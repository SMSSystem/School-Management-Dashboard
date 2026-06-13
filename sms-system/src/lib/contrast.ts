function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Returns 'light' if white foreground reads better on the given hex background,
 * 'dark' if dark foreground reads better. Uses the WCAG relative-luminance threshold.
 */
export function getContrastVariant(hex: string): 'light' | 'dark' {
  return relativeLuminance(hex) > 0.179 ? 'dark' : 'light';
}
