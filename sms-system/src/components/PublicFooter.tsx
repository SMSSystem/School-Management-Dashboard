import { ArrowUpRight } from "lucide-react";
import Genr8Logo from "@/components/Genr8Logo";
import { BUILD_YEAR, buildDescription, displayVersion } from "@/lib/appVersion";

const DEMO_URL = "https://sms-demo.solutions.genr83d.com/";
const DESIGNER_URL = "https://solutions.genr83d.com/";

// 44px tap targets on phones, natural height from md up (as on the demo site).
const LINK = "inline-flex min-h-11 md:min-h-0 items-center gap-1 rounded hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";

// The footer of the signed-out pages (login, register). Facts on the left (copyright, then the version
// a user can quote when reporting a problem), links on the right (the demo, then the designer's credit).
// On phones it stacks, links first and the copyright line last. Placed by PublicPageShell, which keeps
// it at the bottom of the screen without ever covering the card.
const PublicFooter = ({ className = "" }: { className?: string }) => (
  <footer className={`px-4 py-4 text-xs text-slate-500 ${className}`}>
    <div className="mx-auto flex max-w-5xl flex-col-reverse items-center gap-y-2 sm:flex-row sm:justify-between sm:gap-x-4">
      <p className="flex flex-wrap items-center justify-center gap-x-2">
        <span>© {BUILD_YEAR} GENR8-3D Digital Solutions</span>
        <span aria-hidden="true">·</span>
        {/* Same text and build tooltip as AppVersionTag, inline and in the footer's colour. */}
        <span title={buildDescription()}>{displayVersion()}</span>
      </p>
      <nav aria-label="About this system" className="flex flex-col items-center sm:flex-row sm:gap-x-2">
        <a
          href={DEMO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Try the demo (opens in a new tab)"
          className={`${LINK} font-medium text-slate-600 underline-offset-2 hover:underline`}
        >
          Try the demo <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
        <span aria-hidden="true" className="hidden sm:inline">·</span>
        <a
          href={DESIGNER_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Designed by GENR8-3D Digital Solutions (opens in a new tab)"
          className={`${LINK} gap-2`}
        >
          <span>Designed by</span>
          <Genr8Logo className="h-6 w-auto" />
        </a>
      </nav>
    </div>
  </footer>
);

export default PublicFooter;
