const PALETTES = {
    color: {
        line: '#6366f1', lineWidth: 2,
        gradientTop: 'rgba(99, 102, 241, 0.20)',
        gradientMid: 'rgba(99, 102, 241, 0.08)',
        gradientBot: 'rgba(99, 102, 241, 0.01)',
        band: 'rgba(16, 185, 129, 0.07)',
        maxLine: 'rgba(234, 179, 8, 0.95)',
        maxLabelBg: 'rgba(234, 179, 8, 0.18)',
        maxLabelBorder: 'rgba(234, 179, 8, 0.55)',
        maxLabelText: '#8a5c00',
        minLine: 'rgba(239, 68, 68, 0.95)',
        minLabelBg: 'rgba(239, 68, 68, 0.18)',
        minLabelBorder: 'rgba(239, 68, 68, 0.55)',
        minLabelText: '#a01a1a',
        segIn: '#6366f1', segHigh: '#eab308', segLow: '#ef4444',
        extremesMax: '#eab308', extremesMin: '#ef4444', extremeRing: '#ffffff'
    },
    mono: {
        line: '#111111', lineWidth: 2.2,
        gradientTop: 'rgba(0, 0, 0, 0.14)',
        gradientMid: 'rgba(0, 0, 0, 0.05)',
        gradientBot: 'rgba(0, 0, 0, 0.00)',
        band: 'rgba(0, 0, 0, 0.04)',
        maxLine: '#000000', maxLabelBg: 'rgba(0, 0, 0, 0.08)',
        maxLabelBorder: 'rgba(0, 0, 0, 0.35)', maxLabelText: '#000000',
        minLine: '#666666', minLabelBg: 'rgba(0, 0, 0, 0.05)',
        minLabelBorder: 'rgba(102, 102, 102, 0.40)', minLabelText: '#333333',
        segIn: '#111111', segHigh: '#000000', segLow: '#666666',
        extremesMax: '#000000', extremesMin: '#666666', extremeRing: '#ffffff'
    }
};

function currentPalette() { return PALETTES[state.chartMode] || PALETTES.color; }

/* Theme-aware axis colors */
function axisColors() {
    return isDarkMode()
        ? { axisText: '#cbd5e1', axisTextSoft: '#94a3b8' }
        : { axisText: '#334155', axisTextSoft: '#475569' };
}

const FONT = {
    screen: { tick: 11, label: 10, title: 10 },
    print: { tick: 14, label: 13, title: 13 }
};

function formatXLabel(label) {
    if (!label) return '';
    const m = String(label).match(/^\d{4}\/(\d{2})\/(\d{2})_(\d{2}):(\d{2})/);
    return m ? `${m[2]}/${m[1]} ${m[3]}:${m[4]}` : String(label);
}

/**
 * X-axis tick callback — first + last always from actual data.
 */
function xTickCallback(maxLabels) {
    return function (value, index) {
        const chart = this.chart;
        const labels = (chart && chart.data && chart.data.labels) || [];
        const total = labels.length;

        if (total === 0) return '';
        if (total === 1) return formatXLabel(labels[0]);
        if (index === 0) return formatXLabel(labels[0]);
        if (index === total - 1) return formatXLabel(labels[total - 1]);

        const step = Math.max(1, Math.round((total - 1) / (maxLabels - 1)));
        if (index % step !== 0) return '';
        if (total - 1 - index < step * 0.6) return '';

        return formatXLabel(labels[index]);
    };
}

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

const complianceBandPlugin = {
    id: 'complianceBand',
    beforeDatasetsDraw(chart) {
        const pal = currentPalette();
        const { ctx, chartArea: { top, right, bottom, left }, scales: { y } } = chart;
        const minT = parseFloat(document.getElementById('minThreshold').value);
        const maxT = parseFloat(document.getElementById('maxThreshold').value);
        const yTop = y.getPixelForValue(maxT);
        const yBot = y.getPixelForValue(minT);
        if (yTop < bottom && yBot > top) {
            ctx.save();
            ctx.fillStyle = pal.band;
            ctx.fillRect(left, Math.max(top, yTop), right - left, Math.min(bottom, yBot) - Math.max(top, yTop));
            ctx.restore();
        }
    }
};

