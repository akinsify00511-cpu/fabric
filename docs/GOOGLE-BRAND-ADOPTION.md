# Avenize × Google-Inspired Brand Guidelines
## Adopting Google's UI/UX Excellence for Avenize

---

## Executive Summary

This document outlines how Avenize can adopt Google's proven UI/UX and branding principles while maintaining its unique identity as "The Business Operating System." Google's design philosophy—clean, minimal, accessible, and purposeful—perfectly aligns with Avenize's brand promise: **Everything works together.**

---

## 01. Google Branding Principles to Adopt

### 1.1 The Google Visual Identity

| Element | Google | Avenize (Current) | Avenize (Recommended) |
|---------|--------|-------------------|------------------------|
| Primary Color | `#4285F4` | `#2563EB` | `#4285F4` or blend `#2563EB` with `#4285F4` |
| Secondary | `#EA4335`, `#FBBC05`, `#34A853` | Gradient blue-indigo-violet | Retain gradient for signature moments |
| Background | `#FFFFFF` (pure white) | `#F9FAFB` (off-white) | Use `#FFFFFF` for surfaces, `#F8F9FA` for page bg |
| Text | `#202124` (near black) | `#111827` | `#1F2937` (softer, Google-style) |
| Secondary Text | `#5F6368` | `#6B7280` | `#5F6368` (Google's secondary) |
| Borders | Minimal, often none | Visible borders | Remove borders on cards, use elevation only |

### 1.2 Google's Design Philosophy

**"Beautiful, useful, and trustworthy."**

Google's design principles:
1. **Focus on the user** — Every decision serves the user
2. **One primary action** — Each screen has one clear purpose
3. **Reduce cognitive load** — Less is more, everywhere
4. **Consistency** — Same patterns everywhere
5. **Delight in motion** — Purposeful, not decorative animation

**Avenize alignment:**
- ✅ Avenize's "One click fewer" principle mirrors Google's focus
- ✅ Avenize's "One screen fewer" principle mirrors Google's simplicity
- ✅ Avenize's "One decision fewer" principle mirrors Google's clarity

---

## 02. Color System (Google-Inspired)

### 2.1 Primary Colors

```
/* Google Blue (recommended for Avenize) */
--google-blue: #4285F4;
--google-blue-hover: #3367D6;
--google-blue-light: rgba(66, 133, 244, 0.1);

/* Avenize Signature Gradient (retain for hero moments) */
--avenize-gradient-start: #4285F4;  /* Changed from #2563EB */
--avenize-gradient-mid: #6366F1;   /* Changed from #4F46E5 */
--avenize-gradient-end: #8B5CF6;   /* Retained */
```

### 2.2 Surface System (Google-Style)

```
/* Pure white surfaces - no borders, just elevation */
--surface-primary: #FFFFFF;
--surface-secondary: #F8F9FA;      /* Google's page background */
--surface-elevated: #FFFFFF;

/* Elevation shadows (Google Material 3 style) */
--elevation-1: 0 1px 2px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08);
--elevation-2: 0 2px 4px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.06);
--elevation-3: 0 4px 8px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.06);

/* REMOVE: Border-based cards */
/* DELETE: --av-border, --av-border-strong */
```

### 2.3 Text Colors (Google Typography)

```
/* High contrast, readable */
--text-primary: #202124;      /* Google's primary text */
--text-secondary: #5F6368;     /* Google's secondary text */
--text-tertiary: #9AA0A6;     /* Google's muted text */
--text-disabled: #DADCE0;     /* Google's disabled text */
```

---

## 03. Typography (Google-Inspired)

### 3.1 Font Selection

**Current Avenize:** Geist (good), Inter (fallback)

**Google uses:** Product Sans → Google Sans → Roboto

**Recommendation:** Keep Geist but adopt Google's type scale:

### 3.2 Google Type Scale

| Role | Google Size | Google Weight | Avenize Use |
|------|-------------|---------------|-------------|
| Display Large | 57px | 400 | Hero headlines |
| Display Medium | 45px | 400 | Section titles |
| Headline Large | 32px | 400 | Page titles |
| Headline Medium | 28px | 400 | Card titles |
| Title Large | 22px | 500 | Navigation |
| Title Medium | 16px | 500 | Section headers |
| Body Large | 16px | 400 | Primary content |
| Body Medium | 14px | 400 | Secondary content |
| Label Large | 14px | 500 | Buttons |
| Label Medium | 12px | 500 | Tags, badges |

### 3.3 Typography Rules (Google Style)

```css
/* Google's approach: variable font weights, optical sizing */
--font-family: 'Geist', 'Google Sans', system-ui, sans-serif;

/* Letter spacing per Google spec */
letter-spacing: -0.01em;  /* Display, Headline, Title */
letter-spacing: 0;        /* Body */
letter-spacing: 0.01em;   /* Label */
```

---

## 04. Spacing System (Google 8dp Grid)

### 4.1 The 8dp Grid

Google uses an 8dp (8 pixel) base unit for all spacing. Adopt this:

```
--space-1: 4px;   /* 0.5x - tight spacing */
--space-2: 8px;   /* 1x - base unit */
--space-3: 12px;  /* 1.5x */
--space-4: 16px;  /* 2x - default spacing */
--space-5: 24px;  /* 3x */
--space-6: 32px;  /* 4x */
--space-7: 48px;  /* 6x */
--space-8: 64px;  /* 8x */
--space-9: 96px;  /* 12x */
```

### 4.2 Component Spacing

| Component | Google Padding | Avenize (Recommended) |
|-----------|---------------|----------------------|
| Card | 16px | 24px |
| Button | 24px horizontal, 10px vertical | 24px horizontal, 12px vertical |
| Input | 16px | 16px |
| List item | 16px vertical, 24px horizontal | 16px vertical, 24px horizontal |
| Page margin | 48-72px | 48px |

---

## 05. Corner Radius (Google Material 3)

### 5.1 Radius Scale

| Element | Google Radius | Avenize (Current) | Avenize (Recommended) |
|---------|---------------|-------------------|----------------------|
| Small (chips, badges) | 8px | 6px | 8px |
| Medium (buttons, inputs) | 12px | 8px | 12px |
| Large (cards, dialogs) | 16px | 12px | 16px |
| Extra Large (modals) | 28px | 16px | 24px |
| FAB | 16px | - | 16px |
| Search bar | Full pill | - | 28px (pill shape) |

### 5.2 Google Pill Shape (Key Element)

```css
/* Google Search Bar Style - Highly Recommended for Avenize */
.avenize-search {
  border-radius: 24px;  /* Pill shape */
  padding: 12px 24px;
  border: 1px solid #DADCE0;
  background: #FFFFFF;
  font-size: 16px;
  box-shadow: none;
  transition: box-shadow 200ms ease;
}

.avenize-search:hover {
  box-shadow: 0 1px 6px rgba(32,33,36,0.28);
}

.avenize-search:focus-within {
  box-shadow: 0 1px 6px rgba(32,33,36,0.28);
  border-color: transparent;
}
```

---

## 06. Components (Google Material 3 Style)

### 6.1 Buttons

**Google Button Spec:**

```css
/* Filled Button (Primary) */
.btn-filled {
  background: #4285F4;
  color: #FFFFFF;
  border-radius: 12px;
  padding: 12px 24px;
  font-weight: 500;
  font-size: 14px;
  border: none;
  cursor: pointer;
  transition: background 150ms ease;
}

.btn-filled:hover {
  background: #3367D6;
}

/* Outlined Button */
.btn-outlined {
  background: transparent;
  color: #4285F4;
  border: 1px solid #DADCE0;
  border-radius: 12px;
  padding: 12px 24px;
}

.btn-outlined:hover {
  background: rgba(66,133,244,0.04);
  border-color: #4285F4;
}

/* Text Button */
.btn-text {
  background: transparent;
  color: #4285F4;
  border: none;
  padding: 12px 24px;
}
```

### 6.2 Cards (Google Style)

**Key difference from current Avenize:** NO borders, use elevation only.

```css
/* Google-style Card - Elevation-based */
.card-google {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 24px;
  /* NO border property */
  box-shadow: 0 1px 2px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06);
  transition: box-shadow 200ms ease;
}

.card-google:hover {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.06);
}

/* Interactive Card */
.card-interactive {
  cursor: pointer;
}

.card-interactive:hover {
  box-shadow: 0 4px 8px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.06);
}
```

### 6.3 State Layers (Google Interaction Model)

Google uses state layers for hover/focus/pressed states:

```css
/* State Layer (Google Material 3) */
.state-layer {
  position: absolute;
  inset: 0;
  background: currentColor;
  opacity: 0;
  transition: opacity 150ms ease;
  border-radius: inherit;
}

.interactive:hover .state-layer {
  opacity: 0.08;  /* Hover: 8% opacity overlay */
}

.interactive:focus-visible .state-layer {
  opacity: 0.12;  /* Focus: 12% opacity overlay */
}

.interactive:active .state-layer {
  opacity: 0.12;  /* Pressed: 12% opacity overlay */
}
```

---

## 07. Motion (Google Material 3)

### 7.1 Animation Principles

1. **Purposeful** — Every animation communicates something
2. **Quick** — Never more than 300ms for UI transitions
3. **Natural** — Use easing curves, not linear
4. **Consistent** — Same motion for same interactions

### 7.2 Animation Tokens

```css
/* Duration */
--motion-duration-short: 100ms;   /* Micro-interactions */
--motion-duration-medium: 200ms; /* Standard transitions */
--motion-duration-long: 300ms;   /* Large movements */

/* Easing (Google's standard curves) */
--motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);        /* Accelerate */
--motion-easing-emphasized: cubic-bezier(0.2, 0, 0, 1);      /* Spring-like */
--motion-easing-decelerated: cubic-bezier(0, 0, 0, 1);       /* Enter */
--motion-easing-accelerated: cubic-bezier(0.3, 0, 1, 1);     /* Exit */

/* Examples */
.fade-in {
  animation: fadeIn var(--motion-duration-medium) var(--motion-easing-decelerated);
}

.slide-up {
  animation: slideUp var(--motion-duration-medium) var(--motion-easing-emphasized);
}
```

### 7.3 Page Load Animation (Google Style)

```css
/* Staggered entrance - Google homepage style */
@keyframes fadeSlideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-entrance {
  animation: fadeSlideUp 400ms var(--motion-easing-emphasized) forwards;
  opacity: 0;
}

.delay-1 { animation-delay: 0ms; }
.delay-2 { animation-delay: 100ms; }
.delay-3 { animation-delay: 200ms; }
.delay-4 { animation-delay: 300ms; }
.delay-5 { animation-delay: 400ms; }
```

---

## 08. Icons (Google Material Symbols)

### 8.1 Icon Guidelines

- **Style:** Outlined, 24px default
- **Optical size:** Variable (small, medium, large)
- **Weight:** 400 (regular), 500 (medium)
- **Grade:** 0 or 200 (for lighter/darker variants)
- **Fill:** None for standard icons

### 8.2 Recommended Icon Library

**Google Material Symbols** (free, Google-made):
```
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0');
```

Or use **Lucide** (currently in your guidelines) which has similar aesthetics.

---

## 09. Navigation & Layout (Google Style)

### 9.1 Top Navigation (Google Header)

```css
/* Google-style top bar */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 64px;
  background: #FFFFFF;
  border-bottom: 1px solid #E8EAED;
  position: sticky;
  top: 0;
  z-index: 100;
}

/* Left: Logo + Primary Nav */
.header-left {
  display: flex;
  align-items: center;
  gap: 32px;
}

/* Right: User actions */
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Nav links */
.nav-link {
  color: #5F6368;
  font-size: 14px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  text-decoration: none;
  transition: background 150ms ease, color 150ms ease;
}

.nav-link:hover {
  background: rgba(0,0,0,0.04);
  color: #202124;
}

.nav-link.active {
  color: #4285F4;
}
```

### 9.2 Sidebar (Google-style Rail)

```css
/* Minimal sidebar - Google Workspace style */
.sidebar {
  width: 72px;  /* Rail width */
  background: #FFFFFF;
  border-right: 1px solid #E8EAED;
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
}

.sidebar-item {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5F6368;
  transition: background 150ms ease;
}

.sidebar-item:hover {
  background: rgba(0,0,0,0.04);
}

.sidebar-item.active {
  background: rgba(66,133,244,0.12);
  color: #4285F4;
}
```

---

## 10. Dark Mode (Google Material You)

### 10.1 Dark Surface Colors

```css
@media (prefers-color-scheme: dark) {
  :root {
    --surface-primary: #1F1F1F;
    --surface-secondary: #2D2D2D;
    --surface-elevated: #303030;
    
    --text-primary: #E8EAED;
    --text-secondary: #9AA0A6;
    --text-tertiary: #707070;
    
    --border-color: rgba(255,255,255,0.12);
  }
}
```

### 10.2 Dark Mode Elevation

```css
@media (prefers-color-scheme: dark) {
  .card {
    background: #303030;
    box-shadow: 
      0 2px 4px rgba(0,0,0,0.4),
      0 8px 16px rgba(0,0,0,0.3);
  }
}
```

---

## 11. Accessibility (Google Standards)

### 11.1 Contrast Ratios

| Text Type | Minimum Ratio | Google Standard |
|-----------|---------------|-----------------|
| Body text | 4.5:1 | 7:1 (AAA) |
| Large text | 3:1 | 4.5:1 |
| UI components | 3:1 | 4.5:1 |

### 11.2 Focus States

```css
/* Google-style focus ring */
:focus-visible {
  outline: 2px solid #4285F4;
  outline-offset: 2px;
}

/* Remove default focus for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```

### 11.3 Touch Targets

- Minimum size: 48x48px
- Recommended: 56x56px
- Spacing between: 8px minimum

---

## 12. Implementation Checklist

### Color System
- [ ] Update primary to Google Blue (#4285F4) or blend with current
- [ ] Remove border colors from design tokens
- [ ] Add elevation shadow tokens
- [ ] Update text colors to Google's hierarchy
- [ ] Implement dark mode color scheme

### Typography
- [ ] Adjust type scale to Google spec
- [ ] Update letter-spacing rules
- [ ] Ensure minimum 14px body text

### Spacing
- [ ] Adopt 8dp grid system
- [ ] Increase card padding to 24px
- [ ] Standardize button padding

### Components
- [ ] Convert border-based cards to elevation-based
- [ ] Update corner radius to Google spec
- [ ] Implement Google-style search bar (pill shape)
- [ ] Add state layer interactions
- [ ] Update button styles

### Motion
- [ ] Implement motion duration tokens
- [ ] Add easing curve tokens
- [ ] Create page load animation system
- [ ] Add hover/focus state transitions

### Navigation
- [ ] Update header to Google style
- [ ] Implement minimal sidebar rail
- [ ] Add nav link hover states

---

## 13. Example: Updated CSS Variables

```css
:root {
  /* === COLORS === */
  /* Primary (Google Blue) */
  --color-primary: #4285F4;
  --color-primary-hover: #3367D6;
  --color-primary-light: rgba(66, 133, 244, 0.1);
  
  /* Avenize Signature Gradient */
  --avenize-gradient: linear-gradient(135deg, #4285F4 0%, #6366F1 50%, #8B5CF6 100%);
  
  /* Surfaces */
  --surface-1: #FFFFFF;
  --surface-2: #F8F9FA;
  --surface-3: #F1F3F4;
  
  /* Elevation (Google-style shadows) */
  --shadow-1: 0 1px 2px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06);
  --shadow-2: 0 2px 4px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.06);
  --shadow-3: 0 4px 8px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.06);
  
  /* Text */
  --text-1: #202124;
  --text-2: #5F6368;
  --text-3: #9AA0A6;
  
  /* === SPACING (8dp grid) === */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  
  /* === RADIUS === */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-pill: 9999px;
  
  /* === MOTION === */
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --easy-gentle: cubic-bezier(0, 0, 0.2, 1);
}
```

---

## 14. Visual Reference: Key Google Patterns

### 14.1 The Google Search Bar (Perfect UX Pattern)

The most iconic UI element - clean, focused, pill-shaped:

```
┌─────────────────────────────────────────────────────────────┐
│  🔍  Enter your search...                              ⚙️  │
└─────────────────────────────────────────────────────────────┘
```

**Avenize Application:** Apply this same principle to:
- Global search
- Command palette (Raycast/Alfred style)
- Quick create
- Filter inputs

### 14.2 Google Card Style

```
┌─────────────────────────────────┐
│                                 │
│   Content with generous        │
│   padding (24px)               │
│                                 │
│   No visible borders            │
│   Just subtle shadow            │
│                                 │
└─────────────────────────────────┘
```

### 14.3 Google Button Hierarchy

```
[PRIMARY]  [SECONDARY]  [TEXT]
 Filled     Outlined    No border
```

---

## 15. Summary: Google + Avenize Fusion

| Element | Google Principle | Avenize Implementation |
|---------|-----------------|------------------------|
| **Colors** | Blue primary, clean whites | Google Blue, keep signature gradient |
| **Typography** | Product Sans, 8sp scale | Geist, Google type scale |
| **Surfaces** | Elevation > Borders | Remove card borders, add shadows |
| **Spacing** | 8dp grid | Adopt 8dp system |
| **Radius** | 12px default | Update to 12px standard |
| **Motion** | 200ms, ease-out | Implement motion tokens |
| **Focus** | Clear rings | Use Google focus style |
| **Icons** | Material Symbols | Keep Lucide (similar style) |
| **Navigation** | Minimal, icon rail | Sidebar rail pattern |

---

## Next Steps

1. **Phase 1:** Update CSS variables and design tokens
2. **Phase 2:** Redesign core components (cards, buttons, inputs)
3. **Phase 3:** Update typography and spacing system
4. **Phase 4:** Implement motion and animation system
5. **Phase 5:** Add dark mode support
6. **Phase 6:** Audit and polish all screens

---

*Document created for Avenize brand evolution*
*Inspired by Google Material Design 3 and Material You*
