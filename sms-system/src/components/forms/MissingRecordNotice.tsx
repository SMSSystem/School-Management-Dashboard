import { useState } from "react";
import { NO_RECORD_ID_MESSAGE } from "@/lib/formMessages";

/** For a form's submit handler: `missingId.show()` when the record to update has no id, and render `{missingId.notice}` above the submit button. */
export function useMissingRecordNotice() {
  const [shown, setShown] = useState(false);
  return {
    show: () => setShown(true),
    notice: shown ? <p className="text-xs text-red-400">{NO_RECORD_ID_MESSAGE}</p> : null,
  };
}
