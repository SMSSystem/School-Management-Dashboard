import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

export function BrandApplicator() {
  const { institution } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    if (institution?.brandColor) {
      root.style.setProperty('--brand-accent', institution.brandColor);
    } else {
      root.style.removeProperty('--brand-accent');
    }
  }, [institution?.brandColor]);

  return null;
}
