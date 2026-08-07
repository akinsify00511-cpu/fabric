# Avenize Design Specification
## Single Source of Truth for All UI Development

**Version:** 5.0  
**Last Updated:** 2026-08-07  
**Status:** MANDATORY - All pages must follow this spec

---

## 🎯 Design Philosophy

Avenize is a **Boutique SaaS Platform** - not a Google clone, not a generic enterprise tool.

**Positioning:** Linear × Notion × Stripe  
**Feel:** Premium, warm, approachable, professional  
**NOT:** Cold Google whites, Material Design, generic enterprise

---

## 🎨 Color System

### Primary Colors (MANDATORY)

```css
/* Primary Brand - Teal (ownable, distinctive) */
--av-primary: #0891B2;
--av-primary-hover: #0E7490;
--av-primary-active: #155E75;
--av-primary-soft: rgba(8, 145, 178, 0.08);
--av-primary-subtle: rgba(8, 145, 178, 0.04);

/* DO NOT USE: #4285F4 (Google Blue) */
/* DO NOT USE: #4285F4 anywhere in UI */
```

### Secondary Colors

```css
/* Warm Amber for accents/CTAs */
--av-amber: #D97706;
--av-amber-hover: #B45309;
--av-amber-soft: rgba(217, 119, 6, 0.08);

/* Signature Gradient - Teal to Emerald */
--av-gradient: linear-gradient(135deg, #0891B2 0%, #0D9488 50%, #059669 100%);
```

### Surface Colors

```css
/* Warm surfaces - NOT cold Google whites */
--av-surface: #FAFAF9;      /* Page background */
--av-surface-2: #F5F5F4;    /* Card backgrounds */
--av-surface-3: #E7E5E4;    /* Tertiary */
--av-surface-elevated: #FFFFFF;
```

### Text Colors

```css
/* Near-black text - Linear-style clarity */
--av-text: #18181B;           /* Primary text */
--av-text-secondary: #52525B; /* Secondary text */
--av-text-muted: #A1A1AA;    /* Placeholder/muted */
--av-text-disabled: #D4D4D8;  /* Disabled */
```

### Semantic Colors

```css
--av-success: #059669;        /* Green */
--av-success-bg: rgba(5, 150, 105, 0.08);
--av-warning: #D97706;        /* Amber */
--av-warning-bg: rgba(217, 119, 6, 0.08);
--av-danger: #DC2626;         /* Red */
--av-danger-bg: rgba(220, 38, 38, 0.08);
--av-info: #0891B2;           /* Teal */
--av-info-bg: rgba(8, 145, 178, 0.08);
```

### Module Colors (for icons/badges)

| Module | Color | Hex |
|--------|-------|-----|
| CRM | Teal | #0891B2 |
| Sales | Emerald | #059669 |
| Finance | Purple | #7C3AED |
| Projects | Amber | #D97706 |
| HR | Pink | #DB2777 |

---

## 📝 Typography

### Font Stack
```css
--av-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Type Scale
```css
--av-text-xs: 11px;    /* Captions */
--av-text-sm: 13px;    /* Small text */
--av-text-base: 14px;  /* Body text */
--av-text-md: 15px;    /* Medium */
--av-text-lg: 18px;    /* H4 */
--av-text-xl: 20px;    /* H3 */
--av-text-2xl: 24px;   /* H2 */
--av-text-3xl: 30px;   /* H1 */
--av-text-4xl: 36px;   /* Hero */
```

### Weights
- **Regular (400):** Body text
- **Medium (500):** Emphasis, labels
- **Semibold (600):** Headings, buttons

---

## 📐 Spacing System (8px Grid)

```css
--av-space-1: 4px;
--av-space-2: 8px;
--av-space-3: 12px;
--av-space-4: 16px;
--av-space-5: 20px;
--av-space-6: 24px;
--av-space-7: 32px;
--av-space-8: 40px;
--av-space-9: 48px;
--av-space-10: 64px;
```

---

## 🔲 Border Radius

```css
/* Generous, friendly radii - Linear/Stripe style */
--av-radius-sm: 6px;    /* Small elements */
--av-radius-md: 8px;    /* Inputs, buttons */
--av-radius-lg: 12px;   /* Cards */
--av-radius-xl: 16px;   /* Large cards */
--av-radius-2xl: 24px;  /* Modals */
--av-radius-full: 9999px; /* Pills, avatars */
```

---

## 🌫️ Shadows (NOT Material Design)

```css
/* Soft, premium shadows - NOT Google's Material elevation */
--av-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--av-shadow-md: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
--av-shadow-lg: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
--av-shadow-glow: 0 0 20px rgba(8, 145, 178, 0.2);  /* For primary elements */
```

**DO NOT USE:** Material Design shadows like `0 1px 2px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06)`

---

## 🔘 Buttons

### Primary Button
```css
background: var(--av-primary);  /* #0891B2 */
color: white;
padding: 10px 16px;
border-radius: var(--av-radius-md);
font-weight: 500;
```

### Secondary Button
```css
background: transparent;
color: var(--av-text);
border: 1px solid var(--av-border);
border-radius: var(--av-radius-md);
```

### Ghost Button
```css
background: transparent;
color: var(--av-text-secondary);
border: none;
```

---

## 📦 Cards

### Standard Card
```css
background: var(--av-surface-elevated);
border-radius: var(--av-radius-lg);
padding: var(--av-space-5);
border: 1px solid var(--av-border);
box-shadow: var(--av-shadow-sm);
```

### Hero Card (with gradient accent)
```css
/* Same as standard card PLUS: */
.av-card-hero::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--av-gradient);  /* Teal gradient */
}
```

---

## 📝 Forms

### Input Fields
```css
.av-input {
  padding: 10px 12px;
  border: 1px solid var(--av-border);
  border-radius: var(--av-radius-md);
  font-size: var(--av-text-sm);
  transition: border-color, box-shadow;
}

