"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "./SessionProvider";
import { Initials } from "./ui";
import { clsx } from "@/lib/clsx";

/**
 * Textarea with @handle autocomplete. The server re-parses handles on save, so the
 * dropdown is a convenience only — typing "@coeditor" by hand notifies just the same.
 */
export function MentionBox({
  value,
  onChange,
  onSubmit,
  placeholder,
  rows = 2,
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
}) {
  const { editors, me } = useSession();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [placeAbove, setPlaceAbove] = useState(false);

  // `value` is cleared by the parent after posting, which must also close the menu.
  const candidates =
    query === null || value === ""
      ? []
      : editors
          .filter(
            (e) =>
              e.handle.toLowerCase().startsWith(query) ||
              e.name.toLowerCase().includes(query)
          )
          .slice(0, 5);

  // autoFocus alone is unreliable when the box mounts inside a scroll container.
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  function syncQuery(el: HTMLTextAreaElement) {
    const upto = el.value.slice(0, el.selectionStart);
    const m = /@([a-z0-9_.-]*)$/i.exec(upto);
    const next = m ? m[1].toLowerCase() : null;
    if (next !== query) setActive(0);
    setQuery(next);
    // The composer can sit at the top of a scrolling rail, where a menu opening
    // upward would be clipped. Pick whichever side has room.
    const box = el.getBoundingClientRect();
    setPlaceAbove(box.bottom + 190 > window.innerHeight && box.top > 190);
  }

  function insert(handle: string) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart;
    const before = value.slice(0, caret).replace(/@([a-z0-9_.-]*)$/i, `@${handle} `);
    const next = before + value.slice(caret);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = before.length;
    });
  }

  return (
    <div className={clsx("relative", className)}>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          syncQuery(e.target);
        }}
        onClick={(e) => syncQuery(e.currentTarget)}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        onKeyDown={(e) => {
          if (candidates.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % candidates.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + candidates.length) % candidates.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              insert(candidates[active].handle);
              return;
            }
            if (e.key === "Escape") {
              setQuery(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="w-full resize-y rounded border border-rule bg-card px-2.5 py-2 text-[13px] leading-relaxed outline-none transition-colors focus:border-blue"
      />

      {candidates.length > 0 && (
        <div
          className={clsx(
            "rise absolute left-0 z-30 w-60 overflow-hidden rounded border border-rule bg-card shadow-lg shadow-black/10",
            placeAbove ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          <div className="label border-b border-hair px-2.5 py-1.5">Tag someone to email them</div>
          {candidates.map((e, i) => (
            <button
              key={e.id}
              type="button"
              onMouseDown={(ev) => {
                ev.preventDefault();
                insert(e.handle);
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px]",
                i === active ? "bg-blue-2" : ""
              )}
            >
              <Initials name={e.name} size={20} />
              <span className="font-medium">{e.name}</span>
              <span className="font-mono text-[11px] text-ink-3">@{e.handle}</span>
              {e.id === me?.id && <span className="ml-auto font-mono text-[10px] text-ink-3">you</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders stored text with @handles highlighted. */
export function MentionText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/(@[a-z0-9_.-]+)/gi);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="font-medium text-blue">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}
