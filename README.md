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

The app runs two ways from the same code. Locally it needs nothing: SQLite in
`data/stemhub.db`, PDFs in `data/uploads`. Set `DATABASE_URL` and the Supabase keys
and it switches to Postgres and a storage bucket — which is what a serverless host
needs, since those give you no persistent disk.

### Free hosting on Vercel

**1. Database.** Make a project at [supabase.com](https://supabase.com) (free tier:
500 MB) and copy the **pooled** connection string from Project Settings → Database.
Neon or Vercel Postgres work identically — the app only wants a `DATABASE_URL`.

**2. Storage.** In the same Supabase project, Storage → New bucket → name it
`spreads`, and leave **Public** off. Copy the project URL and the `service_role` key
from Project Settings → API.

> Spreads are big — the real one in this repo is 25 MB, and Vercel caps request
> bodies at 4.5 MB. So the browser uploads straight to the bucket: it asks
> `POST /api/spreads` for a one-time URL, PUTs the file there, then `PUT /api/spreads`
> records the metadata. The PDF never passes through a function. `/api/pdf/[id]`
> redirects to a signed URL that expires in an hour.

**3. Deploy.** Import the repo on Vercel and set these environment variables:

```
APP_URL, DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, CRON_SECRET
```

The tables are created on the first request. `vercel.json` already registers the
daily digest against `/api/cron/digest`; Vercel sends `CRON_SECRET` as a bearer token
automatically. Hobby projects get one cron run a day, which is exactly what this
needs. The schedule is in UTC — `15 14 * * *` is 7:15am Pacific.

**4. Bring your data across.** Once the deployed app has loaded once (that creates
the tables), from your laptop:

```bash
DATABASE_URL='...' SUPABASE_URL='...' SUPABASE_SERVICE_ROLE_KEY='...' npm run migrate
```

It copies every row and uploads the PDFs, and refuses to run if the remote database
already has stories in it.

### What the free tiers actually cost you

- **1 GB of storage** is about 40 spreads at 25 MB. Delete old issues, or move the
  bucket to a paid tier when you run out.
- **Supabase pauses a free project after ~a week of no activity.** You resume it from
  the dashboard in a click. If that gets annoying over the summer, swap
  `DATABASE_URL` to Neon, which wakes on its own — no code change.
- Vercel functions time out; the digest route asks for 60 seconds, which is far more
  than it needs for two editors.

### Anywhere with a disk

Railway, Render, Fly, or a spare machine: skip Postgres and Supabase entirely, set
`DATA_DIR` to a mounted volume, and point cron at `scripts/digest.mjs`. Same code.

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
