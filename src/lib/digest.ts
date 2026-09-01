import { all, todayStamp } from "./db";
import { daysUntil, formatDate, relativeDue, today } from "./dates";
import { APP_URL, emailShell, escapeHtml, sendMail } from "./mail";
import { frontier, STAGES, type Article, type Editor, type Flag, type StageKey, type Todo } from "./types";

const CONTACT_DAYS = 10; // no word to the writers in this long

const daysAgo = (date: string | null) => (date ? -(daysUntil(date) ?? 0) : Infinity);

/**
 * The one place that decides whether a story needs attention. The tracker, the
 * dashboard and the email all call this, so they can never disagree.
 */
export function flagsFor(a: Article): Flag[] {
  if (a.archived || a.spiked || a.published) return [];

  const next = frontier(a);
  if (!next) return [{ kind: "cleared", label: "Cleared copy", severity: 1 }];

  const flags: Flag[] = [];

  if (next === "section_edits")
    flags.push({ kind: "on-your-desk", label: "Waiting on section edits", severity: 2 });
  else if (next === "draft" && a.folder_made)
    flags.push({ kind: "no-draft", label: "Folder made, no draft", severity: 1 });

  const contact = daysAgo(a.last_contact);
  if (contact >= CONTACT_DAYS)
    flags.push({
      kind: "stale-contact",
      label: Number.isFinite(contact) ? `No word in ${contact} days` : "Never contacted",
      severity: 1,
    });

  return flags;
}

export function severityOf(flags: Flag[]): 0 | 1 | 2 | 3 {
  return flags.reduce<0 | 1 | 2 | 3>((m, f) => (f.severity > m ? f.severity : m), 0);
}

export type Scored = { article: Article; flags: Flag[] };

export type DigestData = {
  date: string;
  onYourDesk: Scored[];
  cleared: Article[];
  reachOut: Scored[];
  openTodos: Todo[];
  unresolvedNotes: { id: number; spread_id: number; title: string; body: string }[];
  editors: Editor[];
  board: { key: StageKey; label: string; articles: Article[] }[];
};

export async function buildDigest(): Promise<DigestData> {
  const articles = await all<Article>(
    "SELECT * FROM articles WHERE archived = 0 AND spiked = 0 AND published = 0"
  );
  const scored: Scored[] = articles.map((article) => ({ article, flags: flagsFor(article) }));
  const has = (s: Scored, kind: Flag["kind"]) => s.flags.some((f) => f.kind === kind);

  const onYourDesk = scored.filter((s) => has(s, "on-your-desk"));

  const reachOut = scored.filter((s) => has(s, "stale-contact"));

  const cleared = scored.filter((s) => has(s, "cleared")).map((s) => s.article);

  const board = STAGES.map((s) => ({
    key: s.key,
    label: s.full,
    articles: articles.filter((a) => frontier(a) === s.key),
  }));

  return {
    date: today(),
    onYourDesk,
    cleared,
    reachOut,
    board,
    openTodos: await all<Todo>(
      "SELECT * FROM todos WHERE done = 0 AND (due_date IS NULL OR due_date <= ?) ORDER BY due_date IS NULL, due_date",
      todayStamp(2)
    ),
    unresolvedNotes: await all(
      `SELECT a.id, a.spread_id, s.title, a.body
         FROM annotations a JOIN spreads s ON s.id = a.spread_id
        WHERE a.resolved = 0 ORDER BY a.created_at DESC LIMIT 8`
    ),
    editors: await all<Editor>("SELECT * FROM editors"),
  };
}

/* --- the email ---------------------------------------------------------- */

const INK = "#17181c";
const MUTED = "#5c6068";
const FAINT = "#93979f";
const RULE = "#e3e3dd";
const BLUE = "#2b4c9b";

export function renderDigestHtml(d: DigestData): string {
  const nameOf = (id: number | null) => d.editors.find((e) => e.id === id)?.name ?? "unassigned";

  const section = (title: string, inner: string) =>
    inner
      ? `<div style="margin:0 0 30px;">
           <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${FAINT};padding-bottom:8px;border-bottom:1px solid ${RULE};">${title}</div>
           ${inner}
         </div>`
      : "";

  const row = (title: string, meta: string, tail: string, href: string) => `
    <div style="padding:11px 0;border-bottom:1px solid #f0f0eb;">
      <a href="${href}" style="color:${INK};font-weight:600;text-decoration:none;font-size:14px;">${title}</a>
      <div style="color:${MUTED};font-size:12.5px;margin-top:3px;">${meta}</div>
      ${tail}
    </div>`;

  const storyRow = ({ article: a, flags }: Scored) =>
    row(
      escapeHtml(a.title),
      `${escapeHtml(a.writers || "no writers")} &nbsp;·&nbsp; ${escapeHtml(a.week)} &nbsp;·&nbsp; ${escapeHtml(nameOf(a.editor_id))}`,
      `<div style="margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:${MUTED};">
         ${flags.map((f) => escapeHtml(f.label)).join(" &nbsp;/&nbsp; ")}
       </div>`,
      `${APP_URL}/articles#a${a.id}`
    );

  const counts = [
    `${d.onYourDesk.length} on your desk`,
    `${d.cleared.length} cleared`,
    `${d.openTodos.length} open to-dos`,
  ].join(" &nbsp;·&nbsp; ");

  const body = `
    <p style="margin:0 0 26px;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:${MUTED};">${counts}</p>
    ${section("On your desk", d.onYourDesk.map(storyRow).join(""))}
    ${section("Reach out to the writers", d.reachOut.map(storyRow).join(""))}
    ${section(
      "Cleared copy — ready to place",
      d.cleared
        .map((a) => row(escapeHtml(a.title), escapeHtml(a.writers), "", `${APP_URL}/articles#a${a.id}`))
        .join("")
    )}
    ${section(
      "Open to-dos",
      d.openTodos
        .map((t) =>
          row(
            escapeHtml(t.text),
            t.due_date ? `due ${formatDate(t.due_date)} (${relativeDue(t.due_date)})` : "no due date",
            "",
            `${APP_URL}/todos`
          )
        )
        .join("")
    )}
    ${section(
      "Unresolved notes on the spreads",
      d.unresolvedNotes
        .map((n) =>
          row(escapeHtml(n.body.slice(0, 110)), escapeHtml(n.title), "", `${APP_URL}/spreads/${n.spread_id}?note=${n.id}`)
        )
        .join("")
    )}
    ${
      d.onYourDesk.length + d.reachOut.length + d.openTodos.length === 0
        ? `<p style="color:${BLUE};margin:0;">Nothing needs you. The desk is clear.</p>`
        : ""
    }`;

  const pretty = new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return emailShell(pretty, body);
}

export async function sendDigest(recipients?: Editor[]) {
  const data = await buildDigest();
  const html = renderDigestHtml(data);
  const to = recipients ?? data.editors;
  const results = [];
  for (const e of to) {
    results.push(
      await sendMail({
        to: e.email,
        toName: e.name,
        kind: "digest",
        subject: `STEM desk — ${data.onYourDesk.length} on your desk, ${data.reachOut.length} to chase`,
        html,
      })
    );
  }
  return { recipients: to.length, results, summary: data };
}
