import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { RegistrationDirectoryEntry } from "@/lib/firebase";
import { onLoadError } from "@/lib/reportError";
import { isCustomModeOf, type RegistrationDirectory } from "@/lib/registrationFormLogic";

// The institution's public registration-directory entry for the registration form (scenes/(auth)/register/
// [institutionId]): undefined while it loads, null when it is missing or not accepting registrations (which
// sends the visitor back to /register with a message), otherwise the entry. Moved from the page as it was.
export function useRegistrationDirectory(institutionId: string | undefined) {
  const navigate = useNavigate();
  const [directory, setDirectory] = useState<RegistrationDirectory | null | undefined>(undefined);

  useEffect(() => {
    if (!institutionId) return;
    getDoc(doc(db, "registration_directory", institutionId)).then(
      (snap) => {
        if (
          !snap.exists() ||
          !(snap.data() as RegistrationDirectoryEntry).acceptingRegistrations
        ) {
          setDirectory(null);
          return;
        }
        setDirectory({
          id: institutionId,
          ...(snap.data() as RegistrationDirectoryEntry),
        });
      },
      // Without an answer the form would wait forever; null sends the visitor back to /register.
      onLoadError("this registration form", () => setDirectory(null)),
    );
  }, [institutionId]);

  useEffect(() => {
    if (directory === null) {
      navigate("/register", {
        replace: true,
        state: {
          message: "That institution isn't accepting registrations right now.",
        },
      });
    }
  }, [directory, navigate]);

  return { directory, isCustomMode: isCustomModeOf(directory) };
}
