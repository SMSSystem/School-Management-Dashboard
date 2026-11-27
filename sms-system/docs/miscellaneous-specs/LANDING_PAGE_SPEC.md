# Landing page

The public page at `/` that introduces the system to schools. It is built into this app but **off until launch**: with `VITE_LANDING_ENABLED` unset, nothing about `/` changes and no landing page code is built.

Working name on the page: Scholarch (one constant, `PRODUCT_NAME` in `src/landing/content.ts`).

## How it fits into the app

| Piece | File | What it does |
|---|---|---|
| Switch | `vite.config.ts` (`landingEnabled`) | Reads `VITE_LANDING_ENABLED === "true"` at build time. Off: only `index.html` is built. On: `landing.html` is built too. |
| Build step | `scripts/landingBuild.mjs` | Always writes the app a second time as `dist/app.html`. When on, renders the landing page to HTML on the build machine and writes it as `dist/index.html`. |
| Hosting | `vercel.json` | Vercel serves a real file before any rewrite, so `/` is always `dist/index.html`. Every other path is rewritten to `/app.html`. |
| Service worker | `src/sw.ts`, `src/lib/serviceWorker/precacheSelection.ts` | App page loads get the stored `app.html`. `/` is fetched from the network first and falls back to the stored `index.html` offline. Only the landing page's stylesheet is kept, never its code. |
| Page shell | `landing.html` | The HTML around the page: meta tags, font preloads, the boot script, `<noscript>`, and the slot the build fills. |
| Boot script | `public/landing-boot.js` | Runs before paint: adds `js` to `<html>`, applies the saved theme, redirects a signed-in visitor to `/login`. |
| Page | `src/landing/` | `LandingPage.tsx`, `components/`, `content.ts` (all copy), `landing.css` (all styles), `theme.ts`, `entry-server.tsx` (build), `main.tsx` (browser). |
| Images | `public/landing/shots/` | Demo-school screenshots (fictional data), light and dark, at 800, 1600 and 2560 px wide (WebP). |
| Fonts | `src/landing/assets/fonts/` | Fraunces, Plus Jakarta Sans, Manrope, Inter (self-hosted; SIL OFL texts in `public/licenses/`). |

Shared with the rest of the app: `src/lib/publicLinks.ts` (demo and designer addresses, operator name; also used by `components/PublicFooter.tsx`), `components/OutsideLink.tsx` (every link to another site), `components/Genr8Logo.tsx`, `lib/appVersion.ts` (`BUILD_YEAR`).

### Rules that keep it that way

- **The landing page never loads Firebase, reCAPTCHA, the router, the query client or the app.** `src/landing/__tests__/landingBoundaries.test.ts` walks the import graph of both landing entries and fails otherwise; it also checks that the app never imports `src/landing/`. That is why `OutsideLink` now loads the "You're leaving" dialog on demand.
- **The page is complete without JavaScript.** Everything the build writes into `index.html` is the final page. Enhancements turn on under `html.js` only.
- **All copy lives in `content.ts`.** Claims stay within shipped features and the privacy notice (`docs/compliance/PRIVACY_NOTICE.md`, still a draft in legal review).
- **No real school data.** Screenshots come from the public demo school only.

## Running it

- **Switching it on locally:** put `VITE_LANDING_ENABLED="true"` in `.env.local` (or `.env.development` for `npm run dev` only, `.env.production` for builds only). `vite.config.ts` reads it with Vite's `loadEnv`, so the `.env` files work; a real environment variable (Vercel's, or one set in the shell) takes precedence. Restart `npm run dev` after changing it.
- **Development:** with the flag on, `npm run dev` shows the landing page at `/` (scripts/landingBuild.mjs, `landingDevRoot`); `/login`, `/dashboard` and every other path are the app as usual. The page renders in the browser (no prerendering in dev). With the flag off, `/` is the app, and the landing page can still be opened at `/landing.html`.
- **Production build with the page on:** with the flag on, `npm run build` then `npm run preview`; `/` is the prerendered landing page. Note: `vite preview` answers unknown paths with `dist/index.html`, so `/login` there shows the landing page; on Vercel the rewrite sends it to `app.html`.
- **Checks:** `npm run test:e2e:landing` builds with the page on, serves `dist/` on port 4180, and runs `e2e/landing/landing.spec.ts` in Chromium, Firefox and WebKit. It reads nothing from Firebase.

## Deploying and launching

1. Leave `VITE_LANDING_ENABLED` unset in production. To review it, set it to `true` on a Vercel preview and redeploy (it is read at build time).
2. Devices with the current service worker keep showing the app at `/` until the worker updates (the app switches workers at a safe moment, `components/UpdateController.tsx`).
3. Launch with the checklist below.

## Launch checklist

The landing page goes live in its own pull request (the "launch PR"). **Copy this whole checklist into the launch PR's description and tick every item before it is merged.** An item that is deliberately skipped stays unticked with a one-line reason. Reviewers check the list, not memory.

