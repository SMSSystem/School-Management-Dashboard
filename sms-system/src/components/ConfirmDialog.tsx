import DialogShell from "@/components/DialogShell";
import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";

const DANGER_BUTTON_CLS = "inline-flex items-center gap-1 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50";

// A question in a dialog instead of the browser's own pop-up: what is about to happen, a Cancel button that has the focus
// (so Enter cannot confirm by accident), and a confirm button, red when the action destroys something. Escape and the X
// cancel. The frame (focus kept inside, given back on close) is DialogShell.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "neutral",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "neutral" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogShell title={title} onClose={onCancel} busy={busy}>
      <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={SECONDARY_BUTTON_CLS}>
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={tone === "danger" ? DANGER_BUTTON_CLS : PRIMARY_BUTTON_CLS}
          style={tone === "danger" ? undefined : { backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        >
          {confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}
