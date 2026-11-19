/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Supabase Bridge: Fully replaces Firebase with Supabase client persistence,
 * PostgreSQL reports storage, real-time sync, and authentication.
 */

import './index.css';
import type { User } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-client';
import {
  enqueuePendingReport,
  getPendingReports,
  getPendingCount,
  deleteCachedReport,
  OfflineQueuedReport
} from './offline-storage';
import {
  initSyncService,
  syncPendingReports,
  subscribeSyncStatus,
  isOnline,
  SyncStatusEvent
} from './sync-service';

export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY };

export interface SavedReport {
  id: string;
  lotNumber: string;
  fileName?: string;
  fileSize?: number;
  fileBase64?: string;
  pdfBase64?: string;
  minThreshold: number;
  maxThreshold: number;
  startRange?: string;
  endRange?: string;
  minTemp?: number;
  maxTemp?: number;
  duration?: string;
  rowCount?: number;
  sensorData?: Array<{ time: string; temp: number }>;
  chartMode?: 'color' | 'mono';
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  createdAt?: string;
  updatedAt?: string;
  isOfflinePending?: boolean;
  isUploading?: boolean;
}

const LOCAL_STORAGE_REPORTS_KEY = 'hpt_supabase_saved_reports';
let currentUser: User | null = null;
let savedReports: SavedReport[] = [];
let historySearchQuery = '';
let selectedReportIds = new Set<string>();
let lastUploadedFile: { name: string; size: number; base64: string } | null = null;
let reportsSubscription: any = null;
let currentPendingCount = 0;
export const activeUploadingIds = new Set<string>();
export const expandedReportIds = new Set<string>();
let currentHistoryFilterTab: 'all' | 'in-spec' | 'excursions' | 'offline' = 'all';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeTs(ts?: string): string {
  return (ts || '').replace(/-/g, '/').replace(' ', '_');
}

function computeMinMax(values: number[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  let found = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && !isNaN(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
      found = true;
    }
  }
  return found ? { min, max } : null;
}

function computeRunTelemetry(report: SavedReport): {
  runMin: number | undefined;
  runMax: number | undefined;
  runPoints: number;
  isExcursion: boolean;
} {
  const minThreshold = report.minThreshold ?? 35.0;
  const maxThreshold = report.maxThreshold ?? 39.0;
  let runMin = report.minTemp;
  let runMax = report.maxTemp;
  let runPoints = report.rowCount || report.sensorData?.length || 0;

  if (report.sensorData && report.sensorData.length > 0 && (report.startRange || report.endRange)) {
    const normStart = normalizeTs(report.startRange);
    const normEnd = normalizeTs(report.endRange);
    const filteredTemps: number[] = [];
    for (let i = 0; i < report.sensorData.length; i++) {
      const d = report.sensorData[i];
      const t = normalizeTs(d.time);
      if (normStart && t < normStart) continue;
      if (normEnd && t > normEnd) continue;
      filteredTemps.push(Number(d.temp));
    }
    if (filteredTemps.length > 0) {
      const stats = computeMinMax(filteredTemps);
      if (stats) {
        runMin = parseFloat(stats.min.toFixed(2));
        runMax = parseFloat(stats.max.toFixed(2));
        runPoints = filteredTemps.length;
      }
    }
  }

  const isExcursion = (runMin != null && runMin < minThreshold) || (runMax != null && runMax > maxThreshold);
  return { runMin, runMax, runPoints, isExcursion };
}

function getFilteredReports(): SavedReport[] {
  const query = historySearchQuery.trim().toLowerCase();
  return savedReports.filter(report => {
    if (query) {
      const match =
        (report.lotNumber && report.lotNumber.toLowerCase().includes(query)) ||
        (report.fileName && report.fileName.toLowerCase().includes(query)) ||
        (report.startRange && report.startRange.toLowerCase().includes(query));
      if (!match) return false;
    }

    if (currentHistoryFilterTab === 'offline') {
      return !!report.isOfflinePending;
    }

    if (currentHistoryFilterTab === 'in-spec' || currentHistoryFilterTab === 'excursions') {
      const { isExcursion } = computeRunTelemetry(report);
      return currentHistoryFilterTab === 'excursions' ? isExcursion : !isExcursion;
    }

    return true;
  });
}

async function confirmAction(opts: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  const confirmDialog = (window as any).Utils?.confirmDialog;
  if (typeof confirmDialog === 'function') {
    return await confirmDialog(opts);
  }
  return true;
}

// UI Elements & Helpers
function setSyncStatus(status: 'synced' | 'syncing' | 'offline' | 'saved' | 'queued', text?: string) {
  const el = document.getElementById('cloudSyncStatus');
  if (!el) return;
  
  el.className = `cloud-status cloud-status--${status}`;
  
  let label = text;
  if (!label) {
    switch (status) {
      case 'synced':
        label = 'Supabase Synced';
        break;
      case 'syncing':
        label = 'Syncing...';
        break;
      case 'saved':
        label = 'Saved to Cloud';
        break;
      case 'queued':
        label = `Offline (${currentPendingCount} pending)`;
        break;
      case 'offline':
      default:
        label = !isOnline() 
          ? (currentPendingCount > 0 ? `Offline (${currentPendingCount} pending)` : 'Offline Mode')
          : (currentUser ? 'Supabase Ready' : 'Sign in to sync');
        break;
    }
  }

  const syncBtnHtml = (currentPendingCount > 0 && isOnline()) 
    ? `<button id="syncNowInlineBtn" class="sync-now-inline-btn" title="Sync pending reports to Supabase">Sync Now ⟳</button>`
    : '';

  el.innerHTML = `
    <span class="status-dot"></span>
    <span class="status-text">${label}</span>
    ${syncBtnHtml}
  `;

  document.getElementById('syncNowInlineBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    syncPendingReports();
  });
}

function updateHistoryBadge() {
  const badge = document.getElementById('historyCountBadge');
  if (badge) {
    badge.textContent = String(savedReports.length);
    badge.style.display = savedReports.length > 0 ? 'inline-flex' : 'none';
  }
}

function loadLocalReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_REPORTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalReports(reports: SavedReport[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_REPORTS_KEY, JSON.stringify(reports));
  } catch (e) {
    console.warn('[SupabaseBridge] Local storage quota exceeded for reports cache', e);
  }
}

function renderAuthUI() {
  const container = document.getElementById('authContainer');
  if (!container) return;

  if (currentUser) {
    const rawName = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'User';
    const rawEmail = currentUser.email || '';
    const initials = (currentUser.user_metadata?.full_name || rawEmail || 'U')
      .split(' ')
      .filter(Boolean)
      .map((n: string) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const safeAvatarUrl = currentUser.user_metadata?.avatar_url ? escapeHtml(currentUser.user_metadata.avatar_url) : '';
    const avatarHtml = safeAvatarUrl
      ? `<img src="${safeAvatarUrl}" alt="avatar" class="user-avatar-img">`
      : `<div class="user-avatar-fallback">${escapeHtml(initials)}</div>`;

    container.innerHTML = `
      <div class="user-profile-badge" title="${escapeHtml(rawEmail)}">
        ${avatarHtml}
        <div class="user-info-text">
          <span class="user-name">${escapeHtml(rawName)}</span>
          <span class="user-email">${escapeHtml(rawEmail)}</span>
        </div>
        <button id="signOutBtn" class="auth-btn auth-btn--logout" title="Sign out of account">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          <span>Sign Out</span>
        </button>
      </div>
    `;

    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
  } else {
    container.innerHTML = `
      <button id="signInBtn" class="auth-btn auth-btn--login" title="Sign in with your Google or Supabase account">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span>Sign In</span>
      </button>
    `;

    document.getElementById('signInBtn')?.addEventListener('click', handleSignIn);
  }
}

const LOCAL_USER_KEY = 'hpt_supabase_current_user';

export function getDefaultUser(): User {
  return {
    id: 'usr_mcpvip1_gmail_com',
    app_metadata: { provider: 'operator' },
    user_metadata: { full_name: 'Lab Operator', initials: 'LO' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: 'mcpvip1@gmail.com'
  } as any;
}

function getStoredUser(): User {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return getDefaultUser();
}

function setStoredUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(LOCAL_USER_KEY);
    }
  } catch (e) {}
}

