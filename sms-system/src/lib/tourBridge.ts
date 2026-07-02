// Plain mutable state read by tour validation functions (see tourValidation.ts), which
// run outside React and can't consume hooks/context. Components update these fields via
// a useEffect mirroring their own state; validation functions read them synchronously.
type TourBridge = {
  gradebookColumnModalOpen: boolean;
};

export const tourBridge: TourBridge = {
  gradebookColumnModalOpen: false,
};
