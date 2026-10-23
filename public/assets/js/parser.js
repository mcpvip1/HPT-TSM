const Parser = {
    _pad2(n) { return String(n).padStart(2, '0'); },

    _formatLocal(d) {
        return `${d.getFullYear()}/${this._pad2(d.getMonth() + 1)}/${this._pad2(d.getDate())}`
            + `_${this._pad2(d.getHours())}:${this._pad2(d.getMinutes())}:${this._pad2(d.getSeconds())}`;
    },

    _formatUTC(d) {
        return `${d.getUTCFullYear()}/${this._pad2(d.getUTCMonth() + 1)}/${this._pad2(d.getUTCDate())}`
            + `_${this._pad2(d.getUTCHours())}:${this._pad2(d.getUTCMinutes())}:${this._pad2(d.getUTCSeconds())}`;
    },

    normalizeTime(raw) {
        if (raw == null || raw === '') return null;
        if (raw instanceof Date && !isNaN(raw.getTime())) return this._formatLocal(raw);
        if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
            const epoch = Date.UTC(1899, 11, 30);
            const d = new Date(epoch + raw * 86400000);
            if (!isNaN(d.getTime())) return this._formatUTC(d);
        }
        const s = String(raw).trim();
        if (!s) return null;

        let m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:[ T_]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) {
            const [, y, mo, d, h = '00', mi = '00', sec = '00'] = m;
            return `${y}/${this._pad2(mo)}/${this._pad2(d)}_${this._pad2(h)}:${this._pad2(mi)}:${this._pad2(sec)}`;
        }

        m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:[ T_]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) {
            const [, a, b, y, h = '00', mi = '00', sec = '00'] = m;
            const aNum = parseInt(a, 10);
            const bNum = parseInt(b, 10);
            let mo, d;
            if (aNum > 12) { mo = bNum; d = aNum; }
            else { mo = aNum; d = bNum; }
            return `${y}/${this._pad2(mo)}/${this._pad2(d)}_${this._pad2(h)}:${this._pad2(mi)}:${this._pad2(sec)}`;
        }

        const parsed = new Date(s.replace(/_/g, ' '));
        if (!isNaN(parsed.getTime()) && /\d{4}/.test(s)) {
            return this._formatLocal(parsed);
        }
        return null;
    },

    isPlausibleTemp(v) {
        if (v == null || v === '') return false;
        const n = parseFloat(v);
        return !isNaN(n) && n > CONFIG.TEMP_MIN_PLAUSIBLE && n < CONFIG.TEMP_MAX_PLAUSIBLE;
    },

    _detectByKeywords(rows) {
        for (let i = 0; i < Math.min(rows.length, CONFIG.HEADER_SCAN_LIMIT); i++) {
            const row = rows[i];
            if (!row) continue;
            const nonEmpty = row.filter(c => c != null && c !== '').length;
            if (nonEmpty < 2) continue;

            let candTime = -1, candTemp = -1;
            row.forEach((cell, idx) => {
                if (cell == null) return;
                const v = String(cell).toLowerCase().trim();
                if (candTime === -1 && CONFIG.TIME_KEYS.some(k => v.includes(k.toLowerCase()))) candTime = idx;
                if (candTemp === -1 && CONFIG.TEMP_KEYS.some(k => v.includes(k.toLowerCase()))) candTemp = idx;
            });

            if (candTime !== -1 && candTemp !== -1) {
                return { timeCol: candTime, tempCol: candTemp, headerIndex: i };
            }
        }
        return null;
    },

    detectColumnsByData(rows) {
        const maxCols = Math.max(...rows.map(r => r ? r.length : 0));
        if (maxCols === 0) return null;
        const timeScore = new Array(maxCols).fill(0);
        const tempScore = new Array(maxCols).fill(0);

        rows.forEach(row => {
            if (!row) return;
            for (let c = 0; c < maxCols; c++) {
                const v = row[c];
                if (v == null || v === '') continue;
                if (this.normalizeTime(v)) timeScore[c]++;
                if (this.isPlausibleTemp(v)) tempScore[c]++;
            }
        });

        let best = { score: 0, timeCol: -1, tempCol: -1 };
        for (let tc = 0; tc < maxCols; tc++) {
            if (timeScore[tc] < 3) continue;
            for (let pc = 0; pc < maxCols; pc++) {
                if (pc === tc) continue;
                if (tempScore[pc] < 3) continue;
                const score = Math.min(timeScore[tc], tempScore[pc]) * 3 + timeScore[tc] + tempScore[pc];
                if (score > best.score) best = { score, timeCol: tc, tempCol: pc };
            }
        }
        return best.timeCol !== -1 ? { ...best, headerIndex: -1 } : null;
    },

    detectColumns(rows) {
        const kw = this._detectByKeywords(rows);
        if (kw && this.validateColumns(rows, kw.timeCol, kw.tempCol)) return kw;
        return this.detectColumnsByData(rows);
    },

    validateColumns(rows, timeCol, tempCol) {
        let count = 0;
        for (const row of rows) {
            if (!row) continue;
            const t = this.normalizeTime(row[timeCol]);
            const v = parseFloat(row[tempCol]);
            if (t && !isNaN(v) && v !== CONFIG.TEMP_ABSOLUTE_ZERO_FILTER) count++;
            if (count >= CONFIG.MIN_VALID_ROWS) return true;
        }
        return count > 0;
    },

    extractMetadata(rows) {
        let lot = null, start = null, end = null;
        for (let i = 0; i < Math.min(rows.length, CONFIG.METADATA_SCAN_LIMIT); i++) {
            const row = rows[i];
            if (!row) continue;
            for (const cell of row) {
                if (cell == null) continue;
                const v = String(cell);
                if (!lot) {
                    const lm = v.match(CONFIG.LOT_PATTERN);
                    if (lm) lot = lm[0];
                }
                if (!start || !end) {
                    const rm = v.match(CONFIG.RANGE_PATTERN);
                    if (rm) {
                        start = this.normalizeTime(rm[1]);
                        end = this.normalizeTime(rm[2]);
                    }
                }
            }
        }
        return { lot, start, end };
    },

    parse(rows) {
        if (!rows || rows.length === 0) return null;
        const metadata = this.extractMetadata(rows);
        const cols = this.detectColumns(rows);
        if (!cols) return null;

        const { timeCol, tempCol } = cols;
        const parsed = [];
        const seen = new Set();

        for (const row of rows) {
            if (!row) continue;
            const normTime = this.normalizeTime(row[timeCol]);
            if (!normTime) continue;
            const tempNum = parseFloat(row[tempCol]);
            if (isNaN(tempNum) || tempNum === CONFIG.TEMP_ABSOLUTE_ZERO_FILTER) continue;
            if (seen.has(normTime)) continue;
            seen.add(normTime);
            parsed.push({ time: normTime, temp: tempNum });
        }

        if (parsed.length === 0) return null;
        parsed.sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0);

        const firstParsed = parsed[0].time;
        const lastParsed = parsed[parsed.length - 1].time;
        const useStart = (metadata.start && metadata.start >= firstParsed && metadata.start <= lastParsed) ? metadata.start : firstParsed;
        const useEnd = (metadata.end && metadata.end >= firstParsed && metadata.end <= lastParsed) ? metadata.end : lastParsed;

        return { data: parsed, lot: metadata.lot, start: useStart, end: useEnd, _detectedCols: cols };
    }
};