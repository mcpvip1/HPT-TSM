# Temperature Test Report · Pro
### EXCELLENT MEDICAL TECHNOLOGY (THAILAND) CO., LTD.
> An enterprise-grade, quadrilingual (English · 中文 · ไทย · မြန်မာ) analytical dashboard for validating biological indicator (BI) incubation logs, monitoring temperature compliance, and generating audit-ready reports.

---

## 📋 Overview

**Temperature Test Report · Pro** is purpose-built for cleanroom, clinical, and laboratory quality-assurance workflows. It accepts raw data-logger exports (Excel `.xlsx`, `.xls`, or `.csv`), automatically maps timestamps and sensor readings, evaluates temperature compliance against defined acceptance criteria (e.g. 35.0°C – 39.0°C), highlights excursions/outliers, and outputs calibrated single-page A4 landscape reports suitable for regulatory archiving.

---

## ⚡ Core Features

### 1. Dual-Pass Excel & CSV Parser
- **Intelligent Column Detection**:
  - **Pass 1 (Multilingual Semantic Keywords)**: Identifies columns labeled with timestamps (`time`, `date`, `采集时间`, `时间`, etc.) and temperatures (`temp`, `temperature`, `°c`, `温度`).
  - **Pass 2 (Statistical Heuristic)**: When headers are missing or non-standard, scans row values for valid ISO/local time formats and plausible incubator temperatures (20°C to 50°C) with confidence scoring.
- **Excel Serial Date Support**: Accurately computes day fraction serials (`Date.UTC(1899, 11, 30)` epoch correction) avoiding browser timezone drift.
- **Automated Metadata Extraction**: Extracts Batch / Lot identifiers (e.g., `EXT-YYYYMM-XX`) and cycle time intervals directly from metadata cells.
- **Bulk Upload & Queued Batch Processing**:
  - Multi-file simultaneous upload via file picker (`multiple`) or direct drag-and-drop.
  - Asynchronous queued pipeline with animated step-by-step progress bars (Reading -> Parsing -> Cloud Sync -> Complete).
  - Individual per-file diagnostic summaries (total rows, run duration, min/max readings, compliance rate).
  - Automatic individual cloud archival for each successfully parsed batch.
  - Interactive "Load to Graph" switcher to toggle between parsed files on demand.

### 2. High-Precision Charting & Outlier Highlighting
- **Interactive Line Visualization**: Smooth cubic spline curves with adaptive dark/light axes and responsive canvas rendering.
- **Outlier & Excursion Engine**:
  - Evaluates every sensor reading against configured Min/Max thresholds.
  - Automatically flags temperature excursions with amber (high) and red (low) halo indicator rings.
  - Displays instant excursion breakdown (High count, Low count, and total Compliance Rate percentage).
  - One-click **"Highlight Outliers"** toggle to switch between an excursion diagnostic overlay and a clean trendline.
- **Style Modes**: Instant toggle between **Vibrant Color** (screen inspection) and **Monochrome B&W** (high-contrast photocopier / thermal print optimization).

### 3. Cloud Archive & History System
- **Lot-Indexed Persistence**: Automatically records each analyzed batch to a secure cloud database under its unique Lot Number.
- **Complete Preservation**:
  - Stores configured criteria (Min/Max thresholds, Start/End timestamps, Duration).
  - Preserves full time-series readings.
  - Retains the original Excel spreadsheet binary for 1-click re-download.
  - Caches the rendered A4 PDF report for instant audit access.
- **Real-Time History Drawer**: Slide-out drawer with search by Lot Number, file name, or date, excursion compliance badges, and one-click graph reload.
- **Authentication**: Single Sign-On with Google Authentication ensuring lab staff records are securely partitioned.

### 4. Calibrated A4 Landscape Publishing
- **Pixel-Accurate ISO 216 Dimensions**: Renders an isolated report canvas sized at 1123 × 794 px matching the standard $\sqrt{2}$ aspect ratio of A4 landscape (297 mm × 210 mm).
- **Direct PDF & PNG Generation**: High-DPI rasterization via `html2canvas` and direct vector packaging with `jsPDF`.
- **Light Theme Enforcement**: When printing or generating PDF/PNG files, the document is strictly rendered in pristine white/light paper styling, even if the workstation is operating in dark mode.
- **Anti-Shrink Canvas Lifecycle**: Completely recreates the print canvas DOM node before each capture to prevent viewport scaling degradation on repeat exports.

### 5. Quadrilingual Localization & Typography
- **4 Languages Supported**: English (`en`), Chinese / 中文 (`zh`), Thai / ไทย (`th`), and Burmese / မြန်မာ (`my`).
- **Font Stack**: Embedded web fonts (`Noto Sans Thai`, `Noto Sans Myanmar`, `Inter`, `JetBrains Mono`) guarantee zero missing glyphs or clipping across Southeast Asian character sets.

---

## 🖥️ User Interface & Workflow

```
[ Upload Excel / CSV ] ────────► [ Auto-Detect Columns & Metadata ]
                                           │
                                           ▼
[ Interactive Chart ] ◄─────── [ Run Compliance & Outlier Analysis ]
        │
        ├──► Toggle Highlight Outliers (Show/Hide Excursions)
        ├──► Switch Color vs B&W Print Mode
        ├──► Adjust Start/End Time Windows & Thresholds
        │
        ▼
[ Cloud Database ] ──────────► [ Search & Reload Historical Lot Numbers ]
        │
        ▼
[ Publish Report ] ──────────► [ 1-Page A4 Print · Vector PDF · High-Res PNG ]
```

---

## 🛠️ Project Structure

```
├── assets/
│   ├── css/
│   │   └── style.css            # Responsive themes, dark/light styles, A4 print media queries
│   ├── images/
│   │   └── logo.png             # Official company insignia
│   └── js/
│       ├── config.js            # Threshold defaults, patterns, runtime state
│       ├── i18n.js              # Localization dictionaries (EN / ZH / TH / MY)
│       ├── parser.js            # Spreadsheet parsing, serial dates, heuristic column discovery
│       ├── chart.js             # Chart.js plugins: compliance band, threshold lines, outlier halos
│       ├── dashboard.js         # Date pickers, excursion calculations, metric summaries
│       ├── exporter.js          # Calibrated A4 canvas preparation, PDF and PNG compilers
│       ├── main.js              # Event coordinators, file drag/drop, bootstrap lifecycle
│       └── utils.js             # Time formatters, debounce, theme persistence helpers
├── src/
│   └── firebase-bridge.ts       # Secure cloud storage, real-time snapshot sync, Google Auth
├── index.html                   # Semantic HTML5 application shell & print staging layout
├── firestore.rules              # Attribute-based access control (ABAC) zero-trust security rules
├── package.json                 # Build configuration & runtime scripts
└── README.md                    # Engineering documentation
```

---

## 🚀 Getting Started

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start the local server
npm run dev

# 3. Access in browser
http://localhost:3000
```

### Building for Production
```bash
npm run build
```

---

## 🔒 Security & Privacy
- Zero telemetry tracking.
- Client-side data parsing: spreadsheets are parsed locally in browser memory.
- Cloud records are strictly partitioned by authenticated user credentials with zero cross-tenant query leaks.

---

## 📄 License
Copyright © 2026 EXCELLENT MEDICAL TECHNOLOGY (THAILAND) CO., LTD. All rights reserved.