.av-input:focus {
  outline: none;
  border-color: var(--av-primary);
  box-shadow: 0 0 0 3px var(--av-primary-soft);
}
```

---

## 🏷️ Badges

```css
.av-badge {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: var(--av-radius-full);
}

/* Variants */
.av-badge-primary { background: var(--av-primary-soft); color: var(--av-primary); }
.av-badge-success { background: var(--av-success-bg); color: var(--av-success); }
.av-badge-warning { background: var(--av-warning-bg); color: var(--av-warning); }
.av-badge-danger { background: var(--av-danger-bg); color: var(--av-danger); }
```

---

## 🚫 FORBIDDEN PATTERNS

### NEVER Do These:

1. **NEVER use Google Blue**
   ```tsx
   // BAD ❌
   <div className="bg-[#4285F4]">...</div>
   <div className="text-[#4285F4]">...</div>
   
   // GOOD ✅
   <div className="bg-[var(--av-primary)]">...</div>
   <div className="text-[var(--av-primary)]">...</div>
   ```

2. **NEVER use Material Design shadows**
   ```tsx
   // BAD ❌
   box-shadow: 0 1px 2px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06);
   
   // GOOD ✅
   box-shadow: var(--av-shadow-md);
   ```

3. **NEVER use cold whites**
   ```tsx
   // BAD ❌
   background: white;
   background: #FFFFFF;
   
   // GOOD ✅
   background: var(--av-surface);
   background: var(--av-surface-elevated);
   ```

4. **NEVER use "Google Sans" or reference Google fonts**
   ```css
   /* BAD ❌ */
   font-family: 'Google Sans', 'Product Sans', Roboto, sans-serif;
   
   /* GOOD ✅ */
   font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
   ```

5. **NEVER use Lucide icons with "currentColor" inconsistently**
   ```tsx
   // GOOD ✅ - Always set color explicitly
   <Icon className="w-5 h-5 text-[var(--av-primary)]" />
   ```

---

## 📱 Page Layout Rules

### Shell Layout (App Pages)
- **Header:** 64px height, white background, subtle bottom border
- **Sidebar:** 240px width, collapsible to 64px
- **Content Area:** max-w-7xl centered, padding 24px

### Page Headers
```tsx
<div className="bg-white border-b border-[var(--av-border)] px-6 py-4">
  <h1 className="text-xl font-semibold text-[var(--av-text)]">
    Page Title
  </h1>
  <p className="text-sm text-[var(--av-text-secondary)] mt-0.5">
    Page description
  </p>
</div>
```

### Content Sections
```tsx
<div className="p-6">
  {/* Use grid for cards */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {/* Cards go here */}
  </div>
</div>
```

---

## 🎬 Animations

### Transitions
```css
--av-transition-fast: 100ms var(--av-ease-out);
--av-transition-normal: 150ms var(--av-ease-out);
```

### Easing
```css
--av-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--av-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Common Animations
```css
/* Fade in */
@keyframes av-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Slide up */
@keyframes av-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Scale in */
@keyframes av-scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
```

---

## 🎨 Dark Mode

Dark mode should:
- Use warm dark surfaces: `#27272A` (not pure black `#000`)
- Maintain readable contrast ratios
- Invert text hierarchy properly

```css
@media (prefers-color-scheme: dark) {
  :root {
    --av-surface: #27272A;
    --av-surface-2: #3F3F46;
    --av-surface-3: #52525B;
    --av-text: #FAFAFA;
    --av-text-secondary: #A1A1AA;
  }
}
```

---

## 📋 Checklist for New Pages

Before committing a new page, verify:

- [ ] Uses `--av-primary` not `#4285F4`
- [ ] Uses `--av-surface` not `white` for backgrounds
- [ ] Uses `--av-shadow-*` not Material shadows
- [ ] Uses `var(--av-gradient)` for accent bars
- [ ] Uses Inter font stack
- [ ] Uses `--av-radius-*` tokens
- [ ] Uses `--av-text-*` tokens
- [ ] Consistent spacing using `--av-space-*`
- [ ] Follows page header pattern
- [ ] Follows card pattern
- [ ] Follows button patterns
- [ ] Follows input patterns

---

## 🔗 File References

- **CSS Variables:** `/src/styles/avenize-brand.css`
- **Tailwind Config:** `/tailwind.config.js` (should reference CSS variables)
- **Brand Guide:** `/AVENIZE-Brand-Guide-Compact.md`

---

## 📞 Questions?

If you're unsure about a design decision, refer to:
1. This spec (AVENIZE-DESIGN-SPECIFICATION.md)
2. The CSS file (avenize-brand.css)
3. Linear's design (linear.app) as reference

**When in doubt, ask before implementing.**
