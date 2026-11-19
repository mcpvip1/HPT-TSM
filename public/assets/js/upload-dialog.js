/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UploadDialog: Prompts the user to review and customize the Lot Number,
 * target Cloud File Name, and Start/End Date-Time window immediately upon
 * selecting a spreadsheet file, offering "Show Graph" and "Save to Cloud & Show" actions.
 */

const UploadDialog = {
    currentFile: null,
    currentParsed: null,
    fileBase64: null,
    fileBase64Promise: null,

    init() {
        const backdrop = document.getElementById('uploadConfirmBackdrop');
        const closeBtn = document.getElementById('uploadConfirmCloseBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const showGraphBtn = document.getElementById('confirmShowGraphBtn');
        const saveAndShowBtn = document.getElementById('confirmSaveAndShowBtn');
        const lotInput = document.getElementById('confirmLotInput');

        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());
        if (backdrop) backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) this.close();
        });

        if (lotInput) {
            lotInput.addEventListener('input', (e) => {
                this.updateCloudFileNamePreview(e.target.value);
            });
        }

        const dateFieldIds = [
            'confirmStartYear', 'confirmStartMonth', 'confirmStartDay', 'confirmStartHour', 'confirmStartMinute',
            'confirmEndYear', 'confirmEndMonth', 'confirmEndDay', 'confirmEndHour', 'confirmEndMinute'
        ];
        dateFieldIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', Utils.debounce(() => this.updateSummaryPreview(), 150));
            }
        });

        if (showGraphBtn) {
            showGraphBtn.addEventListener('click', () => this.handleShowGraph());
        }

        if (saveAndShowBtn) {
            saveAndShowBtn.addEventListener('click', () => this.handleSaveAndShow());
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('uploadConfirmModal');
                if (modal && modal.classList.contains('is-open')) {
                    this.close();
                }
            }
        });
    },

    updateCloudFileNamePreview(lotVal) {
        const previewEl = document.getElementById('confirmCloudFileName');
        if (!previewEl) return;
        const cleaned = (lotVal || '').trim() || 'EXT-UNSPECIFIED';
        const fileName = cleaned.toLowerCase().endsWith('.xlsx') ? cleaned : `${cleaned}.xlsx`;
        previewEl.textContent = fileName;
    },

    updateSummaryPreview() {
        if (!this.currentParsed || !this.currentParsed.data) return;
        const fileMetaEl = document.getElementById('confirmFileMeta');
        const tempRangeEl = document.getElementById('confirmTempRange');

        const startVal = this._readDate('confirmStart');
        const endVal = this._readDate('confirmEnd');
        const runPoints = this.currentParsed.data.filter(d =>
            (!startVal || d.time >= startVal) &&
            (!endVal || d.time <= endVal)
        );
        const target = runPoints.length > 0 ? runPoints : this.currentParsed.data;
        const sizeKb = this.currentFile ? `${(this.currentFile.size / 1024).toFixed(1)} KB` : '—';

        if (fileMetaEl) {
            fileMetaEl.textContent = `${target.length} / ${this.currentParsed.data.length} pts · ${sizeKb}`;
        }
        const { min, max } = Utils.minMax(target.map(d => d.temp));
        if (tempRangeEl) {
            tempRangeEl.textContent = (min != null && max != null)
                ? `${min.toFixed(1)}°C ~ ${max.toFixed(1)}°C`
                : '--';
        }
    },

    async open(file, parsedResult) {
        this.currentFile = file;
        this.currentParsed = parsedResult;
        this.fileBase64 = null;
        this.fileBase64Promise = null;

        const modal = document.getElementById('uploadConfirmModal');
        const backdrop = document.getElementById('uploadConfirmBackdrop');
        const fileNameEl = document.getElementById('confirmFileName');
        const lotInput = document.getElementById('confirmLotInput');

        if (fileNameEl) fileNameEl.textContent = file.name;

        // Determine default Lot Number:
        // Priority 1: Uploaded file name (e.g. "EXT-S0125-20261025-194N1.xlsx" -> "EXT-S0125-20261025-194N1")
        // Priority 2: Parsed lot from spreadsheet content metadata
        // Priority 3: Current input value or default fallback
        let defaultLot = '';
        if (file && file.name) {
            defaultLot = file.name.replace(/\.[^/.]+$/, '').trim();
        }
        if (!defaultLot || defaultLot === 'EXT-UNSPECIFIED') {
            defaultLot = parsedResult.lot;
        }
        if (!defaultLot || defaultLot === 'EXT-UNSPECIFIED') {
            const currentLot = document.getElementById('lotNumberInput')?.value.trim();
            defaultLot = currentLot || 'EXT-2026-001';
        }

        if (lotInput) {
            lotInput.value = defaultLot;
        }
        this.updateCloudFileNamePreview(defaultLot);

        // Prefill Start and End dates (prefer spreadsheet metadata run range if available)
        const firstTime = parsedResult.start || parsedResult.data[0]?.time;
        const lastTime = parsedResult.end || parsedResult.data[parsedResult.data.length - 1]?.time;
        if (firstTime) this._writeDate('confirmStart', firstTime);
        if (lastTime) this._writeDate('confirmEnd', lastTime);

        this.updateSummaryPreview();

        if (modal) modal.classList.add('is-open');
        if (backdrop) backdrop.classList.add('is-open');

        // Cache base64 in background (promise stored so fast clicks still wait for it)
        this.fileBase64Promise = (async () => {
            try {
                const buffer = await file.arrayBuffer();
                const b64 = Utils.arrayBufferToBase64(buffer);
                this.fileBase64 = b64;
                return b64;
            } catch (e) {
                console.warn('[UploadDialog] Could not convert file to base64:', e);
                return '';
            }
        })();

        setTimeout(() => {
            lotInput?.focus();
            lotInput?.select();
        }, 120);
    },

    close() {
        const modal = document.getElementById('uploadConfirmModal');
        const backdrop = document.getElementById('uploadConfirmBackdrop');
        if (modal) modal.classList.remove('is-open');
        if (backdrop) backdrop.classList.remove('is-open');
        this.currentFile = null;
        this.currentParsed = null;
        this.fileBase64 = null;
        this.fileBase64Promise = null;
    },

    _readDate(prefix) {
        const y = document.getElementById(prefix + 'Year')?.value.trim();
        const mo = document.getElementById(prefix + 'Month')?.value.trim();
        const d = document.getElementById(prefix + 'Day')?.value.trim();
        const h = document.getElementById(prefix + 'Hour')?.value.trim();
        const mi = document.getElementById(prefix + 'Minute')?.value.trim();
        if (!y || !mo || !d || !h || !mi) return '';
        return `${y}/${Utils.pad2(mo)}/${Utils.pad2(d)}_${Utils.pad2(h)}:${Utils.pad2(mi)}:00`;
    },

    _writeDate(prefix, internal) {
        if (!internal) return;
        const [datePart, timePart] = internal.split('_');
        if (!datePart || !timePart) return;
        const [y, mo, d] = datePart.split('/');
        const [h, mi] = timePart.split(':');
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        setVal(prefix + 'Year', y);
        setVal(prefix + 'Month', mo);
        setVal(prefix + 'Day', d);
        setVal(prefix + 'Hour', h);
        setVal(prefix + 'Minute', mi);
    },

    applyToDashboard() {
        if (!this.currentParsed) return null;
        const lotNumber = document.getElementById('confirmLotInput')?.value.trim() || 'EXT-UNSPECIFIED';
        const startVal = this._readDate('confirmStart') || this.currentParsed.data[0]?.time;
        const endVal = this._readDate('confirmEnd') || this.currentParsed.data[this.currentParsed.data.length - 1]?.time;
        const cloudFileName = lotNumber.toLowerCase().endsWith('.xlsx') ? lotNumber : `${lotNumber}.xlsx`;

        state.sensorData = this.currentParsed.data.slice();
        state.rawData = this.currentParsed.data.slice();
        state.lotNumber = lotNumber;
        state.currentFileName = cloudFileName;

        const lotInput = document.getElementById('lotNumberInput');
        if (lotInput) lotInput.value = lotNumber;
        Dashboard.updateLotBadge();

        if (startVal) Dashboard._write('start', startVal);
        if (endVal) Dashboard._write('end', endVal);

        Dashboard.update();
        if (window.AutoSaver && typeof window.AutoSaver.save === 'function') {
            window.AutoSaver.save();
        }
        return { lotNumber, startVal, endVal, cloudFileName };
    },

    async _buildReportPayload(res) {
        const base64 = this.fileBase64 || (this.fileBase64Promise ? await this.fileBase64Promise : '') || '';
        const rawMin = parseFloat(document.getElementById('minThreshold')?.value);
        const rawMax = parseFloat(document.getElementById('maxThreshold')?.value);
        const minThresh = isNaN(rawMin) ? CONFIG.DEFAULT_MIN_THRESHOLD : rawMin;
        const maxThresh = isNaN(rawMax) ? CONFIG.DEFAULT_MAX_THRESHOLD : rawMax;

        const runPoints = this.currentParsed.data.filter(d =>
            (!res.startVal || d.time >= res.startVal) &&
            (!res.endVal || d.time <= res.endVal)
        );
        const targetPoints = runPoints.length > 0 ? runPoints : this.currentParsed.data;
        const { min: minRun, max: maxRun } = Utils.minMax(targetPoints.map(d => d.temp));
        const durationStr = (window.Utils && typeof window.Utils.formatDuration === 'function')
            ? (window.Utils.formatDuration(res.startVal, res.endVal) || '—')
            : '—';

        return {
            lotNumber: res.lotNumber,
            fileName: res.cloudFileName,
            fileSize: this.currentFile ? this.currentFile.size : 0,
            fileBase64: base64,
            minThreshold: minThresh,
            maxThreshold: maxThresh,
            startRange: res.startVal,
            endRange: res.endVal,
            minTemp: minRun != null ? parseFloat(minRun.toFixed(2)) : 0,
            maxTemp: maxRun != null ? parseFloat(maxRun.toFixed(2)) : 0,
            duration: durationStr,
            rowCount: targetPoints.length,
            sensorData: this.currentParsed.data.slice(),
            chartMode: (window.state && window.state.chartMode) || 'color'
        };
    },

    async handleShowGraph() {
        const res = this.applyToDashboard();
        if (!res) return;

        // Snapshot payload before closing dialog
        const payloadPromise = this._buildReportPayload(res);
        this.close();
        Toast.success(`📊 Graph loaded for Lot [${res.lotNumber}]`);

        // Automatically archive to cloud in background so uploaded files are never lost
        if (window.CloudStorage && typeof window.CloudStorage.saveDirectReport === 'function') {
            try {
                const payload = await payloadPromise;
                await window.CloudStorage.saveDirectReport(payload);
            } catch (err) {
                console.warn('Auto cloud archive note:', err);
            }
        }
    },

    async handleSaveAndShow() {
        const res = this.applyToDashboard();
        if (!res) return;

        if (window.CloudStorage && typeof window.CloudStorage.saveDirectReport === 'function') {
            try {
                Toast.info('☁️ Saving report to Supabase...');
                const payload = await this._buildReportPayload(res);
                this.close();
                const saved = await window.CloudStorage.saveDirectReport(payload);
                if (saved) {
                    Toast.success(`☁️ Saved Lot [${res.lotNumber}] as "${res.cloudFileName}" & displayed graph!`);
                }
            } catch (err) {
                console.error('Save to cloud failed:', err);
                Toast.error('Could not save to cloud: ' + (err.message || 'Error'));
                this.close();
            }
        } else {
            this.close();
        }
    }
};

window.UploadDialog = UploadDialog;
window.addEventListener('DOMContentLoaded', () => UploadDialog.init());