const thresholdLinePlugin = {
    id: 'thresholdLines',
    beforeDatasetsDraw(chart) {
        const pal = currentPalette();
        const { ctx, chartArea: { top, right, bottom, left }, scales: { y } } = chart;
        const labelSize = (chart.options.plugins &&
            chart.options.plugins.thresholdLabels &&
            chart.options.plugins.thresholdLabels.fontSize) || 11;
        const minT = parseFloat(document.getElementById('minThreshold').value);
        const maxT = parseFloat(document.getElementById('maxThreshold').value);
        ctx.save();
        ctx.textBaseline = 'middle';

        const yMax = y.getPixelForValue(maxT);
        if (yMax >= top && yMax <= bottom) {
            ctx.beginPath(); ctx.setLineDash([8, 5]);
            ctx.moveTo(left, yMax); ctx.lineTo(right, yMax);
            ctx.lineWidth = 1.5; ctx.strokeStyle = pal.maxLine; ctx.stroke();
            ctx.setLineDash([]);
            const lt = `MAX ${maxT.toFixed(1)}°C`;
            ctx.font = `bold ${labelSize}px ui-monospace, monospace`;
            const tw = ctx.measureText(lt).width;
            const padX = Math.round(labelSize * 0.9);
            const boxH = labelSize + 8;
            const boxX = left + 6;
            const boxY = yMax - boxH - 4;
            ctx.fillStyle = pal.maxLabelBg;
            roundRect(ctx, boxX, boxY, tw + padX * 2, boxH, boxH / 2); ctx.fill();
            ctx.strokeStyle = pal.maxLabelBorder; ctx.lineWidth = 1;
            roundRect(ctx, boxX, boxY, tw + padX * 2, boxH, boxH / 2); ctx.stroke();
            ctx.fillStyle = pal.maxLabelText;
            ctx.fillText(lt, boxX + padX, boxY + boxH / 2);
        }

        const yMin = y.getPixelForValue(minT);
        if (yMin >= top && yMin <= bottom) {
            ctx.beginPath(); ctx.setLineDash([8, 5]);
            ctx.moveTo(left, yMin); ctx.lineTo(right, yMin);
            ctx.lineWidth = 1.5; ctx.strokeStyle = pal.minLine; ctx.stroke();
            ctx.setLineDash([]);
            const lt = `MIN ${minT.toFixed(1)}°C`;
            ctx.font = `bold ${labelSize}px ui-monospace, monospace`;
            const tw = ctx.measureText(lt).width;
            const padX = Math.round(labelSize * 0.9);
            const boxH = labelSize + 8;
            const boxX = left + 6;
            const boxY = yMin + 4;
            ctx.fillStyle = pal.minLabelBg;
            roundRect(ctx, boxX, boxY, tw + padX * 2, boxH, boxH / 2); ctx.fill();
            ctx.strokeStyle = pal.minLabelBorder; ctx.lineWidth = 1;
            roundRect(ctx, boxX, boxY, tw + padX * 2, boxH, boxH / 2); ctx.stroke();
            ctx.fillStyle = pal.minLabelText;
            ctx.fillText(lt, boxX + padX, boxY + boxH / 2);
        }
        ctx.restore();
    }
};

