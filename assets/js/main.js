// Periodic Auto-Save System
const AutoSaver = {
    STORAGE_KEY: 'hpt_autosave_state',
    timer: null,

    save() {
        try {
            if (!state || !state.sensorData || state.sensorData.length === 0) return;
            const lotInput = document.getElementById('lotNumberInput');
            const minInput = document.getElementById('minThreshold');
            const maxInput = document.getElementById('maxThreshold');
            
            const payload = {
                timestamp: Date.now(),
                lotNumber: (lotInput ? lotInput.value.trim() : state.lotNumber) || state.lotNumber || '',
                sensorData: state.sensorData,
                startRange: (window.Dashboard && typeof window.Dashboard.readStart === 'function') ? window.Dashboard.readStart() : '',
                endRange: (window.Dashboard && typeof window.Dashboard.readEnd === 'function') ? window.Dashboard.readEnd() : '',
                minThreshold: minInput ? parseFloat(minInput.value) : 35.0,
                maxThreshold: maxInput ? parseFloat(maxInput.value) : 39.0,
                chartMode: state.chartMode || 'color',
                fileName: state.currentFileName || ''
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('[AutoSaver] Storage write failed', e);
        }
    },

    startPeriodic(intervalMs = 15000) {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => this.save(), intervalMs);
        window.addEventListener('beforeunload', () => this.save());
    },

    restore() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || !data.sensorData || !Array.isArray(data.sensorData) || data.sensorData.length === 0) return false;
            
            state.sensorData = data.sensorData;
            state.rawData = data.sensorData.slice();
            state.lotNumber = data.lotNumber || '';
            state.chartMode = data.chartMode || 'color';

            const lotInput = document.getElementById('lotNumberInput');
            if (lotInput) lotInput.value = state.lotNumber;
            const minInput = document.getElementById('minThreshold');
            if (minInput && data.minThreshold != null) minInput.value = String(data.minThreshold);
            const maxInput = document.getElementById('maxThreshold');
            if (maxInput && data.maxThreshold != null) maxInput.value = String(data.maxThreshold);

            if (data.startRange && data.endRange && window.Dashboard) {
                Dashboard._write('start', data.startRange);
                Dashboard._write('end', data.endRange);
                Dashboard.update();
            } else if (window.Dashboard) {
                Dashboard.showFullResult();
            }

            if (window.Dashboard) {
                Dashboard.updateLotBadge();
                Dashboard.setChartMode(state.chartMode);
            }
            if (window.Toast) {
                const timeStr = new Date(data.timestamp).toLocaleTimeString();
                window.Toast.info(`🔄 Restored auto-saved session (${data.lotNumber || 'Lot'} · ${timeStr})`);
            }
            return true;
        } catch (e) {
            console.warn('[AutoSaver] Restore failed', e);
            return false;
        }
    },

    clear() {
        try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) {}
    }
};

window.AutoSaver = AutoSaver;

