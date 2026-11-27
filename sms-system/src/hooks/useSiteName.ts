import { useAuth } from "@/lib/AuthContext";
import { siteNameFor } from "@/lib/siteName";

/**
 * The site's name as the top bar shows it (components/TopHeader.tsx), from lib/siteName.ts. Other places that name
 * "this site", such as the lock screen and the "You're leaving" dialog, use it too, so the name always matches.
 */
export function useSiteName(): string {
  const { role, institution } = useAuth();
  return siteNameFor(role, institution?.name);
}
