import { EyeOff, Lock, Scale, ShieldCheck } from "lucide-react";
import { SectionHeader } from "./Headings";
import { privacy } from "../content";

const ICONS = [ShieldCheck, Lock, EyeOff, Scale];

// The page's dark band: night blue in light mode. In dark mode (where the page itself is night blue) it goes deeper
// (`--privacy-bg`), with thin edges and a faint sky glow, so it still reads as its own section.
export default function PrivacyBand() {
  return (
    <section
      id="privacy"
      aria-labelledby="privacy-title"
      className="on-dark relative overflow-hidden bg-privacy text-white dark:border-y dark:border-white/10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 hidden size-[52rem] -translate-x-1/2 rounded-full opacity-25 blur-3xl dark:block"
        style={{
          background:
            "radial-gradient(circle, var(--color-sky) 0%, transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-[80rem] px-6 py-24 lg:px-10 lg:py-32">
        <SectionHeader
          id="privacy-title"
          kicker={privacy.kicker}
          title={privacy.title}
          tone="onDark"
        >
          <p className="mt-5 text-lg text-white/80">{privacy.body}</p>
        </SectionHeader>
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {privacy.points.map((p, i) => {
            const Icon = ICONS[i];
            return (
              <li
                key={p.title}
                className="ld-reveal rounded-3xl border border-white/10 bg-white/[0.04] p-7"
              >
                <Icon className="size-7 text-sky" aria-hidden="true" />
                <h3 className="mt-5 font-ui text-lg font-bold">{p.title}</h3>
                <p className="mt-2 leading-relaxed text-white/75">{p.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
