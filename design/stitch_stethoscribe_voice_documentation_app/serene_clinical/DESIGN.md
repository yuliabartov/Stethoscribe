---
name: Serene Clinical
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3d4947'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#795900'
  on-secondary: '#ffffff'
  secondary-container: '#ffc329'
  on-secondary-container: '#6f5100'
  tertiary: '#825100'
  on-tertiary: '#ffffff'
  tertiary-container: '#a36700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#ffdf9f'
  secondary-fixed-dim: '#f9bd22'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#5c4300'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  margin-mobile: 20px
  margin-desktop: 64px
  gutter: 16px
  touch-target: 56px
  card-padding: 24px
---

## Brand & Style

The visual identity is anchored in a **Flat, Modern, and Accessible** aesthetic specifically tailored for the high-pressure medical environment. It prioritizes clarity over ornamentation, utilizing a soft-professional tone to reduce cognitive load for healthcare providers.

The personality is "The Calm Expert"—reliable, efficient, and human-centric. By blending a warm, energetic palette with structured, minimalist layouts, the design system bridges the gap between clinical precision and approachable technology. It avoids the sterile, cold blues typical of the industry in favor of a "Sunlit Sage" theme that promotes focus and well-being.

## Colors

The palette is derived from the core logo and the requested "Sunlit Sage" aesthetic. 
- **Primary (Teal/Sage):** Used for primary actions, branding, and active states. It provides a grounded, clinical professional feel.
- **Secondary (Warm Yellow/Orange):** Used for highlights, informational callouts, and secondary visual interest to inject warmth.
- **Neutrals:** A range of cool slates and off-whites ensure the interface remains soft on the eyes during long shifts.

Colors should be applied in large, flat blocks rather than gradients to maintain the professional, flat-design ethos.

## Typography

This design system uses **Hanken Grotesk** as the primary typeface for its exceptional legibility and modern, clean geometry. It is specifically scaled up for "medical professional" readability, ensuring that patient data and transcriptions are legible at a glance.

**JetBrains Mono** is used sparingly for technical labels, timestamps, and metadata to provide a subtle "technical/scribe" distinction from general content. Use `body-lg` (18px) as the default body size for mobile to accommodate busy environments and one-handed use.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a heavy emphasis on vertical rhythm and whitespace. 

- **Mobile First:** A single-column layout with 20px side margins. Tap targets are strictly 56px or larger.
- **Tablet/Desktop:** Transitions to a 12-column grid. Max content width is 1280px.
- **Spacing Rhythm:** Use 8px increments. Generous padding (24px+) within containers is required to maintain the "calm" aesthetic and prevent information density fatigue.

## Elevation & Depth

This system utilizes a **Flat Tonal Layering** approach instead of traditional shadows. Depth is communicated through:

1.  **Color Blocking:** Distinguishing the background (`neutral`) from content containers (`white` or `sage-light`).
2.  **Stroke Hierarchy:** Subtle 1px borders in `#E2E8F0` replace shadows for most cards.
3.  **Active State Elevation:** When an element is interacted with, it does not rise; instead, it changes fill color (e.g., from `sage-light` to `sage-dark`) to indicate selection.
4.  **Backdrop Blurs:** Used exclusively for modal overlays to keep the user's focus on the medical task at hand without losing context.

## Shapes

The shape language is defined by **High-Radius Curves** to evoke friendliness and safety. 

- **Cards & Containers:** Use a minimum radius of 24px (`rounded-xl` / `rounded-2xl`).
- **Buttons:** Fully rounded (pill-shaped) to maximize the "comfortable tap" visual metaphor.
- **Form Inputs:** 12px radius to balance the softer cards with a hint of structured precision.

## Components

### Buttons
Primary buttons are pill-shaped, using `sage-dark` with white text. Height is fixed at 56px for accessibility. Secondary buttons use the `amber-soft` fill with dark text for high-visibility warnings or alternative actions.

### Cards
Cards are the primary organizational unit. They must have a 24px corner radius and 24px internal padding. Avoid borders where tonal changes (e.g., a sage card on a slate-100 background) provide enough contrast.

### Input Fields
Inputs use a "Soft-Box" style: a subtle 12px radius, light gray background, and 16px vertical padding. Focus states are indicated by a 2px `sage-dark` border.

### Transcription Chips
For medical tags or status indicators, use small, fully rounded chips with low-opacity fills of the primary colors (e.g., 10% Teal with 100% Teal text).

### Navigation
A bottom navigation bar on mobile with large 32px icons and clear labels ensures quick switching between "Patients," "Scribe," and "Records" while the user is on the move.