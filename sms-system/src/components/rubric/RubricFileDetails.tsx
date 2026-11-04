import { formatFileSize } from "@/lib/documentUpload";
import { gridChangedAfterUpload } from "@/lib/rubricFileKinds";
import type { RubricDocument } from "@/types/assessment";

/**
 * The line about a rubric's stored file. Staff also see whether the grid changed after the upload
 * (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 13.2), since the two may then disagree. Nothing without a file.
 */
export default function RubricFileDetails({
  rubric,
  staff = false,
}: {
  rubric: Pick<RubricDocument, "file" | "updatedAt">;
  staff?: boolean;
}) {
  const { file } = rubric;
  if (!file) return null;
  const date = file.uploadedAt?.toDate?.().toLocaleDateString();
  return (
    <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
      <p>
        Original file: {file.fileName} · {formatFileSize(file.size)}
        {staff &&
          ` · Uploaded by ${file.uploadedByName}${date ? ` on ${date}` : ""}`}
      </p>
      {staff && gridChangedAfterUpload(rubric) && (
        <p className="text-amber-600 dark:text-amber-400">
          The grid was changed after this file was uploaded.
        </p>
      )}
    </div>
  );
}
