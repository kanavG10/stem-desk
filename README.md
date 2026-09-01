# STEM Desk

A newsroom hub for the STEM section: the story tracker, the to-do list, the page
spreads, and the emails that chase all three.

```bash
npm install
npm run dev      # http://localhost:3000
```

It seeds itself on first run with the section's Week 1 and Week 2 stories, a few
to-dos, and a couple of story notes. Spreads start empty — upload your own.

---

## The editing chain

A story moves through seven checkpoints, in order:

**Folder made → Draft in → Section edits → Managing edits → EIC edits → Ms. Huang
edits → Copy edits**

That sequence is defined once, in `STAGES` in `src/lib/types.ts`, and everything
reads from it — the tracker columns, the dashboard board, the digest. Add a stage
there and it appears everywhere.

In the tracker each story's chain is drawn as one connected rail. The line fills to
the last completed stage, and the first outstanding box — the **frontier** — carries a
ring. Where a story sits is the thing you read at a glance; there is no separate
status field, because the frontier *is* the status. Click any box to move a story
along. Ms. Huang's box shows a dash on stories she doesn't need to read (toggle
"Ms. Huang needs to read this" in the row detail).

Past the chain sit two **outcome** boxes, **Spiked** and **Published**. Either one
takes a story out of the working list and out of the digest, so ticking one leaves an
Undo bar behind rather than just making the row vanish.

Moving a box resets that story's stall clock. Renaming it doesn't.

---

## What's here

**Today** (`/`) — the board across the top shows every live story standing at the
stage it is waiting on, so you can see the whole desk in one line. Below it: the
unresolved notes on your spreads, and the open to-dos. The daily digest card at the
bottom previews and sends the email, which reports more than this page shows.

**Tracker** (`/articles`) — the budget, grouped by week the way the sheet is. Every
cell edits in place. Columns: article, writers, the editing chain, spiked, published,
editor, last contact, and a free note (`wp`, `dire`, whatever you use). The contact
cell is also a button — clicking it marks the writers as contacted today. Filters:
**All / Spiked / Published**, where All is everything still in play.

The speech bubble on the right shows how many notes a story carries. Open it and
notes work like the ones on a spread: each is its own card with an author and a time,
takes replies, and can be resolved. Tag someone with `@` and they get an email.

**To-dos** (`/todos`) — grouped overdue / today / coming up / no date, optionally hung
off a story.

**Spreads** (`/spreads`) — drop an 11×17 PDF and it renders in the browser.
**Drag a box over any part of the page** and that region highlights for you to comment
on; a plain click drops a point note instead. Threads take replies, resolve and
reopen, and the numbers in the rail match the badges on the page. Boxes are stored as
fractions of the page, so they hold position at any zoom. "Whole page" is the default
view for a tall spread; switch to "Fit width" to read body copy.

**Inbox** (`/inbox`) — *Tagged me* is every `@mention` aimed at you. *Outgoing mail*
is every email the app has produced, rendered as it would arrive.

---

## Tagging and email

Type `@` anywhere you can write — a to-do, a story note, a spread comment, a reply —
and an autocomplete appears. On save the server re-parses the text, records the
mention, and emails that person a deep link back to the exact spot. Replying to a
thread — on a story or on a spread — also emails whoever started it.

**Sending is live.** `.env.local` holds the Gmail app password, and the sidebar reads
"Email sending live". Mail goes to the two editor addresses in `editors`
(`28kanavg@` and `28sarial@students.harker.org`). That file is gitignored — if you
move this to another machine you have to recreate it from `.env.example`.

Delete or empty `.env.local` and the app falls back to outbox mode: every message is
still written down and shown in `/inbox` → *Outgoing mail*, fully rendered, but
nothing leaves the building. Useful when you want to try things without mailing
anyone.

---

## The daily digest

`flagsFor(article)` in `src/lib/digest.ts` is the one function that decides whether a
story needs attention. The tracker, the dashboard and the email all call it, so they
can never disagree.

