/**
 * Loading placeholders that copy the real cards (same padding, same grid, same pieces), so nothing jumps when the data arrives.
 * Each grid is hidden from screen readers; one "Loading" note is spoken instead.
 */
const Bar = ({ className = '' }: { className?: string }) => <div className={`skeleton ${className}`} />;
const Shell = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`card card-border bg-base-100 ${className}`}>{children}</div>
);
const Loading = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <div role="status" aria-busy="true">
    <span className="sr-only">Loading…</span>
    <div aria-hidden="true" className={className}>{children}</div>
  </div>
);

/** The grid card used by Resonators, Echoes and Weapons. */
function DocCardSkeleton({ dense }: { dense?: boolean }) {
  return (
    <Shell className="h-full overflow-hidden">
      <div className={`card-body h-full ${dense ? 'gap-1 p-3' : 'gap-3 p-4'}`}>
        <div className="flex items-start gap-3">
          <Bar className={`shrink-0 rounded-xl ${dense ? 'h-10 w-10' : 'h-14 w-14'}`} />
          <div className="min-w-0 flex-1 space-y-2 pt-1.5">
            <Bar className="h-4 w-3/5" />
            <Bar className="h-3.5 w-2/5" />
          </div>
          <Bar className="h-8 w-8 shrink-0 rounded-full" />
        </div>
        {!dense && (
          <div className="mt-auto flex h-7 items-center justify-between gap-3 border-t border-white/10 pt-2">
            <Bar className="h-3.5 w-2/5" />
            <Bar className="h-3.5 w-8" />
          </div>
        )}
      </div>
    </Shell>
  );
}

/** The grouped card used by Builds and Skills: a resonator with a few rows underneath. */
function GroupCardSkeleton({ dense }: { dense?: boolean }) {
  return (
    <Shell className="h-full">
      <div className={`card-body h-full ${dense ? 'gap-1 p-3' : 'gap-3 p-4'}`}>
        <div className="flex items-center gap-3">
          <Bar className={`shrink-0 rounded-xl ${dense ? 'h-9 w-9' : 'h-12 w-12'}`} />
          <div className="min-w-0 flex-1 space-y-2">
            <Bar className="h-5 w-2/5" />
            <Bar className="h-3 w-1/4" />
          </div>
          <Bar className="h-8 w-16 rounded-full" />
        </div>
        <div className="divide-y divide-white/10">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-2">
                <Bar className={`h-4 ${i === 1 ? 'w-1/3' : 'w-1/2'}`} />
                <Bar className="h-3 w-2/3" />
              </div>
              <Bar className="h-8 w-8 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/** The list pages (Resonators, Echoes, Weapons, Builds, Skills). */
export function ListSkeleton({ grouped, dense }: { grouped?: boolean; dense?: boolean }) {
  return grouped ? (
    <Loading className={`grid grid-cols-[minmax(0,1fr)] ${dense ? 'gap-3' : 'gap-4'} lg:grid-cols-2`}>
      {Array.from({ length: 6 }).map((_, i) => <GroupCardSkeleton key={i} dense={dense} />)}
    </Loading>
  ) : (
    <Loading className={`grid grid-cols-[minmax(0,1fr)] ${dense ? 'gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'gap-4 sm:grid-cols-2 lg:grid-cols-3'}`}>
      {Array.from({ length: dense ? 12 : 9 }).map((_, i) => <DocCardSkeleton key={i} dense={dense} />)}
    </Loading>
  );
}

/** The Assets page: a square picture, a name, a size line and a usage line. */
export function AssetGridSkeleton() {
  return (
    <Loading className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Shell key={i}>
          <div className="card-body gap-2 p-3">
            <Bar className="aspect-square w-full rounded-xl" />
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 flex-1 space-y-2">
                <Bar className="h-4 w-3/4" />
                <Bar className="h-3 w-1/2" />
              </div>
              <Bar className="h-8 w-8 shrink-0 rounded-full" />
            </div>
            <Bar className="h-5 w-24 rounded-full" />
            <Bar className="h-3.5 w-2/3" />
          </div>
        </Shell>
      ))}
    </Loading>
  );
}

/** The Emojis page: a centred emoji with its name and menu button underneath. */
export function EmojiGridSkeleton() {
  return (
    <Loading className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 15 }).map((_, i) => (
        <Shell key={i}>
          <div className="card-body items-center gap-2 p-3">
            <Bar className="h-12 w-12 rounded-lg" />
            <div className="flex w-full items-center justify-between gap-1">
              <Bar className="h-4 w-2/3" />
              <Bar className="h-8 w-8 shrink-0 rounded-full" />
            </div>
          </div>
        </Shell>
      ))}
    </Loading>
  );
}

/** The Activity page: a badge, a scope, a title and a time on each entry. */
export function ActivitySkeleton() {
  return (
    <Loading className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Shell key={i}>
          <div className="card-body gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Bar className="h-6 w-16 rounded-full" />
                <Bar className="h-3 w-16" />
                <Bar className="h-5 w-40" />
              </div>
              <Bar className="h-4 w-28" />
            </div>
            <Bar className="h-3.5 w-1/2" />
          </div>
        </Shell>
      ))}
    </Loading>
  );
}

/** The Health page: a collapsed group header (severity, check name, count). */
export function HealthSkeleton() {
  return (
    <Loading className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Shell key={i}>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Bar className="h-3 w-3" />
              <Bar className="h-6 w-16 rounded-full" />
              <Bar className="h-5 w-44" />
            </div>
            <Bar className="h-6 w-8 rounded-full" />
          </div>
          <div className="divide-y divide-white/10 px-4 pb-2">
            {[0, 1].map((j) => (
              <div key={j} className="flex items-center justify-between gap-2 py-2.5">
                <div className="space-y-2">
                  <Bar className="h-4 w-48" />
                  <Bar className="h-3.5 w-72 max-w-full" />
                </div>
                <Bar className="h-8 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </Shell>
      ))}
    </Loading>
  );
}