async function handleSignIn() {
  showAuthFallbackModal();
}

function showAuthFallbackModal() {
  if (document.getElementById('authFallbackModalBackdrop')) return;

  const stored = getStoredUser();
  const defaultEmail = escapeHtml(stored?.email || 'mcpvip1@gmail.com');
  const defaultName = escapeHtml(stored?.user_metadata?.full_name || 'Lab Operator');

  const backdrop = document.createElement('div');
  backdrop.id = 'authFallbackModalBackdrop';
  backdrop.className = 'domain-modal-backdrop';
  backdrop.innerHTML = `
    <div class="domain-modal" role="dialog" aria-modal="true" style="max-width:440px;">
      <div class="domain-modal__header">
        <h3 class="domain-modal__title"><span>🔐 Supabase Cloud Connection</span></h3>
        <button id="closeAuthModalBtn" class="history-drawer__close" style="width:28px;height:28px;font-size:14px;">✕</button>
      </div>
      <div class="domain-modal__body">
        <!-- Direct Operator Identity (Fastest, zero-config) -->
        <div style="background:var(--bg-surface-alt);padding:14px;border-radius:8px;border:1px solid var(--border);margin-bottom:14px;">
          <h4 style="font-size:13px;font-weight:600;margin-bottom:4px;color:var(--text-primary);">⚡ Instant Operator Sign-In</h4>
          <p style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">
            Connects your profile directly to your Supabase <code>reports</code> database with full sync capability.
          </p>

          <div style="display:flex;flex-direction:column;gap:8px;">
            <div>
              <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:2px;">Operator Name</label>
              <input type="text" id="authNameInput" value="${defaultName}" class="history-search__input" style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--border);border-radius:5px;background:var(--bg-input);color:var(--text-primary);font-size:12px;" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:2px;">Email Address</label>
              <input type="email" id="authEmailDirectInput" value="${defaultEmail}" class="history-search__input" style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--border);border-radius:5px;background:var(--bg-input);color:var(--text-primary);font-size:12px;" />
            </div>
            <button id="btnDirectConnect" class="tbtn tbtn--upload" style="width:100%;justify-content:center;padding:9px;margin-top:4px;">
              <span>Connect &amp; Sync to Supabase</span>
            </button>
          </div>
        </div>

        <!-- Optional: Supabase Email Magic Link -->
        <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:10px;">
          <h4 style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-primary);">✉️ Send Magic Link (Email OTP)</h4>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <input type="email" id="authEmailOtpInput" placeholder="name@company.com" class="history-search__input" style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:5px;background:var(--bg-input);color:var(--text-primary);font-size:12px;" />
            <button id="btnSendMagicLink" class="tbtn tbtn--primary" style="padding:7px 12px;font-size:12px;white-space:nowrap;">
              <span>Send Link</span>
            </button>
          </div>
        </div>

        <!-- Optional: Google OAuth Notice -->
        <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;">
          <h4 style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-primary);">🌐 Google Sign-In</h4>
          <p style="font-size:10px;color:var(--text-faint);margin-bottom:8px;">
            Note: Requires Google Provider enabled under Supabase Dashboard &gt; Authentication &gt; Providers &gt; Google.
          </p>
          <button id="btnGoogleOAuth" class="tbtn tbtn--print" style="width:100%;justify-content:center;padding:8px;font-size:12px;">
            <span>Sign In with Google</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss();
  };
  const dismiss = () => {
    document.removeEventListener('keydown', onEsc);
    backdrop.remove();
  };
  document.addEventListener('keydown', onEsc);
  document.getElementById('closeAuthModalBtn')?.addEventListener('click', dismiss);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) dismiss();
  });

  // Direct Operator Connect
  document.getElementById('btnDirectConnect')?.addEventListener('click', () => {
    const name = (document.getElementById('authNameInput') as HTMLInputElement)?.value.trim() || 'Lab Operator';
    const email = (document.getElementById('authEmailDirectInput') as HTMLInputElement)?.value.trim() || 'mcpvip1@gmail.com';
    const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

    const mockUser: User = {
      id: 'usr_' + (email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()),
      app_metadata: { provider: 'operator' },
      user_metadata: { full_name: name, avatar_url: '', initials },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email
    } as any;

    currentUser = mockUser;
    setStoredUser(mockUser);
    renderAuthUI();
    fetchReports();
    (window as any).Toast?.success(`✅ Connected as ${name} (${email})`);
    dismiss();
  });

  // Email OTP Magic Link
  document.getElementById('btnSendMagicLink')?.addEventListener('click', async () => {
    const email = (document.getElementById('authEmailOtpInput') as HTMLInputElement)?.value.trim();
    if (!email) {
      (window as any).Toast?.warning('Please enter a valid email address');
      return;
    }
    const sendBtn = document.getElementById('btnSendMagicLink') as HTMLButtonElement | null;
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
      });
      if (error) {
        (window as any).Toast?.error(error.message);
      } else {
        (window as any).Toast?.success('Magic login link sent to your email!');
        dismiss();
      }
    } catch (err: any) {
      (window as any).Toast?.error('Failed to send link: ' + (err.message || ''));
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Link';
      }
    }
  });

  // Google OAuth with graceful feedback
  document.getElementById('btnGoogleOAuth')?.addEventListener('click', async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
      });
      if (error) {
        (window as any).Toast?.warning('Google Provider is not enabled in your Supabase project. Please use Instant Operator Sign-In above or enable Google under Authentication > Providers in Supabase.');
      }
    } catch (err: any) {
      (window as any).Toast?.warning('Google Provider error: ' + (err.message || 'Not enabled in Supabase'));
    }
  });
}

async function handleSignOut() {
  try {
    if (reportsSubscription) {
      supabase.removeChannel(reportsSubscription);
      reportsSubscription = null;
    }
    await supabase.auth.signOut();
  } catch (err: any) {
    console.warn('Supabase sign-out notice:', err);
  }
  currentUser = null;
  setStoredUser(null);
  savedReports = [];
  selectedReportIds.clear();
  renderAuthUI();
  renderHistoryDrawer();
  updateHistoryBadge();
  updateBulkBarUI();
  setSyncStatus('offline', 'Signed out');
  (window as any).Toast?.info('Signed out of cloud database');
}

// Map between Supabase column names and frontend SavedReport model
function mapDbRowToReport(row: any): SavedReport {
  let minTemp = row.min_temp != null ? Number(row.min_temp) : undefined;
  let maxTemp = row.max_temp != null ? Number(row.max_temp) : undefined;
  let rowCount = row.row_count || 0;
  const sensorData = row.sensor_data || [];
  const startRange = row.start_range || '';
  const endRange = row.end_range || '';

  // If sensor_data has points and a range was specified, calculate run min and max strictly within that time range:
  if (sensorData.length > 0 && (startRange || endRange)) {
    const normStart = normalizeTs(startRange);
    const normEnd = normalizeTs(endRange);
    const runTemps: number[] = [];
    for (let i = 0; i < sensorData.length; i++) {
      const d = sensorData[i];
      const t = normalizeTs(d.time);
      if (normStart && t < normStart) continue;
      if (normEnd && t > normEnd) continue;
      runTemps.push(Number(d.temp));
    }
    if (runTemps.length > 0) {
      const stats = computeMinMax(runTemps);
      if (stats) {
        minTemp = parseFloat(stats.min.toFixed(2));
        maxTemp = parseFloat(stats.max.toFixed(2));
        rowCount = runTemps.length;
      }
    }
  }

  return {
    id: row.id,
    lotNumber: row.lot_number || '',
    fileName: row.file_name || '',
    fileSize: row.file_size || 0,
    fileBase64: row.file_base64 || '',
    pdfBase64: row.pdf_base64 || '',
    minThreshold: Number(row.min_threshold ?? 35.0),
    maxThreshold: Number(row.max_threshold ?? 39.0),
    startRange,
    endRange,
    minTemp,
    maxTemp,
    duration: row.duration || '',
    rowCount,
    sensorData,
    chartMode: row.chart_mode || 'color',
    userId: row.user_id || '',
    userEmail: row.user_email || '',
    userDisplayName: row.user_display_name || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    isUploading: activeUploadingIds.has(row.id)
  };
}

function mapReportToDbRow(report: SavedReport, userId: string) {
  return {
    id: report.id,
    lot_number: report.lotNumber,
    file_name: report.fileName,
    file_size: report.fileSize,
    file_base64: report.fileBase64,
    pdf_base64: report.pdfBase64,
    min_threshold: report.minThreshold,
    max_threshold: report.maxThreshold,
    start_range: report.startRange,
    end_range: report.endRange,
    min_temp: report.minTemp,
    max_temp: report.maxTemp,
    duration: report.duration,
    row_count: report.rowCount,
    sensor_data: report.sensorData,
    chart_mode: report.chartMode,
    user_id: userId,
    user_email: report.userEmail || currentUser?.email || '',
    user_display_name: report.userDisplayName || currentUser?.user_metadata?.full_name || '',
    updated_at: new Date().toISOString()
  };
}

export function subscribeToReports() {
  if (reportsSubscription) {
    try {
      supabase.removeChannel(reportsSubscription);
    } catch (e) {}
    reportsSubscription = null;
  }

  try {
    reportsSubscription = supabase
      .channel('public:reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {
        fetchReports();
      })
      .subscribe();
  } catch (err) {
    console.warn('[Supabase Realtime] Subscription note:', err);
  }
}

// Fetch Reports from Supabase with Local-first Fallback & IndexedDB Offline Queue
export async function fetchReports() {
  setSyncStatus('syncing', 'Fetching reports...');
  
  // First load from local storage cache for instant UI response
  const localList = loadLocalReports();
  if (localList.length > 0 && savedReports.length === 0) {
    savedReports = localList;
    renderHistoryDrawer();
    updateHistoryBadge();
  }

  // Load any pending offline reports from IndexedDB
  let pendingReports: OfflineQueuedReport[] = [];
  try {
    pendingReports = await getPendingReports();
    currentPendingCount = pendingReports.length;
  } catch (e) {
    console.warn('[IndexedDB] Could not load pending reports:', e);
  }

  try {
    if (!isOnline()) {
      // Offline mode: combine cached reports with any pending offline uploads
      const pendingMapped: SavedReport[] = pendingReports.map(p => ({
        ...p,
        isOfflinePending: true
      }));
      const ids = new Set(pendingMapped.map(p => p.id));
      savedReports = [...pendingMapped, ...savedReports.filter(r => !ids.has(r.id))];
      saveLocalReports(savedReports);
      renderHistoryDrawer();
      updateHistoryBadge();
      setSyncStatus(currentPendingCount > 0 ? 'queued' : 'offline', currentPendingCount > 0 ? `Offline (${currentPendingCount} pending)` : 'Offline Mode');
      return;
    }

    const query = supabase
      .from('reports')
      .select('*')
      .order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      // If table does not exist or network error, fallback to local cache cleanly
      console.warn('[Supabase] Remote query note:', error.message);
      setSyncStatus(currentPendingCount > 0 ? 'queued' : 'synced', currentPendingCount > 0 ? `Offline (${currentPendingCount} pending)` : `${savedReports.length} Reports (Local)`);
      return;
    }

    if (data) {
      const remoteReports = data.map(mapDbRowToReport);
      // Prepend pending offline reports that haven't synced yet
      const pendingMapped: SavedReport[] = pendingReports.map(p => ({
        ...p,
        isOfflinePending: true
      }));
      const remoteIds = new Set(remoteReports.map(r => r.id));
      const pendingUnsynced = pendingMapped.filter(p => !remoteIds.has(p.id));

      savedReports = [...pendingUnsynced, ...remoteReports];
      saveLocalReports(savedReports);
      renderHistoryDrawer();
      updateHistoryBadge();

      if (currentPendingCount > 0) {
        setSyncStatus('queued', `Pending sync (${currentPendingCount})`);
      } else {
        setSyncStatus('synced', `${remoteReports.length} Reports in Supabase`);
      }
    }

    // Ensure realtime listener is active
    if (!reportsSubscription) {
      subscribeToReports();
    }
  } catch (err: any) {
    console.warn('[Supabase] Fetch error:', err);
    setSyncStatus(currentPendingCount > 0 ? 'queued' : 'synced', currentPendingCount > 0 ? `Offline (${currentPendingCount} pending)` : `${savedReports.length} Reports (Cached)`);
  }
}

// Cloud Storage Operations
export async function saveCurrentReportToCloud(isAutoSave = false) {
  const state = (window as any).state;
  if (!state || !state.sensorData || state.sensorData.length === 0) {
    if (!isAutoSave) (window as any).Toast?.error('No report data to save to cloud.');
    return;
  }

  if (!currentUser) {
    if (!isAutoSave) {
      (window as any).Toast?.info('Please sign in or select demo operator to save reports.');
      handleSignIn();
    }
    return;
  }
  const user = currentUser;

  setSyncStatus('syncing', 'Saving to Supabase...');

  const lotInput = (document.getElementById('lotNumberInput') as HTMLInputElement)?.value.trim() || state.lotNumber || 'EXT-UNKNOWN';
  const existingMatch = savedReports.find(r => r.lotNumber === lotInput);
  const reportId = existingMatch?.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  activeUploadingIds.add(reportId);

  try {
    const cloudFileName = lotInput.toLowerCase().endsWith('.xlsx') ? lotInput : `${lotInput}.xlsx`;
    const parsedMinT = parseFloat((document.getElementById('minThreshold') as HTMLInputElement)?.value);
    const parsedMaxT = parseFloat((document.getElementById('maxThreshold') as HTMLInputElement)?.value);
    const minThreshold = isNaN(parsedMinT) ? 35.0 : parsedMinT;
    const maxThreshold = isNaN(parsedMaxT) ? 39.0 : parsedMaxT;
    const startRange = (window as any).Dashboard?.readStart() || (state.sensorData[0]?.time || '');
    const endRange = (window as any).Dashboard?.readEnd() || (state.sensorData[state.sensorData.length - 1]?.time || '');
    const duration = (document.getElementById('footerDurationVal')?.textContent || '').trim() || (window as any).Utils?.formatDuration(startRange, endRange) || '—';

    // Filter strictly to the confirmed run time range so min/max is saved as is for this run
    const normStart = normalizeTs(startRange);
    const normEnd = normalizeTs(endRange);
    const runPoints = state.sensorData.filter((d: any) => {
      const t = normalizeTs(d.time);
      if (normStart && t < normStart) return false;
      if (normEnd && t > normEnd) return false;
      return true;
    });
    const targetData = runPoints.length > 0 ? runPoints : state.sensorData;
    const stats = computeMinMax(targetData.map((d: any) => Number(d.temp)));
    const minTemp = stats ? stats.min : 0;
    const maxTemp = stats ? stats.max : 0;

    let pdfDataUri = '';
    try {
      if ((window as any).Exporter && typeof (window as any).Exporter.prepareA4Canvas === 'function') {
        const canvas = await (window as any).Exporter.prepareA4Canvas();
        if (canvas) {
          const imgData = canvas.toDataURL('image/jpeg', 0.82);
          const { jsPDF } = (window as any).jspdf || {};
          if (jsPDF) {
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
            pdfDataUri = pdf.output('datauristring');
          }
        }
      }
    } catch (pdfErr) {
      console.warn('PDF generation for cloud payload skipped or failed:', pdfErr);
    }

    const sampleData = state.sensorData.length > 3000
      ? state.sensorData.filter((_: any, idx: number) => idx % Math.ceil(state.sensorData.length / 2000) === 0)
      : state.sensorData;

    const payload: SavedReport = {
      id: reportId,
      lotNumber: lotInput,
      fileName: cloudFileName,
      fileSize: lastUploadedFile?.size || existingMatch?.fileSize || 0,
      fileBase64: (lastUploadedFile && lastUploadedFile.base64.length < 900000) ? lastUploadedFile.base64 : (existingMatch?.fileBase64 || ''),
      pdfBase64: (pdfDataUri && pdfDataUri.length < 900000) ? pdfDataUri : '',
      minThreshold,
      maxThreshold,
      startRange,
      endRange,
      minTemp: parseFloat(minTemp.toFixed(2)),
      maxTemp: parseFloat(maxTemp.toFixed(2)),
      duration,
      rowCount: targetData.length,
      sensorData: sampleData,
      chartMode: state.chartMode || 'color',
      userId: user.id,
      userEmail: user.email || '',
      userDisplayName: user.user_metadata?.full_name || '',
      createdAt: existingMatch?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isUploading: true
    };

    // Update local state and trigger history UI so uploading indicator is visible
    const existingIndex = savedReports.findIndex(r => r.id === reportId || r.lotNumber === lotInput);
    if (existingIndex >= 0) {
      savedReports[existingIndex] = payload;
    } else {
      savedReports.unshift(payload);
    }
    saveLocalReports(savedReports);
    renderHistoryDrawer();
    updateHistoryBadge();

    // If offline, enqueue directly to IndexedDB
    if (!isOnline()) {
      payload.isOfflinePending = true;
      payload.isUploading = false;
      activeUploadingIds.delete(reportId);
      renderHistoryDrawer();

      await enqueuePendingReport({
        ...payload,
        status: 'pending',
        attempts: 0,
        createdAt: payload.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as OfflineQueuedReport);

      currentPendingCount = await getPendingCount();
      setSyncStatus('queued', `Saved Offline (${currentPendingCount} pending)`);
      (window as any).Toast?.info(`💾 Saved Lot [${lotInput}] to IndexedDB. Will sync when back online.`);
      return;
    }

    // Persist to Supabase
    try {
      const dbRow = mapReportToDbRow(payload, user.id);
      const { error } = await supabase.from('reports').upsert(dbRow);
      
      if (error) {
        console.warn('[Supabase] Remote insert note, enqueueing to IndexedDB:', error.message);
        payload.isOfflinePending = true;
        await enqueuePendingReport({
          ...payload,
          status: 'pending',
          attempts: 1,
          error: error.message,
          createdAt: payload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as OfflineQueuedReport);
        currentPendingCount = await getPendingCount();
        setSyncStatus('queued', `Queued (${currentPendingCount} pending)`);
        (window as any).Toast?.warning(`📡 Network issue: Saved Lot [${lotInput}] to IndexedDB queue.`);
      } else {
        setSyncStatus('saved', `Saved Lot: ${lotInput} (Supabase)`);
        (window as any).Toast?.success(
          isAutoSave 
            ? `☁️ Auto-saved Lot [${lotInput}] to Supabase` 
            : `☁️ Saved Lot [${lotInput}] (${cloudFileName}) to Supabase archive`
        );
      }
    } catch (netErr: any) {
      console.warn('[Supabase] Network exception, enqueueing to IndexedDB:', netErr);
      payload.isOfflinePending = true;
      await enqueuePendingReport({
        ...payload,
        status: 'pending',
        attempts: 1,
        error: netErr.message,
        createdAt: payload.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as OfflineQueuedReport);
      currentPendingCount = await getPendingCount();
      setSyncStatus('queued', `Queued (${currentPendingCount} pending)`);
      (window as any).Toast?.warning(`📡 Offline: Saved Lot [${lotInput}] to local IndexedDB.`);
    }
  } catch (error: any) {
    setSyncStatus('offline', 'Save failed');
    console.error('Supabase save error:', error);
    (window as any).Toast?.error('Failed to save: ' + (error.message || 'Unknown error'));
  } finally {
    activeUploadingIds.delete(reportId);
    const reportItem = savedReports.find(r => r.id === reportId);
    if (reportItem) reportItem.isUploading = false;
    renderHistoryDrawer();
  }
}

export async function saveDirectReport(report: SavedReport): Promise<boolean> {
  const user = currentUser || ({
    id: 'demo_user_direct',
    app_metadata: {},
    user_metadata: { full_name: 'Direct Operator' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: 'operator@hpt-lab.com'
  } as any);
  currentUser = user;

  setSyncStatus('syncing', 'Saving...');
  
  const existingMatch = savedReports.find(r => (report.id && r.id === report.id) || (report.lotNumber && r.lotNumber === report.lotNumber));
  if (!report.id) {
    report.id = existingMatch?.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
  const reportId = report.id;
  activeUploadingIds.add(reportId);
  report.isUploading = true;

  try {
    report.userId = user.id;
    report.createdAt = report.createdAt || existingMatch?.createdAt || new Date().toISOString();
    report.updatedAt = new Date().toISOString();

    // Ensure run min/max is strictly within the run time range
    if (report.sensorData && report.sensorData.length > 0 && (report.startRange || report.endRange)) {
      const normStart = normalizeTs(report.startRange);
      const normEnd = normalizeTs(report.endRange);
      const runTemps: number[] = [];
      for (let i = 0; i < report.sensorData.length; i++) {
        const d = report.sensorData[i];
        const t = normalizeTs(d.time);
        if (normStart && t < normStart) continue;
        if (normEnd && t > normEnd) continue;
        runTemps.push(Number(d.temp));
      }
      if (runTemps.length > 0) {
        const stats = computeMinMax(runTemps);
        if (stats) {
          report.minTemp = parseFloat(stats.min.toFixed(2));
          report.maxTemp = parseFloat(stats.max.toFixed(2));
          report.rowCount = runTemps.length;
        }
      }
    }

    // Update local cache immediately so user sees uploading status beside file name
    const existingIndex = savedReports.findIndex(r => r.id === report.id || r.lotNumber === report.lotNumber);
    if (existingIndex >= 0) {
      savedReports[existingIndex] = report;
    } else {
      savedReports.unshift(report);
    }
    saveLocalReports(savedReports);
    renderHistoryDrawer();
    updateHistoryBadge();

    // Check if offline
    if (!isOnline()) {
      report.isOfflinePending = true;
      report.isUploading = false;
      activeUploadingIds.delete(reportId);
      renderHistoryDrawer();

      await enqueuePendingReport({
        ...report,
        status: 'pending',
        attempts: 0,
        createdAt: report.createdAt || new Date().toISOString(),
        updatedAt: report.updatedAt
      } as OfflineQueuedReport);

      currentPendingCount = await getPendingCount();
      setSyncStatus('queued', `Saved Offline (${currentPendingCount} pending)`);
      (window as any).Toast?.info(`💾 Saved Lot [${report.lotNumber}] to IndexedDB. Will sync when connection is restored.`);
      return true;
    }

    try {
      const dbRow = mapReportToDbRow(report, user.id);
      const { error } = await supabase.from('reports').upsert(dbRow);

      if (error) {
        console.warn('[Supabase] Direct save error, queuing in IndexedDB:', error.message);
        report.isOfflinePending = true;
        await enqueuePendingReport({
          ...report,
          status: 'pending',
          attempts: 1,
          error: error.message,
          createdAt: report.createdAt || new Date().toISOString(),
          updatedAt: report.updatedAt
        } as OfflineQueuedReport);
        currentPendingCount = await getPendingCount();
        setSyncStatus('queued', `Queued (${currentPendingCount} pending)`);
        (window as any).Toast?.warning(`📡 Network issue: Lot [${report.lotNumber}] saved to IndexedDB queue.`);
      } else {
        setSyncStatus('saved', `Saved Lot: ${report.lotNumber}`);
        (window as any).Toast?.success(`☁️ Lot [${report.lotNumber}] saved to Supabase!`);
      }
    } catch (netErr: any) {
      console.warn('[Supabase] Direct save network error, queuing in IndexedDB:', netErr);
      report.isOfflinePending = true;
      await enqueuePendingReport({
        ...report,
        status: 'pending',
        attempts: 1,
        error: netErr.message,
        createdAt: report.createdAt || new Date().toISOString(),
        updatedAt: report.updatedAt
      } as OfflineQueuedReport);
      currentPendingCount = await getPendingCount();
      setSyncStatus('queued', `Queued (${currentPendingCount} pending)`);
      (window as any).Toast?.info(`💾 Saved Lot [${report.lotNumber}] to IndexedDB.`);
    }

    return true;
  } catch (err: any) {
    console.warn('[Supabase] Exception in direct save, queuing in IndexedDB:', err);
    report.isOfflinePending = true;
    await enqueuePendingReport({
      ...report,
      status: 'pending',
      attempts: 1,
      error: err.message,
      createdAt: report.createdAt || new Date().toISOString(),
      updatedAt: report.updatedAt || new Date().toISOString()
    } as OfflineQueuedReport);
    currentPendingCount = await getPendingCount();
    setSyncStatus('queued', `Saved Offline (${currentPendingCount} pending)`);
    (window as any).Toast?.info(`💾 Saved Lot [${report.lotNumber}] to IndexedDB.`);
    return true;
  } finally {
    activeUploadingIds.delete(reportId);
    report.isUploading = false;
    renderHistoryDrawer();
  }
}

export function loadReportIntoApp(report: SavedReport) {
  if (!report || !report.sensorData || report.sensorData.length === 0) {
    (window as any).Toast?.error('Selected report contains no sensor data.');
    return;
  }

  const state = (window as any).state || ((window as any).state = {
    sensorData: [],
    rawData: [],
    chart: null,
    printChart: null,
    language: 'en',
    lotNumber: '',
    chartMode: 'color',
    appearance: 'light',
    highlightOutliers: true
  });
  const Dashboard = (window as any).Dashboard;
  const ChartFactory = (window as any).ChartFactory;

  state.sensorData = report.sensorData.slice();
  state.rawData = report.sensorData.slice();
  state.lotNumber = report.lotNumber || '';
  state.currentFileName = report.fileName || '';

  const lotInput = document.getElementById('lotNumberInput') as HTMLInputElement;
  if (lotInput) {
    lotInput.value = report.lotNumber || '';
  }
  Dashboard?.updateLotBadge();

  const minThresholdInput = document.getElementById('minThreshold') as HTMLInputElement;
  const maxThresholdInput = document.getElementById('maxThreshold') as HTMLInputElement;
  if (minThresholdInput && report.minThreshold != null) minThresholdInput.value = String(report.minThreshold);
  if (maxThresholdInput && report.maxThreshold != null) maxThresholdInput.value = String(report.maxThreshold);

  if (report.chartMode && Dashboard?.setChartMode) {
    Dashboard.setChartMode(report.chartMode);
  }

  if (!state.chart && ChartFactory && document.getElementById('mainChart')) {
    state.chart = ChartFactory.createMain(document.getElementById('mainChart'));
  }

  if (report.startRange && report.endRange) {
    Dashboard?._write('start', report.startRange);
    Dashboard?._write('end', report.endRange);
    Dashboard?.update();
  } else {
    Dashboard?.showFullResult();
  }

  if ((window as any).AutoSaver?.save) {
    (window as any).AutoSaver.save();
  }

  toggleHistoryDrawer(false);
  (window as any).Toast?.success(`✅ Loaded Report Lot: ${report.lotNumber} (${report.rowCount || report.sensorData.length} records)`);
}

export function downloadReportExcel(report: SavedReport) {
  if (report.fileBase64 && report.fileBase64.includes('base64,')) {
    try {
      const parts = report.fileBase64.split('base64,');
      const raw = window.atob(parts[1]);
      const rawLength = raw.length;
      const uInt8Array = new Uint8Array(rawLength);
      for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      const blob = new Blob([uInt8Array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = report.fileName || `Temperature_Report_${report.lotNumber}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      (window as any).Toast?.success(`📥 Downloaded ${link.download}`);
      return;
    } catch (e) {
      console.warn('Direct base64 decode failed, exporting reconstructed sheet', e);
    }
  }

  if (report.sensorData && (window as any).XLSX) {
    const XLSX = (window as any).XLSX;
    const wsData = [
      ['Timestamp', 'Temperature (°C)', 'Lot Number', report.lotNumber || '—'],
      ...report.sensorData.map(d => [d.time.replace('_', ' '), d.temp])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Temperature_Log');
    XLSX.writeFile(wb, `${report.fileName || `Report_${report.lotNumber}.xlsx`}`);
    (window as any).Toast?.success('📥 Downloaded reconstructed Excel spreadsheet');
  } else {
    (window as any).Toast?.error('Original spreadsheet file data not found in this record.');
  }
}

