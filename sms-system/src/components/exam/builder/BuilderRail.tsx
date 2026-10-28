import BuilderListPanel from "./BuilderListPanel";

// The list of questions beside the editor from `md` up: it takes the place of the long column the builder used to be, so the
// whole exam can be seen, any question chosen, and questions moved, while one is edited. It sticks to the top of the
// scrolling area and scrolls inside itself when the list is long. Below `md` it is not shown (the Questions sheet is).
export default function BuilderRail(props: React.ComponentProps<typeof BuilderListPanel>) {
  return (
    <nav aria-label="Questions" className="hidden md:sticky md:top-0 md:block md:max-h-[calc(100dvh-3.5rem)] md:overflow-y-auto md:py-2">
      <BuilderListPanel {...props} />
    </nav>
  );
}
