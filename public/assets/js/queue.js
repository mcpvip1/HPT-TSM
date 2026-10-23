/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * QueueManager: Handles bulk simultaneous uploads of sensor data files,
 * executes queued sequential processing with robust error handling & retry logic,
 * and displays live progress indicators with interactive report loaders.
 */

const QueueManager = {
    queue: [],
    isProcessing: false,
    currentIndex: -1,

    init() {
        const modal = document.getElementById('bulkUploadModal');
        const backdrop = document.getElementById('bulkUploadBackdrop');
        const closeBtn = document.getElementById('bulkCloseBtn');
        const retryAllBtn = document.getElementById('bulkRetryAllBtn');
        const fileInput = document.getElementById('fileInput');

        if (fileInput) {
            fileInput.setAttribute('multiple', 'true');
        }

        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
        if (retryAllBtn) retryAllBtn.addEventListener('click', () => this.retryAllFailed());
        if (backdrop) backdrop.addEventListener('click', () => {
            if (!this.isProcessing) this.close();
        });

        // Setup Drag & Drop zone on window
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.add('is-dragging-file');
        });

        window.addEventListener('dragleave', (e) => {
            if (e.clientX <= 0 || e.clientY <= 0) {
                document.body.classList.remove('is-dragging-file');
            }
        });

        window.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.remove('is-dragging-file');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const files = Array.from(e.dataTransfer.files);
                if (files.length === 1 && window.App && typeof window.App.handleUpload === 'function') {
                    window.App.handleUpload({ target: { files } });
                } else {
                    this.handleFiles(files);
                }
            }
        });
    },

    open() {
        const modal = document.getElementById('bulkUploadModal');
        const backdrop = document.getElementById('bulkUploadBackdrop');
        if (modal) modal.classList.add('is-open');
        if (backdrop) backdrop.classList.add('is-open');
    },

    close() {
        if (this.isProcessing) {
            if (!confirm('Processing is still in progress. Are you sure you want to dismiss the queue view?')) {
                return;
            }
        }
        const modal = document.getElementById('bulkUploadModal');
        const backdrop = document.getElementById('bulkUploadBackdrop');
        if (modal) modal.classList.remove('is-open');
        if (backdrop) backdrop.classList.remove('is-open');
    },

    handleFiles(fileList) {
        // Filter for Excel / CSV files
        const validFiles = fileList.filter(f => {
            const ext = f.name.split('.').pop()?.toLowerCase();
            return ['xlsx', 'xls', 'csv'].includes(ext);
        });

        if (validFiles.length === 0) {
            Toast.error('Please select valid Excel (.xlsx, .xls) or CSV (.csv) sensor files.');
            return;
        }

        this.queue = validFiles.map((file, idx) => ({
            id: idx,
            file,
            name: file.name,
            size: file.size,
            status: 'queued', // queued | reading | parsing | saving | done | error
            progress: 0,
            lotNumber: '—',
            rowCount: 0,
            duration: '—',
            minTemp: null,
            maxTemp: null,
            compliancePct: null,
            savedToCloud: false,
            error: null,
            parsedData: null,
            retries: 0
        }));

        this.currentIndex = -1;
        this.open();
        this.render();
        this.startQueue();
    },

    async processSingleItem(item) {
        // 1. Reading file
        item.status = 'reading';
        item.progress = 25;
        this.render();
        await Utils.sleep(40);

        try {
            const buffer = await item.file.arrayBuffer();
            item.progress = 50;
            item.status = 'parsing';
            this.render();
            await Utils.sleep(40);

            // 2. Reading workbook
            const workbook = XLSX.read(new Uint8Array(buffer), {
                type: 'array',
                cellDates: true,
                cellNF: false,
                cellText: false
            });

            let bestResult = null;
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                if (!sheet) continue;
                const rows = XLSX.utils.sheet_to_json(sheet, {
                    header: 1, blankrows: true, raw: true, defval: null
                });
                if (!rows || rows.length === 0) continue;

                const result = Parser.parse(rows);
                if (result && result.data && result.data.length > 0) {
                    if (!bestResult || result.data.length > bestResult.data.length) {
                        bestResult = result;
                    }
                }
            }

            if (!bestResult || bestResult.data.length === 0) {
                throw new Error('No valid temperature/time series columns found');
            }

            item.progress = 75;
            item.parsedData = bestResult;
            item.lotNumber = bestResult.lot || 'EXT-UNSPECIFIED';
            item.rowCount = bestResult.data.length;

            const firstTime = bestResult.data[0].time;
            const lastTime = bestResult.data[bestResult.data.length - 1].time;
            item.duration = Utils.formatDuration(firstTime, lastTime) || '—';

            const temps = bestResult.data.map(d => d.temp);
            item.minTemp = Math.min(...temps);
            item.maxTemp = Math.max(...temps);

            const minThresh = parseFloat(document.getElementById('minThreshold')?.value) || 35.0;
            const maxThresh = parseFloat(document.getElementById('maxThreshold')?.value) || 39.0;
            const inRange = bestResult.data.filter(d => d.temp >= minThresh && d.temp <= maxThresh).length;
            item.compliancePct = parseFloat(((inRange / bestResult.data.length) * 100).toFixed(1));

            // 3. Attempt direct save to Cloud Firestore with Lot Number as filename
            if (window.CloudStorage && typeof window.CloudStorage.saveDirectReport === 'function') {
                item.status = 'saving';
                item.progress = 90;
                this.render();

                // Convert file buffer to Base64
                let binary = '';
                const bytes = new Uint8Array(buffer);
                for (let b = 0; b < bytes.byteLength; b++) {
                    binary += String.fromCharCode(bytes[b]);
                }
                const base64 = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + window.btoa(binary);
                const cloudFileName = item.lotNumber.toLowerCase().endsWith('.xlsx') ? item.lotNumber : `${item.lotNumber}.xlsx`;

                const saved = await window.CloudStorage.saveDirectReport({
                    lotNumber: item.lotNumber,
                    fileName: cloudFileName,
                    fileSize: item.size,
                    fileBase64: base64,
                    minThreshold: minThresh,
                    maxThreshold: maxThresh,
                    startRange: bestResult.start || firstTime,
                    endRange: bestResult.end || lastTime,
                    minTemp: parseFloat(item.minTemp.toFixed(2)),
                    maxTemp: parseFloat(item.maxTemp.toFixed(2)),
                    duration: item.duration,
                    rowCount: item.rowCount,
                    sensorData: bestResult.data,
                    chartMode: state.chartMode || 'color'
                });

                item.savedToCloud = !!saved;
            }

            item.status = 'done';
            item.progress = 100;
            item.error = null;
            return true;

        } catch (err) {
            console.warn(`[Bulk Parser] Error processing ${item.name}:`, err);
            item.status = 'error';
            item.progress = 100;
            item.error = err.message || 'File parsing failed';
            return false;
        }
    },

    async startQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.updateHeaderSummary();

        let successCount = 0;
        let firstSuccessfulResult = null;

        for (let i = 0; i < this.queue.length; i++) {
            const item = this.queue[i];
            if (item.status === 'done') {
                successCount++;
                if (!firstSuccessfulResult) firstSuccessfulResult = item;
                continue;
            }

            this.currentIndex = i;
            const ok = await this.processSingleItem(item);
            if (ok) {
                successCount++;
                if (!firstSuccessfulResult) firstSuccessfulResult = item;
            }
            this.render();
            await Utils.sleep(100);
        }

        this.isProcessing = false;
        this.updateHeaderSummary();
        this.render();

        // If at least one succeeded and current chart is demo or empty, load the first file
        if (firstSuccessfulResult && firstSuccessfulResult.parsedData) {
            this.loadToDashboard(firstSuccessfulResult.id, false);
            Toast.success(`Batch complete: ${successCount} of ${this.queue.length} files processed successfully.`);
        } else {
            Toast.error(`Batch processing completed with errors. Click "Retry" on failed items.`);
        }
    },

    /**
     * Retry a single failed item
     */
    async retryItem(itemId) {
        const item = this.queue.find(q => q.id === itemId);
        if (!item) return;

        item.status = 'queued';
        item.progress = 0;
        item.error = null;
        item.retries = (item.retries || 0) + 1;
        this.render();

        if (!this.isProcessing) {
            this.isProcessing = true;
            this.updateHeaderSummary();
            await this.processSingleItem(item);
            this.isProcessing = false;
            this.updateHeaderSummary();
            this.render();
            if (item.status === 'done') {
                Toast.success(`✅ Successfully parsed ${item.name}`);
            } else {
                Toast.error(`❌ Retry failed for ${item.name}: ${item.error}`);
            }
        }
    },

    /**
     * Retry all items currently in error state
     */
    async retryAllFailed() {
        if (this.isProcessing) return;

        const failedItems = this.queue.filter(q => q.status === 'error');
        if (failedItems.length === 0) return;

        failedItems.forEach(item => {
            item.status = 'queued';
            item.progress = 0;
            item.error = null;
            item.retries = (item.retries || 0) + 1;
        });

        Toast.info(`🔄 Retrying ${failedItems.length} failed file(s)...`);
        this.render();
        await this.startQueue();
    },

    loadToDashboard(itemId, showToast = true) {
        const item = this.queue.find(q => q.id === itemId);
        if (!item || !item.parsedData) {
            Toast.error('Cannot load this file: data unavailable.');
            return;
        }

        state.sensorData = item.parsedData.data.slice();
        state.rawData = item.parsedData.data.slice();

        if (item.lotNumber && item.lotNumber !== '—') {
            document.getElementById('lotNumberInput').value = item.lotNumber;
            Dashboard.updateLotBadge();
        }

        Dashboard.showFullResult();

        if (showToast) {
            this.close();
            Toast.success(`✅ Active Report switched to Lot [${item.lotNumber}] (${item.name})`);
        }
    },

    updateHeaderSummary() {
        const countEl = document.getElementById('bulkQueueCount');
        const progressBar = document.getElementById('bulkOverallProgress');
        const subTitle = document.getElementById('bulkQueueSubtitle');
        const retryAllBtn = document.getElementById('bulkRetryAllBtn');

        if (!countEl) return;

        const total = this.queue.length;
        const finished = this.queue.filter(q => q.status === 'done' || q.status === 'error').length;
        const failedCount = this.queue.filter(q => q.status === 'error').length;
        const pct = total > 0 ? Math.round((finished / total) * 100) : 0;

        countEl.textContent = `${finished}/${total}`;
        if (progressBar) progressBar.style.width = `${pct}%`;

        // Toggle Retry All button
        if (retryAllBtn) {
            if (failedCount > 0 && !this.isProcessing) {
                retryAllBtn.style.display = 'inline-flex';
                retryAllBtn.innerHTML = `<span>🔄 Retry All Failed (${failedCount})</span>`;
            } else {
                retryAllBtn.style.display = 'none';
            }
        }

        if (subTitle) {
            if (this.isProcessing) {
                subTitle.textContent = `Processing file ${this.currentIndex + 1} of ${total} (${pct}%)...`;
            } else if (total > 0) {
                const successes = this.queue.filter(q => q.status === 'done').length;
                subTitle.textContent = `Completed · ${successes} successful, ${failedCount} failed`;
            } else {
                subTitle.textContent = 'Queue ready';
            }
        }
    },

    render() {
        this.updateHeaderSummary();
        const listEl = document.getElementById('bulkQueueList');
        if (!listEl) return;

        listEl.innerHTML = this.queue.map(item => {
            let statusBadge = '';
            let progressClass = '';

            switch (item.status) {
                case 'queued':
                    statusBadge = '<span class="qbadge qbadge--queued">⏳ Queued</span>';
                    progressClass = 'qprogress-bar--waiting';
                    break;
                case 'reading':
                    statusBadge = '<span class="qbadge qbadge--reading"><span class="qspinner"></span> Reading</span>';
                    progressClass = 'qprogress-bar--active';
                    break;
                case 'parsing':
                    statusBadge = '<span class="qbadge qbadge--parsing"><span class="qspinner"></span> Parsing</span>';
                    progressClass = 'qprogress-bar--active';
                    break;
                case 'saving':
                    statusBadge = '<span class="qbadge qbadge--saving"><span class="qspinner"></span> Cloud Sync</span>';
                    progressClass = 'qprogress-bar--active';
                    break;
                case 'done':
                    statusBadge = '<span class="qbadge qbadge--done">✅ Parsed</span>';
                    progressClass = 'qprogress-bar--done';
                    break;
                case 'error':
                    statusBadge = `<span class="qbadge qbadge--error" title="${item.error}">❌ Error</span>`;
                    progressClass = 'qprogress-bar--error';
                    break;
            }

            const cloudPill = item.savedToCloud 
                ? '<span class="qcloud-pill" title="Saved to Cloud Firestore">☁️ Synced</span>'
                : '';

            const complianceBadge = item.compliancePct != null
                ? (item.compliancePct === 100 
                    ? `<span class="qcomp-pill qcomp-pill--ok">100% In-Spec</span>`
                    : `<span class="qcomp-pill qcomp-pill--warn">${item.compliancePct}% Spec</span>`)
                : '';

            const cloudFileName = item.lotNumber.toLowerCase().endsWith('.xlsx') ? item.lotNumber : `${item.lotNumber}.xlsx`;

            return `
                <div class="queue-item queue-item--${item.status}">
                    <div class="queue-item__header">
                        <div class="queue-item__info">
                            <span class="queue-item__icon">📄</span>
                            <div class="queue-item__names">
                                <strong class="queue-item__file truncate" title="${item.name}">${item.name}</strong>
                                <span class="queue-item__lot-orig">Original: <code>${item.name}</code></span>
                            </div>
                        </div>
                        <div class="queue-item__badges">
                            ${cloudPill}
                            ${complianceBadge}
                            ${statusBadge}
                        </div>
                    </div>

                    <!-- Editable Lot Number & Target Cloud File Name -->
                    <div class="queue-item__lot-edit-box">
                        <div class="queue-lot-field">
                            <label class="queue-item__lot-lbl">Lot Number:</label>
                            <input type="text" class="queue-lot-input" data-id="${item.id}" value="${item.lotNumber !== '—' ? item.lotNumber : ''}" placeholder="Enter Lot Number">
                        </div>
                        <div class="queue-cloud-name">
                            <span>☁️ Cloud File:</span>
                            <code>${cloudFileName}</code>
                        </div>
                    </div>

                    <div class="queue-item__progress-wrap">
                        <div class="queue-item__progress-bar ${progressClass}" style="width: ${item.progress}%"></div>
                    </div>

                    <div class="queue-item__footer">
                        <div class="queue-item__stats">
                            ${item.status === 'done' 
                                ? `<span>📊 ${item.rowCount} rows</span> · <span>⏱️ ${item.duration}</span> · <span>🌡️ ${item.minTemp?.toFixed(1)}° ~ ${item.maxTemp?.toFixed(1)}°C</span>`
                                : (item.status === 'error' 
                                    ? `<span class="qerror-msg">⚠️ ${item.error}${item.retries ? ` (Attempt ${item.retries + 1})` : ''}</span>`
                                    : `<span>Size: ${(item.size / 1024).toFixed(1)} KB</span>`)}
                        </div>

                        <div class="queue-item__actions">
                            ${item.status === 'done' ? `
                                <button class="qaction-btn qaction-btn--load" onclick="QueueManager.loadToDashboard(${item.id})" title="Load into dashboard and show graph">
                                    <span>📊 Show Graph</span>
                                </button>
                                <button class="qaction-btn qaction-btn--save" onclick="QueueManager.saveItemToCloud(${item.id})" title="Save to Cloud as ${cloudFileName}">
                                    <span>☁️ Save Cloud</span>
                                </button>
                                <button class="qaction-btn qaction-btn--config" onclick="QueueManager.openItemInDialog(${item.id})" title="Adjust Start/End dates & Lot Number">
                                    <span>⚙️ Adjust Range</span>
                                </button>
                            ` : ''}
                            ${item.status === 'error' ? `
                                <button class="qaction-btn qaction-btn--retry" onclick="QueueManager.retryItem(${item.id})">
                                    <span>🔄 Retry</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Wire inputs in list
        listEl.querySelectorAll('.queue-lot-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const id = parseInt(e.target.getAttribute('data-id'), 10);
                const item = this.queue.find(q => q.id === id);
                if (item) {
                    item.lotNumber = e.target.value.trim() || 'EXT-UNSPECIFIED';
                    this.render();
                }
            });
            input.addEventListener('click', (e) => e.stopPropagation());
        });
    },

    async saveItemToCloud(itemId) {
        const item = this.queue.find(q => q.id === itemId);
        if (!item || !item.parsedData) {
            Toast.error('Cannot save: file data unavailable.');
            return;
        }

        if (!window.CloudStorage || typeof window.CloudStorage.saveDirectReport !== 'function') {
            Toast.error('Cloud storage service not connected.');
            return;
        }

        try {
            item.status = 'saving';
            this.render();
            Toast.info(`☁️ Saving Lot [${item.lotNumber}] to Cloud Firestore...`);

            const buffer = await item.file.arrayBuffer();
            let binary = '';
            const bytes = new Uint8Array(buffer);
            for (let b = 0; b < bytes.byteLength; b++) {
                binary += String.fromCharCode(bytes[b]);
            }
            const base64 = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + window.btoa(binary);

            const minThresh = parseFloat(document.getElementById('minThreshold')?.value) || 35.0;
            const maxThresh = parseFloat(document.getElementById('maxThreshold')?.value) || 39.0;
            const cloudFileName = item.lotNumber.toLowerCase().endsWith('.xlsx') ? item.lotNumber : `${item.lotNumber}.xlsx`;

            const saved = await window.CloudStorage.saveDirectReport({
                lotNumber: item.lotNumber,
                fileName: cloudFileName,
                fileSize: item.size,
                fileBase64: base64,
                minThreshold: minThresh,
                maxThreshold: maxThresh,
                startRange: item.parsedData.start || item.parsedData.data[0]?.time,
                endRange: item.parsedData.end || item.parsedData.data[item.parsedData.data.length - 1]?.time,
                minTemp: parseFloat(item.minTemp.toFixed(2)),
                maxTemp: parseFloat(item.maxTemp.toFixed(2)),
                duration: item.duration,
                rowCount: item.rowCount,
                sensorData: item.parsedData.data,
                chartMode: state.chartMode || 'color'
            });

            item.status = 'done';
            item.savedToCloud = !!saved;
            this.render();

            if (saved) {
                Toast.success(`☁️ Successfully saved Lot [${item.lotNumber}] as "${cloudFileName}" to Cloud!`);
            }
        } catch (err) {
            item.status = 'error';
            item.error = err.message || 'Save to cloud failed';
            this.render();
            Toast.error(`❌ Cloud save failed: ${item.error}`);
        }
    },

    openItemInDialog(itemId) {
        const item = this.queue.find(q => q.id === itemId);
        if (!item || !item.parsedData) return;
        this.close();
        if (window.UploadDialog && typeof window.UploadDialog.open === 'function') {
            window.UploadDialog.open(item.file, item.parsedData);
        }
    }
};

window.QueueManager = QueueManager;
window.addEventListener('DOMContentLoaded', () => QueueManager.init());
