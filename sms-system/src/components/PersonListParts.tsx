import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { Link } from "react-router-dom";
import InactiveBadge from "@/components/InactiveBadge";
import LoginLinkBadge from "@/components/LoginLinkBadge";
import type { LoginLinkState } from "@/lib/loginLinkStatus";

// The two pieces of a Students or Teachers list row that are the same in both: the first cell (the photo, or the
// person's initial, then their name, email and badges) and the eye button that opens their details page.

export function PersonCell({
  person,
  photoSrc,
  children,
}: {
  person: {
    name: string;
    email?: string;
    status?: string | null;
    loginState?: LoginLinkState;
    emailedAtMs?: number | null;
  };
  photoSrc?: string | null;
  // Anything more under the badges (the Teachers list adds a "No department" note).
  children?: ReactNode;
}) {
  return (
    <td className="flex items-center gap-4 p-4">
      {photoSrc ? (
        <img
          src={photoSrc}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          className="md:hidden xl:block w-10 h-10 rounded-full object-cover"
        />
      ) : (
        <div className="flex md:hidden xl:flex w-10 h-10 rounded-full bg-sky-500 items-center justify-center text-white text-sm font-semibold shrink-0">
          {(person.name[0] ?? "?").toUpperCase()}
        </div>
      )}
      <div className="flex flex-col">
        <h3 className="font-semibold">{person.name}</h3>
        <p className="text-xs text-gray-500">{person?.email}</p>
        <InactiveBadge status={person.status} />
        <LoginLinkBadge state={person.loginState} emailedAtMs={person.emailedAtMs} />
        {children}
      </div>
    </td>
  );
}

export function ViewDetailsLink({ to, name }: { to: string; name: string }) {
  return (
    <Link to={to}>
      <button
        className="w-7 h-7 flex items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        title={`View ${name}'s details`}
        aria-label={`View ${name}'s details`}
      >
        <Eye className="w-4 h-4 text-white" />
      </button>
    </Link>
  );
}
