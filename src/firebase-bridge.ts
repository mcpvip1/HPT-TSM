/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDocFromServer, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp, 
  deleteDoc 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App, Auth, and Firestore
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Strictly adhere to FirestoreErrorInfo and OperationType
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Mandatory connection test on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firestore] Connection test passed');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// State & Interfaces
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
  createdAt?: any;
  updatedAt?: any;
}

let currentUser: User | null = null;
let savedReports: SavedReport[] = [];
let unsubscribeReports: (() => void) | null = null;
let lastUploadedFile: { name: string; size: number; base64: string } | null = null;

// UI Elements & Helpers
function setSyncStatus(status: 'synced' | 'syncing' | 'offline' | 'saved', text?: string) {
  const el = document.getElementById('cloudSyncStatus');
  if (!el) return;
  
  const textEl = el.querySelector('.status-text');
  el.className = `cloud-status cloud-status--${status}`;
  
  if (textEl) {
    if (text) {
      textEl.textContent = text;
    } else {
      switch (status) {
        case 'synced':
          textEl.textContent = 'Cloud Synced';
          break;
        case 'syncing':
          textEl.textContent = 'Syncing...';
          break;
        case 'saved':
          textEl.textContent = 'Saved to Cloud';
          break;
        case 'offline':
        default:
          textEl.textContent = currentUser ? 'Cloud Ready' : 'Sign in to sync';
          break;
      }
    }
  }
}

function updateHistoryBadge() {
  const badge = document.getElementById('historyCountBadge');
  if (badge) {
    badge.textContent = String(savedReports.length);
    badge.style.display = savedReports.length > 0 ? 'inline-flex' : 'none';
  }
}

function renderAuthUI() {
  const container = document.getElementById('authContainer');
  if (!container) return;

  if (currentUser) {
    const initials = (currentUser.displayName || currentUser.email || 'U')
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const avatarHtml = currentUser.photoURL 
      ? `<img src="${currentUser.photoURL}" alt="avatar" class="user-avatar-img">`
      : `<div class="user-avatar-fallback">${initials}</div>`;

    container.innerHTML = `
      <div class="user-profile-badge" title="${currentUser.email || ''}">
        ${avatarHtml}
        <div class="user-info-text">
          <span class="user-name">${currentUser.displayName || 'Authorized User'}</span>
          <span class="user-email">${currentUser.email || ''}</span>
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
      <button id="signInBtn" class="auth-btn auth-btn--login" title="Sign in with your Google account">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span>Google Sign In</span>
      </button>
    `;

    document.getElementById('signInBtn')?.addEventListener('click', handleSignIn);
  }
}

async function handleSignIn() {
  try {
    setSyncStatus('syncing', 'Signing in...');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // Upsert User Profile
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      userId: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      updatedAt: serverTimestamp()
    }, { merge: true });

    (window as any).Toast?.success(`Signed in as ${user.displayName || user.email}`);
  } catch (err: any) {
    console.error('Sign-in error:', err);
    setSyncStatus('offline');
    (window as any).Toast?.error('Sign in failed: ' + (err.message || 'Unknown error'));
  }
}

async function handleSignOut() {
  try {
    if (unsubscribeReports) {
      unsubscribeReports();
      unsubscribeReports = null;
    }
    await signOut(auth);
    savedReports = [];
    renderHistoryDrawer();
    updateHistoryBadge();
    setSyncStatus('offline', 'Signed out');
    (window as any).Toast?.info('Signed out of cloud database');
  } catch (err: any) {
    console.error('Sign-out error:', err);
  }
}

// Auth State Observer & Real-time Reports Listener
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  renderAuthUI();

  if (user) {
    setSyncStatus('syncing', 'Connecting cloud...');
    
    // Attach real-time snapshot listener
    const pathForReports = 'reports';
    const reportsQuery = query(
      collection(db, pathForReports),
      where('userId', '==', user.uid)
    );

    if (unsubscribeReports) unsubscribeReports();

    unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      const items: SavedReport[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as SavedReport;
        items.push({ ...data, id: docSnap.id });
      });

      // Sort client-side by updatedAt descending
      items.sort((a, b) => {
        const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
        const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
        return tb - ta;
      });

      savedReports = items;
      renderHistoryDrawer();
      updateHistoryBadge();
      setSyncStatus('synced', `${items.length} Reports in Cloud`);
    }, (error) => {
      setSyncStatus('offline', 'Sync error');
      handleFirestoreError(error, OperationType.GET, pathForReports);
    });

  } else {
    if (unsubscribeReports) {
      unsubscribeReports();
      unsubscribeReports = null;
    }
    savedReports = [];
    renderHistoryDrawer();
    updateHistoryBadge();
    setSyncStatus('offline', 'Sign in to sync');
  }
});