const App = {
    init() {
        Toast.init();
        Debug.init();
        Appearance.init();    /* applies saved theme to <html> and <body> */

        state.chart = ChartFactory.createMain(document.getElementById('mainChart'));

        // Restore autosaved report if available, otherwise generate default demo data
        const restored = AutoSaver.restore();
        if (!restored) {
            state.sensorData = this.generateDemoData();
            state.rawData = state.sensorData.slice();
            Dashboard.showFullResult();
            Dashboard.updateLotBadge();
            Dashboard.setChartMode('color');
        }

        // Start periodic auto-save
        AutoSaver.startPeriodic(15000);

        /* Apply theme-aware chart colors after the chart exists */
        ChartFactory.refreshTheme(state.chart);

        this.bindEvents();
        console.log('[App] Ready · points:', state.sensorData.length, '· theme:', state.appearance);
    },

    /* Defensively bind every event so a missing element never breaks the app */
    bindEvents() {
        const $ = id => document.getElementById(id);

        const langSelect = $('langSelect');
        if (langSelect) langSelect.addEventListener('change', e => {
            I18n.apply(e.target.value);
            Dashboard.update();
        });

        const appearanceBtn = $('appearanceBtn');
        if (appearanceBtn) appearanceBtn.addEventListener('click', () => Appearance.toggle());

        const debugBtn = $('debugBtn');
        if (debugBtn) debugBtn.addEventListener('click', () => Debug.toggle());
        const debugCloseBtn = $('debugCloseBtn');
        if (debugCloseBtn) debugCloseBtn.addEventListener('click', () => Debug.close());

        const uploadBtn = $('uploadBtn');
        if (uploadBtn) uploadBtn.addEventListener('click', () => $('fileInput')?.click());
        const fileInput = $('fileInput');
        if (fileInput) fileInput.addEventListener('change', e => this.handleUpload(e));

        const printBtn = $('printBtn');
        if (printBtn) printBtn.addEventListener('click', () => Exporter.print());
        const exportPngBtn = $('exportPngBtn');
        if (exportPngBtn) exportPngBtn.addEventListener('click', () => Exporter.exportPNG());
        const exportPdfBtn = $('exportPdfBtn');
        if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => Exporter.exportPDF());

        const lotInput = $('lotNumberInput');
        if (lotInput) lotInput.addEventListener('input', () => Dashboard.updateLotBadge());

        ['startYear', 'startMonth', 'startDay', 'startHour', 'startMinute',
            'endYear', 'endMonth', 'endDay', 'endHour', 'endMinute'].forEach(id => {
                const el = $(id);
                if (el) el.addEventListener('input', Utils.debounce(() => Dashboard.update(), 200));
            });

        const fullBtn = $('fullResultBtn');
        if (fullBtn) fullBtn.addEventListener('click', () => Dashboard.showFullResult());
        const lastBtn = $('last24hBtn');
        if (lastBtn) lastBtn.addEventListener('click', () => Dashboard.jumpToLast24h());

        ['minThreshold', 'maxThreshold'].forEach(id => {
            const el = $(id);
            if (el) el.addEventListener('change', () => Dashboard.update());
        });

        const colorBtn = $('modeColorBtn');
        if (colorBtn) colorBtn.addEventListener('click', () => Dashboard.setChartMode('color'));
        const monoBtn = $('modeMonoBtn');
        if (monoBtn) monoBtn.addEventListener('click', () => Dashboard.setChartMode('mono'));

        const toggleOutliersBtn = $('toggleOutliersBtn');
        if (toggleOutliersBtn) toggleOutliersBtn.addEventListener('click', () => Dashboard.toggleOutliers());

        /* Auto follow the OS theme if no explicit preference was saved */
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                try {
                    if (!localStorage.getItem('appearance')) {
                        Appearance.apply(e.matches ? 'dark' : 'light');
                    }
                } catch (err) { }
            });
        }
    },

    async handleUpload(event) {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;
        event.target.value = '';

        if (files.length > 1) {
            if (window.QueueManager && typeof window.QueueManager.handleFiles === 'function') {
                window.QueueManager.handleFiles(files);
                return;
            }
        }

        const file = files[0];
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(buffer), {
                type: 'array', cellDates: true, cellNF: false, cellText: false
            });

            let bestResult = null;
            let bestSheetName = '';
            const debugLines = [];

            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                if (!sheet) continue;
                const rows = XLSX.utils.sheet_to_json(sheet, {
                    header: 1, blankrows: true, raw: true, defval: null
                });
                if (!rows || rows.length === 0) continue;

                const result = Parser.parse(rows);
                if (result && result.data.length > 0) {
                    debugLines.push(`<strong>Sheet "${sheetName}":</strong> ${result.data.length} rows`);
                    if (!bestResult || result.data.length > bestResult.data.length) {
                        bestResult = result;
                        bestSheetName = sheetName;
                    }
                } else {
                    debugLines.push(`<span style="color:#f87171">Sheet "${sheetName}": no data</span>`);
                }
            }

            if (!bestResult || bestResult.data.length === 0) {
                Toast.error('❌ ' + I18n.t('noValidData'));
                Debug.log(debugLines.join('<br>'));
                return;
            }

            // Ask user for Lot Number, Start & End times, with buttons to Save and Show Graph
            if (window.UploadDialog && typeof window.UploadDialog.open === 'function') {
                window.UploadDialog.open(file, bestResult);
            } else {
                state.sensorData = bestResult.data;
                state.rawData = bestResult.data.slice();

                if (bestResult.lot) {
                    document.getElementById('lotNumberInput').value = bestResult.lot;
                    Dashboard.updateLotBadge();
                }

                Dashboard.showFullResult();
            }

            const firstTime = bestResult.data[0]?.time || '—';
            const lastTime = bestResult.data[bestResult.data.length - 1]?.time || '—';
            const duration = (window.Utils && typeof window.Utils.formatDuration === 'function')
                ? window.Utils.formatDuration(firstTime, lastTime)
                : '—';

            Debug.log(
                `<strong>Used sheet:</strong> ${bestSheetName}<br>` +
                `<strong>Parsed rows:</strong> ${bestResult.data.length}<br>` +
                `<strong>Lot:</strong> ${bestResult.lot || '—'}<br>` +
                `<strong>Start:</strong> ${firstTime}<br>` +
                `<strong>End:</strong> ${lastTime}<br>` +
                `<strong>Duration:</strong> ${duration || '—'}<br>` +
                `<strong>Columns:</strong> time=${bestResult._detectedCols?.timeCol || '—'}, temp=${bestResult._detectedCols?.tempCol || '—'}<br>` +
                `<strong>All sheets:</strong><br>${debugLines.join('<br>')}`
            );

        } catch (err) {
            console.error(err);
            Toast.error('❌ ' + I18n.t('parseError') + err.message);
        }
    },

    generateDemoData() {
        const out = [];
        const now = new Date();
        now.setHours(16, 10, 0, 0);
        now.setDate(now.getDate() - 2);
        let t = 36.2;
        for (let i = 0; i < 288; i++) {
            out.push({
                time: `${now.getFullYear()}/${Utils.pad2(now.getMonth() + 1)}/${Utils.pad2(now.getDate())}_${Utils.pad2(now.getHours())}:${Utils.pad2(now.getMinutes())}:00`,
                temp: parseFloat(t.toFixed(2))
            });
            t += (Math.random() - 0.5) * 0.4;
            if (t > 37.5) t -= 0.3;
            if (t < 35.8) t += 0.3;
            now.setMinutes(now.getMinutes() + 10);
        }
        return out;
    }
};

window.App = App;

window.addEventListener('DOMContentLoaded', () => App.init());