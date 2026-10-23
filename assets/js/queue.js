/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * QueueManager: Handles bulk simultaneous uploads of sensor data files,
 * executes queued sequential processing, and displays live progress indicators.
 */

const QueueManager = {
    queue: [],
    isProcessing: false,
    currentIndex: -1,

    init() {
        const modal = document.getElementById('bulkUploadModal');
        const backdrop = document.getElementById('bulkUploadBackdrop');
        const closeBtn = document.getElementById('bulkCloseBtn');
        const fileInput = document.getElementById('fileInput');

        if (fileInput) {
            fileInput.setAttribute('multiple', 'true');
        }

        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
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
                this.handleFiles(Array.from(e.dataTransfer.files));
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
            parsedData: null
        }));

        this.currentIndex = -1;
        this.open();
        this.render();
        this.startQueue();
    },

    async startQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.updateHeaderSummary();

        let successCount = 0;
        let firstSuccessfulResult = null;

        for (let i = 0; i < this.queue.length; i++) {
            this.currentIndex = i;
            const item = this.queue[i];

            // 1. Reading file
            item.status = 'reading';
            item.progress = 25;
            this.render();
            await Utils.sleep(60);

            try {
                const buffer = await item.file.arrayBuffer();
                item.progress = 45;
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

                // 3. Attempt direct save to Cloud Firestore if logged in
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

                    const saved = await window.CloudStorage.saveDirectReport({
                        lotNumber: item.lotNumber,
                        fileName: item.name,
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
                successCount++;

                if (!firstSuccessfulResult) {
                    firstSuccessfulResult = item;
                }

            } catch (err) {
                console.warn(`[Bulk Parser] Error processing ${item.name}:`, err);
                item.status = 'error';
                item.progress = 100;
                item.error = err.message || 'File parsing failed';
            }

            this.render();
            await Utils.sleep(120);
        }

        this.isProcessing = false;
        this.updateHeaderSummary();

        // If at least one succeeded, load the first into the active dashboard
        if (firstSuccessfulResult && firstSuccessfulResult.parsedData) {
            this.loadToDashboard(firstSuccessfulResult.id, false);
            Toast.success(`Batch complete: ${successCount} of ${this.queue.length} files processed successfully.`);
        } else {
            Toast.error(`Batch processing completed with errors. Check details.`);
        }
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

        if (!countEl) return;

        const total = this.queue.length;
        const finished = this.queue.filter(q => q.status === 'done' || q.status === 'error').length;
        const pct = total > 0 ? Math.round((finished / total) * 100) : 0;

        countEl.textContent = `${finished}/${total}`;
        if (progressBar) progressBar.style.width = `${pct}%`;

        if (subTitle) {
            if (this.isProcessing) {
                subTitle.textContent = `Processing file ${this.currentIndex + 1} of ${total} (${pct}%)...`;
            } else if (total > 0) {
                const successes = this.queue.filter(q => q.status === 'done').length;
                subTitle.textContent = `Completed · ${successes} successful, ${total - successes} failed`;
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

            return `
                <div class="queue-item queue-item--${item.status}">
                    <div class="queue-item__header">
                        <div class="queue-item__info">
                            <span class="queue-item__icon">📄</span>
                            <div class="queue-item__names">
                                <strong class="queue-item__file truncate" title="${item.name}">${item.name}</strong>
                                <span class="queue-item__lot">Lot: <code>${item.lotNumber}</code></span>
                            </div>
                        </div>
                        <div class="queue-item__badges">
                            ${cloudPill}
                            ${complianceBadge}
                            ${statusBadge}
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
                                    ? `<span class="qerror-msg">⚠️ ${item.error}</span>`
                                    : `<span>Size: ${(item.size / 1024).toFixed(1)} KB</span>`)}
                        </div>

                        ${item.status === 'done' ? `
                            <div class="queue-item__actions">
                                <button class="qaction-btn qaction-btn--load" onclick="QueueManager.loadToDashboard(${item.id})">
                                    <span>Load to Graph</span>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
};

window.QueueManager = QueueManager;
window.addEventListener('DOMContentLoaded', () => QueueManager.init());
