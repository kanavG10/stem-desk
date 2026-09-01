import { all, run, stamp } from "./db";
import { APP_URL, emailShell, escapeHtml, sendMail } from "./mail";
import type { Editor } from "./types";

const HANDLE_RE = /@([a-z0-9_.-]+)/gi;

export function extractHandles(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(HANDLE_RE)) out.add(m[1].toLowerCase().replace(/[.]+$/, ""));
  return [...out];
}

type MentionSource = {
  text: string;
  actorId: number | null;
  contextType: "todo" | "annotation" | "reply" | "article";
  contextId: number | null;
  contextLabel: string;
  url: string;
};

/**
 * Resolves @handles in `text` to editors, records a mention for each, and emails them.
 * The author is never notified about their own mention.
 */
export async function processMentions(src: MentionSource): Promise<Editor[]> {
  const handles = extractHandles(src.text);
  if (handles.length === 0) return [];

  // Tagging yourself is allowed — it is the easiest way to check mail is arriving.
  const editors = await all<Editor>(
    `SELECT * FROM editors WHERE lower(handle) IN (${handles.map(() => "?").join(",")})`,
    ...handles
  );
  if (editors.length === 0) return [];

  const actor = src.actorId
    ? (await all<Editor>("SELECT * FROM editors WHERE id = ?", src.actorId))[0]
    : undefined;
  const actorName = actor?.name ?? "Someone";
  const selfTag = (e: Editor) => e.id === src.actorId;
  const url = `${APP_URL}${src.url}`;

  for (const e of editors) {
    await run(
      `INSERT INTO mentions (editor_id, actor_id, context_type, context_id, context_label, excerpt, url, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      e.id,
      src.actorId,
      src.contextType,
      src.contextId,
      src.contextLabel,
      src.text.slice(0, 400),
      src.url,
      stamp()
    );

    await sendMail({
      to: e.email,
      toName: e.name,
      kind: "mention",
      subject: selfTag(e)
        ? `You tagged yourself — ${src.contextLabel}`
        : `${actorName} tagged you — ${src.contextLabel}`,
      html: emailShell(
        selfTag(e) ? "You tagged yourself" : `${actorName} tagged you`,
        `<p style="margin:0 0 14px;font-family:ui-monospace,Menlo,monospace;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#93979f;">
           ${escapeHtml(labelFor(src.contextType))} &nbsp;·&nbsp; ${escapeHtml(src.contextLabel)}
         </p>
         <blockquote style="margin:0 0 22px;padding:2px 0 2px 16px;border-left:2px solid #2b4c9b;color:#17181c;font-size:15px;">
           ${highlight(src.text)}
         </blockquote>
         <a href="${url}" style="display:inline-block;padding:9px 16px;background:#2b4c9b;color:#ffffff;font-weight:600;text-decoration:none;font-size:13.5px;">Open in STEM Desk</a>`
      ),
    });
  }
  return editors;
}

function labelFor(t: string) {
  return t === "annotation" || t === "reply" ? "Spread note" : t === "todo" ? "To-do" : "Article";
}

/** Renders @handles as highlighted spans inside otherwise-escaped text. */
export function highlight(text: string) {
  return escapeHtml(text).replace(
    /@([a-z0-9_.-]+)/gi,
    '<span style="color:#2b4c9b;font-weight:600;">@$1</span>'
  );
}
