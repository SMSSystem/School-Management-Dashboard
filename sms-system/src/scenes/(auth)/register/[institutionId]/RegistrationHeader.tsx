import type { RegistrationDirectory } from "@/lib/registrationFormLogic";

// The institution's logo and name, and the academic year the registration is for (none in custom mode).
export default function RegistrationHeader({
  directory,
  isCustomMode,
}: {
  directory: RegistrationDirectory;
  isCustomMode: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
        <img
          src={directory.logoUrl || "/logo.png"}
          alt=""
          className="w-8 h-8 object-contain"
        />
      </div>
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {directory.name}
        </h1>
        <p className="text-xs text-slate-500">
          Student Registration{!isCustomMode && ` — ${directory.activeAcademicYearName ?? ""}`}
        </p>
      </div>
    </div>
  );
}
