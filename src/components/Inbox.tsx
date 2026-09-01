"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { Mention, OutboxItem } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { MentionText } from "./MentionBox";
import { useSession } from "./SessionProvider";
import { Empty, Input, Label, Note, Segmented } from "./ui";

/**
 * Where mail actually goes. Editable here because the usual reason a notification
 * "never arrived" is that it went to the wrong address, or to one whose server
 * quietly filed it away.
 */
function Recipients() {
  const { editors, refreshEditors } = useSession();
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(id: number, email: string) {
    setError(null);
    try {
      await api(`/api/editors/${id}`, { method: "PATCH", body: JSON.stringify({ email }) });
      setSaved(id);
      setTimeout(() => setSaved((v) => (v === id ? null : v)), 2500);
      refreshEditors();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save");
    }
  }

  return (
    <div className="mb-5 border-b border-rule pb-5">
      <Label>Where mail goes</Label>
      <div className="mt-2 space-y-2">
        {editors.map((e) => (
          <div key={e.id} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-[13px]">{e.name}</span>
            <Input
              defaultValue={e.email}
              onBlur={(ev) => ev.target.value.trim() !== e.email && save(e.id, ev.target.value)}
              onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
              className="w-72 font-mono text-[12px]"
            />
            {saved === e.id && <Note tone="blue">saved</Note>}
          </div>
        ))}
      </div>
      {error && (
        <div className="mt-2">
          <Note tone="rust">{error}</Note>
        </div>
      )}
    </div>
  );
}

export function Inbox() {
  const { me, refreshUnread, mailIsLive } = useSession();
  const [tab, setTab] = useState<"tags" | "mail">("tags");
  const { data: mData, reload: reloadMentions } = useApi<{
    mentions: (Mention & { actor_name: string | null })[];
  }>(me ? `/api/mentions?editorId=${me.id}` : null);
  const { data: oData } = useApi<{ messages: OutboxItem[]; mailIsLive: boolean }>("/api/outbox");
  const [openMail, setOpenMail] = useState<number | null>(null);

  const mentions = mData?.mentions ?? [];
  const unread = mentions.filter((m) => !m.seen).length;

  useEffect(() => {
    if (tab !== "tags" || unread === 0 || !me) return;
    const t = setTimeout(() => {
      api("/api/mentions", { method: "POST", body: JSON.stringify({ editorId: me.id }) })
        .then(() => {
          reloadMentions();
          refreshUnread();
        })
        .catch(() => {});
    }, 1400);
    return () => clearTimeout(t);
  }, [tab, unread, me, reloadMentions, refreshUnread]);

  return (
    <div className="mx-auto max-w-2xl px-8 py-7 pb-20">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ["tags", `Tagged me${unread ? ` · ${unread}` : ""}`],
          ["mail", "Outgoing mail"],
        ]}
      />

      {tab === "tags" && (
        <div className="mt-5">
          {mentions.length === 0 && <Empty>No one has tagged you yet.</Empty>}
          {mentions.map((m) => (
            <Link
              key={m.id}
              href={m.url}
              className={clsx(
                "block border-b border-hair py-3 transition-colors hover:bg-sunk/50",
                !m.seen && "border-l-2 border-l-blue pl-3"
              )}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-medium">{m.actor_name ?? "Someone"}</span>
                <span className="text-[12.5px] text-ink-2">tagged you in</span>
                <span className="truncate text-[12.5px] text-ink-2">{m.context_label}</span>
                <span className="ml-auto shrink-0">
                  <Note>{m.created_at.slice(5, 10).replace("-", "/")}</Note>
                </span>
              </div>
              <div className="mt-1.5 border-l border-rule pl-2.5 text-[13px] text-ink-2">
                <MentionText text={m.excerpt} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "mail" && (
        <div className="mt-5">
          <Recipients />

          <p className="mb-4 border-l-2 border-rule pl-3 text-[12.5px] leading-relaxed text-ink-2">
            {mailIsLive
              ? "SMTP is configured — these were really sent."
              : "No SMTP credentials, so nothing left the building. Every notification is captured here exactly as it would arrive. Add SMTP_HOST, SMTP_USER and SMTP_PASS to .env.local to go live."}
          </p>

          {(oData?.messages ?? []).length === 0 && <Empty>No mail yet.</Empty>}
          {(oData?.messages ?? []).map((m) => (
            <div key={m.id} className="border-b border-hair">
              <button
                onClick={() => setOpenMail(openMail === m.id ? null : m.id)}
                className="flex w-full items-baseline gap-3 py-3 text-left transition-colors hover:bg-sunk/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{m.subject}</div>
                  <div className="mt-0.5">
                    <Note tone={m.status === "failed" ? "rust" : "muted"}>
                      {`to ${m.to_name || m.to_email}  ·  ${m.kind}  ·  ${m.status}${m.error ? `  ·  ${m.error}` : ""}`}
                    </Note>
                  </div>
                </div>
                <Note>{m.created_at.slice(5, 10).replace("-", "/")}</Note>
              </button>
              {openMail === m.id && (
                <iframe
                  title={m.subject}
                  srcDoc={m.html}
                  className="mb-3 h-[440px] w-full border border-rule bg-sunk"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
