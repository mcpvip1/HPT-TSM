const Dashboard = {
    readStart() { return this._read('start'); },
    readEnd() { return this._read('end'); },

    _read(prefix) {
        const y = document.getElementById(prefix + 'Year').value.trim();
        const mo = document.getElementById(prefix + 'Month').value.trim();
        const d = document.getElementById(prefix + 'Day').value.trim();
        const h = document.getElementById(prefix + 'Hour').value.trim();
        const mi = document.getElementById(prefix + 'Minute').value.trim();
        if (!y || !mo || !d || !h || !mi) return '';
        return `${y}/${Utils.pad2(mo)}/${Utils.pad2(d)}_${Utils.pad2(h)}:${Utils.pad2(mi)}:00`;
    },

    _readDisplay(prefix) {
        const y = document.getElementById(prefix + 'Year').value.trim();
        const mo = document.getElementById(prefix + 'Month').value.trim();
        const d = document.getElementById(prefix + 'Day').value.trim();
        const h = document.getElementById(prefix + 'Hour').value.trim();
        const mi = document.getElementById(prefix + 'Minute').value.trim();
        if (!y || !mo || !d || !h || !mi) return '';
        return `${y}/${Utils.pad2(mo)}/${Utils.pad2(d)} ${Utils.pad2(h)}:${Utils.pad2(mi)}`;
    },

    _write(prefix, internal) {
        if (!internal) return;
        const [datePart, timePart] = internal.split('_');
        if (!datePart || !timePart) return;
        const [y, mo, d] = datePart.split('/');
        const [h, mi] = timePart.split(':');
        document.getElementById(prefix + 'Year').value = y;
        document.getElementById(prefix + 'Month').value = mo;
        document.getElementById(prefix + 'Day').value = d;
        document.getElementById(prefix + 'Hour').value = h;
        document.getElementById(prefix + 'Minute').value = mi;
    },

    showFullResult() {
        if (state.sensorData.length === 0) return;
        this._write('start', state.sensorData[0].time);
        this._write('end', state.sensorData[state.sensorData.length - 1].time);
        this.update();
    },

    jumpToLast24h() {
        if (state.sensorData.length === 0) return;
        const last = state.sensorData[state.sensorData.length - 1].time;
        const [datePart, timePart] = last.split('_');
        const [y, mo, d] = datePart.split('/');
        const [h, mi] = timePart.split(':');
        const endDate = new Date(+y, +mo - 1, +d, +h, +mi);
        const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        this._write('start', `${startDate.getFullYear()}/${Utils.pad2(startDate.getMonth() + 1)}/${Utils.pad2(startDate.getDate())}_${Utils.pad2(startDate.getHours())}:${Utils.pad2(startDate.getMinutes())}:00`);
        this._write('end', last);
        this.update();
    },

    updateBiCycle() {
        const startDisp = this._readDisplay('start');
        const endDisp = this._readDisplay('end');
        const el = document.getElementById('biCycleVal');
        let text = '—';
        if (startDisp && endDisp) text = `${startDisp} - ${endDisp}`;
        else if (startDisp) text = `${startDisp} - …`;
        else if (endDisp) text = `… - ${endDisp}`;
        el.textContent = text;
    },

    updateDuration() {
        const startVal = this.readStart();
        const endVal = this.readEnd();
        let text = '—';
        if (startVal && endVal) {
            const duration = Utils.formatDuration(startVal, endVal);
            if (duration) text = duration;
        }
        const summaryEl = document.getElementById('footerDurationVal');
        if (summaryEl) summaryEl.textContent = text;
    },

    updateLotBadge() {
        const val = document.getElementById('lotNumberInput').value.trim();
        state.lotNumber = val;
        const metaLot = document.getElementById('metaLotVal');
        if (metaLot) metaLot.textContent = val === '' ? '—' : val;
    },

    update() {
        if (state.sensorData.length === 0) return;
        const minThreshold = parseFloat(document.getElementById('minThreshold').value);
        const maxThreshold = parseFloat(document.getElementById('maxThreshold').value);
        const startVal = this.readStart();
        const endVal = this.readEnd();
        this.updateBiCycle();
        this.updateDuration();

        const filtered = state.sensorData.filter(d => {
            if (startVal && d.time < startVal) return false;
            if (endVal && d.time > endVal) return false;
            return true;
        });
        if (filtered.length === 0) return;

        const temps = filtered.map(d => d.temp);
        const labels = filtered.map(d => d.time);
        const minT = Math.min(...temps);
        const maxT = Math.max(...temps);

        const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setText('footerMinVal', `${minT.toFixed(1)}°C`);
        setText('footerMaxVal', `${maxT.toFixed(1)}°C`);

        // Outlier & Excursion Analysis
        const highOutliers = filtered.filter(d => d.temp > maxThreshold);
        const lowOutliers = filtered.filter(d => d.temp < minThreshold);
        const totalOutliers = highOutliers.length + lowOutliers.length;

        const pill = document.getElementById('outlierCountPill');
        if (pill) {
            pill.textContent = String(totalOutliers);
            pill.className = `outlier-count-pill ${totalOutliers > 0 ? 'outlier-count-pill--warn' : 'outlier-count-pill--zero'}`;
        }

        const banner = document.getElementById('excursionBanner');
        if (banner) {
            if (totalOutliers > 0) {
                const pct = ((totalOutliers / filtered.length) * 100).toFixed(1);
                banner.className = 'excursion-banner excursion-banner--warn show';
                banner.innerHTML = `
                    <div class="excursion-banner__icon">⚠️</div>
                    <div class="excursion-banner__text">
                        <strong>${totalOutliers} Outlier${totalOutliers > 1 ? 's' : ''} Detected (${pct}% of run)</strong>: 
                        ${highOutliers.length > 0 ? `<span class="tag-hi">▲ ${highOutliers.length} Above Max</span>` : ''}
                        ${lowOutliers.length > 0 ? `<span class="tag-lo">▼ ${lowOutliers.length} Below Min</span>` : ''}
                        <span class="excursion-compliance">Compliance: ${(100 - parseFloat(pct)).toFixed(1)}%</span>
                    </div>
                `;
            } else {
                banner.className = 'excursion-banner excursion-banner--ok show';
                banner.innerHTML = `
                    <div class="excursion-banner__icon">✅</div>
                    <div class="excursion-banner__text">
                        <strong>100% In-Spec Compliance</strong>: All ${filtered.length} readings are strictly within ${minThreshold.toFixed(1)}°C ~ ${maxThreshold.toFixed(1)}°C.
                    </div>
                `;
            }
        }

        if (state.chart) {
            state.chart.data.labels = labels;
            state.chart.data.datasets[0].data = temps;
            state.chart.options.scales.y.min = Math.floor(Math.min(minT, minThreshold) - 1);
            state.chart.options.scales.y.max = Math.ceil(Math.max(maxT, maxThreshold) + 1);
            state.chart.update();
        } else if (window.ChartFactory && document.getElementById('mainChart')) {
            state.chart = ChartFactory.createMain(document.getElementById('mainChart'));
            if (state.chart) {
                state.chart.data.labels = labels;
                state.chart.data.datasets[0].data = temps;
                state.chart.options.scales.y.min = Math.floor(Math.min(minT, minThreshold) - 1);
                state.chart.options.scales.y.max = Math.ceil(Math.max(maxT, maxThreshold) + 1);
                state.chart.update();
            }
        }
    },

    toggleOutliers() {
        state.highlightOutliers = !state.highlightOutliers;
        const btn = document.getElementById('toggleOutliersBtn');
        if (btn) btn.classList.toggle('is-active', state.highlightOutliers);
        if (state.chart) state.chart.update('none');
        Toast.info(state.highlightOutliers ? '⚠️ Outlier highlights visible' : '👁️ Outlier highlights hidden');
    },

    setChartMode(mode) {
        if (mode !== 'color' && mode !== 'mono') return;
        state.chartMode = mode;
        const colorBtn = document.getElementById('modeColorBtn');
        const monoBtn = document.getElementById('modeMonoBtn');
        if (colorBtn && monoBtn) {
            colorBtn.classList.toggle('is-active', mode === 'color');
            monoBtn.classList.toggle('is-active', mode === 'mono');
        }
        if (window.ChartFactory && state.chart) {
            ChartFactory.applyPalette(state.chart);
        }
    }
};

window.Dashboard = Dashboard;