---
version: alpha
name: Firecrawl
description: >-
  Firecrawl is a context API for AI agents to search, scrape, and interact with the web at scale. The design system
  emphasizes heat-driven energy with a clean, technical aesthetic that balances bold orange accents against a minimal
  light-mode foundation.
logo:
  src: https://firecrawl.dev/favicon.png
colors:
  surface: '#ffffff'
  surface-dim: '#fbfbfb'
  surface-bright: '#ffffff'
  surface-container-lowest: '#f9f9f9'
  surface-container-low: '#f9f9f9'
  surface-container: '#f9f9f9'
  surface-container-high: '#ededed'
  surface-container-highest: '#e8e8e8'
  on-surface: '#262626'
  on-surface-variant: '#4b5563'
  inverse-surface: '#171717'
  inverse-on-surface: '#f5f5f5'
  outline: '#9ca3af'
  outline-variant: '#d1d5db'
  surface-tint: '#fa5d19'
  primary: '#fa5d19'
  on-primary: '#ffffff'
  primary-container: '#fde4d6'
  on-primary-container: '#5d2410'
  inverse-primary: '#ff8c42'
  secondary: '#9ca3af'
  on-secondary: '#ffffff'
  secondary-container: '#e5e7eb'
  on-secondary-container: '#374151'
  tertiary: '#9061ff'
  on-tertiary: '#ffffff'
  tertiary-container: '#e9d5ff'
  on-tertiary-container: '#4c1d97'
  error: '#eb3424'
  on-error: '#ffffff'
  error-container: '#fde4d6'
  on-error-container: '#5d2410'
  primary-fixed: '#fde4d6'
  primary-fixed-dim: '#f5c4a8'
  on-primary-fixed: '#3d1505'
  on-primary-fixed-variant: '#8b4620'
  secondary-fixed: '#e5e7eb'
  secondary-fixed-dim: '#c9cfd8'
  on-secondary-fixed: '#1f2937'
  on-secondary-fixed-variant: '#6b7280'
  tertiary-fixed: '#e9d5ff'
  tertiary-fixed-dim: '#d8b7f5'
  on-tertiary-fixed: '#2d0052'
  on-tertiary-fixed-variant: '#6d28d9'
  background: '#f9f9f9'
  on-background: '#262626'
  surface-variant: '#e8e8e8'
typography:
  display:
    fontFamily: suisse, 'suisse Fallback', ui-sans-serif, system-ui, sans-serif
    fontSize: 60px
    fontWeight: '700'
    lineHeight: 68px
    letterSpacing: '-0.04em'
  headline-lg:
    fontFamily: suisse, 'suisse Fallback', ui-sans-serif, system-ui, sans-serif
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: '-0.02em'
  headline-md:
    fontFamily: suisse, 'suisse Fallback', ui-sans-serif, system-ui, sans-serif
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: '-0.01em'
  title-lg:
    fontFamily: suisse, 'suisse Fallback', ui-sans-serif, system-ui, sans-serif
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0em
  body-lg:
    fontFamily: suisse, 'suisse Fallback', ui-sans-serif, system-ui, sans-serif
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0em
  body-md:
    fontFamily: suisse, 'suisse Fallback', ui-sans-serif, system-ui, sans-serif
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  label-md:
    fontFamily: suisse, 'suisse Fallback', ui-sans-serif, system-ui, sans-serif
    fontSize: 14px
    fontWeight: '450'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: suisse, 'suisse Fallback', ui-sans-serif, system-ui, sans-serif
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  container-max: 1280px
elevation:
  sm: 0 1px 2px rgba(0, 0, 0, 0.06)
  md: 0 4px 12px rgba(0, 0, 0, 0.08)
  lg: 0 16px 40px rgba(0, 0, 0, 0.12)
