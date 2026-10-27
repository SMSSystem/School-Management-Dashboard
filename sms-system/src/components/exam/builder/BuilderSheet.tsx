import DialogShell from "@/components/DialogShell";
import BuilderListPanel from "./BuilderListPanel";

// The list of questions as a sheet from the bottom of the screen, below `md`, where there is no room for the rail: the same
// list, with 44 px rows. Choosing a question shows it and closes the sheet. Its focus, Escape and X are DialogShell's.
export default function BuilderSheet({
  onClose,
  onSelect,
  ...panel
}: Omit<React.ComponentProps<typeof BuilderListPanel>, "large"> & { onClose: () => void }) {
  return (
    <DialogShell title="Questions" onClose={onClose} sheet>
      <BuilderListPanel
        {...panel}
        large
        onSelect={(id) => {
          onSelect(id);
          onClose();
        }}
      />
    </DialogShell>
  );
}
