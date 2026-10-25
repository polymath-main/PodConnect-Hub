# 03 — UI Design System Specification
> **PodConnect Hub AI — v2.0 SaaS**
> Last Updated: 2026-10-25 | Status: Locked

---

## 1. Theme

**Dark-only. No light mode. No theme toggle.**

All values below are absolute — do not derive from Tailwind's default palette without checking these overrides first.

---

## 2. Color Palette

### Canvas & Background Layers

| Token | Hex | Usage |
|-------|-----|-------|
| `--canvas` | `#090D16` | Page background (deepest layer) |
| `--surface-base` | `#0F172A` | Main content panels, sidebar |
| `--surface-raised` | `#1E293B` | Cards, modals, dropdowns |
| `--surface-overlay` | `#263044` | Hover states, table row hover |
| `--border-hairline` | `rgba(255,255,255,0.08)` | All borders, dividers |
| `--border-subtle` | `rgba(255,255,255,0.12)` | Input borders (default) |
| `--border-focus` | `rgba(99,102,241,0.6)` | Input borders (focused) |

### Brand & Primary Actions

| Token | Hex | Usage |
|-------|-----|-------|
| `--primary` | `#6366F1` | Primary buttons, active nav, links |
| `--primary-hover` | `#5153D4` | Primary button hover |
| `--primary-muted` | `rgba(99,102,241,0.15)` | Primary button ghost background |
| `--accent` | `#0EA5E9` | Secondary accent, info badges, sky-blue highlights |
| `--accent-muted` | `rgba(14,165,233,0.15)` | Accent ghost backgrounds |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--success` | `#10B981` | Active status, approved badges, success toasts |
| `--success-muted` | `rgba(16,185,129,0.15)` | Success badge backgrounds |
| `--warning` | `#F59E0B` | Warning states, amber log level, paused status |
| `--warning-muted` | `rgba(245,158,11,0.15)` | Warning badge backgrounds |
| `--danger` | `#F43F5E` | Error states, destructive actions, rose log level |
| `--danger-muted` | `rgba(244,63,94,0.15)` | Danger badge backgrounds |
| `--neutral` | `#64748B` | Disabled states, placeholder text, metadata |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#F1F5F9` | Body text, headings |
| `--text-secondary` | `#94A3B8` | Labels, subtitles, helper text |
| `--text-muted` | `#64748B` | Placeholders, disabled text, timestamps |
| `--text-inverse` | `#090D16` | Text on light/colored backgrounds |

---

## 3. Typography Scale

### Font Families

| Family | Variable | Usage |
|--------|----------|-------|
| `Plus Jakarta Sans` | `--font-display` | All headings, body text, UI labels |
| `JetBrains Mono` | `--font-mono` | Code blocks, console/log output, data tables, job IDs |

Both fonts loaded via Google Fonts CDN in `index.html`. Fallback: `system-ui, sans-serif`.

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-xs` | `10px` | 400 | 1.4 | Timestamps, micro-labels |
| `--text-sm` | `12px` | 400/500 | 1.5 | Table cell text, badges, helper text |
| `--text-base` | `14px` | 400 | 1.6 | Default body copy, form labels |
| `--text-md` | `15px` | 500 | 1.5 | Card titles, section labels |
| `--text-lg` | `16px` | 600 | 1.4 | View headings (H3) |
| `--text-xl` | `18px` | 600 | 1.3 | Panel headings (H2) |
| `--text-2xl` | `20px` | 700 | 1.25 | Page titles (H1) |
| `--text-3xl` | `24px` | 700 | 1.2 | Hero/modal titles |

---

## 4. Spacing System

Base unit: `4px`. All spacing is multiples of 4.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` | Tight gaps (icon-to-label) |
| `--space-2` | `8px` | Inline padding (badge, chip) |
| `--space-3` | `12px` | Component inner padding |
| `--space-4` | `16px` | Card padding, form field gap |
| `--space-5` | `20px` | Section internal padding |
| `--space-6` | `24px` | Section gap, modal padding |
| `--space-8` | `32px` | Layout section spacing |
| `--space-10` | `40px` | Large section breaks |
| `--space-12` | `48px` | Page section spacing |

