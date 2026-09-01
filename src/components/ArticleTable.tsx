"use client";

import { Fragment, useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { today } from "@/lib/dates";
import type { Article, Flag, StageKey } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { useSession } from "./SessionProvider";
import { ArticleNotes } from "./ArticleNotes";
import { CELL, StageHeader, StageRail } from "./StageRail";
import { Button, Empty, Label, Note, Segmented } from "./ui";

type Row = Article & { flags: Flag[] };

const FILTERS = [
  ["all", "All"],
  ["spiked", "Spiked"],
  ["published", "Published"],
] as const;

type FilterKey = (typeof FILTERS)[number][0];

export function ArticleTable() {
  const { data, reload } = useApi<{ articles: Row[] }>("/api/articles");
  const { me, editors } = useSession();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openNotes, setOpenNotes] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ id: number; field: string; message: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    let r = data?.articles ?? [];
    if (q.trim()) {
      const n = q.toLowerCase();
      r = r.filter((a) => `${a.title} ${a.writers} ${a.week} ${a.note}`.toLowerCase().includes(n));
    }
    if (filter === "spiked") return r.filter((a) => a.spiked);
    if (filter === "published") return r.filter((a) => a.published && !a.spiked);
    return r.filter((a) => !a.spiked && !a.published);
  }, [data, q, filter]);

  /** Every week on the books, so a new story can join one without typing it. */
  const allWeeks = useMemo(() => {
    const seen = new Set((data?.articles ?? []).map((a) => a.week).filter(Boolean));
    if (seen.size === 0) return ["Week 1", "Week 2"];
    return [...seen].sort();
  }, [data]);

  /** Weeks are the sheet's own grouping, so the table keeps them. */
  const weeks = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const a of rows) {
      const key = a.week || "Unfiled";
      (map.get(key) ?? map.set(key, []).get(key)!).push(a);
    }
    return [...map.entries()];
  }, [rows]);

  async function patch(id: number, body: Record<string, unknown>) {
    await api(`/api/articles/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...body, actorId: me?.id }),
    });
    reload();
  }

  /** Any action that makes a row disappear offers the way back for ten seconds. */
  function offerUndo(id: number, field: string, message: string) {
    setUndo({ id, field, message });
    window.setTimeout(
      () => setUndo((u) => (u && u.id === id && u.field === field ? null : u)),
      10_000
    );
  }

  async function setOutcome(a: Row, field: "spiked" | "published", next: boolean) {
    await patch(a.id, { [field]: next ? 1 : 0 });
    if (next && filter === "all") {
      offerUndo(a.id, field, `${a.title || "Untitled story"} marked ${field}`);
    } else {
      setUndo(null);
    }
  }

  /** Deleting archives the row, so the undo is a real recovery rather than a re-add. */
  async function remove(a: Row) {
    if (openNotes === a.id) setOpenNotes(null);
    await api(`/api/articles/${a.id}`, { method: "DELETE" });
    reload();
    offerUndo(a.id, "archived", `Deleted ${a.title || "Untitled story"}`);
  }

  async function addRow(week: string) {
    setAdding(false);
    const { article } = await api<{ article: Row }>("/api/articles", {
      method: "POST",
      body: JSON.stringify({ title: "", week, editor_id: me?.id }),
    });
    reload();
    setOpenNotes(article.id);
  }

  return (
    <div className="pb-20">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule px-8 py-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search stories or writers"
          className="w-52 rounded border border-rule bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-blue"
        />
        <Segmented value={filter} onChange={setFilter} options={FILTERS} />
        <div className="relative ml-auto flex items-center gap-3">
          <Note>{rows.length} stories</Note>
          <Button variant="primary" onClick={() => setAdding((v) => !v)}>
            Add story
          </Button>
          {adding && (
            <WeekPicker
              weeks={allWeeks}
              onPick={addRow}
              onClose={() => setAdding(false)}
            />
          )}
        </div>
      </div>

      {undo && (
        <div className="rise flex items-center gap-3 border-b border-rule bg-sunk px-8 py-2">
          <Note>{undo.message}</Note>
          <button
            onClick={async () => {
              await patch(undo.id, { [undo.field]: 0 });
              setUndo(null);
            }}
            className="text-[12.5px] font-medium text-blue hover:underline"
          >
            Undo
          </button>
          <button
            onClick={() => setUndo(null)}
            className="ml-auto text-ink-3 hover:text-ink"
            aria-label="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1360px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-rule">
              <th className="label px-8 py-2.5 text-left font-normal">Article</th>
              <th className="label py-2.5 pr-4 text-left font-normal">Writers</th>
              <th className="py-2.5 pl-2 pr-4 align-bottom" style={{ width: CELL * 7 + 24 }}>
                <div className="label pb-1.5 text-left">Editing chain</div>
                <StageHeader />
              </th>
              <th className="py-2.5 pr-4 align-bottom">
                <div className="label pb-1.5 text-left">Needs</div>
                <div className="label w-16 text-center leading-none" style={{ letterSpacing: "0.02em" }}>
                  Huang
                </div>
              </th>
              <th className="py-2.5 pr-4 align-bottom">
                <div className="label pb-1.5 text-left">Outcome</div>
                <div className="flex">
                  <div className="label w-14 text-center leading-none" style={{ letterSpacing: "0.02em" }}>
                    Spiked
                  </div>
                  <div className="label w-16 text-center leading-none" style={{ letterSpacing: "0.02em" }}>
                    Published
                  </div>
                </div>
              </th>
              <th className="label py-2.5 pr-4 text-left font-normal">Editor</th>
              <th className="label py-2.5 pr-4 text-left font-normal">Contact</th>
              <th className="label py-2.5 pr-4 text-left font-normal">Note</th>
              <th className="w-10 py-2.5 pr-8" />
            </tr>
          </thead>

          {weeks.map(([week, items]) => (
            <tbody key={week}>
              <tr>
                <td colSpan={9} className="bg-sunk/70 px-8 py-1.5">
                  <span className="label text-ink-2">{week}</span>
                  <span className="label ml-3">{items.length} stories</span>
                </td>
              </tr>

              {items.map((a) => {
                const isOpen = openNotes === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr
                      id={`a${a.id}`}
                      className={clsx(
                        "group border-b border-hair align-middle transition-colors hover:bg-sunk/40",
                        a.spiked && "opacity-45"
                      )}
                    >
                      <td className="max-w-[300px] py-2 pl-8 pr-4">
                        <CellText
                          value={a.title}
                          placeholder="Untitled story"
                          onSave={(v) => patch(a.id, { title: v })}
                          className={clsx("font-medium", a.spiked && "line-through")}
                        />
                      </td>

                      <td className="max-w-[170px] py-2 pr-4">
                        <CellText
                          value={a.writers}
                          placeholder="add writers"
                          onSave={(v) => patch(a.id, { writers: v })}
                          className="text-ink-2"
                        />
                      </td>

                      <td className="py-2 pl-2 pr-4">
                        <StageRail
                          article={a}
                          onToggle={(key: StageKey, next) => patch(a.id, { [key]: next ? 1 : 0 })}
                        />
                      </td>

                      <td className="py-2 pr-4">
                        <div className="grid w-16 place-items-center">
                          <Check
                            on={!!a.huang_needed}
                            tone="blue"
                            label="Ms. Huang needs to read this"
                            onClick={() => patch(a.id, { huang_needed: a.huang_needed ? 0 : 1 })}
                          />
                        </div>
                      </td>

                      <td className="py-2 pr-4">
                        <div className="flex">
                          <div className="grid w-14 place-items-center">
                            <Check
                              on={!!a.spiked}
                              tone="rust"
                              label="Spiked"
                              onClick={() => setOutcome(a, "spiked", !a.spiked)}
                            />
                          </div>
                          <div className="grid w-16 place-items-center">
                            <Check
                              on={!!a.published}
                              tone="blue"
                              label="Published"
                              onClick={() => setOutcome(a, "published", !a.published)}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-2 pr-4">
                        <select
                          value={a.editor_id ?? ""}
                          onChange={(e) =>
                            patch(a.id, { editor_id: e.target.value ? Number(e.target.value) : null })
                          }
                          className="max-w-[110px] cursor-pointer truncate bg-transparent text-[12.5px] text-ink-2 outline-none hover:text-ink"
                        >
                          <option value="">unassigned</option>
                          {editors.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-2 pr-4">
                        <button
                          onClick={() => patch(a.id, { last_contact: today() })}
                          title="Mark the writers as contacted today"
                          className="font-mono text-[11.5px] text-ink-3 transition-colors hover:text-blue"
                        >
                          {a.last_contact ? a.last_contact.slice(5).replace("-", "/") : "never"}
                        </button>
                      </td>

                      <td className="max-w-[110px] py-2 pr-4">
                        <CellText
                          value={a.note}
                          placeholder="—"
                          onSave={(v) => patch(a.id, { note: v })}
                          className="font-mono text-[11.5px] text-ink-2"
                        />
                      </td>

                      <td className="py-2 pr-8">
                        <div className="flex items-center justify-end gap-0.5">
                          <NotesButton
                            open={isOpen}
                            count={a.note_count ?? 0}
                            onClick={() => setOpenNotes(isOpen ? null : a.id)}
                          />
                          <button
                            onClick={() => remove(a)}
                            title="Delete this story"
                            aria-label="Delete this story"
                            className="rounded p-1 text-ink-3 opacity-0 transition-opacity hover:text-rust focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="border-b border-hair bg-sunk/40">
                        <td colSpan={9} className="px-8 py-4">
                          <RowDetail
                            article={a}
                            onPatch={(body) => patch(a.id, body)}
                            onChanged={reload}
                            onClose={() => setOpenNotes(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      {rows.length === 0 && <Empty>No stories match. Clear the filter, or add one.</Empty>}
    </div>
  );
}

/** Asks which week a new story belongs to, rather than guessing. */
function WeekPicker({
  weeks,
  onPick,
  onClose,
}: {
  weeks: string[];
  onPick: (week: string) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="rise absolute right-0 top-full z-40 mt-1.5 w-52 rounded border border-rule bg-card p-1 shadow-lg shadow-black/10"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="label px-2 py-1.5">Add to which week?</div>
        {weeks.map((w) => (
          <button
            key={w}
            autoFocus={w === weeks[0]}
            onClick={() => onPick(w)}
            className="block w-full rounded-[3px] px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-blue-2"
          >
            {w}
          </button>
        ))}
        <div className="mt-1 border-t border-hair p-1.5">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) onPick(custom.trim());
            }}
            placeholder="or a new week…"
            className="w-full rounded border border-rule bg-card px-2 py-1 text-[13px] outline-none focus:border-blue"
          />
        </div>
      </div>
    </>
  );
}

/** A quiet checkbox. Colour only appears once it is ticked. */
function Check({
  on,
  tone,
  label,
  onClick,
}: {
  on: boolean;
  tone: "rust" | "blue";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={clsx(
        "grid h-[15px] w-[15px] place-items-center rounded-[3px] border transition-colors",
        on
          ? tone === "rust"
            ? "border-rust bg-rust text-white"
            : "border-blue bg-blue text-white"
          : "border-rule bg-card text-transparent hover:border-ink-3"
      )}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M2.5 6.4l2.4 2.4 4.6-5" />
      </svg>
    </button>
  );
}

/** Shows how many notes a story carries, so the count is visible without opening it. */
function NotesButton({
  open,
  count,
  onClick,
}: {
  open: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={count === 1 ? "1 note" : `${count} notes`}
      className={clsx(
        "flex items-center gap-1 rounded px-1.5 py-1 transition-colors",
        open ? "bg-blue-2 text-blue" : count > 0 ? "text-blue hover:bg-sunk" : "text-ink-3 hover:text-ink"
      )}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 15a2 2 0 01-2 2H8l-4 3V5a2 2 0 012-2h12a2 2 0 012 2z" />
      </svg>
      <span className="font-mono text-[11px]">{count || ""}</span>
    </button>
  );
}

function CellText({
  value,
  onSave,
  placeholder,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  if (!editing)
    return (
      <button
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={clsx(
          "block w-full truncate rounded px-1 py-0.5 text-left transition-colors hover:bg-card",
          !value && "text-ink-3",
          className
        )}
      >
        {value || placeholder}
      </button>
    );

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={clsx("w-full rounded border border-blue bg-card px-1 py-0.5 outline-none", className)}
    />
  );
}

function RowDetail({
  article,
  onPatch,
  onChanged,
  onClose,
}: {
  article: Article;
  onPatch: (body: Record<string, unknown>) => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-10">
      <div className="min-w-[340px] flex-1">
        <ArticleNotes articleId={article.id} onChanged={onChanged} />
      </div>

      <div className="space-y-3">
        <Label>Story settings</Label>
        <label className="block">
          <span className="label mb-1 block">Week</span>
          <input
            defaultValue={article.week}
            onBlur={(e) => e.target.value !== article.week && onPatch({ week: e.target.value })}
            className="w-36 rounded border border-rule bg-card px-2 py-1 text-[13px] outline-none focus:border-blue"
          />
        </label>
        <Button variant="quiet" onClick={onClose} className="px-0">
          Close
        </Button>
      </div>
    </div>
  );
}
