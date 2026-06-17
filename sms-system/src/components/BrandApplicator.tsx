import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getContrastVariant } from '@/lib/contrast';

// Returns true if the color is usable as a button background
// (not too light, not too dark, not near-neutral white/black)
function isBrandColorUsable(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Linearize for luminance
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Reject very light (near white) and very dark (near black)
  if (lum > 0.85 || lum < 0.02) return false;
  // Reject near-neutral greys (low saturation)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < 0.15) return false;
  return true;
}

const FALLBACK_BUTTON_BG = '#0284c7'; // sky-600

export function BrandApplicator() {
  const { institution } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    const color = institution?.brandColor;
    const usable = color ? isBrandColorUsable(color) : false;
    // Always set --brand-accent so CSS color-mix() usages (lamaSky, sidebar tints) have a value.
    // Fall back to sky-600 when the brand color is not usable (too light/dark/grey) or absent.
    root.style.setProperty('--brand-accent', usable ? color! : FALLBACK_BUTTON_BG);
    root.style.setProperty('--brand-button-bg', usable ? color! : FALLBACK_BUTTON_BG);
  }, [institution?.brandColor]);

  return null;
}
