# UI Theme, Color & Icon Style Guide
> An enterprise-grade design system for scientific, laboratory, and high-density analytical dashboards.
> Features light/dark mode parity, dual-stack typography (Latin + Southeast Asian + Monospace), micro-icon containers, and calibrated data visualization tokens.

---

## 🎨 1. Color System & CSS Variables

This design system uses semantic CSS custom properties with dedicated support for both **Light** and **Dark** themes.

### CSS Variables Template (`theme.css`)

```css
/* ================================================================
   Theme Variables — Light (Default)
   ================================================================ */
:root {
    /* Font Stacks */
    --font-ui: 'Inter', 'Noto Sans Thai', 'Noto Sans Myanmar',
        'Padauk', 'Myanmar Text', 'Leelawadee UI',
        system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', 'Noto Sans Thai', 'Noto Sans Myanmar',
        ui-monospace, 'SF Mono', Menlo, Consolas, monospace;

    /* Backgrounds & Surfaces */
    --bg-page: #e9ecef;          /* Neutral canvas backdrop */
    --bg-surface: #ffffff;       /* Main cards, modals & panels */
    --bg-surface-alt: #f8fafc;   /* Elevated panels, drawer headers */
    --bg-surface-soft: #f1f5f9;  /* Secondary pill containers, active rows */
    --bg-input: #f8fafc;         /* Form inputs & segment pickers */

    /* Borders */
    --border: #cbd5e1;           /* Standard structural border */
    --border-light: #e2e8f0;     /* Sub-dividers & cell boundaries */
    --border-faint: #f1f5f9;     /* Subtle grid lines */

    /* Text Hierarchy */
    --text-primary: #1e293b;     /* High contrast headings (Slate 800) */
    --text-secondary: #475569;   /* Body copy & descriptions (Slate 600) */
    --text-muted: #64748b;       /* Metadata, captions & timestamps (Slate 500) */
    --text-faint: #94a3b8;       /* Placeholders, disabled states (Slate 400) */

    /* Accent & Brand (Electric Indigo / Violet) */
    --accent: #4f46e5;           /* Primary interactive color (Indigo 600) */
    --accent-light: #6366f1;     /* Hover & active state (Indigo 500) */
    --accent-soft: #eef2ff;      /* Tinted pill backgrounds (Indigo 50) */
    --accent-soft-bd: #c7d2fe;   /* Tinted borders (Indigo 200) */
    --accent-soft-tx: #3730a3;   /* High-contrast text on tint (Indigo 800) */

    /* Warning & Inspection (Warm Amber) */
    --warn: #d97706;             /* Warning alerts (Amber 600) */
    --warn-soft: #fffbeb;        /* Warning badge background (Amber 50) */
    --warn-soft-bd: #fde68a;     /* Warning badge border (Amber 200) */
    --warn-soft-tx: #92400e;     /* Warning text (Amber 800) */

    /* Success & Compliant (Emerald Green) */
    --success: #059669;          /* In-spec readings (Emerald 600) */
    --success-soft: rgba(16, 185, 129, 0.12);
    --success-border: rgba(16, 185, 129, 0.30);

    /* Danger & Excursion (Rose Red) */
    --danger: #dc2626;           /* Out-of-spec excursions (Red 600) */
    --danger-soft: rgba(239, 68, 68, 0.10);
    --danger-border: rgba(239, 68, 68, 0.30);

    /* Elevation & Shadows */
    --shadow-sm: 0 4px 16px -6px rgba(0, 0, 0, 0.08);
    --shadow-md: 0 12px 30px -8px rgba(0, 0, 0, 0.15);
    --shadow-lg: 0 25px 60px -15px rgba(0, 0, 0, 0.35);
}

/* ================================================================
   Theme Variables — Dark Mode
   Applied via [data-theme="dark"] or .dark on <html>
   ================================================================ */
[data-theme="dark"],
html.dark,
body.dark {
    /* Backgrounds & Surfaces */
    --bg-page: #0b1220;          /* Deep space midnight */
    --bg-surface: #111827;       /* Card surface (Gray 900) */
    --bg-surface-alt: #1a2436;   /* Highlighted container surface */
    --bg-surface-soft: #0f172a;  /* Inset wells & dark slots */
    --bg-input: #1e293b;         /* Input wells (Slate 800) */

    /* Borders */
    --border: #334155;           /* Structural border (Slate 700) */
    --border-light: #1e293b;     /* Sub-dividers */
    --border-faint: #1e293b;

    /* Text Hierarchy */
    --text-primary: #f1f5f9;     /* Crisp white-slate (Slate 100) */
    --text-secondary: #cbd5e1;   /* Neutral secondary (Slate 300) */
    --text-muted: #94a3b8;       /* Dim labels (Slate 400) */
    --text-faint: #64748b;       /* Subtle placeholders (Slate 500) */

    /* Accent & Brand */
    --accent: #6366f1;           /* Luminous Indigo (Indigo 500) */
    --accent-light: #818cf8;     /* Indigo 400 */
    --accent-soft: rgba(99, 102, 241, 0.14);
    --accent-soft-bd: rgba(99, 102, 241, 0.38);
    --accent-soft-tx: #a5b4fc;   /* Indigo 200 */

    /* Warning & Inspection */
    --warn: #fbbf24;
    --warn-soft: rgba(245, 158, 11, 0.12);
    --warn-soft-bd: rgba(245, 158, 11, 0.35);
    --warn-soft-tx: #fbbf24;

    /* Success & Compliant */
    --success: #10b981;
    --success-soft: rgba(16, 185, 129, 0.16);
    --success-border: rgba(16, 185, 129, 0.35);

    /* Danger & Excursion */
    --danger: #ef4444;
    --danger-soft: rgba(239, 68, 68, 0.14);
    --danger-border: rgba(239, 68, 68, 0.35);

    /* Elevation & Shadows */
    --shadow-sm: 0 4px 16px -6px rgba(0, 0, 0, 0.40);
    --shadow-md: 0 12px 30px -8px rgba(0, 0, 0, 0.55);
    --shadow-lg: 0 25px 60px -15px rgba(0, 0, 0, 0.65);
}
```

