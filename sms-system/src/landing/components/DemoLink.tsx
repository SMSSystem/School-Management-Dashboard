import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import OutsideLink from "@/components/OutsideLink";
import { DEMO_URL, ui } from "../content";

// Every "Try the demo" button on the page. Goes through OutsideLink (the repo rule for links to other sites): it opens
// in a new tab, and screen readers hear "(opens in a new tab)". Our own address, so no "You're leaving" check.
export default function DemoLink({
  className = "",
  children = ui.demo,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <OutsideLink href={DEMO_URL} className={className}>
      {children}
      <ArrowUpRight className="size-[1em] shrink-0" aria-hidden="true" />
    </OutsideLink>
  );
}
