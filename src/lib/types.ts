export type Editor = {
  id: number;
  name: string;
  handle: string;
  email: string;
  role: string;
};

/**
 * The editing chain, in the order a story moves through it. This list is the single
 * definition of the workflow — the tracker columns, the stage rail, the dashboard
 * board and the digest all read from it, so adding a stage here adds it everywhere.
 */
export const STAGES = [
  { key: "folder_made", label: "Folder", full: "Folder made" },
  { key: "draft", label: "Draft", full: "Draft in" },
  { key: "section_edits", label: "Section", full: "Section edits" },
  { key: "managing_edits", label: "Managing", full: "Managing edits" },
  { key: "eic_edits", label: "EIC", full: "EIC edits" },
  { key: "huang_edits", label: "Huang", full: "Ms. Huang edits", optional: true },
  { key: "copy_edits", label: "Copy", full: "Copy edits" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export type Article = {
  id: number;
  title: string;
  writers: string;
  week: string;
  editor_id: number | null;
  folder_made: number;
  draft: number;
  section_edits: number;
  managing_edits: number;
  eic_edits: number;
  huang_edits: number;
  huang_needed: number;
  copy_edits: number;
  spiked: number;
  published: number;
  note: string;
  last_contact: string | null;
  stage_moved_at: string;
  note_count?: number;
  archived: number;
  created_at: string;
  updated_at: string;
};

/** A stage only counts when it applies — Ms. Huang reads some stories, not all. */
export function stageApplies(article: Article, key: StageKey): boolean {
  return key !== "huang_edits" || article.huang_needed === 1;
}

/** The first stage still outstanding, or null when the story has cleared copy. */
export function frontier(article: Article): StageKey | null {
  for (const s of STAGES) {
    if (!stageApplies(article, s.key)) continue;
    if (!article[s.key]) return s.key;
  }
  return null;
}

export function stagesDone(article: Article): number {
  return STAGES.filter((s) => stageApplies(article, s.key) && article[s.key]).length;
}

export function stagesTotal(article: Article): number {
  return STAGES.filter((s) => stageApplies(article, s.key)).length;
}

/** A note on a story. Top-level notes have no parent; replies point at one. */
export type ArticleNote = {
  id: number;
  article_id: number;
  parent_id: number | null;
  author_id: number | null;
  body: string;
  resolved: number;
  created_at: string;
  replies?: ArticleNote[];
};

export type Todo = {
  id: number;
  text: string;
  done: number;
  assignee_id: number | null;
  article_id: number | null;
  due_date: string | null;
  created_by: number | null;
  created_at: string;
  done_at: string | null;
};

export type Spread = {
  id: number;
  title: string;
  issue: string;
  page_label: string;
  filename: string;
  stored_name: string;
  size_bytes: number;
  uploaded_by: number | null;
  created_at: string;
  open_notes?: number;
  total_notes?: number;
};

/**
 * A note is anchored to a rectangle on the page, stored as fractions of the page box
 * so it holds position at any zoom. A zero-size box is a point marker.
 */
export type Annotation = {
  id: number;
  spread_id: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  body: string;
  author_id: number | null;
  resolved: number;
  created_at: string;
  replies?: Reply[];
};

export type Reply = {
  id: number;
  annotation_id: number;
  author_id: number | null;
  body: string;
  created_at: string;
};

export type Mention = {
  id: number;
  editor_id: number;
  actor_id: number | null;
  context_type: string;
  context_id: number | null;
  context_label: string;
  excerpt: string;
  url: string;
  seen: number;
  created_at: string;
};

export type OutboxItem = {
  id: number;
  to_email: string;
  to_name: string;
  subject: string;
  html: string;
  text: string;
  kind: string;
  status: string;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

/** Why a story is surfaced in the digest. 3 = act today, 1 = worth knowing. */
export type Flag = {
  kind: "on-your-desk" | "no-draft" | "stale-contact" | "cleared";
  label: string;
  severity: 1 | 2 | 3;
};
