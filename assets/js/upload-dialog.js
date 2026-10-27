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

    init() {
        const modal = document.getElementById('uploadConfirmModal');
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

        if (showGraphBtn) {
            showGraphBtn.addEventListener('click', () => this.handleShowGraph());
        }

        if (saveAndShowBtn) {
            saveAndShowBtn.addEventListener('click', () => this.handleSaveAndShow());
        }
    },

    updateCloudFileNamePreview(lotVal) {
        const previewEl = document.getElementById('confirmCloudFileName');
        if (!previewEl) return;
        const cleaned = (lotVal || '').trim() || 'EXT-UNSPECIFIED';
        const fileName = cleaned.toLowerCase().endsWith('.xlsx') ? cleaned : `${cleaned}.xlsx`;
        previewEl.textContent = fileName;
    },

    async open(file, parsedResult) {
        this.currentFile = file;
        this.currentParsed = parsedResult;
        this.fileBase64 = null;

        const modal = document.getElementById('uploadConfirmModal');
        const backdrop = document.getElementById('uploadConfirmBackdrop');
        const fileNameEl = document.getElementById('confirmFileName');
        const fileMetaEl = document.getElementById('confirmFileMeta');
        const tempRangeEl = document.getElementById('confirmTempRange');
        const lotInput = document.getElementById('confirmLotInput');

        if (fileNameEl) fileNameEl.textContent = file.name;
        if (fileMetaEl) fileMetaEl.textContent = `${parsedResult.data.length} records · ${(file.size / 1024).toFixed(1)} KB`;

        const temps = parsedResult.data.map(d => d.temp);
        if (tempRangeEl && temps.length > 0) {
            tempRangeEl.textContent = `${Math.min(...temps).toFixed(1)}°C ~ ${Math.max(...temps).toFixed(1)}°C`;
        }

        // Determine default Lot Number
        let defaultLot = parsedResult.lot;
        if (!defaultLot || defaultLot === 'EXT-UNSPECIFIED') {
            const currentLot = document.getElementById('lotNumberInput')?.value.trim();
            defaultLot = currentLot || 'EXT-2026-001';
        }

        if (lotInput) {
            lotInput.value = defaultLot;
        }
        this.updateCloudFileNamePreview(defaultLot);

        // Prefill Start and End dates from data
        const firstTime = parsedResult.data[0]?.time;
        const lastTime = parsedResult.data[parsedResult.data.length - 1]?.time;
        if (firstTime) this._writeDate('confirmStart', firstTime);
        if (lastTime) this._writeDate('confirmEnd', lastTime);

        if (modal) modal.classList.add('is-open');
        if (backdrop) backdrop.classList.add('is-open');

        // Cache base64 in background
        try {
            const buffer = await file.arrayBuffer();
            let binary = '';
            const bytes = new Uint8Array(buffer);
            for (let b = 0; b < bytes.byteLength; b++) {
                binary += String.fromCharCode(bytes[b]);
            }
            this.fileBase64 = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + window.btoa(binary);
        } catch (e) {
            console.warn('[UploadDialog] Could not convert file to base64:', e);
        }

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

        state.sensorData = this.currentParsed.data.slice();
        state.rawData = this.currentParsed.data.slice();
        state.lotNumber = lotNumber;

        const lotInput = document.getElementById('lotNumberInput');
        if (lotInput) lotInput.value = lotNumber;
        Dashboard.updateLotBadge();

        if (startVal) Dashboard._write('start', startVal);
        if (endVal) Dashboard._write('end', endVal);

        Dashboard.update();
        return { lotNumber, startVal, endVal };
    },

    async handleShowGraph() {
        const res = this.applyToDashboard();
        if (!res) return;

        // Cache last uploaded file with user's customized lot name
        if (this.currentFile && window.CloudStorage && typeof window.CloudStorage.onNewReportLoaded === 'function') {
            try {
                const buffer = await this.currentFile.arrayBuffer();
                const cloudName = res.lotNumber.toLowerCase().endsWith('.xlsx') ? res.lotNumber : `${res.lotNumber}.xlsx`;
                window.CloudStorage.onNewReportLoaded({
                    name: cloudName,
                    size: this.currentFile.size,
                    fileBuffer: buffer
                });
            } catch (e) {}
        }

        this.close();
        Toast.success(`📊 Graph loaded for Lot [${res.lotNumber}]`);
    },

    async handleSaveAndShow() {
        const res = this.applyToDashboard();
        if (!res) return;

        const cloudFileName = res.lotNumber.toLowerCase().endsWith('.xlsx') ? res.lotNumber : `${res.lotNumber}.xlsx`;

        if (window.CloudStorage && typeof window.CloudStorage.saveDirectReport === 'function') {
            try {
                Toast.info('☁️ Saving report to Supabase...');
                const minThresh = parseFloat(document.getElementById('minThreshold')?.value) || 35.0;
                const maxThresh = parseFloat(document.getElementById('maxThreshold')?.value) || 39.0;
                const temps = this.currentParsed.data.map(d => d.temp);

                const saved = await window.CloudStorage.saveDirectReport({
                    lotNumber: res.lotNumber,
                    fileName: cloudFileName,
                    fileSize: this.currentFile ? this.currentFile.size : 0,
                    fileBase64: this.fileBase64 || '',
                    minThreshold: minThresh,
                    maxThreshold: maxThresh,
                    startRange: res.startVal,
                    endRange: res.endVal,
                    minTemp: Math.min(...temps),
                    maxTemp: Math.max(...temps),
                    duration: Utils.formatDuration(res.startVal, res.endVal) || '—',
                    rowCount: this.currentParsed.data.length,
                    sensorData: this.currentParsed.data,
                    chartMode: state.chartMode || 'color'
                });

                if (saved) {
                    Toast.success(`☁️ Saved Lot [${res.lotNumber}] as "${cloudFileName}" & displayed graph!`);
                }
            } catch (err) {
                console.error('Save to cloud failed:', err);
                Toast.error('Could not save to cloud: ' + (err.message || 'Error'));
            }
        }

        this.close();
    }
};

window.UploadDialog = UploadDialog;
window.addEventListener('DOMContentLoaded', () => UploadDialog.init());
