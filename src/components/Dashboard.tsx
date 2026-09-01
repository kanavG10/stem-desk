"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { formatDate, relativeDue } from "@/lib/dates";
import type { Article, StageKey, Todo } from "@/lib/types";
import { useSession } from "./SessionProvider";
import { MentionText } from "./MentionBox";
import { Button, Empty, Label, Note, Panel } from "./ui";

type Digest = {
  date: string;
  openTodos: Todo[];
  unresolvedNotes: { id: number; spread_id: number; title: string; body: string }[];
  board: { key: StageKey; label: string; articles: Article[] }[];
};

export function Dashboard() {
  const { data, reload } = useApi<{ data: Digest; html: string }>("/api/digest");
  const { mailIsLive } = useSession();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const d = data?.data;

  async function sendNow() {
    setSending(true);
    try {
      const res = await api<{ recipients: number }>("/api/digest", { method: "POST" });
      setSent(
        mailIsLive
          ? `Sent to ${res.recipients} editors.`
          : `Held for ${res.recipients} editors — read it in the Inbox.`
      );
    } finally {
      setSending(false);
      reload();
    }
  }

  if (!d) return <Empty>Reading the desk…</Empty>;

  const live = d.board.reduce((n, col) => n + col.articles.length, 0);

  return (
    <div className="px-8 py-7 pb-20">
      {/* The board: every live story, standing at the stage it is waiting on. */}
      <section>
        <div className="flex items-baseline justify-between">
          <Label>Where every story stands</Label>
          <Note>{live} live</Note>
        </div>

        <div className="mt-3 overflow-x-auto">
          <div className="flex min-w-[900px] border-t-2 border-ink">
            {d.board.map((col) => (
              <div key={col.key} className="min-w-0 flex-1 border-r border-hair pt-3 pr-3 last:border-r-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-[26px] leading-none">
                    {col.articles.length || <span className="text-ink-3">0</span>}
                  </span>
                  <span className="label">waiting</span>
                </div>
                <div className="mt-1 text-[12.5px] font-medium">{col.label}</div>

                <ul className="mt-3 space-y-1.5">
                  {col.articles.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/articles#a${a.id}`}
                        className="block truncate text-[12.5px] text-ink-2 transition-colors hover:text-blue"
                        title={a.title}
                      >
                        {a.title || "Untitled"}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-10 gap-x-10 lg:columns-2 [&>section]:mb-9 [&>section]:break-inside-avoid">
        <section>
          <div className="flex items-baseline justify-between border-b border-rule pb-2">
            <Label>Unresolved notes on the spreads</Label>
            <Link href="/spreads" className="text-[12px] text-ink-3 hover:text-blue">
              spreads
            </Link>
          </div>
          {d.unresolvedNotes.length === 0 && <Empty>No open notes.</Empty>}
          <ul>
            {d.unresolvedNotes.map((n) => (
              <li key={n.id} className="border-b border-hair">
                <Link
                  href={`/spreads/${n.spread_id}?note=${n.id}`}
                  className="block py-2.5 transition-colors hover:bg-sunk/50"
                >
                  <div className="truncate text-[13px]">
                    <MentionText text={n.body} />
                  </div>
                  <div className="mt-0.5">
                    <Note>{n.title}</Note>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <div className="flex items-baseline justify-between border-b border-rule pb-2">
            <Label>Open to-dos</Label>
            <Link href="/todos" className="text-[12px] text-ink-3 hover:text-blue">
              all to-dos
            </Link>
          </div>
          {d.openTodos.length === 0 && <Empty>Nothing open.</Empty>}
          <ul>
            {d.openTodos.map((t) => (
              <li key={t.id} className="border-b border-hair py-2.5">
                <div className="text-[13px]">
                  <MentionText text={t.text} />
                </div>
                <div className="mt-0.5">
                  <Note tone={t.due_date && relativeDue(t.due_date).includes("late") ? "ochre" : "muted"}>
                    {t.due_date ? `${formatDate(t.due_date)} · ${relativeDue(t.due_date)}` : "no due date"}
                  </Note>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Panel className="mt-2 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
          <Label>Daily digest</Label>
          <span className="text-[12.5px] text-ink-2">
            {mailIsLive
              ? "Emailed to both editors each morning."
              : "No SMTP set up — digests wait in the Inbox."}
          </span>
          <div className="ml-auto flex gap-2">
            <Button onClick={() => setPreview((v) => !v)}>{preview ? "Hide preview" : "Preview"}</Button>
            <Button variant="primary" onClick={sendNow} disabled={sending}>
              {sending ? "Sending…" : "Send now"}
            </Button>
          </div>
        </div>
        <div className="px-4 py-2.5">
          {sent ? (
            <Note tone="blue">{sent}</Note>
          ) : (
            <Note>Runs from cron via `npm run digest` — the line is in README.md</Note>
          )}
        </div>
        {preview && (
          <iframe
            title="Digest preview"
            srcDoc={data.html}
            className="h-[520px] w-full border-t border-rule bg-sunk"
          />
        )}
      </Panel>
    </div>
  );
}
