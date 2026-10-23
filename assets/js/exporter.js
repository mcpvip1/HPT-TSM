const Exporter = {
    buildPrintSheet() {
        const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setText('psBiCycle', document.getElementById('biCycleVal').textContent);
        setText('psLot', document.getElementById('metaLotVal').textContent);
        setText('psFooterMin', document.getElementById('footerMinVal').textContent);
        setText('psFooterMax', document.getElementById('footerMaxVal').textContent);
        setText('psFooterDuration', document.getElementById('footerDurationVal').textContent);

        if (state.printChart) {
            try { state.printChart.destroy(); } catch (e) { }
            state.printChart = null;
        }
        const orphan = Chart.getChart('psChart');
        if (orphan) { try { orphan.destroy(); } catch (e) { } }

        /* Replace canvas with a fresh one — fixes shrinking-on-repeat bug */
        const oldCanvas = document.getElementById('psChart');
        const parent = oldCanvas.parentElement;
        const freshCanvas = document.createElement('canvas');
        freshCanvas.id = 'psChart';
        parent.replaceChild(freshCanvas, oldCanvas);

        const rect = parent.getBoundingClientRect();
        const cssW = Math.max(700, Math.min(1050, Math.floor(rect.width) || 1000));
        const cssH = Math.max(280, Math.min(520, Math.floor(rect.height) || 420));

        state.printChart = ChartFactory.createPrint(freshCanvas, cssW, cssH);
        state.printChart.data.labels = state.chart.data.labels.slice();
        state.printChart.data.datasets[0].data = state.chart.data.datasets[0].data.slice();
        state.printChart.options.scales.y.min = state.chart.options.scales.y.min;
        state.printChart.options.scales.y.max = state.chart.options.scales.y.max;
        state.printChart.update('none');
    },

    getFileStem() {
        const lot = (state.lotNumber || '').trim();
        if (lot && lot !== '—') return Utils.sanitizeFilename(`Temperature_Report_${lot}`);
        return Utils.sanitizeFilename(Utils.buildFallbackName());
    },

    async print() {
        if (state.sensorData.length === 0) { Toast.error(I18n.t('noDataToPrint')); return; }
        this.buildPrintSheet();
        await Utils.sleep(500);
        window.print();
    },

    async prepareA4Canvas() {
        const stage = document.getElementById('a4PrintSheet');

        Object.assign(stage.style, {
            position: 'fixed', left: '0', top: '0',
            width: CONFIG.CHART_PRINT_WIDTH + 'px',
            height: CONFIG.CHART_PRINT_HEIGHT + 'px',
            zIndex: '99999', pointerEvents: 'none', opacity: '1'
        });

        await Utils.nextFrame();
        await Utils.nextFrame();
        await Utils.sleep(80);

        this.buildPrintSheet();
        await Utils.sleep(500);
        await Utils.nextFrame();

        const canvas = await html2canvas(stage, {
            backgroundColor: '#ffffff',
            scale: 2,
            width: CONFIG.CHART_PRINT_WIDTH,
            height: CONFIG.CHART_PRINT_HEIGHT,
            windowWidth: CONFIG.CHART_PRINT_WIDTH,
            windowHeight: CONFIG.CHART_PRINT_HEIGHT,
            allowTaint: false, useCORS: true, logging: false,
            scrollX: 0, scrollY: 0
        });

        stage.removeAttribute('style');
        return canvas;
    },

    async exportPNG() {
        if (state.sensorData.length === 0) { Toast.error(I18n.t('noDataToExport')); return; }
        Toast.info('⏳ ' + I18n.t('generatingPng'));
        try {
            const canvas = await this.prepareA4Canvas();
            const link = document.createElement('a');
            link.download = `${this.getFileStem()}.png`;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            Toast.success('✅ ' + I18n.t('pngExported'));
        } catch (err) {
            console.error('[PNG EXPORT]', err);
            Toast.error('❌ ' + I18n.t('pngFailed') + (err.message || err));
        }
    },

    async exportPDF() {
        if (state.sensorData.length === 0) { Toast.error(I18n.t('noDataToExport')); return; }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            Toast.error('❌ PDF library not loaded. Reload page.');
            return;
        }
        Toast.info('⏳ ' + I18n.t('generatingPdf'));
        try {
            const canvas = await this.prepareA4Canvas();
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
            pdf.save(`${this.getFileStem()}.pdf`);
            Toast.success('✅ ' + I18n.t('pdfExported'));
        } catch (err) {
            console.error('[PDF EXPORT]', err);
            Toast.error('❌ ' + I18n.t('pdfFailed') + (err.message || err));
        }
    }
};