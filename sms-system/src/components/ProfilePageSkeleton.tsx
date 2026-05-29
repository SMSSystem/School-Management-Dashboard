const Pulse = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`} />
);

const SkField = () => (
  <div className="flex flex-col gap-1">
    <Pulse className="h-3 w-20" />
    <Pulse className="h-10 w-full rounded-md" />
  </div>
);

const SkEntry = () => (
  <div className="rounded-md border border-gray-100 dark:border-gray-700 p-3 flex flex-col gap-1">
    <Pulse className="h-4 w-36" />
    <Pulse className="h-3 w-52" />
    <Pulse className="h-3 w-28 mt-1" />
  </div>
);

const ProfilePageSkeleton = () => (
  <div className="p-4 flex flex-col gap-4">
    {/* Header */}
    <section className="bg-white dark:bg-gray-800 rounded-md p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Pulse className="w-20 h-20 rounded-full shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <Pulse className="h-7 w-44" />
          <div className="flex gap-2 mt-1">
            <Pulse className="h-5 w-24 rounded-full" />
            <Pulse className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </section>

    <div className="grid grid-cols-12 gap-4">
      {/* Left column — Contact info + Role-specific details */}
      <div className="col-span-12 xl:col-span-7 flex flex-col gap-4">
        <section className="bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm h-[stretch]">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <Pulse className="h-5 w-24" />
              <Pulse className="h-3 w-64 mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 5 }, (_, i) => (
              <SkField key={i} />
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm h-[stretch]">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <Pulse className="h-5 w-40" />
              <Pulse className="h-3 w-52 mt-1" />
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-1">
                <Pulse className="h-3 w-20" />
                <Pulse className="h-4 w-40" />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Right column — Account details + Activity */}
      <div className="col-span-12 xl:col-span-5 flex flex-col gap-4">
        <section className="bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm h-[stretch]">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <Pulse className="h-5 w-32" />
              <Pulse className="h-3 w-44 mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <SkField key={i} />
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm h-[stretch]">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <Pulse className="h-5 w-20" />
              <Pulse className="h-3 w-48 mt-1" />
            </div>
          </div>
          <div className="space-y-3">
            <SkEntry />
            <SkEntry />
          </div>
        </section>
      </div>
    </div>
  </div>
);

export default ProfilePageSkeleton;
