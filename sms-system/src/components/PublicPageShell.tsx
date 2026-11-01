import type { ReactNode } from "react";
import PublicFooter from "@/components/PublicFooter";

// The page frame of the signed-out pages: a full-height column whose content area grows to fill the
// screen, with PublicFooter after it. The footer sits at the bottom of the screen when the content is
// short and is pushed below it when it is tall, so it never covers the card (an absolutely placed
// footer did on short screens). `dotGrid` draws the login screens' dotted background.
const PublicPageShell = ({
  children,
  align = "center",
  className = "",
  dotGrid = true,
}: {
  children: ReactNode;
  align?: "center" | "start";
  /** Extra classes for the content area, such as its vertical padding. */
  className?: string;
  dotGrid?: boolean;
}) => (
  <div className="relative min-h-dvh flex flex-col bg-slate-100">
    {dotGrid && (
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
    )}
    <main
      className={`relative z-10 flex-1 flex justify-center px-4 ${align === "center" ? "items-center" : "items-start"} ${className}`}
    >
      {children}
    </main>
    <PublicFooter className="relative z-10" />
  </div>
);

export default PublicPageShell;