| Flag | Trigger |
| --- | --- |
| **Waiting on section edits** | Draft is in and section edits aren't done |
| **Folder made, no draft** | Folder exists but nothing has been filed |
| **No word in N days** | No contact with the writers in 10 days |
| **Cleared copy** | Every applicable stage done — ready to place |

Spiked and published stories are excluded from all of it. The thresholds are the constants at the
top of `digest.ts`.

Send it on a schedule with cron — the app must be running:

```cron
15 7 * * 1-5  cd "/Users/kanav/Projects/stem hub" && /usr/bin/env node scripts/digest.mjs >> data/digest.log 2>&1
```

Or by hand: `npm run digest`, or **Send now** on the dashboard.

---

## How it's put together

| | |
| --- | --- |
| Next.js 16, App Router | pages and API routes in one app |
| `node:sqlite` | Node's built-in SQLite — no native build step |
| pdf.js | renders spreads to canvas; note boxes are an HTML overlay |
| nodemailer | SMTP, with the outbox fallback above |
| Tailwind v4 | tokens defined in `src/app/globals.css` |

```
src/lib/types.ts       the editing chain, and everything derived from it
src/lib/db.ts          schema, seed data, query helpers
src/lib/digest.ts      the "does this need attention?" rules and the digest email
src/lib/mentions.ts    @handle parsing -> mention rows -> email
src/lib/mail.ts        outbox table + optional SMTP
src/app/api/           REST routes for every entity
src/components/        the UI
data/                  the SQLite file and uploaded PDFs (gitignored)
```

Everything lives in `data/`. Delete that directory to reset to seed data; copy it to
back up.

**The design**: paper ground, one editing colour (`--color-blue`, a blue-pencil
`#2B4C9B`) for anything actionable, ochre for attention and rust for spiked. Every
label is set in mono. Colour is scarce on purpose — when a row turns ochre it means
something. Tokens are all at the top of `globals.css`.

---

## Deploying

The app keeps everything on disk: `data/stemhub.db` and the PDFs in `data/uploads`.
So it runs anywhere with a **persistent filesystem** — Railway, Render, Fly, a spare
machine on the school network, or a laptop that stays on. Set the same environment
variables as `.env.local`, and point cron at `scripts/digest.mjs`.

**Vercel needs a change first.** Its functions get an ephemeral, mostly read-only
filesystem, so the SQLite file and every uploaded spread would be wiped on each
deploy and would not be shared between requests. It would look like it worked, then
quietly lose the tracker. Two swaps make it work:

1. **Database** — move off `node:sqlite` to hosted Postgres (Vercel Postgres, Neon,
   Supabase). Contained to `src/lib/db.ts`: routes only ever call `all`, `one` and
   `run`, so the SQL stays and the connection changes.
2. **Uploads** — store spreads in Vercel Blob or S3 instead of `data/uploads`, and
   have `/api/pdf/[id]` redirect to the blob URL. Touches
   `src/app/api/spreads/route.ts` and `src/app/api/pdf/[id]/route.ts`.

Then set `DIGEST_SECRET` and add a Vercel Cron entry pointing at `POST /api/digest`
with that header, replacing the local cron line above.

---

## Known edges

Deliberate prototype shortcuts, not oversights:

- **No auth.** You pick who you are from the sidebar. Every write already sends an
  explicit `actorId`, so replacing `SessionProvider` with real sign-in touches almost
  nothing else.
- **Editors are Kanav and Saria**, seeded in `db.ts`. Writers are free text, not
  accounts, so `@` tagging only reaches editors.
- **Spiked and published are flags, not stages.** They sit outside the chain because a
  story can be spiked at any point, and publishing happens after copy.
- **Weeks are a text field**, so there's no place for a week-level note yet.
- **The digest needs the app running**, since `scripts/digest.mjs` posts to the API.
- **SQLite means one machine.** Fine for two editors on a laptop; move to Postgres if
  this goes on a server for the whole staff.
