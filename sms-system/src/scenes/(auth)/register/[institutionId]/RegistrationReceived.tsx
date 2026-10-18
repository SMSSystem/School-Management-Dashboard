import { Link } from "react-router-dom";
import type { RegistrationDirectory } from "@/lib/registrationFormLogic";

// The screen shown once the registration has been submitted.
export default function RegistrationReceived({ directory }: { directory: RegistrationDirectory }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10 max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">
          Registration received
        </h1>
        <p className="text-base leading-relaxed text-slate-600">
          Thank you — {directory.name} has received your registration and will
          be in touch.
        </p>
        <Link
          to="/login"
          className="mt-6 block w-full bg-sky-500 text-white py-2.5 rounded-lg text-base font-semibold hover:bg-sky-600"
        >
          Return to Login
        </Link>
      </div>
    </div>
  );
}
