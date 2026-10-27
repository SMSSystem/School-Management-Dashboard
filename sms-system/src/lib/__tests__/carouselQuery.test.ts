import { describe, expect, it } from 'vitest';
import { CAROUSEL_QUERY, MOBILE_QUERY } from '../../hooks/useMediaQuery';
import { inCarouselViewport } from '../examCarousel';

// The carousel layout's media query and the rule in code must say the same thing. There is no browser here, so a small
// evaluator reads the query string (a comma is "or", "and" joins conditions, each is (max-width: Npx) or
// (orientation: portrait)) and is compared with inCarouselViewport over a grid of window sizes.

function matches(query: string, view: { width: number; portrait: boolean }): boolean {
  return query.split(',').some((alternative) =>
    alternative.split(' and ').every((condition) => {
      const width = /\(max-width:\s*(\d+)px\)/.exec(condition);
      if (width) return view.width <= Number(width[1]);
      const orientation = /\(orientation:\s*(portrait|landscape)\)/.exec(condition);
      if (orientation) return (orientation[1] === 'portrait') === view.portrait;
      throw new Error(`Unread condition: ${condition}`);
    }),
  );
}

describe('the carousel media query', () => {
  it('is the one written down: under 1024 px wide, or upright up to 1279 px', () => {
    expect(CAROUSEL_QUERY).toBe('(max-width: 1023px), (orientation: portrait) and (max-width: 1279px)');
  });

  it('agrees with inCarouselViewport for every size on a grid, upright and on its side', () => {
    for (const width of [320, 390, 768, 820, 1022, 1023, 1024, 1025, 1100, 1278, 1279, 1280, 1281, 1440, 1920]) {
      for (const portrait of [true, false]) {
        expect(matches(CAROUSEL_QUERY, { width, portrait }), `${width} ${portrait ? 'portrait' : 'landscape'}`).toBe(inCarouselViewport({ width, portrait }));
      }
    }
  });

  it('is not the phone query the sidebar uses', () => {
    expect(CAROUSEL_QUERY).not.toBe(MOBILE_QUERY);
  });
});
