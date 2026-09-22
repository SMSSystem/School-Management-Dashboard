import { useState } from "react";
import { processPhotoUpload, PhotoValidationError } from "@/lib/imageUpload";

// Shared preview/upload/replace/remove UI for the photo-upload feature
// (PHOTO_UPLOAD_SPEC.md). Extracted after this exact ~40-70 line block was
// duplicated across StudentForm.tsx, TeacherForm.tsx, AdminCreateUserForm.tsx,
// and the public registration form — this component owns both the markup
// AND the processPhotoUpload() call/loading/error state, reporting back only
// the resolved base64 data URL (or null on Remove/Clear) via onChange.
export type PhotoUploadFieldProps = {
  /** Current photo (already-saved or just-picked) to preview, or null. */
  photoUrl: string | null;
  /** Fires with the processed data URL after a successful pick, or null after Remove/Clear. */
  onChange: (dataUrl: string | null) => void;
  /** Single letter shown in the fallback circle when there's no photo. Omit for a plain empty circle instead. */
  fallbackInitial?: string;
  size?: "sm" | "lg";
  /** false disables dark: variants — the public registration page is light-only. */
  darkMode?: boolean;
  chooseLabel?: string;
  replaceLabel?: string;
  removeLabel?: string;
  /** When set, wraps the field in a labeled "<Label> (optional)" block (Create Account / registration style) instead of a bare row (edit-modal style). */
  fieldLabel?: string;
};

export default function PhotoUploadField({
  photoUrl,
  onChange,
  fallbackInitial,
  size = "lg",
  darkMode = true,
  chooseLabel = "Upload photo",
  replaceLabel = "Replace photo",
  removeLabel = "Remove photo",
  fieldLabel,
}: PhotoUploadFieldProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const dataUrl = await processPhotoUpload(file);
      onChange(dataUrl);
    } catch (err) {
      setError(err instanceof PhotoValidationError ? err.message : "Could not process this image.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    setError(null);
    onChange(null);
  };

  const dim = size === "lg" ? "w-16 h-16" : "w-12 h-12";
  // Tailwind's class scanner is text-based, not runtime-aware — a literal
  // "dark:foo" string passed through this helper is still found and
  // generated at build time even though it's only conditionally applied.
  // What it can't handle is a class name assembled from a runtime value
  // (e.g. `text-red-${x}`), so every className below is a complete literal.
  const dark = (cls: string) => (darkMode ? cls : "");

  const content = (
    <div className={`flex items-center ${size === "lg" ? "gap-4" : "gap-3"}`}>
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          className={`${dim} rounded-full object-cover ring-2 ring-gray-200 ${dark("dark:ring-gray-700")} shrink-0`}
        />
      ) : fallbackInitial ? (
        <div
          className={`${dim} rounded-full bg-sky-500 flex items-center justify-center text-white ${size === "lg" ? "text-lg" : "text-sm"} font-semibold shrink-0`}
        >
          {fallbackInitial.toUpperCase()}
        </div>
      ) : (
        <div className={`${dim} rounded-full bg-gray-100 ${dark("dark:bg-gray-800")} shrink-0`} />
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <label
            className={`cursor-pointer text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 ${dark("dark:border-gray-600")} text-gray-700 ${dark("dark:text-gray-200")} hover:bg-gray-50 ${dark("dark:hover:bg-gray-700")}`}
          >
            {photoUrl ? replaceLabel : chooseLabel}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
          {photoUrl && (
            <button
              type="button"
              onClick={handleRemove}
              className={`text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 ${dark("dark:border-gray-600")} text-red-600 ${dark("dark:text-red-400")} hover:bg-red-50 ${dark("dark:hover:bg-gray-700")}`}
            >
              {removeLabel}
            </button>
          )}
        </div>
        {loading && <p className="text-xs text-gray-400">Processing image…</p>}
        {error && <p className={darkMode ? "text-xs text-red-400" : "text-xs text-red-500"}>{error}</p>}
      </div>
    </div>
  );

  if (!fieldLabel) return content;

  return (
    <div className={`flex flex-col gap-2 text-sm font-medium text-gray-700 ${dark("dark:text-gray-200")}`}>
      <span>
        {fieldLabel} <span className="font-normal text-gray-400">(optional)</span>
      </span>
      {content}
    </div>
  );
}
