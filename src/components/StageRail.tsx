"use client";

import { clsx } from "@/lib/clsx";
import { frontier, STAGES, stageApplies, type Article, type StageKey } from "@/lib/types";

export const CELL = 64;
const RAIL_INSET = CELL / 2;

/** Column headings for the chain, aligned to the same grid the rail uses. */
export function StageHeader() {
  return (
    <div className="flex">
      {STAGES.map((s) => (
        <div
          key={s.key}
          style={{ width: CELL, letterSpacing: "0.02em" }}
          className="label text-center leading-none"
        >
          {s.label}
        </div>
      ))}
    </div>
  );
}

/**
 * The editing chain as one connected track. The line fills to the last completed
 * stage and the frontier — the first box still outstanding — carries a ring, so where
 * a story sits is legible without reading any of the boxes individually.
 */
export function StageRail({
  article,
  onToggle,
}: {
  article: Article;
  onToggle?: (key: StageKey, next: boolean) => void;
}) {
  const next = frontier(article);
  const lastDone = STAGES.reduce(
    (acc, s, i) => (stageApplies(article, s.key) && article[s.key] ? i : acc),
    -1
  );

  return (
    <div className="relative flex" style={{ height: 26 }}>
      <div
        className="pointer-events-none absolute top-1/2 h-px bg-rule"
        style={{ left: RAIL_INSET, right: RAIL_INSET }}
      />
      {lastDone > 0 && (
        <div
          className="pointer-events-none absolute top-1/2 h-px bg-blue"
          style={{ left: RAIL_INSET, width: lastDone * CELL }}
        />
      )}

      {STAGES.map((s) => {
        const applies = stageApplies(article, s.key);
        const done = !!article[s.key];
        const isNext = next === s.key;

        if (!applies)
          return (
            <div key={s.key} style={{ width: CELL }} className="grid place-items-center">
              <span
                title={`${s.full} — not needed for this story`}
                className="relative z-10 block h-px w-2 bg-rule"
              />
            </div>
          );

        return (
          <div key={s.key} style={{ width: CELL }} className="grid place-items-center">
            <button
              type="button"
              disabled={!onToggle}
              onClick={() => onToggle?.(s.key, !done)}
              title={done ? `${s.full} — done` : s.full}
              aria-label={s.full}
              aria-pressed={done}
              className={clsx(
                "relative z-10 grid h-[15px] w-[15px] place-items-center rounded-[3px] border transition-colors",
                done
                  ? "border-blue bg-blue text-white"
                  : "border-rule bg-card text-transparent",
                onToggle && !done && "hover:border-ink-3",
                isNext && "ring-2 ring-blue/25"
              )}
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M2.5 6.4l2.4 2.4 4.6-5" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