const extremesPlugin = {
    id: 'extremes',
    afterDatasetsDraw(chart) {
        const pal = currentPalette();
        const ds = chart.data.datasets[0];
        if (!ds?.data?.length) return;
        const { ctx } = chart;
        const minVal = Math.min(...ds.data);
        const maxVal = Math.max(...ds.data);
        const minIdx = ds.data.indexOf(minVal);
        const maxIdx = ds.data.indexOf(maxVal);
        const meta = chart.getDatasetMeta(0);

        const drawPoint = (idx, color) => {
            const el = meta.data[idx];
            if (!el) return;
            ctx.save();
            ctx.beginPath(); ctx.arc(el.x, el.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = pal.extremeRing; ctx.fill();
            ctx.beginPath(); ctx.arc(el.x, el.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = color; ctx.fill();
            ctx.strokeStyle = pal.extremeRing; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.restore();
        };
        if (minIdx >= 0) drawPoint(minIdx, pal.extremesMin);
        if (maxIdx >= 0) drawPoint(maxIdx, pal.extremesMax);
    }
};

const outliersPlugin = {
    id: 'outliers',
    afterDatasetsDraw(chart) {
        if (state.highlightOutliers === false) return;
        const pal = currentPalette();
        const ds = chart.data.datasets[0];
        if (!ds?.data?.length) return;
        const meta = chart.getDatasetMeta(0);
        if (!meta?.data?.length) return;

        const minT = parseFloat(document.getElementById('minThreshold')?.value);
        const maxT = parseFloat(document.getElementById('maxThreshold')?.value);
        if (isNaN(minT) || isNaN(maxT)) return;

        const { ctx } = chart;
        const total = ds.data.length;
        const dotR = total > 500 ? 3.5 : 4.5;
        const haloR = dotR + 3;

        for (let i = 0; i < total; i++) {
            const val = ds.data[i];
            const isHigh = val > maxT;
            const isLow = val < minT;

            if (isHigh || isLow) {
                const el = meta.data[i];
                if (!el || el.x == null || el.y == null) continue;

                const color = isHigh ? pal.extremesMax : pal.extremesMin;
                ctx.save();
                
                // Outer glow / halo
                ctx.beginPath();
                ctx.arc(el.x, el.y, haloR, 0, Math.PI * 2);
                ctx.fillStyle = isHigh ? 'rgba(234, 179, 8, 0.28)' : 'rgba(239, 68, 68, 0.28)';
                ctx.fill();

                // Contrast ring
                ctx.beginPath();
                ctx.arc(el.x, el.y, dotR + 1.2, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();

                // Core indicator dot
                ctx.beginPath();
                ctx.arc(el.x, el.y, dotR, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.restore();
            }
        }
    }
};

function buildXAxis(maxLabels, fontSize) {
    const { axisText } = axisColors();
    return {
        grid: { display: false },
        border: { display: false },
        ticks: {
            autoSkip: false,
            maxRotation: 0, minRotation: 0,
            padding: 12,
            font: { size: fontSize, family: 'ui-monospace, monospace', weight: '500' },
            color: axisText,
            callback: xTickCallback(maxLabels)
        }
    };
}

function buildYAxis(fontSize, titleSize) {
    const { axisTextSoft } = axisColors();
    return {
        grid: { display: false },
        border: { display: false },
        ticks: {
            font: { size: fontSize, family: 'ui-monospace, monospace', weight: '500' },
            color: axisTextSoft, padding: 12, stepSize: 0.5,
            callback: v => `${v}°`
        },
        title: {
            display: true, text: 'Temperature (°C)', color: axisTextSoft,
            font: { size: titleSize, family: 'ui-monospace, monospace', weight: '600' },
            padding: { top: 6, bottom: 8 }
        }
    };
}

const ChartFactory = {
    gradient(context) {
        const pal = currentPalette();
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return pal.gradientTop;
        const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, pal.gradientTop);
        g.addColorStop(0.5, pal.gradientMid);
        g.addColorStop(1, pal.gradientBot);
        return g;
    },

    segmentColor(segCtx) {
        const pal = currentPalette();
        const minT = parseFloat(document.getElementById('minThreshold').value);
        const maxT = parseFloat(document.getElementById('maxThreshold').value);
        if (segCtx.p0.parsed.y > maxT || segCtx.p1.parsed.y > maxT) return pal.segHigh;
        if (segCtx.p0.parsed.y < minT || segCtx.p1.parsed.y < minT) return pal.segLow;
        return pal.segIn;
    },

    segmentDash(segCtx) {
        if (state.chartMode !== 'mono') return [];
        const minT = parseFloat(document.getElementById('minThreshold').value);
        const maxT = parseFloat(document.getElementById('maxThreshold').value);
        const out = segCtx.p0.parsed.y > maxT || segCtx.p1.parsed.y > maxT
            || segCtx.p0.parsed.y < minT || segCtx.p1.parsed.y < minT;
        return out ? [6, 4] : [];
    },

    createMain(canvas) {
        const pal = currentPalette();
        return new Chart(canvas.getContext('2d'), {
            type: 'line',
            plugins: [complianceBandPlugin, thresholdLinePlugin, extremesPlugin, outliersPlugin],
            data: {
                labels: [],
                datasets: [{
                    label: 'Temperature °C',
                    data: [],
                    fill: true,
                    backgroundColor: this.gradient,
                    borderColor: pal.line,
                    borderWidth: pal.lineWidth,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round',
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: pal.line,
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2,
                    tension: 0.25,
                    spanGaps: true,
                    segment: {
                        borderColor: ctx => this.segmentColor(ctx),
                        borderDash: ctx => this.segmentDash(ctx)
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400 },
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { right: 70, left: 6, top: 12, bottom: 0 } },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false, external: TooltipHandler.external },
                    thresholdLabels: { fontSize: FONT.screen.label }
                },
                scales: {
                    x: buildXAxis(11, FONT.screen.tick),
                    y: buildYAxis(FONT.screen.tick, FONT.screen.title)
                }
            }
        });
    },

    createPrint(canvas, cssW, cssH) {
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        const pal = currentPalette();
        return new Chart(canvas.getContext('2d'), {
            type: 'line',
            plugins: [complianceBandPlugin, thresholdLinePlugin, extremesPlugin, outliersPlugin],
            data: {
                labels: [],
                datasets: [{
                    label: 'Temperature °C',
                    data: [],
                    fill: true,
                    backgroundColor: this.gradient,
                    borderColor: pal.line,
                    borderWidth: pal.lineWidth - 0.2,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round',
                    pointRadius: 0,
                    tension: 0.25,
                    spanGaps: true,
                    segment: {
                        borderColor: ctx => this.segmentColor(ctx),
                        borderDash: ctx => this.segmentDash(ctx)
                    }
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: false,
                animation: false,
                devicePixelRatio: 3,
                layout: { padding: { right: 90, left: 8, top: 12, bottom: 0 } },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                    thresholdLabels: { fontSize: FONT.print.label }
                },
                scales: {
                    /* Print sheet is always light — force light axis colors */
                    x: {
                        grid: { display: false }, border: { display: false },
                        ticks: {
                            autoSkip: false, maxRotation: 0, minRotation: 0, padding: 12,
                            font: { size: FONT.print.tick, family: 'ui-monospace, monospace', weight: '500' },
                            color: '#334155',
                            callback: xTickCallback(9)
                        }
                    },
                    y: {
                        grid: { display: false }, border: { display: false },
                        ticks: {
                            font: { size: FONT.print.tick, family: 'ui-monospace, monospace', weight: '500' },
                            color: '#475569', padding: 12, stepSize: 0.5,
                            callback: v => `${v}°`
                        },
                        title: {
                            display: true, text: 'Temperature (°C)', color: '#475569',
                            font: { size: FONT.print.title, family: 'ui-monospace, monospace', weight: '600' },
                            padding: { top: 6, bottom: 8 }
                        }
                    }
                }
            }
        });
    },

    applyPalette(chart) {
        if (!chart) return;
        const pal = currentPalette();
        chart.data.datasets[0].borderColor = pal.line;
        chart.data.datasets[0].borderWidth = pal.lineWidth;
        chart.data.datasets[0].backgroundColor = this.gradient;
        chart.update();
    },

    /** Refresh the axis colors when the theme changes */
    refreshTheme(chart) {
        if (!chart) return;
        const { axisText, axisTextSoft } = axisColors();
        if (chart.options.scales.x && chart.options.scales.x.ticks) {
            chart.options.scales.x.ticks.color = axisText;
        }
        if (chart.options.scales.y && chart.options.scales.y.ticks) {
            chart.options.scales.y.ticks.color = axisTextSoft;
        }
        if (chart.options.scales.y && chart.options.scales.y.title) {
            chart.options.scales.y.title.color = axisTextSoft;
        }
        chart.update('none');
    }
};

const TooltipHandler = {
    external(context) {
        const { chart, tooltip } = context;
        const tip = document.getElementById('chartTooltip');
        if (!tip) return;
        if (tooltip.opacity === 0) { tip.classList.remove('show'); return; }
        const dp = tooltip.dataPoints?.[0];
        if (!dp) { tip.classList.remove('show'); return; }

        const minT = parseFloat(document.getElementById('minThreshold').value);
        const maxT = parseFloat(document.getElementById('maxThreshold').value);
        const value = dp.parsed.y;

        let statusClass = 'ok', statusText = '● In criteria range';
        if (value > maxT) {
            const diff = (value - maxT).toFixed(2);
            statusClass = 'hi';
            statusText = `▲ High Outlier (+${diff}°C > ${maxT.toFixed(1)}°C)`;
        } else if (value < minT) {
            const diff = (minT - value).toFixed(2);
            statusClass = 'lo';
            statusText = `▼ Low Outlier (-${diff}°C < ${minT.toFixed(1)}°C)`;
        }

        tip.innerHTML = `
            <div class="tt-time">${dp.label.replace('_', ' ')}</div>
            <div class="tt-temp">${value.toFixed(2)} °C</div>
            <div class="tt-status ${statusClass}">${statusText}</div>
        `;
        tip.classList.add('show');

        const canvasRect = chart.canvas.getBoundingClientRect();
        const parentRect = chart.canvas.parentElement.getBoundingClientRect();
        tip.style.left = (canvasRect.left - parentRect.left + tooltip.caretX) + 'px';
        tip.style.top = (canvasRect.top - parentRect.top + tooltip.caretY) + 'px';
        tip.style.transform = 'translate(-50%, calc(-100% - 12px))';
    }
};