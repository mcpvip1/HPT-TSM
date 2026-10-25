const CONFIG = Object.freeze({
    CHART_HEIGHT: 460,
    CHART_PRINT_WIDTH: 1123,
    CHART_PRINT_HEIGHT: 794,

    TEMP_MIN_PLAUSIBLE: 20,
    TEMP_MAX_PLAUSIBLE: 50,
    TEMP_ABSOLUTE_ZERO_FILTER: 0,

    HEADER_SCAN_LIMIT: 50,
    METADATA_SCAN_LIMIT: 20,
    MIN_SCORE_THRESHOLD: 3,
    MIN_VALID_ROWS: 5,

    DEFAULT_MIN_THRESHOLD: 35.0,
    DEFAULT_MAX_THRESHOLD: 39.0,

    LOT_PATTERN: /EXT-[A-Z0-9-]+/i,
    RANGE_PATTERN: /(\d{4}[/\-]\d{1,2}[/\-]\d{1,2}[ T]\d{1,2}:\d{1,2}(?::\d{1,2})?)\s*[-—~]{1,2}\s*(\d{4}[/\-]\d{1,2}[/\-]\d{1,2}[ T]\d{1,2}:\d{1,2}(?::\d{1,2})?)/,
    TIME_PATTERN: /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})[_ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/,

    TIME_KEYS: ['采集时间', '时间', 'time', 'date', 'datetime', 'timestamp'],
    TEMP_KEYS: ['温度', 'temp', 'temperature', '°c']
});

const state = {
    sensorData: [],
    rawData: [],
    chart: null,
    printChart: null,
    language: 'en',
    lotNumber: '',
    chartMode: 'color',
    appearance: 'light',   /* 'light' | 'dark' */
    highlightOutliers: true
};

/**
 * Helper — checks whether dark mode is active right now.
 * Used by Chart.js to pick the correct axis text colors.
 */
function isDarkMode() {
    const root = document.documentElement;
    return root.getAttribute('data-theme') === 'dark' || root.classList.contains('dark');
}

// Global window bindings for cross-module integration
window.CONFIG = CONFIG;
window.state = state;
window.isDarkMode = isDarkMode;