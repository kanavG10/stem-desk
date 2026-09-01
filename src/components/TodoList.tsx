"use client";

import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { daysUntil, formatDate, relativeDue } from "@/lib/dates";
import type { Article, Editor, Todo } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { MentionBox, MentionText } from "./MentionBox";
import { useSession } from "./SessionProvider";
import { Button, Empty, Initials, Label, Note, Select } from "./ui";

export function TodoList() {
  const { data, reload } = useApi<{ todos: Todo[] }>("/api/todos");
  const { data: arts } = useApi<{ articles: Article[] }>("/api/articles");
  const { me, editors, refreshUnread } = useSession();

  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [articleId, setArticleId] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const todos = data?.todos ?? [];
  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  const groups = useMemo(() => {
    const buckets: Record<string, Todo[]> = { overdue: [], today: [], later: [], someday: [] };
    for (const t of open) {
      const d = daysUntil(t.due_date);
      buckets[d === null ? "someday" : d < 0 ? "overdue" : d === 0 ? "today" : "later"].push(t);
    }
    return [
      { key: "overdue", label: "Overdue", items: buckets.overdue },
      { key: "today", label: "Today", items: buckets.today },
      { key: "later", label: "Coming up", items: buckets.later },
      { key: "someday", label: "No date", items: buckets.someday },
    ].filter((g) => g.items.length > 0);
  }, [open]);

  async function add() {
    if (!text.trim()) return;
    const res = await api<{ notified: string[] }>("/api/todos", {
      method: "POST",
      body: JSON.stringify({
        text,
        assignee_id: assignee ? Number(assignee) : null,
        article_id: articleId ? Number(articleId) : null,
        due_date: due || null,
        actorId: me?.id,
      }),
    });
    setText("");
    setDue("");
    setArticleId("");
    setFlash(res.notified.length ? `Emailed ${res.notified.join(", ")}` : "Added");
    setTimeout(() => setFlash(null), 3500);
    reload();
    refreshUnread();
  }

  async function toggle(t: Todo) {
    await api(`/api/todos/${t.id}`, { method: "PATCH", body: JSON.stringify({ done: t.done ? 0 : 1 }) });
    reload();
  }

  async function remove(id: number) {
    await api(`/api/todos/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-7 pb-20">
      <div className="rounded border border-rule bg-card p-3">
        <MentionBox
          value={text}
          onChange={setText}
          onSubmit={add}
          rows={2}
          placeholder="What needs doing? Type @ to tag an editor — they get an email."
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-[130px]">
            <option value="">Anyone</option>
            {editors.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded border border-rule bg-card px-2 py-1.5 font-mono text-[12px] text-ink-2 outline-none focus:border-blue"
          />
          <Select value={articleId} onChange={(e) => setArticleId(e.target.value)} className="w-[190px]">
            <option value="">No story</option>
            {(arts?.articles ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.title.slice(0, 40)}
              </option>
            ))}
          </Select>
          <Button variant="primary" onClick={add} disabled={!text.trim()} className="ml-auto">
            Add
          </Button>
        </div>
        {flash && (
          <div className="mt-2">
            <Note tone="blue">{flash}</Note>
          </div>
        )}
      </div>

      <div className="mt-8 space-y-8">
        {groups.map((g) => (
          <section key={g.key}>
            <div className="flex items-baseline justify-between border-b border-rule pb-2">
              <Label>{g.label}</Label>
              <Note>{g.items.length}</Note>
            </div>
            {g.items.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                article={arts?.articles.find((a) => a.id === t.article_id)}
                editors={editors}
                onToggle={() => toggle(t)}
                onRemove={() => remove(t.id)}
              />
            ))}
          </section>
        ))}

        {open.length === 0 && <Empty>Nothing open.</Empty>}

        {done.length > 0 && (
          <section>
            <button
              onClick={() => setShowDone((v) => !v)}
              className="label border-b border-rule pb-2 w-full text-left transition-colors hover:text-ink-2"
            >
              Done · {done.length}
            </button>
            {showDone &&
              done.map((t) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  article={arts?.articles.find((a) => a.id === t.article_id)}
                  editors={editors}
                  onToggle={() => toggle(t)}
                  onRemove={() => remove(t.id)}
                />
              ))}
          </section>
        )}
      </div>
    </div>
  );
}

function TodoRow({
  todo,
  article,
  editors,
  onToggle,
  onRemove,
}: {
  todo: Todo;
  article?: Article;
  editors: Editor[];
  onToggle: () => void;
  onRemove: () => void;
}) {
  const assignee = editors.find((e) => e.id === todo.assignee_id);
  const late = !todo.done && (daysUntil(todo.due_date) ?? 1) < 0;

  return (
    <div className="group flex items-start gap-3 border-b border-hair py-2.5">
      <button
        onClick={onToggle}
        aria-label={todo.done ? "Mark as not done" : "Mark as done"}
        className={clsx(
          "mt-0.5 grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[3px] border transition-colors",
          todo.done ? "border-blue bg-blue text-white" : "border-rule bg-card text-transparent hover:border-ink-3"
        )}
      >
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M2.5 6.4l2.4 2.4 4.6-5" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <div className={clsx("text-[13.5px] leading-snug", todo.done && "text-ink-3 line-through")}>
          <MentionText text={todo.text} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
          {todo.due_date && (
            <Note tone={late ? "ochre" : "muted"}>
              {formatDate(todo.due_date)} · {relativeDue(todo.due_date)}
            </Note>
          )}
          {article && (
            <a href={`/articles#a${article.id}`} className="truncate">
              <Note>↳ {article.title.slice(0, 46)}</Note>
            </a>
          )}
        </div>
      </div>

      {assignee && <Initials name={assignee.name} size={19} />}

      <button
        onClick={onRemove}
        title="Delete"
        className="mt-0.5 text-ink-3 opacity-0 transition-opacity hover:text-rust group-hover:opacity-100"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
