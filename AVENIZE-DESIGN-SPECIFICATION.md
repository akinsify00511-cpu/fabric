# AVENIZE DESIGN SPECIFICATION v2.0

## Premium • Professional • Muted
**Inspired by:** Linear × Stripe × Notion

---

## Color System

### Primary - Slate
| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#475569` | Primary buttons, links |
| `primaryHover` | `#334155` | Hover states |
| `primaryActive` | `#1E293B` | Active states |
| `primarySoft` | `rgba(71, 85, 105, 0.08)` | Backgrounds |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#15803D` | Success states |
| `successSoft` | `rgba(21, 128, 61, 0.08)` | Success backgrounds |
| `warning` | `#B45309` | Warning states |
| `warningSoft` | `rgba(180, 83, 9, 0.08)` | Warning backgrounds |
| `danger` | `#B91C1C` | Error states |
| `dangerSoft` | `rgba(185, 28, 28, 0.08)` | Error backgrounds |
| `info` | `#0369A1` | Info states |
| `infoSoft` | `rgba(3, 105, 161, 0.08)` | Info backgrounds |

### Accent - Violet
| Token | Hex | Usage |
|-------|-----|-------|
| `accent` | `#7C3AED` | Special elements |
| `accentSoft` | `rgba(124, 58, 237, 0.08)` | Accent backgrounds |

### Surfaces
| Token | Hex | Usage |
|-------|-----|-------|
| `surface` | `#FAFAF9` | Page background |
| `surface2` | `#F5F5F4` | Card backgrounds |
| `surface3` | `#E7E5E4` | Borders |
| `surfaceElevated` | `#FFFFFF` | Elevated cards |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `text` | `#18181B` | Primary text |
| `textSecondary` | `#52525B` | Secondary text |
| `textMuted` | `#A1A1AA` | Muted text |
| `textDisabled` | `#D4D4D8` | Disabled text |

### Borders
| Token | Hex | Usage |
|-------|-----|-------|
| `border` | `#E7E5E4` | Default borders |
| `borderStrong` | `#D6D3D1` | Emphasized borders |

---

## Typography

**Font Family:** Inter (fallback: system sans)

| Element | Size | Weight |
|---------|------|--------|
| H1 | 32px | 700 |
| H2 | 24px | 600 |
| H3 | 20px | 600 |
| Body | 14px | 400 |
| Small | 12px | 400 |
| Caption | 11px | 500 |

---

## Spacing

| Token | Value |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 32px |
| 2xl | 48px |

---

## Border Radius

| Token | Value |
|-------|-------|
| sm | 6px |
| md | 8px |
| lg | 12px |
| xl | 16px |
| full | 9999px |

---

## Shadows

| Token | Value |
|-------|-------|
| sm | `0 1px 2px rgba(0,0,0,0.03)` |
| md | `0 1px 3px rgba(0,0,0,0.04)` |
| lg | `0 4px 6px rgba(0,0,0,0.04)` |

---

## Implementation

### CSS Variables
```css
:root {
  --av-primary: #475569;
  --av-primary-soft: rgba(71, 85, 105, 0.08);
  --av-success: #15803D;
  --av-warning: #B45309;
  --av-danger: #B91C1C;
  --av-surface: #FAFAF9;
  --av-text: #18181B;
  --av-border: #E7E5E4;
}
```

### React Usage
```tsx
const BRAND = {
  primary: '#475569',
  primarySoft: 'rgba(71, 85, 105, 0.08)',
  surface: '#FAFAF9',
  text: '#18181B',
  // ...
}

// Use inline styles
<div style={{ backgroundColor: BRAND.surface }}>
  <button style={{ backgroundColor: BRAND.primary }}>
</div>
```

---

## DON'Ts

❌ `bg-blue-500`  
❌ `bg-green-500`  
❌ `bg-red-500`  
❌ `#0891B2` (old teal)  
❌ `#059669` (old green)  
❌ `#DC2626` (old red)  
❌ `#D97706` (old amber)  

## DOs

✅ `style={{ backgroundColor: BRAND.primary }}`  
✅ `style={{ backgroundColor: BRAND.success }}`  
✅ `style={{ backgroundColor: BRAND.surface }}`  

---

**Updated:** 2026-08-07 (v2.0 - Muted Professional)
