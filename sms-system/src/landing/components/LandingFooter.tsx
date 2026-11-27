import Genr8Logo from "@/components/Genr8Logo";
import OutsideLink from "@/components/OutsideLink";
import { BUILD_YEAR } from "@/lib/appVersion";
import { DESIGNER_URL } from "@/lib/publicLinks";
import Brand from "./Brand";
import DemoLink from "./DemoLink";
import { LOGIN_URL, OPERATOR_NAME, PRODUCT_NAME, ui } from "../content";

const LINK =
  "inline-flex min-h-11 items-center gap-1 rounded text-muted transition-colors duration-200 hover:text-fg";

// The page's footer (a `contentinfo` landmark: it sits outside <main>). Same operator credit, year and demo link as the
// sign-in footer (components/PublicFooter.tsx), at the landing page's scale. The privacy notice and terms are
// placeholders, as text not links, until they are published pages.
export default function LandingFooter() {
  return (
    <footer className="border-t border-line bg-surface-2">
      <div className="mx-auto flex max-w-[80rem] flex-col gap-8 px-6 py-12 text-sm lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex flex-col gap-2">
          <Brand />
          <p className="text-muted">
            © {BUILD_YEAR} {OPERATOR_NAME}
          </p>
        </div>
        <nav aria-label={ui.footerNavLabel}>
          <ul className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
            <li>
              <DemoLink className={LINK} />
            </li>
            <li>
              <a href={LOGIN_URL} className={LINK}>
                {ui.login}
              </a>
            </li>
            <li className="inline-flex min-h-11 items-center text-muted">
              {ui.privacySoon}
            </li>
            <li className="inline-flex min-h-11 items-center text-muted">
              {ui.termsSoon}
            </li>
          </ul>
        </nav>
        <OutsideLink
          href={DESIGNER_URL}
          ariaLabel={`${ui.designedBy} ${OPERATOR_NAME}, the makers of ${PRODUCT_NAME} ${ui.newTab}`}
          className={`${LINK} gap-2`}
        >
          <span>{ui.designedBy}</span>
          <Genr8Logo className="h-6 w-auto" />
        </OutsideLink>
      </div>
    </footer>
  );
}
