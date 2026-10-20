import type { ParentRelationship } from "@/lib/firebase";
import { parentLinkLabel, type ParentLink, type ParentOption } from "@/lib/studentDetailLogic";

// The Linked Parents card: the links, and (institution admin) unlinking and the add-parent form.
export function LinkedParentsSection({
  parentLinks,
  allParents,
  mayEdit,
  handleUnlinkParent,
  linkError,
  selectedRelationship,
  setSelectedRelationship,
  selectedParentId,
  setSelectedParentId,
  handleLinkParent,
  linkingParent,
}: {
  parentLinks: ParentLink[];
  allParents: ParentOption[];
  mayEdit: boolean;
  handleUnlinkParent: (docId: string) => Promise<void>;
  linkError: string | null;
  selectedRelationship: ParentRelationship;
  setSelectedRelationship: (relationship: ParentRelationship) => void;
  selectedParentId: string;
  setSelectedParentId: (id: string) => void;
  handleLinkParent: () => Promise<void>;
  linkingParent: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
      <h2 className="text-base font-semibold">Linked Parents</h2>

      {parentLinks.length === 0 ? (
        <p className="text-sm text-gray-400 py-1">No parents linked yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
          {parentLinks.map((link) => {
            const parent = allParents.find((p) => p.uid === link.parentId);
            return (
              <li
                key={link.docId}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <span className="text-gray-900 dark:text-gray-100 font-medium">
                    {parentLinkLabel(link.relationship, parent?.name, link.parentId)}
                  </span>
                  {parent?.email && (
                    <span className="ml-2 text-xs text-gray-400">
                      {parent.email}
                    </span>
                  )}
                </div>
                {mayEdit && (
                  <button
                    onClick={() => handleUnlinkParent(link.docId)}
                    className="text-red-500 hover:text-red-700 text-xs px-2 py-0.5 rounded border border-red-200 dark:border-red-800 hover:border-red-400"
                  >
                    Unlink
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {linkError && <p className="text-xs text-red-500">{linkError}</p>}

      {/* Add parent */}
      {mayEdit && allParents.filter(
        (p) => !parentLinks.some((l) => l.parentId === p.uid),
      ).length > 0 && (
        <div className="flex gap-2 items-center pt-1">
          <select
            value={selectedRelationship}
            onChange={(e) => setSelectedRelationship(e.target.value as ParentRelationship)}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="mother">Mother</option>
            <option value="father">Father</option>
            <option value="guardian">Guardian</option>
            <option value="other">Other</option>
          </select>
          <select
            value={selectedParentId}
            onChange={(e) => setSelectedParentId(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">Select a parent to link…</option>
            {allParents
              .filter((p) => !parentLinks.some((l) => l.parentId === p.uid))
              .map((p) => (
                <option key={p.uid} value={p.uid}>
                  {p.name}
                  {p.email ? ` — ${p.email}` : ""}
                </option>
              ))}
          </select>
          <button
            onClick={handleLinkParent}
            disabled={linkingParent || !selectedParentId}
            className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50 shrink-0"
          >
            {linkingParent ? "Linking…" : "Link"}
          </button>
        </div>
      )}
      {mayEdit && allParents.length === 0 && (
        <p className="text-xs text-gray-400">
          No parent accounts found — create a parent user first.
        </p>
      )}
    </div>
  );
}