---

## 🔤 2. Typography

### Embedded Google Fonts
Include in `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700;800&family=Noto+Sans+Myanmar:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet">
```

### Font Application Rules
1. **UI Text (`var(--font-ui)`)**:
   - Headings, toolbars, buttons, form labels, general navigation.
   - Weights: `500` (Medium) for body, `600` (SemiBold) for controls, `700` (Bold) for section titles.
2. **Numeric & Data Values (`var(--font-mono)`)**:
   - Dates, timestamps, batch/lot numbers, temperature readings, row counts, code blocks.
   - Use tabular numbers (`font-variant-numeric: tabular-nums`) so numeric readouts do not jitter.

---

## 📐 3. Icon Style & Icon Container System

All icons follow a uniform **Lucide / Feather SVG geometry**:
- **Geometry**: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- **Sizing Tokens**:
  - `14px × 14px`: Inline meta icons, card tags, small badges.
  - `16px × 16px`: Button icons, form field adornments.
  - `20px × 20px`: Modal headers, section title icons.
  - `24px × 24px`: Feature cards & empty state heroes.

### The "Micro-Icon Box" Pattern
Buttons feature an icon nested inside a soft, semi-transparent square container (`.tbtn__icon`). This gives controls an elevated, tactile feel:

```css
.tbtn__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    transition: all 0.18s ease;
    flex-shrink: 0;
}

.tbtn__icon svg {
    width: 15px;
    height: 15px;
}
```

---

## 🔘 4. Toolbar & Button Styles (`.tbtn`)

### Base Button Structure
```html
<button class="tbtn tbtn--upload">
    <span class="tbtn__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
    </span>
    <span>Upload Data</span>
</button>
```

### Button Variants CSS

