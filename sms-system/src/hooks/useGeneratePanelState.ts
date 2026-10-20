import { useEffect, useState } from "react";
import { useCurrentTerm } from "@/lib/CurrentTermContext";

export type GenMode = "single" | "batch";
export type BatchProgress = { done: number; total: number; errors: string[] };

// The state of the admin's "generate" panel on the Report Cards and Progress Reports pages:
// whether it is open, which mode, what is picked, and what the last run said. The two pages run
// different generators (their handlers stay in the pages) and only share this shape.
export function useGeneratePanelState() {
  // Seeded once from the app-wide "current term" (DEV_NOTES Item 6.2) as a convenient starting
  // point for the panel — this is a one-off generation parameter ("produce a report for term X"),
  // not an ongoing work context, so it deliberately doesn't write back. Seeded via an effect (not
  // a useState initializer) because currentTermId can still be '' at mount (its own onSnapshot
  // listener hasn't resolved yet); each `!genTermId`/`!batchTermId` guard means this never
  // overwrites a value the user already picked while waiting for it to resolve.
  const { currentTermId } = useCurrentTerm();

  const [showPanel, setShowPanel] = useState(false);
  const [genMode, setGenMode] = useState<GenMode>("single");
  const [genStudentId, setGenStudentId] = useState("");
  const [genTermId, setGenTermId] = useState("");
  const [batchClassId, setBatchClassId] = useState("");
  const [batchTermId, setBatchTermId] = useState("");
  useEffect(() => {
    if (!genTermId && currentTermId) setGenTermId(currentTermId);
  }, [genTermId, currentTermId]);
  useEffect(() => {
    if (!batchTermId && currentTermId) setBatchTermId(currentTermId);
  }, [batchTermId, currentTermId]);

  const [generating, setGenerating] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelWarnings, setPanelWarnings] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  const clearMessages = () => {
    setPanelError(null);
    setPanelWarnings([]);
    setBatchProgress(null);
  };
  const closePanel = () => {
    setShowPanel(false);
    clearMessages();
  };
  const togglePanel = () => {
    setShowPanel((p) => !p);
    clearMessages();
  };

  return {
    showPanel,
    setShowPanel,
    genMode,
    setGenMode,
    genStudentId,
    setGenStudentId,
    genTermId,
    setGenTermId,
    batchClassId,
    setBatchClassId,
    batchTermId,
    setBatchTermId,
    generating,
    setGenerating,
    panelError,
    setPanelError,
    panelWarnings,
    setPanelWarnings,
    batchProgress,
    setBatchProgress,
    closePanel,
    togglePanel,
  };
}

export type GeneratePanelState = ReturnType<typeof useGeneratePanelState>;