layout:
  containerMaxWidth: 1280px
  gridColumns: 12
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    padding: 8px 16px
    height: 40px
    boxShadow: none
  button-primary-hover:
    backgroundColor: '#ff7a3d'
    textColor: '{colors.on-primary}'
    transition: background-color 150ms ease-out
  button-primary-active:
    backgroundColor: '#e84d0a'
    textColor: '{colors.on-primary}'
  button-secondary:
    backgroundColor: transparent
    textColor: '{colors.on-surface}'
    typography: '{typography.label-md}'
    rounded: '{rounded.lg}'
    padding: 6px 12px
    height: 36px
    border: 1px solid {colors.outline-variant}
  button-secondary-hover:
    backgroundColor: '{colors.surface-container-high}'
    border: 1px solid {colors.outline}
  button-ghost:
    backgroundColor: rgba(0, 0, 0, 0.04)
    textColor: '{colors.on-surface}'
    typography: '{typography.label-md}'
    rounded: '{rounded.md}'
    padding: 6px 12px
    height: 36px
  button-ghost-hover:
    backgroundColor: rgba(0, 0, 0, 0.08)
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.xl}'
    padding: '{spacing.md}'
    boxShadow: '{elevation.sm}'
    border: 1px solid {colors.outline-variant}
  card-hover:
    backgroundColor: '{colors.surface-container-low}'
    boxShadow: '{elevation.md}'
    transition: all 200ms ease-out
  input-field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.body-md}'
    rounded: '{rounded.DEFAULT}'
    padding: '{spacing.sm}'
    border: 1px solid {colors.outline-variant}
    height: 40px
  input-field-focus:
    borderColor: '{colors.primary}'
    boxShadow: 0 0 0 3px rgba(250, 93, 25, 0.1)
    outline: none
  badge:
    backgroundColor: '{colors.primary-container}'
    textColor: '{colors.on-primary-container}'
    typography: '{typography.label-sm}'
    rounded: '{rounded.full}'
    padding: 4px 12px
    height: 24px
  badge-secondary:
    backgroundColor: '{colors.secondary-container}'
    textColor: '{colors.on-secondary-container}'
    typography: '{typography.label-sm}'
    rounded: '{rounded.full}'
    padding: 4px 12px
  chip:
    backgroundColor: '{colors.surface-container-high}'
    textColor: '{colors.on-surface}'
    typography: '{typography.label-md}'
    rounded: '{rounded.full}'
    padding: 6px 16px
    height: 32px
    border: 1px solid {colors.outline-variant}
  chip-selected:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    border: 1px solid {colors.primary}
  list-item:
    backgroundColor: transparent
    rounded: '{rounded.md}'
    padding: '{spacing.sm}'
    typography: '{typography.body-md}'
  list-item-hover:
    backgroundColor: '{colors.surface-container-high}'
    textColor: '{colors.primary}'
    transition: background-color 150ms ease-out
  divider:
    backgroundColor: '{colors.outline-variant}'
    height: 1px
    margin: '{spacing.md} 0'
  tag:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.primary}'
    typography: '{typography.label-sm}'
    rounded: '{rounded.DEFAULT}'
    padding: 4px 8px
    border: 1px solid {colors.heat-24}
---

## Overview