---

## 5. Border & Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `4px` | Badges, tags, small chips |
| `--radius-md` | `8px` | Buttons, inputs, small cards |
| `--radius-lg` | `12px` | Cards, modals, panels |
| `--radius-xl` | `16px` | Large modal containers |
| `--radius-full` | `9999px` | Pill badges, avatars |

---

## 6. Data Density

| Property | Value |
|----------|-------|
| Table row height | `38px` (tight density) |
| Table header height | `32px` |
| Sidebar width | `220px` (collapsed: `56px` icon-only) |
| Header height | `52px` |
| Modal max-width | `640px` |
| Right drawer width | `480px` |

---

## 7. Component States

### 7.1 Button — Primary

| State | Background | Text | Border | Shadow |
|-------|-----------|------|--------|--------|
| Default | `#6366F1` | `#F1F5F9` | none | `0 1px 3px rgba(0,0,0,0.3)` |
| Hover | `#5153D4` | `#F1F5F9` | none | `0 2px 6px rgba(99,102,241,0.4)` |
| Active/Pressed | `#4345B8` | `#F1F5F9` | none | none |
| Disabled | `rgba(99,102,241,0.3)` | `rgba(241,245,249,0.4)` | none | none |
| Loading | `#6366F1` | transparent | none | — (spinner overlay) |

### 7.2 Button — Ghost/Secondary

| State | Background | Text | Border |
|-------|-----------|------|--------|
| Default | `transparent` | `#94A3B8` | `1px solid rgba(255,255,255,0.08)` |
| Hover | `rgba(255,255,255,0.05)` | `#F1F5F9` | `1px solid rgba(255,255,255,0.12)` |
| Disabled | `transparent` | `rgba(148,163,184,0.4)` | `1px solid rgba(255,255,255,0.05)` |

### 7.3 Button — Danger

| State | Background | Text |
|-------|-----------|------|
| Default | `rgba(244,63,94,0.15)` | `#F43F5E` |
| Hover | `rgba(244,63,94,0.25)` | `#FB7185` |
| Disabled | `rgba(244,63,94,0.05)` | `rgba(244,63,94,0.4)` |

### 7.4 Input / Textarea

| State | Background | Border | Text |
|-------|-----------|--------|------|
| Default | `#1E293B` | `1px solid rgba(255,255,255,0.12)` | `#F1F5F9` |
| Focus | `#1E293B` | `1px solid rgba(99,102,241,0.6)` | `#F1F5F9` |
| Error | `#1E293B` | `1px solid #F43F5E` | `#F1F5F9` |
| Disabled | `rgba(30,41,59,0.5)` | `1px solid rgba(255,255,255,0.05)` | `#64748B` |
| Placeholder text | — | — | `#64748B` |

All inputs: `border-radius: 8px`, `padding: 10px 14px`, `font-size: 14px`.

### 7.5 Badge / Status Pill

All badges use `border-radius: 9999px`, `font-size: 11px`, `font-weight: 600`, `padding: 2px 8px`.

| Status | Background | Text |
|--------|-----------|------|
| Active / Success | `rgba(16,185,129,0.15)` | `#10B981` |
| Pending / Info | `rgba(14,165,233,0.15)` | `#0EA5E9` |
| Warning / Paused | `rgba(245,158,11,0.15)` | `#F59E0B` |
| Error / Cancelled | `rgba(244,63,94,0.15)` | `#F43F5E` |
| Neutral / Imported | `rgba(100,116,139,0.2)` | `#94A3B8` |
| Primary / Running | `rgba(99,102,241,0.2)` | `#6366F1` |

### 7.6 Table Row

| State | Background |
|-------|-----------|
| Default | `transparent` |
| Hover | `rgba(255,255,255,0.03)` |
| Selected | `rgba(99,102,241,0.08)` |
| Selected + Hover | `rgba(99,102,241,0.12)` |