// Cloud Storage Operations
export async function saveCurrentReportToCloud(isAutoSave = false) {
  const state = (window as any).state;
  if (!state || !state.sensorData || state.sensorData.length === 0) {
    if (!isAutoSave) (window as any).Toast?.error('No report data to save to cloud.');
    return;
  }

  if (!currentUser) {
    if (!isAutoSave) {
      (window as any).Toast?.info('Please click "Google Sign In" above to save reports to the cloud database.');
      handleSignIn();
    }
    return;
  }

  setSyncStatus('syncing', 'Saving to Cloud...');

  try {
    const lotInput = (document.getElementById('lotNumberInput') as HTMLInputElement)?.value.trim() || state.lotNumber || 'EXT-UNKNOWN';
    const minThreshold = parseFloat((document.getElementById('minThreshold') as HTMLInputElement)?.value) || 35.0;
    const maxThreshold = parseFloat((document.getElementById('maxThreshold') as HTMLInputElement)?.value) || 39.0;
    const startRange = (window as any).Dashboard?.readStart() || (state.sensorData[0]?.time || '');
    const endRange = (window as any).Dashboard?.readEnd() || (state.sensorData[state.sensorData.length - 1]?.time || '');
    const duration = (document.getElementById('footerDurationVal')?.textContent || '').trim() || (window as any).Utils?.formatDuration(startRange, endRange) || '—';
    
    const temps = state.sensorData.map((d: any) => d.temp);
    const minTemp = temps.length ? Math.min(...temps) : 0;
    const maxTemp = temps.length ? Math.max(...temps) : 0;

    // Generate PDF Base64 in background
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

    const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const reportRef = doc(db, 'reports', reportId);

    // Limit sensorData if very huge to maintain 1MB Firestore threshold
    const sampleData = state.sensorData.length > 2000
      ? state.sensorData.filter((_: any, idx: number) => idx % Math.ceil(state.sensorData.length / 1500) === 0)
      : state.sensorData;

    const payload: SavedReport = {
      id: reportId,
      lotNumber: lotInput,
      fileName: lastUploadedFile?.name || `Report_${lotInput}.xlsx`,
      fileSize: lastUploadedFile?.size || 0,
      fileBase64: (lastUploadedFile && lastUploadedFile.base64.length < 750000) ? lastUploadedFile.base64 : '',
      pdfBase64: (pdfDataUri && pdfDataUri.length < 750000) ? pdfDataUri : '',
      minThreshold,
      maxThreshold,
      startRange,
      endRange,
      minTemp: parseFloat(minTemp.toFixed(2)),
      maxTemp: parseFloat(maxTemp.toFixed(2)),
      duration,
      rowCount: state.sensorData.length,
      sensorData: sampleData,
      chartMode: state.chartMode || 'color',
      userId: currentUser.uid,
      userEmail: currentUser.email || '',
      userDisplayName: currentUser.displayName || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(reportRef, payload);
    setSyncStatus('saved', `Saved Lot: ${lotInput}`);
    
    (window as any).Toast?.success(
      isAutoSave 
        ? `☁️ Auto-saved Lot [${lotInput}] to cloud database` 
        : `☁️ Saved Report Lot [${lotInput}] to cloud`
    );
  } catch (error) {
    setSyncStatus('offline', 'Save failed');
    handleFirestoreError(error, OperationType.CREATE, 'reports');
  }
}

export function loadReportIntoApp(report: SavedReport) {
  if (!report || !report.sensorData || report.sensorData.length === 0) {
    (window as any).Toast?.error('Selected report contains no sensor data.');
    return;
  }

  const state = (window as any).state;
  const Dashboard = (window as any).Dashboard;

  state.sensorData = report.sensorData.slice();
  state.rawData = report.sensorData.slice();
  state.lotNumber = report.lotNumber || '';

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

  if (report.startRange && report.endRange) {
    Dashboard?._write('start', report.startRange);
    Dashboard?._write('end', report.endRange);
    Dashboard?.update();
  } else {
    Dashboard?.showFullResult();
  }

  // Close drawer
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
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = report.fileName || `Temperature_Report_${report.lotNumber}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      (window as any).Toast?.success(`📥 Downloaded ${link.download}`);
      return;
    } catch (e) {
      console.warn('Direct base64 decode failed, exporting reconstructed sheet', e);
    }
  }

  // Fallback: Reconstruct XLSX from sensorData
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
    // If not stored as pre-rendered PDF, load it and trigger exporter
    loadReportIntoApp(report);
    setTimeout(() => {
      (window as any).Exporter?.exportPDF();
    }, 400);
  }
}

export async function deleteReportFromCloud(reportId: string, lotNumber: string) {
  if (!confirm(`Are you sure you want to delete report for Lot "${lotNumber}" from the cloud database?`)) {
    return;
  }

  try {
    setSyncStatus('syncing', 'Deleting...');
    await deleteDoc(doc(db, 'reports', reportId));
    (window as any).Toast?.success(`🗑️ Deleted report for Lot ${lotNumber}`);
    setSyncStatus('synced');
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `reports/${reportId}`);
  }
}

// History Drawer Render & Search
let historySearchQuery = '';

export function toggleHistoryDrawer(force?: boolean) {
  const drawer = document.getElementById('historyDrawer');
  const backdrop = document.getElementById('historyBackdrop');
  if (!drawer || !backdrop) return;

  const isOpen = force !== undefined ? force : !drawer.classList.contains('is-open');
  if (isOpen) {
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
    renderHistoryDrawer();
  } else {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
  }
}

export function renderHistoryDrawer() {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;

  if (!currentUser) {
    listEl.innerHTML = `
      <div class="history-empty">
        <div class="history-empty__icon">🔒</div>
        <h4>Cloud Authentication Required</h4>
        <p>Sign in with your Google account to view and sync past temperature test reports.</p>
        <button class="tbtn tbtn--upload" onclick="window.CloudStorage.signIn()">
          <span>Sign In with Google</span>
        </button>
      </div>
    `;
    return;
  }

  if (savedReports.length === 0) {
    listEl.innerHTML = `
      <div class="history-empty">
        <div class="history-empty__icon">📊</div>
        <h4>No Reports in Cloud Yet</h4>
        <p>Upload an Excel sensor file or click "Save Cloud" to store your first report.</p>
      </div>
    `;
    return;
  }

  const query = historySearchQuery.trim().toLowerCase();
  const filtered = savedReports.filter(r => {
    if (!query) return true;
    return (r.lotNumber && r.lotNumber.toLowerCase().includes(query)) ||
           (r.fileName && r.fileName.toLowerCase().includes(query)) ||
           (r.startRange && r.startRange.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="history-empty">
        <div class="history-empty__icon">🔍</div>
        <h4>No matching reports</h4>
        <p>No reports matched "${historySearchQuery}". Try another Lot Number.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(report => {
    const minThreshold = report.minThreshold ?? 35.0;
    const maxThreshold = report.maxThreshold ?? 39.0;
    const isExcursion = (report.minTemp != null && report.minTemp < minThreshold) ||
                        (report.maxTemp != null && report.maxTemp > maxThreshold);

    const statusBadge = isExcursion
      ? `<span class="badge badge--warn">⚠️ Excursion (${report.minTemp}°–${report.maxTemp}°C)</span>`
      : `<span class="badge badge--ok">✅ Compliant (${report.minTemp}°–${report.maxTemp}°C)</span>`;

    const dateFormatted = report.updatedAt?.toDate 
      ? report.updatedAt.toDate().toLocaleString() 
      : (report.startRange || '—');

    return `
      <div class="history-card" data-id="${report.id}">
        <div class="history-card__header">
          <div class="history-card__lot">
            <span class="lot-icon">🏷️</span>
            <strong class="lot-number">${report.lotNumber || '—'}</strong>
          </div>
          ${statusBadge}
        </div>
        
        <div class="history-card__meta">
          <div class="meta-row">
            <span class="meta-label">File:</span>
            <span class="meta-val truncate" title="${report.fileName || ''}">${report.fileName || 'Excel Log'}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Date:</span>
            <span class="meta-val">${dateFormatted}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Duration:</span>
            <span class="meta-val">${report.duration || '—'} (${report.rowCount || 0} pts)</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Range:</span>
            <span class="meta-val">${minThreshold}°C ~ ${maxThreshold}°C</span>
          </div>
        </div>

        <div class="history-card__actions">
          <button class="hcard-btn hcard-btn--load" onclick="window.CloudStorage.loadReport('${report.id}')" title="Load report into dashboard">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            <span>Load</span>
          </button>
          
          <button class="hcard-btn" onclick="window.CloudStorage.downloadExcel('${report.id}')" title="Download Excel spreadsheet">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            <span>Excel</span>
          </button>
          
          <button class="hcard-btn" onclick="window.CloudStorage.downloadPdf('${report.id}')" title="Download A4 PDF report">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>
            </svg>
            <span>PDF</span>
          </button>

          <button class="hcard-btn hcard-btn--delete" onclick="window.CloudStorage.deleteReport('${report.id}', '${report.lotNumber}')" title="Delete from cloud">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

export async function saveDirectReport(reportPayload: {
  lotNumber: string;
  fileName: string;
  fileSize: number;
  fileBase64?: string;
  pdfBase64?: string;
  minThreshold: number;
  maxThreshold: number;
  startRange?: string;
  endRange?: string;
  minTemp: number;
  maxTemp: number;
  duration?: string;
  rowCount: number;
  sensorData: Array<{ time: string; temp: number }>;
  chartMode?: 'color' | 'mono';
}): Promise<boolean> {
  if (!currentUser) return false;
  try {
    const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const reportRef = doc(db, 'reports', reportId);

    const sampleData = reportPayload.sensorData.length > 2000
      ? reportPayload.sensorData.filter((_: any, idx: number) => idx % Math.ceil(reportPayload.sensorData.length / 1500) === 0)
      : reportPayload.sensorData;

    const payload: SavedReport = {
      id: reportId,
      lotNumber: reportPayload.lotNumber,
      fileName: reportPayload.fileName,
      fileSize: reportPayload.fileSize,
      fileBase64: (reportPayload.fileBase64 && reportPayload.fileBase64.length < 750000) ? reportPayload.fileBase64 : '',
      pdfBase64: (reportPayload.pdfBase64 && reportPayload.pdfBase64.length < 750000) ? reportPayload.pdfBase64 : '',
      minThreshold: reportPayload.minThreshold,
      maxThreshold: reportPayload.maxThreshold,
      startRange: reportPayload.startRange,
      endRange: reportPayload.endRange,
      minTemp: reportPayload.minTemp,
      maxTemp: reportPayload.maxTemp,
      duration: reportPayload.duration,
      rowCount: reportPayload.rowCount,
      sensorData: sampleData,
      chartMode: reportPayload.chartMode || 'color',
      userId: currentUser.uid,
      userEmail: currentUser.email || '',
      userDisplayName: currentUser.displayName || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(reportRef, payload);
    return true;
  } catch (err) {
    console.warn('Failed to save batch report directly:', err);
    return false;
  }
}

// Window Bridge API for existing vanilla JS scripts
(window as any).CloudStorage = {
  signIn: handleSignIn,
  signOut: handleSignOut,
  saveCurrentReport: () => saveCurrentReportToCloud(false),
  saveDirectReport: saveDirectReport,
  toggleHistory: toggleHistoryDrawer,
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
  onNewReportLoaded: async (fileInfo: { name: string; size: number; fileBuffer: ArrayBuffer }) => {
    try {
      // Convert buffer to Base64
      let binary = '';
      const bytes = new Uint8Array(fileInfo.fileBuffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + window.btoa(binary);
      lastUploadedFile = {
        name: fileInfo.name,
        size: fileInfo.size,
        base64
      };

      // Auto-save to Firestore if authenticated
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

// Bind history search and close events once DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('historyToggleBtn')?.addEventListener('click', () => toggleHistoryDrawer());
  document.getElementById('saveCloudBtn')?.addEventListener('click', () => saveCurrentReportToCloud(false));
  document.getElementById('historyCloseBtn')?.addEventListener('click', () => toggleHistoryDrawer(false));
  document.getElementById('historyBackdrop')?.addEventListener('click', () => toggleHistoryDrawer(false));
  
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