Firecrawl is a developer-focused context API that transforms web data into clean, structured formats for AI agents. The design system embodies a 'Heat-Driven Minimalism' aesthetic—a technical, energetic brand that pairs a vivid orange accent (#fa5d19) against a pristine white canvas. The visual language prioritizes clarity and speed, with the heat color system (--heat-4 through --heat-100) creating a sophisticated gradient of intensity that communicates urgency and power without sacrificing elegance. The brand personality is direct, confident, and unafraid of bold color: it speaks to engineers and AI practitioners who value precision and performance. Voice: technical but approachable, energetic but not hype-driven. Example: 'Turn any web source into clean Markdown your agents can ship with—no parsing headaches, just data.'

## Colors

The color system is built on a light-mode-first foundation with a sophisticated heat gradient anchoring the brand. Primary (#fa5d19) is the signature orange used exclusively on CTAs, interactive states, and brand moments—it commands attention without overwhelming. The heat scale (--heat-4 at rgba(250, 93, 25, 0.039) through --heat-100 at #fa5d19ff) provides semantic intensity levels: use --heat-4 for subtle backgrounds, --heat-12 for borders and tags, --heat-40 for hover states, and --heat-100 for primary actions. Surface colors range from #ffffff (base) to #f9f9f9 (container-lowest), with outline tokens (#9ca3af, #d1d5db) providing subtle separation. Secondary accents include amethyst (#9061ff) for tertiary actions and forest (#42c366) for success states. On-surface text is #262626 (near-

## Typography

The type system uses Suisse as the primary typeface, a geometric sans-serif that conveys technical precision while remaining warm and approachable. Display (60px, 700 weight, -0.04em tracking) anchors hero sections with commanding presence; headline-lg (40px, 600 weight) breaks major sections; headline-md (28px, 600 weight) introduces subsections. Body text sits at 16px with 400 weight and 24px line-height, providing comfortable reading rhythm at standard viewing distances. Labels use 14px at 450 weight for UI controls, with 12px label-sm reserved for metadata and badges. Letter-spacing tightens progressively at larger sizes (-0.04em at display, -0.02em at headline-lg) to maintain visual cohesion; smaller text uses positive tracking (0.01–0.02em) for clarity. Apply text-shadow: 0 1px 2px r

## Layout

The layout operates on a 12-column grid with a max-width of 1280px, maintaining generous whitespace to emphasize content hierarchy. Gutter spacing is 24px (md unit), with section separation using lg spacing (40px) to create breathing room between major content blocks. Container padding follows the md scale (24px) on desktop, reducing to sm (12px) on tablets. The hero section uses a centered, single-column layout with asymmetric accent placement (orange heat elements positioned off-grid at 40px intervals). Cards and input fields use consistent 8px internal padding (xs unit) with 12px (sm) for larger containers. The spacing scale is semantic: use xs for tight component internals, sm for related element grouping, md for section padding, lg for major breaks, and xl (64px) for full-page margins

## Elevation & Depth

Depth is conveyed through a restrained shadow system that avoids heavy drop-shadows in favor of subtle, precise layering. Level 1 (base surface) has no shadow; Level 2 (cards, inputs) uses box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), creating a soft lift; Level 3 (modals, popovers) escalates to 0 16px 40px rgba(0, 0, 0, 0.12). Hover states on interactive elements transition the shadow from md to lg over 150ms ease-out, signaling interactivity without jarring motion. Focus states add a 3px outline in primary color (rgba(250, 93, 25, 0.1)) rather than relying on shadow alone, ensuring accessibili

## Shapes

The shape philosophy is 'Technical Warmth'—combining sharp, geometric corners with selective rounding to balance precision and approachability. Buttons use lg radius (1rem / 16px), creating a slightly rounded rectangle that feels modern without being pill-shaped. Cards and containers use xl radius (1.5rem / 24px) for a softer, more inviting appearance. Input fields and small UI elements use DEFAULT radius (0.5rem / 8px), maintaining a technical feel. Chips and badges use full radius (9999px) to emphasize their compact, self-contained nature. The rationale: larger, more prominent components (ca

## Components

### Action Elements
Buttons are the primary interaction pattern. Primary buttons (button-primary) use the heat orange (#fa5d19) background with white text, 40px height, 8px vertical / 16px horizontal padding, and lg radius (16px). On hover, the background shifts to #ff7a3d (lighter orange) with a 150ms transition. Active state darkens to #e84d0a. Secondary buttons (button-secondary) use transparent background with a 1px outline-variant border, on-surface text, and 36px height; hover state fills with surface-container-high. Ghost buttons (button-ghost) use rgba(0, 0, 0, 0.04) background, escalating to 0.08 on hover. All buttons apply font-weight: 450 at 14px label-md size.

### Containers & Surfaces
Cards (card) combine surface background, 1px outline-variant border, md padding (24px), and

## Do's and Don'ts

**Do**
- Do use primary (#fa5d19) exclusively on CTAs, focus states, and brand-critical moments—it is the signature accent and loses impact if overused.
- Do apply the heat gradient semantically: --heat-4 for faint backgrounds, --heat-12 for borders, --heat-40 for interactive hover states, --heat-100 for primary actions.
- Do maintain 24px (md) gutter spacing between major sections and 40px (lg) for full-page breaks to preserve breathing room and visual hierarchy.
- Do use Suisse typeface at 16px body size with 24px line-height and -0.04em tracking on display sizes to maintain the technical-yet-warm voice.
- Do combine box-shadow transitions (150–200ms ease-out) with color changes on interactive elements to signal state changes without jarring motion.

**Don't**
- Don't use primary orange on body text, backgrounds, or non-interactive elements—it must remain reserved for CTAs and focus states to maintain visual hierarchy.
- Don't apply shadows heavier than 0 16px 40px rgba(0, 0, 0, 0.12); excessive elevation flattens the minimalist aesthetic and reduces clarity.
- Don't mix heat colors with other accent colors (amethyst, bluetron, crimson) in the same UI section—each accent should own its semantic space.
- Don't reduce padding below sm (12px) on cards or containers; the design system relies on generous whitespace to communicate clarity and technical confidence.
- Don't use pure black (#000000) or pure white (#ffffff) for text on colored backgrounds; always use on-primary, on-secondary, or on-surface tokens to ensure accessible contrast ratios.