Row dividers: `border-bottom: 1px solid rgba(255,255,255,0.05)`.

### 7.7 Modal Overlay

| Property | Value |
|----------|-------|
| Backdrop | `rgba(0,0,0,0.7)` (blurred: `backdrop-filter: blur(4px)`) |
| Modal surface | `#1E293B` |
| Modal border | `1px solid rgba(255,255,255,0.08)` |
| Modal shadow | `0 25px 50px rgba(0,0,0,0.5)` |
| Entry animation | `framer-motion`: `scale 0.95→1.0`, `opacity 0→1`, `duration 200ms` |
| Exit animation | `scale 1.0→0.95`, `opacity 1→0`, `duration 150ms` |

### 7.8 Kanban Card

| Property | Value |
|----------|-------|
| Background | `#1E293B` |
| Border | `1px solid rgba(255,255,255,0.06)` |
| Border (hovered) | `1px solid rgba(99,102,241,0.3)` |
| Border radius | `10px` |
| Padding | `14px` |
| Shadow | `0 2px 8px rgba(0,0,0,0.2)` |
| Drag shadow | `0 8px 24px rgba(0,0,0,0.5)` |

### 7.9 SSE Log Terminal

The log terminal in Scraper Console uses `JetBrains Mono`, `12px`.

| Level | Text Color | Prefix |
|-------|-----------|--------|
| `INFO` | `#94A3B8` | `[INFO]` |
| `SUCCESS` | `#10B981` | `[OK]` |
| `WARN` | `#F59E0B` | `[WARN]` |
| `ERROR` | `#F43F5E` | `[ERR]` |

Terminal background: `#090D16`. Terminal border: `1px solid rgba(255,255,255,0.06)`. `overflow-y: auto`, `max-height: 280px`.

### 7.10 Sidebar Navigation Item

| State | Background | Text | Left Border |
|-------|-----------|------|-------------|
| Default | `transparent` | `#64748B` | none |
| Hover | `rgba(255,255,255,0.04)` | `#94A3B8` | none |
| Active | `rgba(99,102,241,0.12)` | `#6366F1` | `2px solid #6366F1` |

---

## 8. Icon System

Library: `lucide-react` v0.546.0. Default icon size: `18px`. Stroke width: `1.5px`.

| Context | Size |
|---------|------|
| Sidebar nav items | `20px` |
| Button icons | `16px` |
| Table action icons | `14px` |
| Header/hero icons | `24px` |
| Empty state illustration icons | `48px`, stroke `1px` |

---

## 9. Motion & Animation

Library: `motion` (Framer Motion v12).

| Animation | Config |
|-----------|--------|
| Page view transition | `opacity 0→1`, `y 8→0`, `duration 200ms`, `ease: easeOut` |
| Modal enter | `scale 0.95→1`, `opacity 0→1`, `duration 200ms` |
| Modal exit | `scale 1→0.95`, `opacity 1→0`, `duration 150ms` |
| Toast slide-in | `x 100%→0`, `opacity 0→1`, `duration 250ms` |
| Toast slide-out | `x 0→100%`, `opacity 1→0`, `duration 200ms` |
| Kanban card drag | `scale: 1.02`, `rotate: 1deg`, `shadow increased` |
| Progress bar fill | `width transition 300ms ease` |
| Skeleton pulse | `opacity 0.5↔1.0`, `1.5s infinite` |

---

## 10. Toast / Notification System

Position: `bottom-right`, `24px` from edge.
Stack: max 3 visible toasts; oldest auto-dismiss first.
Auto-dismiss: `4000ms`.

| Type | Left border color | Icon |
|------|------------------|------|
| Success | `#10B981` | `CheckCircle` |
| Error | `#F43F5E` | `XCircle` |
| Warning | `#F59E0B` | `AlertTriangle` |
| Info | `#0EA5E9` | `Info` |

Toast surface: `#1E293B`, border: `1px solid rgba(255,255,255,0.08)`, shadow: `0 4px 16px rgba(0,0,0,0.4)`.
