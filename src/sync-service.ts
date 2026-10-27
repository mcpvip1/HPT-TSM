/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Background Sync Service:
 * Automatically monitors online/offline network transitions and flushes
 * queued sensor reports from IndexedDB to Supabase when connection returns.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getPendingReports,
  removePendingReport,
  updatePendingReportStatus,
  getPendingCount,
  OfflineQueuedReport
} from './offline-storage';

export type SyncState = 'synced' | 'syncing' | 'queued' | 'offline' | 'error';

export interface SyncStatusEvent {
  state: SyncState;
  pendingCount: number;
  message?: string;
}

let supabaseInstance: SupabaseClient | null = null;
let isSyncInProgress = false;
let listeners: Array<(event: SyncStatusEvent) => void> = [];

export function subscribeSyncStatus(listener: (event: SyncStatusEvent) => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

function notifyListeners(event: SyncStatusEvent) {
  listeners.forEach(fn => {
    try {
      fn(event);
    } catch (e) {
      console.warn('[SyncService] Listener error:', e);
    }
  });
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function setSupabaseClient(client: SupabaseClient) {
  supabaseInstance = client;
}

/**
 * Maps an OfflineQueuedReport to the Supabase database schema
 */
export function mapQueuedReportToDbRow(report: OfflineQueuedReport, userId: string): Record<string, any> {
  const meta: Record<string, any> = {
    lotNumber: report.lotNumber,
    fileName: report.fileName,
    fileSize: report.fileSize,
    startRange: report.startRange,
    endRange: report.endRange,
    duration: report.duration,
    rowCount: report.rowCount,
    chartMode: report.chartMode || 'color',
    userEmail: report.userEmail,
    userDisplayName: report.userDisplayName,
    offlineCreated: true
  };

  if (report.fileBase64 && report.fileBase64.length < 900000) {
    meta.fileBase64 = report.fileBase64;
  }
  if (report.pdfBase64 && report.pdfBase64.length < 900000) {
    meta.pdfBase64 = report.pdfBase64;
  }

  return {
    id: report.id,
    user_id: userId,
    lot_number: report.lotNumber,
    file_name: report.fileName || `${report.lotNumber}.xlsx`,
    min_threshold: report.minThreshold,
    max_threshold: report.maxThreshold,
    min_temp: report.minTemp ?? null,
    max_temp: report.maxTemp ?? null,
    points_count: report.rowCount || (report.sensorData ? report.sensorData.length : 0),
    sensor_data: report.sensorData || [],
    metadata: meta,
    created_at: report.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Flushes all pending reports in IndexedDB to Supabase
 */
export async function syncPendingReports(): Promise<{ synced: number; failed: number }> {
  if (isSyncInProgress) {
    return { synced: 0, failed: 0 };
  }

  if (!isOnline()) {
    const count = await getPendingCount();
    notifyListeners({
      state: count > 0 ? 'queued' : 'offline',
      pendingCount: count,
      message: count > 0 ? `Offline (${count} pending)` : 'Offline mode'
    });
    return { synced: 0, failed: 0 };
  }

  if (!supabaseInstance) {
    console.warn('[SyncService] Supabase client not initialized');
    return { synced: 0, failed: 0 };
  }

  isSyncInProgress = true;
  let syncedCount = 0;
  let failedCount = 0;

  try {
    const queue = await getPendingReports();
    if (queue.length === 0) {
      notifyListeners({
        state: 'synced',
        pendingCount: 0,
        message: 'Supabase Synced'
      });
      isSyncInProgress = false;
      return { synced: 0, failed: 0 };
    }

    notifyListeners({
      state: 'syncing',
      pendingCount: queue.length,
      message: `Syncing ${queue.length} report${queue.length > 1 ? 's' : ''}...`
    });

    for (const report of queue) {
      if (!isOnline()) {
        break; // Network dropped mid-sync
      }

      await updatePendingReportStatus(report.id, 'syncing');

      try {
        const userId = report.userId || 'operator_offline';
        const dbRow = mapQueuedReportToDbRow(report, userId);

        const { error } = await supabaseInstance
          .from('reports')
          .upsert(dbRow);

        if (error) {
          console.error(`[SyncService] Failed to sync report ${report.id}:`, error.message);
          await updatePendingReportStatus(report.id, 'failed', error.message);
          failedCount++;
        } else {
          await removePendingReport(report.id);
          syncedCount++;
        }
      } catch (itemErr: any) {
        console.error(`[SyncService] Error syncing item ${report.id}:`, itemErr);
        await updatePendingReportStatus(report.id, 'failed', itemErr.message || 'Network error');
        failedCount++;
      }
    }

    const remainingCount = await getPendingCount();

    if (syncedCount > 0) {
      if ((window as any).Toast && typeof (window as any).Toast.success === 'function') {
        (window as any).Toast.success(`☁️ Synced ${syncedCount} offline report${syncedCount > 1 ? 's' : ''} to Supabase!`);
      }
    }

    notifyListeners({
      state: remainingCount > 0 ? 'queued' : 'synced',
      pendingCount: remainingCount,
      message: remainingCount > 0 
        ? `Pending sync (${remainingCount})` 
        : 'Supabase Synced'
    });

    return { synced: syncedCount, failed: failedCount };
  } catch (err) {
    console.error('[SyncService] Global sync loop failed:', err);
    const count = await getPendingCount();
    notifyListeners({
      state: 'error',
      pendingCount: count,
      message: 'Sync error'
    });
    return { synced: syncedCount, failed: failedCount };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Initializes network listeners for automatic background sync
 */
export function initSyncService(supabase: SupabaseClient) {
  setSupabaseClient(supabase);

  // Monitor network state transitions
  window.addEventListener('online', async () => {
    console.log('[SyncService] Connection restored. Triggering auto-sync...');
    if ((window as any).Toast) {
      (window as any).Toast.info('🌐 Connection restored! Syncing offline sensor data...');
    }
    // Small delay to allow full socket handshake
    setTimeout(() => {
      syncPendingReports();
    }, 1000);
  });

  window.addEventListener('offline', async () => {
    console.log('[SyncService] Connection lost. Switching to offline IndexedDB mode.');
    const count = await getPendingCount();
    notifyListeners({
      state: count > 0 ? 'queued' : 'offline',
      pendingCount: count,
      message: count > 0 ? `Offline (${count} pending)` : 'Offline mode'
    });
    if ((window as any).Toast) {
      (window as any).Toast.warning('📡 Working Offline. All sensor uploads will be preserved in IndexedDB.');
    }
  });

  // Initial check on load
  getPendingCount().then(count => {
    if (count > 0 && isOnline()) {
      setTimeout(() => syncPendingReports(), 2000);
    } else {
      notifyListeners({
        state: isOnline() ? 'synced' : 'offline',
        pendingCount: count,
        message: !isOnline() ? `Offline (${count} pending)` : undefined
      });
    }
  });
}
