/** Blender-ish theme tokens, ported from the web style.css. */
export const T = {
  bg: '#3d3d3d',
  panel: '#282828',
  panel2: '#303030',
  btn: '#545454',
  btnHover: '#656565',
  text: '#e6e6e6',
  muted: '#9a9a9a',
  line: '#1f1f1f',
  lineSoft: '#4a4a4a',
  accent: '#e87d0d',
  accentHover: '#ff9f3c',
  select: '#5680c2',
  selectBorder: '#2f4f8a',
  ok: '#8bdc00',
  bad: '#ff3352',
  warn: '#ffd43b',
  darkText: '#1d1d1d',
  radius: 4,
} as const;

export const AXIS_COLORS = { X: '#ff3352', Y: '#8bdc00', Z: '#2890ff' } as const;

/**
 * Fonts. The pixel font (Pixelify Sans) is used only for the big mode name, the MOVE/ROTATE
 * label and panel titles; everything else is the clean system sans (no fontFamily set).
 */
export const FONT = {
  pixel: 'PixelifySans-Bold',
} as const;

/** Hard 2 px drop shadow for big labels (web: text-shadow 2px 2px 0). */
export const hardShadow = (px = 2, alpha = 0.55) => ({
  textShadowColor: `rgba(0,0,0,${alpha})`,
  textShadowOffset: { width: px, height: px },
  textShadowRadius: 0,
});