```markdown
### Landing page launch checklist (docs/miscellaneous-specs/LANDING_PAGE_SPEC.md)

**Content**
- [ ] All copy in `src/landing/content.ts` reviewed and signed off by the owner (headline, features, steps, privacy points, calls to action)
- [ ] Every claim is true of the shipped app today; the privacy points match the published privacy notice
- [ ] Product name final (trademark and domain checks done); `PRODUCT_NAME` and the page `<title>` updated
- [ ] Screenshots still match the current app, light and dark; recaptured from the demo school if not (fictional data only)
- [ ] Alt text in `content.ts` still describes each screenshot

**Legal**
- [ ] Privacy notice published as a page; link it in `components/LandingFooter.tsx` (replace "coming soon")
- [ ] Terms of service published as a page; link it the same way
- [ ] Nothing on the page needs consent (no analytics, no trackers, no forms); if that changed, the notice covers it

**Search and sharing**
- [ ] `<meta name="robots" content="noindex, nofollow">` removed from `landing.html`
- [ ] `public/robots.txt` added (allow `/`, keep app paths out of search)
- [ ] `public/sitemap.xml` added and listed in `robots.txt`
- [ ] Canonical link, description and Open Graph / Twitter card tags (title, description, share image, URL) in `landing.html`
- [ ] Share image added (1200x630) and checked in a link preview

**Switch and deploy**
- [ ] `VITE_LANDING_ENABLED=true` set in Vercel for Production (and Preview if wanted); redeployed
- [ ] On the deployed site: `/` shows the landing page; `/login` and `/dashboard` still open the app; a signed-in tab at `/` goes to `/login`
- [ ] Service worker: a device that had the old worker shows the landing page at `/` after it updates

**Checks**
- [ ] `npm run test:e2e:landing` passes (Chromium, Firefox, WebKit)
- [ ] Checked by hand on a real phone (iOS Safari and Android Chrome), with a screen reader (VoiceOver or TalkBack) and with reduced motion on
- [ ] Lighthouse (or similar) on the deployed page: no accessibility or SEO errors
```

## Accessibility and device support

Target: **WCAG 2.2 AA**. Checked by `e2e/landing/landing.spec.ts` (axe, light and dark, 375/768/1280/2560 px) and by lint (`eslint-plugin-jsx-a11y-x` on `src/landing/**`, `eslint.config.ts`).

- **Structure:** a skip link to `<main tabindex="-1">`, then header, main and footer landmarks (the footer sits outside `<main>`). One `h1`, an `h2` per section, `h3` for items. Every screenshot has its own description in `content.ts`.
- **Keyboard:** a visible focus ring on every surface, without changing the shape of rounded buttons. It is navy on light areas and sky inside the always-dark areas (`.on-dark`), with `.on-glass` for light pills inside them. `scroll-padding` keeps focused items clear of the fixed header and, on phones, the bottom bar (2.4.11).
  - The theme switch is a radio group: arrow keys move and choose.
  - The phone menu is a native `<details>` that closes with Escape.
  - The feature swipe strip is focusable and scrolls with the arrow keys, or with the Previous/Next buttons.
- **Screen readers:**
  - Each screenshot has a light and a dark copy, and only one is displayed. The other is `display: none`, so it is out of the accessibility tree.
  - The desktop sticky screenshot panel is a visual duplicate, so it is `aria-hidden`.
  - Links to other sites say "(opens in a new tab)" (`OutsideLink`).
  - The phone bottom bar is `inert` while hidden.
- **No JavaScript:** the full page, all links, a working menu (`<details>`), and colours that follow the device's light or dark setting. A `<noscript>` note says so. The theme switch, swipe buttons and bottom bar are hidden.
- **Reduced motion:** every animation and transition runs only under `prefers-reduced-motion: no-preference`, with a final rule stopping anything left. Smooth scrolling is off too.
- **Touch** (`pointer: coarse`):
  - Below 64rem the features become a horizontal swipe strip (`scroll-snap-type: x mandatory`).
  - Targets are at least 44px.
  - Hover styles apply only to devices that can hover.
- **Sizes:** everything is in rem. The root size is `max(100%, calc(50% + 0.556vw))`: the visitor's own size up to 1440px wide, then growing with the screen (about 1.4x at 2560px, 1.8x at 3840px), with no ceiling. Screenshots come in three widths through `srcset`.
  - Trade-off: on very wide screens browser zoom has a smaller effect, because part of the size follows the screen width.
  - Sticky step cards only stack where a whole card fits: from 35rem (560px) of window height in the two-column layout, 46rem (736px) on phones.
- **Browsers:** the last two versions of Chrome, Edge, Firefox and Samsung Internet, and Safari 16.4 or later (Tailwind 4's floor, the same as the app's). The scroll-driven effects are inside `@supports` and the page is static without them. The glass has a `-webkit-` prefix and a solid fallback.

## Design

- **Palette B:** navy `#1E3A8A`, sky `#7CC2EC` (fills and tints only, never text on white), night `#0B1530`, pastel cards. Dark mode is a separate token set, not inverted colours.
- **Fonts:**
  - Fraunces (weight and optical size) for headings
  - Plus Jakarta Sans for the interface
  - Manrope for numbers (tabular figures)
  - Inter for body text
- **Scroll effects:**
  - The hero shrinks into a rounded card (CSS scroll-driven, `transform` and `clip-path`).
  - The header merges from separate pieces into one glass pill.
  - On desktop, a sticky screenshot follows the feature list.
  - Step cards stack.
  - Sections reveal as they come into view.