export function downloadReportPdf(report: SavedReport) {
  if (report.pdfBase64 && report.pdfBase64.startsWith('data:application/pdf')) {
    const link = document.createElement('a');
    link.href = report.pdfBase64;
    link.download = `Temperature_Report_${report.lotNumber || 'Archive'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    (window as any).Toast?.success(`📄 Downloaded ${link.download}`);
  } else {
    loadReportIntoApp(report);
    setTimeout(() => {
      (window as any).Exporter?.exportPDF();
    }, 400);
  }
}

export async function deleteReportFromCloud(reportId: string, lotNumber?: string) {
  const existing = savedReports.find(r => r.id === reportId);
  const resolvedLot = lotNumber || existing?.lotNumber || reportId;

  const confirmed = await confirmAction({
    title: 'Delete Report',
    message: `Are you sure you want to delete the report for Lot "${resolvedLot}" from Supabase Cloud?`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;

  try {
    setSyncStatus('syncing', 'Deleting...');

    // Remove from local cache & IndexedDB pending queue/cache
    savedReports = savedReports.filter(r => r.id !== reportId);
    saveLocalReports(savedReports);
    selectedReportIds.delete(reportId);
    expandedReportIds.delete(reportId);
    await deleteCachedReport(reportId).catch(() => {});
    currentPendingCount = await getPendingCount();

    renderHistoryDrawer();
    updateHistoryBadge();
    updateBulkBarUI();

    // Remove from Supabase if online
    if (isOnline()) {
      const { error } = await supabase.from('reports').delete().eq('id', reportId);
      if (error) {
        console.warn('Supabase delete warning:', error.message);
      }
    }

    (window as any).Toast?.success(`🗑️ Deleted report for Lot ${resolvedLot}`);
    setSyncStatus(currentPendingCount > 0 ? 'queued' : 'synced');
  } catch (err: any) {
    console.error('Supabase delete error:', err);
    (window as any).Toast?.error('Delete failed: ' + (err.message || 'Unknown error'));
  }
}

export function updateBulkBarUI(currentFiltered?: SavedReport[]) {
  const bulkBar = document.getElementById('historyBulkBar');
  const selectAllCheckbox = document.getElementById('historySelectAllCheckbox') as HTMLInputElement | null;
  const selectCountText = document.getElementById('historySelectCountText');
  const bulkDeleteBtn = document.getElementById('historyBulkDeleteBtn') as HTMLButtonElement | null;
  const bulkDeleteText = document.getElementById('historyBulkDeleteText');

  if (!bulkBar) return;

  if (!currentUser || savedReports.length === 0) {
    bulkBar.style.display = 'none';
    selectedReportIds.clear();
    return;
  }

  bulkBar.style.display = 'flex';

  const targetList = currentFiltered || getFilteredReports();

  const existingIdSet = new Set(savedReports.map(r => r.id));
  for (const id of Array.from(selectedReportIds)) {
    if (!existingIdSet.has(id)) {
      selectedReportIds.delete(id);
    }
  }

  const selectedCount = selectedReportIds.size;
  const targetCount = targetList.length;
  const selectedTargetCount = targetList.filter(r => selectedReportIds.has(r.id)).length;

  if (bulkDeleteBtn && bulkDeleteText) {
    if (selectedCount > 0) {
      bulkDeleteBtn.disabled = false;
      bulkDeleteBtn.classList.add('is-active');
      bulkDeleteText.textContent = `Delete Selected (${selectedCount})`;
    } else {
      bulkDeleteBtn.disabled = true;
      bulkDeleteBtn.classList.remove('is-active');
      bulkDeleteText.textContent = 'Delete (0)';
    }
  }

  if (selectAllCheckbox && selectCountText) {
    if (targetCount === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      selectAllCheckbox.disabled = true;
      selectCountText.textContent = 'Select All (0)';
    } else {
      selectAllCheckbox.disabled = false;
      if (selectedTargetCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        selectCountText.textContent = `Select All (${targetCount})`;
      } else if (selectedTargetCount === targetCount) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
        selectCountText.textContent = `All ${targetCount} Selected`;
      } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
        selectCountText.textContent = `${selectedTargetCount} of ${targetCount} Selected`;
      }
    }
  }
}

export function toggleSelectAllReports() {
  const targetList = getFilteredReports();
  if (targetList.length === 0) return;

  const allSelected = targetList.every(r => selectedReportIds.has(r.id));
  if (allSelected) {
    targetList.forEach(r => selectedReportIds.delete(r.id));
  } else {
    targetList.forEach(r => selectedReportIds.add(r.id));
  }

  renderHistoryDrawer();
}

export async function deleteSelectedReportsFromCloud() {
  const count = selectedReportIds.size;
  if (count === 0) return;

  const confirmed = await confirmAction({
    title: `Delete ${count} Report${count > 1 ? 's' : ''}`,
    message: `Are you sure you want to permanently delete ${count} selected report(s) from Supabase?\n\nThis operation is irreversible.`,
    confirmText: `Delete (${count})`,
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;

  const bulkDeleteBtn = document.getElementById('historyBulkDeleteBtn') as HTMLButtonElement | null;
  const bulkDeleteText = document.getElementById('historyBulkDeleteText');
  if (bulkDeleteBtn) bulkDeleteBtn.disabled = true;
  if (bulkDeleteText) bulkDeleteText.textContent = `Deleting (${count})...`;

  setSyncStatus('syncing', `Deleting ${count} reports...`);

  try {
    const ids = Array.from(selectedReportIds);
    savedReports = savedReports.filter(r => !selectedReportIds.has(r.id));
    saveLocalReports(savedReports);
    ids.forEach(id => expandedReportIds.delete(id));
    selectedReportIds.clear();

    await Promise.all(ids.map(id => deleteCachedReport(id).catch(() => {})));
    currentPendingCount = await getPendingCount();

    if (isOnline()) {
      const { error } = await supabase.from('reports').delete().in('id', ids);
      if (error) {
        console.warn('Supabase bulk delete warning:', error.message);
      }
    }

    setSyncStatus(currentPendingCount > 0 ? 'queued' : 'synced');
    renderHistoryDrawer();
    updateHistoryBadge();
    updateBulkBarUI();
    (window as any).Toast?.success(`🗑️ Successfully deleted ${count} report(s) from Supabase.`);
  } catch (err: any) {
    console.error('Supabase bulk delete error:', err);
    (window as any).Toast?.error('Failed to delete selected reports: ' + (err.message || ''));
    setSyncStatus('offline', 'Delete failed');
  }
}

function formatSavedDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    }
  } catch (e) {}
  return dateStr;
}

function computeRunDuration(start?: string, end?: string, fallback?: string): string {
  if (start && end) {
    try {
      const s = new Date(start.replace(/_/g, ' ').replace(/\//g, '-')).getTime();
      const e = new Date(end.replace(/_/g, ' ').replace(/\//g, '-')).getTime();
      if (!isNaN(s) && !isNaN(e) && e > s) {
        const diffMs = e - s;
        const totalMinutes = Math.round(diffMs / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        if (mins > 0) {
          return `${hours}h ${mins}min`;
        }
        return `${hours}h`;
      }
    } catch (err) {}
  }
  return fallback || '—';
}

export function renderHistoryDrawer() {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;

  // Update filter tabs counts
  const totalCount = savedReports.length;
  let inSpecCount = 0;
  let excursionCount = 0;
  let offlinePendingCount = 0;

  savedReports.forEach(r => {
    if (r.isOfflinePending) offlinePendingCount++;
    const { isExcursion } = computeRunTelemetry(r);
    if (isExcursion) excursionCount++;
    else inSpecCount++;
  });

  if (currentHistoryFilterTab === 'offline' && offlinePendingCount === 0) {
    currentHistoryFilterTab = 'all';
  }

  const countAllEl = document.getElementById('filterCountAll');
  const countInSpecEl = document.getElementById('filterCountInSpec');
  const countExcursionsEl = document.getElementById('filterCountExcursions');
  const countOfflineEl = document.getElementById('filterCountOffline');
  const tabOfflineEl = document.getElementById('filterTabOffline');

  if (countAllEl) countAllEl.textContent = String(totalCount);
  if (countInSpecEl) countInSpecEl.textContent = String(inSpecCount);
  if (countExcursionsEl) countExcursionsEl.textContent = String(excursionCount);
  if (countOfflineEl) countOfflineEl.textContent = String(offlinePendingCount);
  if (tabOfflineEl) tabOfflineEl.style.display = offlinePendingCount > 0 ? 'inline-flex' : 'none';

  // Wire filter tab clicks
  document.querySelectorAll('#historyFilterTabs .hfilter-tab').forEach(btn => {
    btn.classList.toggle('is-active', btn.getAttribute('data-filter') === currentHistoryFilterTab);
    (btn as HTMLElement).onclick = (e) => {
      e.stopPropagation();
      const targetFilter = btn.getAttribute('data-filter') as any;
      if (targetFilter) {
        currentHistoryFilterTab = targetFilter;
        renderHistoryDrawer();
      }
    };
  });

  // Footer sync text update
  const footerSyncText = document.getElementById('drawerSyncFooterText');
  if (footerSyncText) {
    if (!isOnline()) {
      footerSyncText.textContent = offlinePendingCount > 0
        ? `IndexedDB Offline Storage (${offlinePendingCount} pending)`
        : 'IndexedDB Offline Mode Active';
    } else {
      footerSyncText.textContent = 'Supabase Real-time Cloud Active · Auto-Sync Nominal';
    }
  }

  if (!currentUser && savedReports.length === 0) {
    listEl.innerHTML = `
      <div class="history-empty">
        <div class="history-empty__icon">⚡</div>
        <h4>Supabase Authentication</h4>
        <p>Sign in with your account or connect as Demo Operator to view and sync past temperature test reports.</p>
        <button class="tbtn tbtn--upload" onclick="window.CloudStorage.signIn()">
          <span>Sign In / Connect</span>
        </button>
      </div>
    `;
    updateBulkBarUI([]);
    return;
  }

  if (savedReports.length === 0) {
    listEl.innerHTML = `
      <div class="history-empty">
        <div class="history-empty__icon">📊</div>
        <h4>No Reports in Cloud Archive Yet</h4>
        <p>Upload an Excel sensor dataset or click "Save Cloud" to store your first calibrated report.</p>
      </div>
    `;
    updateBulkBarUI([]);
    return;
  }

  const filtered = getFilteredReports();

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="history-empty">
        <div class="history-empty__icon">🔍</div>
        <h4>No matching reports</h4>
        <p>No reports matched your search or current filter "${escapeHtml(currentHistoryFilterTab)}".</p>
      </div>
    `;
    updateBulkBarUI(filtered);
    return;
  }

  listEl.innerHTML = filtered.map(report => {
    const minThreshold = report.minThreshold ?? 35.0;
    const maxThreshold = report.maxThreshold ?? 39.0;
    const { runMin, runMax, runPoints, isExcursion } = computeRunTelemetry(report);

    const minDisplay = runMin != null ? `${runMin.toFixed(1)}°C` : '—';
    const maxDisplay = runMax != null ? `${runMax.toFixed(1)}°C` : '—';

    const dateFormatted = escapeHtml(formatSavedDate(report.updatedAt || report.createdAt) || (report.startRange || '—'));
    const durationDisplay = escapeHtml(computeRunDuration(report.startRange, report.endRange, report.duration));

    const isSelected = selectedReportIds.has(report.id);
    const safeId = escapeHtml(report.id);
    const safeLot = escapeHtml(report.lotNumber || '—');
    const safeDisplayName = escapeHtml(report.fileName || (report.lotNumber ? `Lot_${report.lotNumber}.xlsx` : 'Sensor_Data.xlsx'));
    const safeStart = escapeHtml(report.startRange || '—');
    const safeEnd = escapeHtml(report.endRange || '—');

    // Uploading / sync status indicator beside file name
    const isUploading = activeUploadingIds.has(report.id) || report.isUploading;
    let uploadStatusHtml = '';

    if (isUploading) {
      uploadStatusHtml = `
        <span class="hcard-status-badge hcard-status-badge--uploading" title="File is currently uploading to Supabase Cloud">
          <svg class="hcard-spinner" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
          </svg>
          <span>Uploading...</span>
        </span>
      `;
    } else if (report.isOfflinePending) {
      uploadStatusHtml = `
        <span class="hcard-status-badge hcard-status-badge--queued" title="File saved in local IndexedDB. Will sync when connection is restored.">
          <span class="hcard-dot hcard-dot--amber"></span>
          <span>Queued</span>
        </span>
      `;
    } else {
      uploadStatusHtml = `
        <span class="hcard-status-badge hcard-status-badge--synced" title="Persisted and synced to Supabase Cloud database">
          <span class="hcard-dot hcard-dot--emerald"></span>
          <span>Synced</span>
        </span>
      `;
    }

    const isExpanded = expandedReportIds.has(report.id);

    return `
      <div class="history-card ${isSelected ? 'history-card--selected' : ''} ${isExpanded ? 'history-card--expanded' : ''}" data-id="${safeId}" onclick="window.CloudStorage.handleCardClick(event, '${safeId}')">
        <!-- Card Header: Compact row shown by default to keep drawer space clean -->
        <div class="hcard-header">
          <label class="hcard-checkbox-label" title="Select report" onclick="event.stopPropagation()">
            <input type="checkbox" class="history-card-checkbox" data-id="${safeId}" ${isSelected ? 'checked' : ''}>
          </label>

          <div class="hcard-header-main">
            <div class="hcard-title-row">
              <div class="hcard-title-left">
                <svg class="hcard-file-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="8" y1="13" x2="16" y2="13"/>
                  <line x1="8" y1="17" x2="16" y2="17"/>
                </svg>
                <strong class="hcard-file-name" title="${safeDisplayName}">${safeDisplayName}</strong>
              </div>

              <div class="hcard-title-right">
                ${uploadStatusHtml}
                <button id="hexpand-btn-${safeId}" class="hcard-expand-btn" aria-label="${isExpanded ? 'Collapse' : 'Expand full details'}" title="${isExpanded ? 'Click to collapse' : 'Click to show full report details'}" onclick="event.stopPropagation(); window.CloudStorage.toggleCardExpansion('${safeId}')">
                  <svg id="hchevron-${safeId}" class="hcard-chevron ${isExpanded ? 'is-expanded' : ''}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="hcard-sub-row">
              <span class="hcard-lot-badge">Lot: ${safeLot}</span>
              <span class="hcard-date-meta">Saved ${dateFormatted}</span>
            </div>
          </div>
        </div>

        <!-- Full Body: Expands smoothly on click to show telemetry & actions -->
        <div id="hdetails-${safeId}" class="hcard-full-body" style="display:${isExpanded ? 'flex' : 'none'};">
          <!-- Precision Run Telemetry Box -->
          <div class="hcard-telemetry">
            <!-- Time Range & Duration / Points line -->
            <div class="hcard-range-line">
              <div class="hcard-range-left">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" class="hcard-range-icon">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span class="hcard-range-text">${safeStart} → ${safeEnd}</span>
              </div>
              <div class="hcard-range-stats">
                <span>${durationDisplay}</span>
                <span class="hcard-sep">·</span>
                <span>${runPoints} pts</span>
              </div>
            </div>

            <!-- Min & Max Temperature side-by-side cards -->
            <div class="hcard-temp-grid">
              <div class="hcard-temp-cell">
                <span class="hcard-temp-label">MIN. TEMP. THIS RUN:</span>
                <span class="hcard-temp-val tabular-nums ${runMin != null && runMin < minThreshold ? 'hcard-temp-val--excursion' : ''}">
                  ${minDisplay}
                </span>
              </div>
              <div class="hcard-temp-cell">
                <span class="hcard-temp-label">MAX. TEMP. THIS RUN:</span>
                <span class="hcard-temp-val tabular-nums ${runMax != null && runMax > maxThreshold ? 'hcard-temp-val--excursion' : ''}">
                  ${maxDisplay}
                </span>
              </div>
            </div>

            <!-- Acceptance Criteria Strip -->
            <div class="hcard-compliance-bar ${isExcursion ? 'hcard-compliance-bar--warn' : 'hcard-compliance-bar--ok'}">
              <span class="hcard-compliance-dot">●</span>
              <span>
                ${isExcursion
                  ? `Excursion Detected: ${minThreshold.toFixed(1)}°C ~ ${maxThreshold.toFixed(1)}°C`
                  : `In-Spec Acceptance Criteria: ${minThreshold.toFixed(1)}°C ~ ${maxThreshold.toFixed(1)}°C`
                }
              </span>
            </div>
          </div>

          <!-- Action Buttons Footer -->
          <div class="hcard-footer">
            <button class="hcard-load-btn" onclick="event.stopPropagation(); window.CloudStorage.loadReport('${safeId}')" title="Load report into dashboard">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span>Load Graph</span>
            </button>

            <div class="hcard-footer-right">
              <button class="hcard-btn-sec" onclick="event.stopPropagation(); window.CloudStorage.downloadExcel('${safeId}')" title="Download Excel (.xlsx)">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="8" y1="13" x2="16" y2="13"/>
                  <line x1="8" y1="17" x2="16" y2="17"/>
                </svg>
                <span>.XLSX</span>
              </button>

              <button class="hcard-btn-sec" onclick="event.stopPropagation(); window.CloudStorage.downloadPdf('${safeId}')" title="Download PDF Report">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                <span>PDF</span>
              </button>

              <button class="hcard-del-btn" onclick="event.stopPropagation(); window.CloudStorage.deleteReport('${safeId}')" title="Delete report from Supabase Cloud">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Wire checkbox change events
  listEl.querySelectorAll('.history-card-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLInputElement;
      const id = target.getAttribute('data-id');
      if (!id) return;
      if (target.checked) {
        selectedReportIds.add(id);
      } else {
        selectedReportIds.delete(id);
      }
      const card = target.closest('.history-card');
      if (card) {
        if (target.checked) card.classList.add('history-card--selected');
        else card.classList.remove('history-card--selected');
      }
      updateBulkBarUI(filtered);
    });
  });

  updateBulkBarUI(filtered);
}

export function handleCardClick(event: MouseEvent, id: string) {
  const target = event.target as HTMLElement;
  if (!target) return;
  // If clicked an interactive control or inside footer, do not toggle accordion
  if (
    target.closest('input') ||
    target.closest('button') ||
    target.closest('label') ||
    target.closest('.hcard-footer') ||
    target.closest('.hcard-telemetry')
  ) {
    return;
  }
  toggleCardExpansion(id);
}

export function toggleCardExpansion(id: string) {
  if (expandedReportIds.has(id)) {
    expandedReportIds.delete(id);
  } else {
    expandedReportIds.add(id);
  }

  const card = document.querySelector(`.history-card[data-id="${id}"]`);
  const details = document.getElementById(`hdetails-${id}`);
  const chevron = document.getElementById(`hchevron-${id}`);
  const expandBtn = document.getElementById(`hexpand-btn-${id}`);

  if (details) {
    const isNowExpanded = expandedReportIds.has(id);
    details.style.display = isNowExpanded ? 'flex' : 'none';
    card?.classList.toggle('history-card--expanded', isNowExpanded);
    if (chevron) {
      chevron.classList.toggle('is-expanded', isNowExpanded);
    }
    if (expandBtn) {
      expandBtn.setAttribute('title', isNowExpanded ? 'Click to collapse' : 'Click to show full report details');
      expandBtn.setAttribute('aria-label', isNowExpanded ? 'Collapse' : 'Expand full details');
    }
  }
}

export function toggleHistoryDrawer(forceState?: boolean) {
  const drawer = document.getElementById('historyDrawer');
  const backdrop = document.getElementById('historyBackdrop');
  if (!drawer || !backdrop) return;

  const isOpen = forceState !== undefined ? forceState : !drawer.classList.contains('is-open');
  if (isOpen) {
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
    renderHistoryDrawer();
    const searchInput = document.getElementById('historySearchInput') as HTMLInputElement;
    if (searchInput) searchInput.focus();
  } else {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
  }
}

// Global CloudStorage API compatibility layer
(window as any).CloudStorage = {
  signIn: handleSignIn,
  signOut: handleSignOut,
  saveCurrentReport: () => saveCurrentReportToCloud(false),
  saveDirectReport: saveDirectReport,
  toggleHistory: toggleHistoryDrawer,
  toggleCardExpansion: toggleCardExpansion,
  toggleDetails: toggleCardExpansion,
  handleCardClick: handleCardClick,
  loadReport: (id: string) => {
    const report = savedReports.find(r => r.id === id);
    if (report) loadReportIntoApp(report);
  },
  downloadExcel: (id: string) => {
    const report = savedReports.find(r => r.id === id);
    if (report) downloadReportExcel(report);
  },
  downloadPdf: (id: string) => {
    const report = savedReports.find(r => r.id === id);
    if (report) downloadReportPdf(report);
  },
  deleteReport: deleteReportFromCloud,
  deleteSelectedReports: deleteSelectedReportsFromCloud,
  toggleSelectAll: toggleSelectAllReports,
  onNewReportLoaded: async (fileInfo: { name: string; size: number; fileBuffer: ArrayBuffer }) => {
    try {
      const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      let base64 = '';
      if (typeof (window as any).Utils?.arrayBufferToBase64 === 'function') {
        base64 = (window as any).Utils.arrayBufferToBase64(fileInfo.fileBuffer, mime);
      } else {
        const bytes = new Uint8Array(fileInfo.fileBuffer);
        const chunks: string[] = [];
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.byteLength; i += chunkSize) {
          chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize))));
        }
        base64 = `data:${mime};base64,${window.btoa(chunks.join(''))}`;
      }
      lastUploadedFile = {
        name: fileInfo.name,
        size: fileInfo.size,
        base64
      };

      if (currentUser) {
        setTimeout(() => {
          saveCurrentReportToCloud(true);
        }, 600);
      }
    } catch (e) {
      console.warn('Could not cache file buffer to base64', e);
    }
  }
};

(window as any).SupabaseStorage = (window as any).CloudStorage;

// Initialize Background Offline Sync Service & UI Listener
subscribeSyncStatus((event: SyncStatusEvent) => {
  currentPendingCount = event.pendingCount;
  const statusMap: Record<SyncStatusEvent['state'], 'synced' | 'syncing' | 'offline' | 'queued'> = {
    synced: 'synced',
    syncing: 'syncing',
    queued: 'queued',
    offline: 'offline',
    error: 'offline'
  };
  setSyncStatus(statusMap[event.state] || 'offline', event.message);

  if (event.syncedCount && event.syncedCount > 0) {
    fetchReports();
  } else if (event.state === 'offline' || event.state === 'queued') {
    renderHistoryDrawer();
  }
});
initSyncService(supabase);

// Initialize Supabase Auth Session and Listeners
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) {
    currentUser = session.user;
    setStoredUser(session.user);
  } else {
    currentUser = getStoredUser();
  }
  renderAuthUI();
  fetchReports();
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    currentUser = session.user;
    setStoredUser(session.user);
    renderAuthUI();
    fetchReports();
  }
});

// Setup DOM bindings on document ready
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('historyToggleBtn')?.addEventListener('click', () => toggleHistoryDrawer());
  document.getElementById('panelSaveCloudBtn')?.addEventListener('click', () => saveCurrentReportToCloud(false));
  document.getElementById('saveCloudBtn')?.addEventListener('click', () => saveCurrentReportToCloud(false));
  document.getElementById('historyCloseBtn')?.addEventListener('click', () => toggleHistoryDrawer(false));
  document.getElementById('historyBackdrop')?.addEventListener('click', () => toggleHistoryDrawer(false));
  
  document.getElementById('historySelectAllCheckbox')?.addEventListener('change', toggleSelectAllReports);
  document.getElementById('historyBulkDeleteBtn')?.addEventListener('click', deleteSelectedReportsFromCloud);

  const searchInput = document.getElementById('historySearchInput') as HTMLInputElement;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      historySearchQuery = (e.target as HTMLInputElement).value;
      renderHistoryDrawer();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleHistoryDrawer(false);
  });
});
