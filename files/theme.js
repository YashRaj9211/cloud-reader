/**
 * theme.js
 * A color palette in the spirit of natureofcode.com — warm paper background,
 * soft ink strokes, and a handful of muted, desaturated accents rather than
 * saturated "UI" colors. Exported both as a flat object (for JS/canvas use)
 * and as CSS custom properties (for the React chrome around the canvas).
 */

export const theme = {
  // paper / canvas
  background: '#F2EEE4',      // warm cream paper
  backgroundAlt: '#EAE4D4',   // slightly deeper cream, for panels

  // ink
  ink: '#2B2B26',             // near-black, warm — used for strokes/text, never pure #000
  inkSoft: '#6B6659',         // muted grey-brown, for secondary labels / axes / grids

  // accents — desaturated, hand-drawn-palette feel
  accentRed: '#C15C3F',       // terracotta — primary "mover" color
  accentBlue: '#4A6C7A',      // dusty slate blue — secondary object / vectors
  accentGreen: '#6E7F52',     // sage green — forces / fields
  accentGold: '#C99A3E',      // mustard — highlights / labels / emphasis
  accentPlum: '#7A5566',      // muted plum — a fourth object color when needed

  // functional
  gridLine: '#DCD5C2',        // faint grid
  shadow: 'rgba(43, 43, 38, 0.12)',

  // convenience palette array the engine cycles through when a spec
  // doesn't specify explicit colors for multiple objects
  palette: ['#C15C3F', '#4A6C7A', '#6E7F52', '#C99A3E', '#7A5566'],
};

// CSS custom properties, so the React chrome (controls, panel, timeline
// scrubber) can share the exact same palette as the canvas.
export const themeCSSVars = `
  --anim-bg: ${theme.background};
  --anim-bg-alt: ${theme.backgroundAlt};
  --anim-ink: ${theme.ink};
  --anim-ink-soft: ${theme.inkSoft};
  --anim-red: ${theme.accentRed};
  --anim-blue: ${theme.accentBlue};
  --anim-green: ${theme.accentGreen};
  --anim-gold: ${theme.accentGold};
  --anim-plum: ${theme.accentPlum};
  --anim-grid: ${theme.gridLine};
  --anim-shadow: ${theme.shadow};
`;
