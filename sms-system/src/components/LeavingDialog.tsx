import DialogShell from "@/components/DialogShell";
import {
  PRIMARY_BUTTON_CLS,
  SECONDARY_BUTTON_CLS,
} from "@/components/exam/builder/builderStyles";
import { useSiteName } from "@/hooks/useSiteName";
import {
  leavingNote,
  leavingText,
  openOutside,
  type LeavingSource,
} from "@/lib/outsideLinks";
import { parseWebUrl } from "@/lib/webUrl";

// "You're leaving" (opened by components/OutsideLink.tsx): before the app sends someone to another site, it names the
// site they're on and shows the full address, so a lookalike address is easier to spot. It doesn't check the address
// itself. "Go back" comes first, so it has the focus (DialogShell focuses the first button) and Enter can't leave by
// accident; Escape and the X go back too. Continuing opens the site in a new tab with no opener and no referrer, as a
// plain link would.
//
// It's drawn where its link is, on DialogShell's z-50, after anything already open, so it paints on top of a dialog
// the link sits in (a lesson note). Moving dialogs to the browser's top layer is a separate BACKLOG item.

export default function LeavingDialog({
  url,
  source,
  onClose,
}: {
  url: string;
  source: LeavingSource;
  onClose: () => void;
}) {
  const site = useSiteName();
  const note = leavingNote(source);
  // The browser's own form of the address, which is also what it would open: a hostname with lookalike letters from
  // another alphabet (a Cyrillic "а" in "exаmple.com") shows as punycode ("xn--exmple-4nf.com"), so the difference is
  // visible instead of hidden. OutsideLink only passes web addresses, so the fallback is never needed in practice.
  const shown = parseWebUrl(url)?.href ?? url;
  return (
    <DialogShell title={leavingText.title(site)} onClose={onClose}>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {leavingText.body(site)}
      </p>
      <code className="block select-all break-all rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
        {shown}
      </code>
      {note && (
        <p className="text-sm text-gray-600 dark:text-gray-400">{note}</p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className={SECONDARY_BUTTON_CLS}
        >
          {leavingText.goBack}
        </button>
        <button
          type="button"
          onClick={() => {
            openOutside(shown);
            onClose();
          }}
          className={PRIMARY_BUTTON_CLS}
          style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        >
          {leavingText.continue}
        </button>
      </div>
    </DialogShell>
  );
}
