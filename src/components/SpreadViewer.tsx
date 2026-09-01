"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { api, useApi } from "@/lib/api";
import { openPdf } from "@/lib/pdf";
import type { Annotation, Editor, Spread } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { MentionBox, MentionText } from "./MentionBox";
import { useSession } from "./SessionProvider";
import { Button, Empty, Initials, Label, Note, Segmented } from "./ui";

type Box = { page: number; x: number; y: number; w: number; h: number };

const DRAG_THRESHOLD = 0.006; // below this a drag is really a click

export function SpreadViewer(props: { spreadId: number }) {
  return (
    <Suspense fallback={<Empty>Loading spread…</Empty>}>
      <Viewer {...props} />
    </Suspense>
  );
}

function Viewer({ spreadId }: { spreadId: number }) {
  const { me, editors, refreshUnread } = useSession();
  const { data, reload } = useApi<{ spread: Spread; annotations: Annotation[] }>(
    `/api/spreads/${spreadId}`
  );
  const params = useSearchParams();

  const stageRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Box | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<RenderTask | null>(null);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<"page" | "width" | number>("page");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);

  const [drag, setDrag] = useState<Box | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const [draftText, setDraftText] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const annotations = useMemo(() => data?.annotations ?? [], [data]);

  useEffect(() => {
    let cancelled = false;
    openPdf(`/api/pdf/${spreadId}`)
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        setPages(d.numPages);
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [spreadId]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setStage({ w: entry.contentRect.width, h: entry.contentRect.height })
    );
    ro.observe(el);
    setStage({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* --- render the current page ------------------------------------------ */
  useEffect(() => {
    if (!doc || !stage.w) return;
    let cancelled = false;

    (async () => {
      const p = await doc.getPage(page);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });

      // 11x17 spreads are tall, so "whole page" is the useful default and
      // "fit width" is the one you switch to for reading body copy.
      const scale =
        zoom === "page"
          ? Math.min((stage.w - 64) / base.width, (stage.h - 64) / base.height)
          : zoom === "width"
            ? (stage.w - 64) / base.width
            : zoom;

      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || cancelled) return;

      taskRef.current?.cancel();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setSize({ w: viewport.width, h: viewport.height });

      const task = p.render({ canvasContext: ctx, viewport });
      taskRef.current = task;
      try {
        await task.promise;
      } catch {
        /* superseded by a newer render */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, page, zoom, stage]);

  /* --- deep link from an email or the dashboard -------------------------- */
  const jumpedTo = useRef<number | null>(null);
  useEffect(() => {
    const noteId = Number(params.get("note"));
    if (!noteId || jumpedTo.current === noteId) return;
    const note = annotations.find((a) => a.id === noteId);
    if (!note) return;
    jumpedTo.current = noteId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing URL -> view once
    setPage(note.page);
    setActive(note.id);
    setFilter("all");
  }, [params, annotations]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") setPage((p) => Math.min(pages, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(1, p - 1));
      if (e.key === "Escape") {
        setDraft(null);
        setDrag(null);
        setActive(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pages]);

  /* --- drag a rectangle over the spread ----------------------------------- */
  const pointIn = useCallback((clientX: number, clientY: number) => {
    const r = pageRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    };
  }, []);

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = pointIn(e.clientX, e.clientY);
    const box: Box = { page, x: start.x, y: start.y, w: 0, h: 0 };
    dragRef.current = box;
    setDrag(box);
    setDraft(null);
    setActive(null);
  }

  // Tracked on the window, so a box can be dragged past the edge of the page and
  // still finish cleanly — it just clamps to the page box.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;

    function move(ev: MouseEvent) {
      const start = dragRef.current;
      if (!start) return;
      const now = pointIn(ev.clientX, ev.clientY);
      const next = { ...start, w: now.x - start.x, h: now.y - start.y };
      dragRef.current = next;
      setDrag(next);
    }

    function up() {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      // Normalise, so dragging up or left still yields a positive box.
      const box: Box = {
        page: d.page,
        x: Math.min(d.x, d.x + d.w),
        y: Math.min(d.y, d.y + d.h),
        w: Math.abs(d.w),
        h: Math.abs(d.h),
      };
      const isPoint = box.w < DRAG_THRESHOLD || box.h < DRAG_THRESHOLD;
      setDraft(isPoint ? { page: d.page, x: d.x, y: d.y, w: 0, h: 0 } : box);
      setDraftText("");
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging, pointIn]);

  async function saveDraft() {
    if (!draft || !draftText.trim()) return;
    await api("/api/annotations", {
      method: "POST",
      body: JSON.stringify({ ...draft, spread_id: spreadId, body: draftText, actorId: me?.id }),
    });
    setDraft(null);
    setDraftText("");
    reload();
    refreshUnread();
  }

  const visible = annotations.filter((a) => (filter === "open" ? !a.resolved : true));
  const onPage = visible.filter((a) => a.page === page);
  const openCount = annotations.filter((a) => !a.resolved).length;
  const spread = data?.spread;
  const liveDrag = drag && (Math.abs(drag.w) > DRAG_THRESHOLD || Math.abs(drag.h) > DRAG_THRESHOLD);

  return (
    <div className="flex h-screen flex-col">
      <div className="z-20 flex shrink-0 flex-wrap items-center gap-4 border-b border-rule bg-card px-5 py-2.5">
        <Link href="/spreads" className="text-ink-3 transition-colors hover:text-blue" title="All spreads">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>

        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium">{spread?.title ?? "…"}</div>
          <Note>{[spread?.issue, spread?.page_label].filter(Boolean).join("  ·  ") || "no issue set"}</Note>
        </div>

        <div className="flex items-center gap-1">
          <IconBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} d="M15 18l-6-6 6-6" />
          <span className="font-mono text-[12px] text-ink-2">
            {page} / {pages}
          </span>
          <IconBtn onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} d="M9 18l6-6-6-6" />
        </div>

        <Segmented
          value={String(zoom)}
          onChange={(v) => setZoom(v === "page" || v === "width" ? v : Number(v))}
          options={[
            ["page", "Whole page"],
            ["width", "Fit width"],
            ["1.5", "150%"],
          ]}
        />

        <div className="ml-auto flex items-center gap-4">
          <Note tone={openCount ? "ochre" : "muted"}>
            {openCount ? `${openCount} open` : "all resolved"}
          </Note>
          <a
            href={`/api/pdf/${spreadId}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-ink-3 hover:text-blue"
          >
            open pdf
          </a>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={stageRef} className="min-w-0 flex-1 overflow-auto bg-sunk p-8">
          {loadError && <Empty>Could not open this PDF ({loadError}).</Empty>}

          <div
            ref={pageRef}
            onMouseDown={onMouseDown}
            style={{ width: size.w || undefined, height: size.h || undefined }}
            className="relative mx-auto cursor-crosshair border border-rule shadow-[0_1px_16px_rgba(0,0,0,0.08)] select-none"
          >
            <canvas ref={canvasRef} className="block bg-white" />

            {onPage.map((a, i) => (
              <Mark
                key={a.id}
                n={i + 1}
                box={a}
                resolved={!!a.resolved}
                active={active === a.id || hover === a.id}
                onSelect={() => {
                  setActive(a.id);
                  setDraft(null);
                }}
              />
            ))}

            {liveDrag && drag && (
              <div
                className="pointer-events-none absolute border border-blue bg-blue/10"
                style={boxStyle({
                  x: Math.min(drag.x, drag.x + drag.w),
                  y: Math.min(drag.y, drag.y + drag.h),
                  w: Math.abs(drag.w),
                  h: Math.abs(drag.h),
                })}
              />
            )}

            {draft && draft.page === page && (
              <Mark n="+" box={draft} active draftMark onSelect={() => {}} />
            )}
          </div>

          <p className="mx-auto mt-4 max-w-sm text-center">
            <Note>Drag a box over the page to comment on it. Click for a point note.</Note>
          </p>
        </div>

        <aside className="flex w-[330px] shrink-0 flex-col border-l border-rule bg-card">
          <div className="flex items-center gap-2 border-b border-rule px-4 py-2.5">
            <Label>Notes</Label>
            <div className="ml-auto">
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  ["open", "Open"],
                  ["all", "All"],
                ]}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {draft && (
              <div className="rise border-b border-rule bg-blue-2/40 p-3">
                <div className="label mb-2">
                  New note · p.{draft.page} · {draft.w > 0 ? "region" : "point"}
                </div>
                <MentionBox
                  value={draftText}
                  onChange={setDraftText}
                  onSubmit={saveDraft}
                  autoFocus
                  rows={3}
                  placeholder="What needs to change here? Type @ to tag someone."
                />
                <div className="mt-2 flex gap-2">
                  <Button variant="primary" onClick={saveDraft} disabled={!draftText.trim()}>
                    Comment
                  </Button>
                  <Button variant="quiet" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {visible.length === 0 && !draft && (
              <Empty>
                {filter === "open" ? "No open notes on this spread." : "No notes yet — drag a box."}
              </Empty>
            )}

            {visible.map((a, i) => (
              <Thread
                key={a.id}
                n={i + 1}
                annotation={a}
                editors={editors}
                meId={me?.id ?? null}
                active={active === a.id}
                currentPage={page}
                onFocus={() => {
                  setActive(a.id);
                  setPage(a.page);
                }}
                onHover={setHover}
                onChanged={() => {
                  reload();
                  refreshUnread();
                }}
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

const boxStyle = (b: { x: number; y: number; w: number; h: number }) => ({
  left: `${b.x * 100}%`,
  top: `${b.y * 100}%`,
  width: `${b.w * 100}%`,
  height: `${b.h * 100}%`,
});

function IconBtn({ d, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { d: string }) {
  return (
    <button
      {...props}
      className="rounded p-1 text-ink-2 transition-colors hover:bg-sunk hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        <path d={d} />
      </svg>
    </button>
  );
}

/** A region note draws its box on the page; a point note is the badge alone. */
function Mark({
  n,
  box,
  active,
  resolved,
  draftMark,
  onSelect,
}: {
  n: number | string;
  box: { x: number; y: number; w: number; h: number };
  active?: boolean;
  resolved?: boolean;
  draftMark?: boolean;
  onSelect: () => void;
}) {
  const isRegion = box.w > 0 && box.h > 0;
  const tone = resolved
    ? "border-ink-3/40 bg-ink-3/5"
    : active || draftMark
      ? "border-blue bg-blue/12"
      : "border-blue/45 bg-blue/[0.06]";

  return (
    <div
      className="absolute"
      style={isRegion ? boxStyle(box) : { left: `${box.x * 100}%`, top: `${box.y * 100}%` }}
    >
      {isRegion && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onSelect}
          aria-label={`Note ${n}`}
          className={clsx("absolute inset-0 border transition-colors", tone)}
        />
      )}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onSelect}
        aria-label={`Note ${n}`}
        className={clsx(
          "absolute -top-[9px] left-0 z-10 grid h-[18px] min-w-[18px] place-items-center rounded-[3px] px-1 font-mono text-[10px] font-medium transition-transform",
          resolved ? "bg-ink-3 text-white" : "bg-blue text-white",
          active && "scale-110"
        )}
      >
        {n}
      </button>
    </div>
  );
}

function Thread({
  n,
  annotation: a,
  editors,
  meId,
  active,
  currentPage,
  onFocus,
  onHover,
  onChanged,
}: {
  n: number;
  annotation: Annotation;
  editors: Editor[];
  meId: number | null;
  active: boolean;
  currentPage: number;
  onFocus: () => void;
  onHover: (id: number | null) => void;
  onChanged: () => void;
}) {
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const author = editors.find((e) => e.id === a.author_id);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  async function send() {
    if (!reply.trim()) return;
    await api(`/api/annotations/${a.id}/replies`, {
      method: "POST",
      body: JSON.stringify({ body: reply, actorId: meId }),
    });
    setReply("");
    setReplying(false);
    onChanged();
  }

  async function toggleResolved() {
    await api(`/api/annotations/${a.id}`, {
      method: "PATCH",
      body: JSON.stringify({ resolved: !a.resolved }),
    });
    onChanged();
  }

  async function remove() {
    await api(`/api/annotations/${a.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div
      ref={ref}
      onClick={onFocus}
      onMouseEnter={() => onHover(a.id)}
      onMouseLeave={() => onHover(null)}
      className={clsx(
        "cursor-pointer border-b border-hair p-3 transition-colors",
        active ? "bg-blue-2/50" : "hover:bg-sunk/60",
        a.resolved && "opacity-55"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "grid h-[17px] min-w-[17px] place-items-center rounded-[3px] px-1 font-mono text-[10px] text-white",
            a.resolved ? "bg-ink-3" : "bg-blue"
          )}
        >
          {n}
        </span>
        <span className="text-[12.5px] font-medium">{author?.name ?? "Unknown"}</span>
        <span className="ml-auto flex items-center gap-2">
          {a.page !== currentPage && <Note>p.{a.page}</Note>}
          <Note>{a.created_at.slice(5, 10).replace("-", "/")}</Note>
        </span>
      </div>

      <div className="mt-2 text-[13px] leading-relaxed">
        <MentionText text={a.body} />
      </div>

      {(a.replies ?? []).length > 0 && (
        <div className="mt-2.5 space-y-2 border-l border-rule pl-2.5">
          {(a.replies ?? []).map((r) => {
            const ra = editors.find((e) => e.id === r.author_id);
            return (
              <div key={r.id}>
                <div className="flex items-center gap-1.5">
                  <Initials name={ra?.name ?? "?"} size={15} />
                  <span className="text-[11.5px] font-medium">{ra?.name ?? "Unknown"}</span>
                </div>
                <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
                  <MentionText text={r.body} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {!replying && (
          <Button variant="quiet" onClick={() => setReplying(true)} className="px-2 py-1">
            Reply
          </Button>
        )}
        <Button variant="quiet" onClick={toggleResolved} className="px-2 py-1">
          {a.resolved ? "Reopen" : "Resolve"}
        </Button>
        <Button variant="quiet" onClick={remove} className="ml-auto px-2 py-1 hover:text-rust">
          Delete
        </Button>
      </div>

      {replying && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <MentionBox
            value={reply}
            onChange={setReply}
            onSubmit={send}
            autoFocus
            rows={2}
            placeholder="Reply — the thread author gets emailed."
          />
          <div className="mt-1.5 flex gap-2">
            <Button variant="primary" onClick={send} disabled={!reply.trim()}>
              Send
            </Button>
            <Button variant="quiet" onClick={() => setReplying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