```css
.tbtn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 16px 0 6px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.18s ease;
    font-family: var(--font-ui);
    white-space: nowrap;
}

/* 1. Upload Button (Cyan Accent) */
.tbtn--upload {
    background: rgba(6, 182, 212, 0.10);
    border-color: rgba(6, 182, 212, 0.35);
    color: #67e8f9;
}
.tbtn--upload .tbtn__icon {
    background: rgba(6, 182, 212, 0.18);
    color: #22d3ee;
}
.tbtn--upload:hover {
    background: rgba(6, 182, 212, 0.20);
    border-color: rgba(6, 182, 212, 0.60);
    color: #a5f3fc;
    box-shadow: 0 6px 20px -8px rgba(6, 182, 212, 0.55);
    transform: translateY(-1px);
}

/* 2. Print Button (Slate Neutral) */
.tbtn--print {
    background: rgba(148, 163, 184, 0.08);
    border-color: rgba(148, 163, 184, 0.28);
    color: #cbd5e1;
}
.tbtn--print .tbtn__icon {
    background: rgba(148, 163, 184, 0.14);
    color: #cbd5e1;
}
.tbtn--print:hover {
    background: rgba(148, 163, 184, 0.16);
    border-color: rgba(148, 163, 184, 0.50);
    color: #f1f5f9;
    box-shadow: 0 6px 20px -8px rgba(148, 163, 184, 0.40);
    transform: translateY(-1px);
}

/* 3. PNG Export (Violet Accent) */
.tbtn--png {
    background: rgba(139, 92, 246, 0.10);
    border-color: rgba(139, 92, 246, 0.35);
    color: #c4b5fd;
}
.tbtn--png .tbtn__icon {
    background: rgba(139, 92, 246, 0.20);
    color: #a78bfa;
}
.tbtn--png:hover {
    background: rgba(139, 92, 246, 0.20);
    border-color: rgba(139, 92, 246, 0.60);
    color: #ddd6fe;
    box-shadow: 0 6px 20px -8px rgba(139, 92, 246, 0.55);
    transform: translateY(-1px);
}

/* 4. PDF Vector Export (Indigo Gradient Primary) */
.tbtn--pdf {
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    border-color: transparent;
    color: #ffffff;
    box-shadow: 0 8px 22px -8px rgba(79, 70, 229, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.18);
}
.tbtn--pdf .tbtn__icon {
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
}
.tbtn--pdf:hover {
    background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
    box-shadow: 0 12px 28px -8px rgba(99, 102, 241, 0.85);
    transform: translateY(-1px);
}

/* 5. Panel Cloud Action Button (Gradient Cyan-Indigo) */
.panel-save-cloud-btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 40px;
    padding: 0 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(14, 165, 233, 0.15) 100%);
    border: 1px solid rgba(99, 102, 241, 0.40);
    color: var(--accent);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.12);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.panel-save-cloud-btn:hover {
    background: linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%);
    color: #ffffff;
    border-color: transparent;
    box-shadow: 0 6px 18px -4px rgba(99, 102, 241, 0.50);
    transform: translateY(-1px);
}
.panel-save-cloud-btn:active {
    transform: translateY(0);
}

/* 6. Destructive / Bulk Delete Button (Crimson Alert) */
.bulk-del-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #ef4444;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.18s ease;
}
.bulk-del-btn:hover:not(:disabled) {
    background: #ef4444;
    border-color: #ef4444;
    color: #ffffff;
    box-shadow: 0 4px 14px -3px rgba(239, 68, 68, 0.55);
    transform: translateY(-1px);
}
.bulk-del-btn:active:not(:disabled) {
    transform: translateY(0);
}

/* 7. Icon Ghost Button (Toolbar Controls) */
.toolbar__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.18s ease;
}
.toolbar__icon-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    transform: translateY(-1px);
}
.toolbar__icon-btn:active {
    transform: translateY(0);
}
```

### ✨ Button Color Effects & Micro-Interaction Formulas

The design system achieves its tactile, luminous look through 5 specific color effect layers:

#### 1. Volumetric Hue-Matched Glow (`box-shadow`)
Unlike generic grey drop-shadows, every button projects a colored light pool matching its exact primary hue:
- **Upload (Cyan Glow)**: `box-shadow: 0 6px 20px -8px rgba(6, 182, 212, 0.55)`
- **PNG (Violet Glow)**: `box-shadow: 0 6px 20px -8px rgba(139, 92, 246, 0.55)`
- **PDF (Indigo Glow)**: `box-shadow: 0 12px 28px -8px rgba(99, 102, 241, 0.85)`
- **Delete (Red Glow)**: `box-shadow: 0 4px 14px -3px rgba(239, 68, 68, 0.55)`
- **Cloud (Sky Glow)**: `box-shadow: 0 6px 18px -4px rgba(99, 102, 241, 0.50)`

#### 2. Glass Tinting & Saturation Transition
When resting, tint buttons maintain a low visual weight (`10% background opacity` and `35% border opacity`).
On hover, opacity doubles to `20% background` and `60% border`, while the text shifts to high-brightness tint:
- **Upload Normal**: `background: rgba(6, 182, 212, 0.10); color: #67e8f9;`
- **Upload Hover**: `background: rgba(6, 182, 212, 0.20); color: #a5f3fc;`

#### 3. Specular Highlight Inset Sheen
Solid gradient buttons (like PDF Export) include an inner top-edge white sheen to mimic beveled glass:
- `inset 0 1px 0 rgba(255, 255, 255, 0.18)` on rest.
- `inset 0 1px 0 rgba(255, 255, 255, 0.22)` on hover.

