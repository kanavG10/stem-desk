"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import type { ArticleNote, Editor } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { MentionBox, MentionText } from "./MentionBox";
import { useSession } from "./SessionProvider";
import { Button, Empty, Initials, Label, Note } from "./ui";

/**
 * Notes on a story, threaded the same way notes on a spread are: each one is its own
 * card with an author and a time, takes replies, and can be resolved.
 */
export function ArticleNotes({
  articleId,
  onChanged,
}: {
  articleId: number;
  onChanged: () => void;
}) {
  const { data, reload } = useApi<{ notes: ArticleNote[] }>(`/api/articles/${articleId}/notes`);
  const { me, editors } = useSession();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const notes = data?.notes ?? [];

  async function post() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api(`/api/articles/${articleId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: text, actorId: me?.id }),
      });
      setText("");
      reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-baseline gap-3">
        <Label>Notes</Label>
        <Note>{notes.length === 0 ? "none yet" : `${notes.length}`}</Note>
      </div>

      <div className="mt-2">
        <MentionBox
          value={text}
          onChange={setText}
          onSubmit={post}
          rows={2}
          placeholder="Add a note. Type @ to tag someone — they get an email."
        />
        <div className="mt-2 flex items-center gap-2">
          <Button variant="primary" onClick={post} disabled={busy || !text.trim()}>
            Post note
          </Button>
          <Note>{"⌘"} + Enter</Note>
        </div>
      </div>

      {notes.length === 0 ? (
        <Empty>No notes on this story yet.</Empty>
      ) : (
        <div className="mt-4 space-y-2">
          {notes.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              articleId={articleId}
              editors={editors}
              meId={me?.id ?? null}
              onChanged={() => {
                reload();
                onChanged();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  articleId,
  editors,
  meId,
  onChanged,
}: {
  note: ArticleNote;
  articleId: number;
  editors: Editor[];
  meId: number | null;
  onChanged: () => void;
}) {
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const author = editors.find((e) => e.id === note.author_id);

  async function send() {
    if (!reply.trim()) return;
    await api(`/api/articles/${articleId}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: reply, parent_id: note.id, actorId: meId }),
    });
    setReply("");
    setReplying(false);
    onChanged();
  }

  async function patch(body: Record<string, unknown>) {
    await api(`/api/article-notes/${note.id}`, { method: "PATCH", body: JSON.stringify(body) });
    onChanged();
  }

  async function remove() {
    await api(`/api/article-notes/${note.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div
      className={clsx(
        "rounded border border-rule bg-card p-3",
        note.resolved && "opacity-55"
      )}
    >
      <div className="flex items-center gap-2">
        <Initials name={author?.name ?? "?"} size={19} />
        <span className="text-[12.5px] font-medium">{author?.name ?? "Unknown"}</span>
        <span className="ml-auto flex items-center gap-2">
          {note.resolved === 1 && <Note tone="blue">resolved</Note>}
          <Note>{note.created_at.slice(5, 16).replace("-", "/")}</Note>
        </span>
      </div>

      <div className="mt-2 text-[13px] leading-relaxed">
        <MentionText text={note.body} />
      </div>

      {(note.replies ?? []).length > 0 && (
        <div className="mt-2.5 space-y-2 border-l border-rule pl-2.5">
          {(note.replies ?? []).map((r) => {
            const ra = editors.find((e) => e.id === r.author_id);
            return (
              <div key={r.id}>
                <div className="flex items-center gap-1.5">
                  <Initials name={ra?.name ?? "?"} size={15} />
                  <span className="text-[11.5px] font-medium">{ra?.name ?? "Unknown"}</span>
                  <span className="ml-auto">
                    <Note>{r.created_at.slice(5, 16).replace("-", "/")}</Note>
                  </span>
                </div>
                <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
                  <MentionText text={r.body} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1">
        {!replying && (
          <Button variant="quiet" onClick={() => setReplying(true)} className="px-2 py-1">
            Reply
          </Button>
        )}
        <Button
          variant="quiet"
          onClick={() => patch({ resolved: !note.resolved })}
          className="px-2 py-1"
        >
          {note.resolved ? "Reopen" : "Resolve"}
        </Button>
        <Button variant="quiet" onClick={remove} className="ml-auto px-2 py-1 hover:text-rust">
          Delete
        </Button>
      </div>

      {replying && (
        <div className="mt-2">
          <MentionBox
            value={reply}
            onChange={setReply}
            onSubmit={send}
            autoFocus
            rows={2}
            placeholder="Reply — the note's author gets emailed."
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
