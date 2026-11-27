import type { ReactNode } from "react";

// CSS device frames around a screenshot (decorative: the image inside carries the alt text). All sizes in rem so the
// frames scale with the page.
export function LaptopFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full ${className}`}>
      <div className="rounded-[1.4rem] bg-ink p-2 shadow-2xl ring-1 ring-white/10 sm:p-2.5">
        <div className="mb-2 flex gap-1.5 px-2 pt-1" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-white/25" />
          <span className="size-2.5 rounded-full bg-white/25" />
          <span className="size-2.5 rounded-full bg-white/25" />
        </div>
        <div className="overflow-hidden rounded-[0.9rem] bg-frame-screen [&_img]:h-auto [&_img]:w-full">
          {children}
        </div>
      </div>
      <div
        className="mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-2xl bg-gradient-to-b from-slate-400 to-slate-500 dark:from-slate-600 dark:to-slate-700"
        aria-hidden="true"
      />
    </div>
  );
}

export function PhoneFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-[min(16.25rem,80vw)] rounded-[2.6rem] bg-ink p-2.5 shadow-2xl ring-1 ring-white/10 ${className}`}
    >
      <div className="relative overflow-hidden rounded-[2.1rem] bg-frame-screen [&_img]:h-auto [&_img]:w-full">
        <div
          className="absolute top-2 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-ink"
          aria-hidden="true"
        />
        {children}
      </div>
    </div>
  );
}

/** The phone-sized attendance shot (one width, 750x1624, light and dark). */
export function PhoneShot({ alt }: { alt: string }) {
  const common = {
    width: 750,
    height: 1624,
    loading: "lazy" as const,
    decoding: "async" as const,
    fetchPriority: "high" as const,
  };
  return (
    <>
      <img
        alt={alt}
        {...common}
        src="/landing/shots/attendance-mobile.webp"
        className="block dark:hidden"
      />
      <img
        alt={alt}
        {...common}
        src="/landing/shots/attendance-mobile-dark.webp"
        className="hidden dark:block"
      />
    </>
  );
}