#### 4. Kinetic Elevation Physics
- **Resting**: `transform: translateY(0);`
- **Hover**: `transform: translateY(-1px);` (creates float elevation)
- **Active (Click / Tap)**: `transform: translateY(0);` with instant `0.05s` snapback (gives mechanical push-button tactile feedback).

#### 5. Focus Halo Ring
For keyboard navigation and high accessibility, controls emit a 3px soft radiant aura on focus:
- `box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.20);`

---

## 📦 5. Card, Modal & Drawer Design Tokens

### 1. Panel Container (`.panel`)
```css
.panel {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: var(--shadow-sm);
    transition: background-color 0.25s ease, border-color 0.25s ease;
}
```

### 2. Segmented Date & Time Picker (`.seg-picker`)
High-density numeric controls for Year, Month, Day, Hour, Minute:
```css
.seg-picker {
    background: var(--bg-surface-alt);
    border: 1px solid var(--border-light);
    border-radius: 16px;
    padding: 14px 12px 12px;
    position: relative;
}

.seg-picker__fields {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
}

.seg-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--bg-surface);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: 5px 2px;
}

.seg-field:focus-within {
    border-color: var(--accent-light);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
}

.seg-field input {
    width: 100%;
    border: none;
    background: transparent;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
}

.seg-field label {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    font-weight: 600;
    margin-top: 1px;
}
```

### 3. Glassmorphic Modal Backdrop & Card
```css
.bulk-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(4px);
    z-index: 9100;
    transition: opacity 0.25s ease;
}

.bulk-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(1);
    width: 640px;
    max-width: 95vw;
    max-height: 88vh;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow-lg);
    z-index: 9101;
    overflow: hidden;
}
```

---

## 🏷️ 6. Badges, Indicators & Status Pills

| Element | Class Name | Light Mode | Dark Mode | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **In-Spec** | `.badge--ok` | `#059669` text on `rgba(16,185,129,0.12)` | `#34d399` text on `rgba(16,185,129,0.20)` | Verified within tolerance |
| **Excursion** | `.badge--warn` | `#dc2626` text on `rgba(239,68,68,0.12)` | `#f87171` text on `rgba(239,68,68,0.20)` | Temperature trip warning |
| **Cloud Synced** | `.qcloud-pill` | `#0284c7` text on `rgba(14,165,233,0.12)` | `#38bdf8` text on `rgba(14,165,233,0.20)` | Cloud Firestore synced |
| **Queue Progress** | `.bulk-queue-pill`| White on `#4f46e5` | White on `#6366f1` | Numeric counts (`12/12`) |
| **Sync Pulse Dot** | `.pulse-dot` | `#10b981` (6px circle) | `#34d399` (6px circle) | Real-time database heartbeat |

---

## 📊 7. Charting & Visualization Palette

| Component | Color (Hex/RGBA) | Purpose |
| :--- | :--- | :--- |
| **Sensor Trend Line** | `#4f46e5` (Light) · `#6366f1` (Dark) | Primary time-series curve |
| **Trend Area Fill** | `rgba(99, 102, 241, 0.08)` gradient | Under-curve depth volume |
| **Target Zone Band** | `rgba(16, 185, 129, 0.06)` | Compliant operating band (35°C–39°C) |
| **Max Limit Line** | `#ef4444` dashed (2px) | Upper excursion threshold |
| **Min Limit Line** | `#f59e0b` dashed (2px) | Lower excursion threshold |
| **Outlier High Halo** | `#ef4444` solid dot + outer halo ring | Critical high point |
| **Outlier Low Halo** | `#f59e0b` solid dot + outer halo ring | Critical low point |
| **Monochrome Mode** | `#0f172a` line + `#475569` markers | High-contrast photocopier & thermal print |

---

## 📋 8. Reusable SVG Icon Pack (Copy & Paste)

```html
<!-- Upload Cloud / File -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
</svg>

<!-- Cloud Archive / Save -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 11a4 4 0 0 0-4-4 4 4 0 0 0-4 4 4 4 0 0 0 .5 2 4.5 4.5 0 0 0-1.5 8h9a4 4 0 0 0 0-8 4 4 0 0 0 0-2z"/>
    <path d="M12 13v6M9 16l3-3 3 3"/>
</svg>

<!-- History Clock -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
</svg>

<!-- Printer -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/>
</svg>

<!-- Vector PDF File -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <path d="M14 2v6h6M9 13h6M9 17h6"/>
</svg>

<!-- Image / PNG -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <path d="M21 15l-5-5L5 21"/>
</svg>

<!-- Trash / Delete -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
</svg>

<!-- Settings / Sliders -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
</svg>

<!-- Search Lens -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
</svg>
```
