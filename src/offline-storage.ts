/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IndexedDB Storage Engine for High-Capacity Sensor Data & Offline Queue
 * Database: hpt_sensor_db (v1)
 * Object Stores:
 *   - pending_reports: Queue of sensor datasets to sync to Supabase once online
 *   - cached_reports: Persistent cache of all reports (bypasses 5MB localStorage limits)
 *   - active_session: Auto-save cache for current working sensor dataset
 */

export interface OfflineQueuedReport {
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
  sensorData: Array<{ time: string; temp: number }>;
  chartMode?: 'color' | 'mono';
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  status: 'pending' | 'syncing' | 'failed';
  attempts: number;
  lastAttemptAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = 'hpt_sensor_db';
const DB_VERSION = 1;
const STORE_PENDING = 'pending_reports';
const STORE_CACHED = 'cached_reports';
const STORE_SESSION = 'active_session';

let dbInstance: IDBDatabase | null = null;

export async function openSensorDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Pending reports queue (indexed by id, lotNumber, and status)
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        const pendingStore = db.createObjectStore(STORE_PENDING, { keyPath: 'id' });
        pendingStore.createIndex('lotNumber', 'lotNumber', { unique: false });
        pendingStore.createIndex('status', 'status', { unique: false });
        pendingStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Cached reports mirror
      if (!db.objectStoreNames.contains(STORE_CACHED)) {
        const cachedStore = db.createObjectStore(STORE_CACHED, { keyPath: 'id' });
        cachedStore.createIndex('lotNumber', 'lotNumber', { unique: false });
        cachedStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Active sensor working session
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event: Event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event: Event) => {
      const err = (event.target as IDBOpenDBRequest).error;
      reject(err || new Error('Failed to open IndexedDB'));
    };
  });
}

// -------------------------------------------------------------
// PENDING SYNC QUEUE OPERATIONS
// -------------------------------------------------------------

export async function enqueuePendingReport(report: OfflineQueuedReport): Promise<void> {
  const db = await openSensorDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PENDING, STORE_CACHED], 'readwrite');
    const pendingStore = tx.objectStore(STORE_PENDING);
    const cachedStore = tx.objectStore(STORE_CACHED);

    const now = new Date().toISOString();
    report.updatedAt = now;
    if (!report.createdAt) report.createdAt = now;
    if (report.attempts === undefined) report.attempts = 0;
    if (!report.status) report.status = 'pending';

    pendingStore.put(report);
    cachedStore.put(report);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingReports(): Promise<OfflineQueuedReport[]> {
  const db = await openSensorDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, 'readonly');
    const store = tx.objectStore(STORE_PENDING);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = (request.result || []) as OfflineQueuedReport[];
      // Sort oldest first (FIFO) for deterministic sync
      results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function removePendingReport(id: string): Promise<void> {
  const db = await openSensorDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, 'readwrite');
    const store = tx.objectStore(STORE_PENDING);
    store.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updatePendingReportStatus(
  id: string,
  status: 'pending' | 'syncing' | 'failed',
  errorMsg?: string
): Promise<void> {
  const db = await openSensorDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING, 'readwrite');
    const store = tx.objectStore(STORE_PENDING);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const item = getReq.result as OfflineQueuedReport | undefined;
      if (!item) {
        resolve();
        return;
      }
      item.status = status;
      item.lastAttemptAt = new Date().toISOString();
      if (status === 'failed') {
        item.attempts = (item.attempts || 0) + 1;
        item.error = errorMsg || 'Sync failed';
      } else if (status === 'syncing') {
        item.error = undefined;
      }
      store.put(item);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCount(): Promise<number> {
  try {
    const db = await openSensorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING, 'readonly');
      const store = tx.objectStore(STORE_PENDING);
      const countReq = store.count();

      countReq.onsuccess = () => resolve(countReq.result || 0);
      countReq.onerror = () => reject(countReq.error);
    });
  } catch (e) {
    console.warn('[IndexedDB] Could not count pending reports:', e);
    return 0;
  }
}

// -------------------------------------------------------------
// CACHED REPORTS MIRROR (High Capacity Offline Archive)
// -------------------------------------------------------------

export async function getAllCachedReports(): Promise<OfflineQueuedReport[]> {
  try {
    const db = await openSensorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED, 'readonly');
      const store = tx.objectStore(STORE_CACHED);
      const req = store.getAll();

      req.onsuccess = () => {
        const results = (req.result || []) as OfflineQueuedReport[];
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
}

export async function saveReportsToCache(reports: OfflineQueuedReport[]): Promise<void> {
  const db = await openSensorDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHED, 'readwrite');
    const store = tx.objectStore(STORE_CACHED);
    reports.forEach(r => store.put(r));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCachedReport(id: string): Promise<void> {
  const db = await openSensorDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CACHED, STORE_PENDING], 'readwrite');
    tx.objectStore(STORE_CACHED).delete(id);
    tx.objectStore(STORE_PENDING).delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// -------------------------------------------------------------
// ACTIVE SESSION SENSOR DATA CACHE (Replaces 5MB localStorage)
// -------------------------------------------------------------

export async function saveActiveSessionData(key: string, data: any): Promise<void> {
  try {
    const db = await openSensorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSION, 'readwrite');
      const store = tx.objectStore(STORE_SESSION);
      store.put({ key, data, timestamp: Date.now() });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[IndexedDB] Failed to cache active session', e);
  }
}

export async function getActiveSessionData(key: string): Promise<any | null> {
  try {
    const db = await openSensorDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSION, 'readonly');
      const store = tx.objectStore(STORE_SESSION);
      const req = store.get(key);

      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}
