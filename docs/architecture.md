# Architecture

How Resume Forge is put together today, why it has no backend, and what has to change for it to be
as good on a phone as it is on a laptop.

- [The principle](#the-principle)
- [What exists today](#what-exists-today)
- [What is actually wrong](#what-is-actually-wrong)
- [Is a backend hard?](#is-a-backend-hard)
- [The target design](#the-target-design)
  - [1. Delete the server](#1-delete-the-server)
  - [2. One storage port, three adapters](#2-one-storage-port-three-adapters)
  - [3. Make records mergeable](#3-make-records-mergeable)
  - [4. Sync](#4-sync)
  - [5. Mobile is a different app shape](#5-mobile-is-a-different-app-shape)
- [Roadmap](#roadmap)
- [Decisions we are deliberately not taking](#decisions-we-are-deliberately-not-taking)

---

## The principle

Two goals, and they pull against each other:

1. **Work must never be lost.** Someone spends an evening tuning a résumé onto one page. That has to
   survive a closed tab, a flat battery, a new laptop, and a clumsy click.
2. **Nobody should have to trust us with their job hunt.** Which companies you are talking to, who
   referred you, what you wrote about being rejected — a tool that holds all of that on someone
   else's database is a worse product, not a more capable one.

Durability wants copies everywhere; privacy wants copies nowhere but yours. The line this project
draws between them is **not "no servers"** — it is:

> A server may exist. It may never hold anything it can read, and it may never be required to use
> the app.

That permits a great deal, including proper phone↔laptop sync. It rules out exactly one thing:
accounts on a database we operate. [Is a backend hard?](#is-a-backend-hard) works through why.

---

## What exists today

```mermaid
flowchart LR
  subgraph Browser
    UI[React tabs] --> Z[Zustand store]
    Z --> LS[(localStorage<br/>one JSON blob)]
    Z --> BK[backup.ts]
    BK --> FH[(File System Access<br/>handle in IndexedDB)]
  end
  FH -.->|written every 1s| F[/resume-forge.json<br/>in iCloud or Dropbox/]
  F -.->|read on launch| BK
  UI -->|only on 'Sync catalogue'| PX[/api/deepml]
  PX --> DM[(Deep-ML public API)]
  UI -->|only if a model is connected| LM[lib/agent.ts]
  LM -.->|posting + shortlisted bullets<br/>user's own key, no proxy| PR[(Claude / OpenAI / Ollama)]
```

| Piece | Where | Notes |
|---|---|---|
| Source of truth | `lib/store.ts` → Zustand + `persist` | One `DB` object, `localStorage["resume-forge"]`, schema v2 |
| Derived output | `lib/resume.ts` `resolve(db, variant)` | Preview and LaTeX both read this — they cannot disagree |
| Durability | `lib/backup.ts` | Whole blob written to a user-picked file, 1s debounce; handle in IndexedDB |
| Sync | The file, in a cloud-synced folder | Desktop ↔ desktop only |
| Conflict | Halt and ask | Never merges, never guesses |
| Server | `app/api/deepml/route.ts` | 60 lines, read-only, no state, no key |
| Tailoring | `lib/agent.ts` → `retrieve.ts` + `pack.ts` | Off by default; keyword-only without a model; the key lives outside `DB` |
| Model calls | Browser → provider, direct | User's own key and account. No route of ours is in the path |

That is the whole system. It is genuinely small, and the small size is worth defending.

---

## What is actually wrong

Five things, roughly in order of how much they hurt.

**1. On a phone, data can just vanish.** Phone browsers have no File System Access API, so
`localStorage` is the *only* copy. iOS then deletes a site's script-writable storage after seven days
without a visit. Someone who logs ten applications from the train and comes back a fortnight later
finds nothing. This is silent, it looks like a bug in us, and it is currently unmitigated.

**2. One API route costs the whole static story.** `app/api/deepml/route.ts` is the only reason this
project needs a Node runtime at all. Because it exists, the app cannot be built with
`output: "export"`, which means it cannot go on GitHub Pages, cannot be dropped on any static host,
and cannot be self-hosted by anyone who isn't comfortable running a Node process. The route earns
none of that: it forwards four fixed public URLs.

**3. `localStorage` is the wrong substrate.** It is synchronous, capped around 5 MB per origin, and
the `persist` middleware re-serialises the *entire* database on every change. Application snapshots
each hold a full `.tex` (~10 KB); a hundred applications is a megabyte before you count anything
else. It is also the first thing a browser throws away under pressure.

**4. Halt-on-conflict does not survive a third device.** Two desktops that take turns are fine. Add a
phone and the normal case becomes "phone added an application, laptop edited a bullet" — genuinely
concurrent, genuinely non-overlapping, and the app stops and makes you throw one side away. The
current behaviour is right for a whole-file blob; the blob is the problem.

**5. The mobile layout is a shrunk desktop.** There are about eighteen responsive utilities across
~3,800 lines of page code. `app/page.tsx` collapses `lg:grid-cols-[1.28fr_minmax(430px,1fr)]` into a
stack, which is a fallback, not a design.

Note what is *not* on this list: the data model, `resolve()`, the import pipeline, the ATS URL
parser, the undo system. Those are good and should not be touched.

---

## Is a backend hard?

### First, what actually survives what

Worth stating precisely, because the intuition is usually wrong in both directions.
`localStorage` is on disk, not in memory. Today, with no backup file connected at all:

| | Survives? |
|---|---|
| Close the tab | ✅ |
| Quit the browser | ✅ |
| Restart or shut down the machine | ✅ |
| Battery dies mid-edit | ✅ — every change is written immediately |
| Browser crashes | ✅ |
| Open it on `:3001` instead of `:3000` | ⚠️ looks empty, **nothing is lost** — it is in the other origin's storage |
| "Clear browsing data" including site data | ❌ gone |
| Private / incognito window | ❌ gone on close |
| iOS Safari, seven days without a visit | ❌ gone |
| A different browser, or a different machine | ⚠️ that is a separate copy, not the same one |

So the frightening scenario — spend an evening on it, shut the laptop, come back to nothing — **does
not happen today.** The genuine losses are a deliberate cache clear, incognito, and the iOS timer.
The one that *feels* like catastrophe and is not is the port change, which is why it earned a
section in the README.

None of that makes the current setup good enough. Three of those rows should not be ❌ or ⚠️, and one
copy on one machine is one hard-disk failure from zero. But it does mean this is a **durability
gap to close deliberately**, not a fire.

### Two things get called "a backend"

They differ by roughly two orders of magnitude in what they cost you.

#### The kind with accounts — Supabase, Firebase, your own Postgres + auth

**Building it is not that hard.** Supabase hands you auth, a table and row-level security. Someone
who has never done backend work, with an AI assistant, has a working happy path in two or three days.

**Owning it is hard, and it never stops.** You become the custodian of other people's interview
pipelines — who they are talking to, who referred them, what they wrote after a rejection — with the
breach and deletion-request obligations that implies. Free tiers run out and someone has to pay.
Password resets need deliverable email. Accounts get locked and spam signups arrive. And on the day
you lose interest in the project, everyone's data is stranded behind a login only you can operate.

Then the part that matters most for your actual question: **every person who forks this repo would
have to provision their own Supabase project and set environment variables before the app would run
at all.** Adding this kind of backend does not fix "the backend is hard to set up" — it is the thing
that would finally make that sentence true. Today the setup burden is one 60-line file that
[phase 0](#roadmap) deletes.

**Verdict: no.** The cost is ongoing and mostly non-technical, and the benefit — durability — is
available for far less.

#### The kind with no accounts — a dumb encrypted box

The entire server:

```
PUT /:id    store these bytes
GET /:id    give them back
```

No login. No user table. No schema. It cannot read what it holds, because the browser encrypts
before sending and decrypts after fetching; to the server it is noise.

How it feels to use: on the laptop, press **Sync to my phone**. The app generates a random sync
code, derives a key from it, and shows a QR code. Point the phone at it. That is the whole setup —
no email, no password, no account, nothing to remember.

Honest effort:

| Piece | What it actually is | Time |
|---|---|---|
| The server | A Cloudflare Worker + KV. `npx wrangler init`, ~80 lines, `npx wrangler deploy` | an afternoon |
| Encryption | WebCrypto — PBKDF2 to turn the sync code into a key, AES-GCM to seal the blob. ~60 lines | a day, mostly reading |
| Pairing | QR out, camera in | a day |
| Merge | `lib/merge.ts` — required for *any* sync, see [§3](#3-make-records-mergeable) | two days |

**Running cost: zero.** Cloudflare's free tier is 100,000 requests a day and this app makes a
handful per session. Nothing to keep alive, no OS to patch, no migrations, no backups to take —
if the Worker vanished tomorrow every user's data would still be in their browser and their backup
file, because sync is a convenience layer and never the source of truth. That property is what makes
the whole thing cheap to own.

**Verdict: yes**, once phone↔laptop sync is the priority. It is about a week, not a project — but
[§4](#4-sync) puts the user's own cloud ahead of it, on rescue rather than on cost.

### The thing worth holding on to

The fear is losing work. **A backend does not fix that — a second copy does.** A server is one way
to hold a second copy, and for a phone it is the most practical one. But it is not the fastest fix,
it is not the fix to reach for first, and the account-shaped version would make the project harder
to use rather than safer.

| What you are afraid of | What actually fixes it | Cost |
|---|---|---|
| Closing the tab / shutting down | Already fine | — |
| Clearing browsing data by accident | The backup file, made non-optional | an afternoon |
| Laptop dies / gets stolen | Backup file in a synced folder | already built |
| Phone data evaporating after a week | Installable PWA + IndexedDB | a weekend |
| Editing on the phone and the laptop | Mergeable records, then sync | ~a week |

Only the last row needs a server at all.

---

## The target design

```mermaid
flowchart TB
  subgraph Client["Static bundle — no server"]
    UI[UI: desktop shell / mobile shell]
    UI --> ST[Zustand store<br/>records with updatedAt + deletedAt]
    ST --> PORT{{Storage port}}
    PORT --> IDB[(IndexedDB<br/>source of truth)]
    PORT --> FILE[(File handle<br/>Chrome/Edge desktop)]
    PORT --> REMOTE[(The user's own cloud<br/>Drive / Dropbox app folder)]
    ST --> MERGE[merge.ts<br/>per-record LWW]
    MERGE --> PORT
  end
  CAT[/public/catalogue/deepml.json<br/>refreshed by GitHub Action/] --> UI
```

### 1. Delete the server

Replace the live proxy with a build-time artefact.

- A scheduled GitHub Action (weekly) fetches Deep-ML's four catalogues, writes
  `public/catalogue/deepml.json`, and opens a commit if it changed.
- `lib/deepml.ts` gains a third tier in front of the two it already has: **static file → direct fetch
  (refresh, works on `localhost:3000` where their CORS allows it) → nothing**. Delete `PROXY`.
- `next.config.mjs` gets `output: "export"`, `images: { unoptimized: true }`.
- Add `.github/workflows/pages.yml`. Deploy on push to `main`.

What this buys, all at once:

| | Before | After |
|---|---|---|
| Hosting | Vercel, or Node somewhere | Any static host, incl. GitHub Pages |
| Self-host difficulty | `npm install && npm run build && npm start`, keep a process alive | Copy a folder |
| `Sync catalogue` | ~40 requests fanned out, several seconds | One file, already cached |
| Offline | Fails | Works |
| Catalogue freshness | Live | Up to a week stale — irrelevant for a problem list |

Server-side code in the repo after this: **zero files.** That is the honest answer to "the backend is
hard to set up" — there stops being one.

### 2. One storage port, three adapters

Introduce `lib/storage/port.ts`:

```ts
export interface StoragePort {
  id: "idb" | "file" | "gist" | "drive";
  load(): Promise<DB | null>;
  save(db: DB): Promise<void>;
  /** null when the remote cannot tell us cheaply */
  remoteStamp(): Promise<string | null>;
}
```

- **`idb`** — IndexedDB via `idb-keyval` (~600 bytes), replacing `localStorage` as the source of
  truth. Async, effectively unbounded, and pairs with `navigator.storage.persist()` to ask the
  browser not to evict us. Migrate on first load: if `localStorage["resume-forge"]` exists, read it,
  write it to IDB, leave the old key alone for one release.
- **`file`** — today's `backup.ts`, unchanged behaviour, now just one adapter among several.
- **`gist` / `drive`** — see §4.

`backup.ts`'s state machine (`on / off / locked / conflict / error`) generalises to the port and the
header badge keeps working as-is.

**Then make the unsafe state visible.** If the platform has no `file` adapter, no remote is
connected, and the app is not installed to the home screen, that is the vanishing-data case from
above. Say so, once, in plain language, with the two buttons that fix it (Install, or Export).

Add a PWA manifest and a service worker (`next-pwa`, or ~30 lines by hand since the bundle is
static). Installing is not cosmetic here: **an iOS home-screen web app is exempt from the seven-day
storage cap.** It is the cheapest durability fix available and it needs no backend.

### 3. Make records mergeable

Schema v3. Every record in `DB` — entries, bullets, variants, applications, platforms, solves, tags —
gains two fields:

```ts
interface Tracked {
  updatedAt: number;   // Date.now() on every mutation
  deletedAt?: number;  // tombstone; kept ~90 days, then swept
}
```

The store already funnels every mutation through a small number of setters, so stamping is a handful
of lines, not a rewrite. Deletes become tombstones so that "deleted on the laptop" can beat "still
present in the phone's copy" — without tombstones, every sync resurrects everything you removed.

`lib/merge.ts` is then about forty lines: walk both sides by id, keep the higher `updatedAt`, let a
tombstone win over an older edit. Order-bearing fields (a variant's section order) are single
last-write-wins values on the variant record, not merged element-wise.

The conflict UI changes from *"pick a side, lose the other"* to *"merged; 3 things from this device
were superseded — Undo"*. The restore-point machinery already in `lib/store.ts` is exactly the safety
net that makes automatic merging acceptable.

> **Why not CRDTs?** Automerge or Yjs would preserve two people editing the same sentence at the same
> moment. That is the wrong problem: this is a single-user tool across two of their own devices, and
> the realistic conflict is "different records", which per-record LWW handles perfectly. The cost —
> a new dependency, a binary document format, a parallel data model, and a much harder debugging
> story — buys us a case that will occur approximately never. Revisit only if collaboration
> (a mentor editing your résumé) ever becomes a goal.

### 4. Sync

The file-in-a-synced-folder approach stays, and stays the recommendation on desktop. It just cannot
reach a phone: iCloud Drive and Dropbox do not hand a writable file handle to a web page, and mobile
browsers have no picker to give one. So the phone needs a remote.

The question is not which remote is most elegant. It is which one a person can still get their
résumé out of eighteen months later, on a new phone, having forgotten every detail of how this app
worked — including that there was something they were supposed to keep safe.

| Option | Setup the user does | If they forget everything | Verdict |
|---|---|---|---|
| **The user's own cloud** — Google Drive or Dropbox app folder | Sign in to an account they already have | The file is in their own Drive, under a name they can read. They can open it without us, on any device | **Ship this first.** The only option with a recovery story an ordinary person can carry out alone |
| Encrypted blob store + sync code | Scan a QR code | Nothing. The code *was* the key, and there is no reset | **Second**, and an explicit choice rather than the default: for people who would rather no third party held the bytes |
| Private GitHub Gist | Paste a fine-grained PAT | The Gist is in their GitHub account | Developer-facing alternative, and needs no server of ours at all. Token pasting is too much for everyone else |
| Dropbox / Drive via full-account scope | OAuth, in-browser | Same as the app folder | Rejected — asking for the whole Drive to store one file is a worse bargain than the app folder, for identical function |
| WebRTC / P2P | none | — | Rejected — needs a signalling server anyway, and the devices are rarely both awake |
| Hosted DB with accounts | Sign up | A password reset we operate | Rejected — see [above](#the-kind-with-accounts--supabase-firebase-your-own-postgres--auth) |

**Why the sync code lost the default.** It is the better answer on privacy and the better answer on
cost, and it is still worth building. What it cannot do is survive the ordinary case: someone pairs
their phone in March, never thinks about it again, and loses the laptop in October — by which time
the sync code is off a screenshot they deleted, or in a notes app they stopped using. There is no
recovery path *by design*, because that is exactly what "we cannot read it" costs. For a tool used
by people who write LaTeX, that trade is fine and they will keep the code somewhere sensible. For a
tool meant to be handed to a friend who is job-hunting, an unrecoverable secret is not a feature; it
is the failure mode, and it arrives silently, months later, at the worst possible moment.

**The app folder, concretely.** Google's `drive.file` scope grants access to the files *this app
created* and nothing else — not the rest of the Drive, not even a listing of it. That boundary is
enforced by Google rather than by a promise in our README, and because the scope is non-sensitive
there is no verification review to pass: a fork registers its own OAuth client in an afternoon.
Dropbox's app folder works the same way and is the same adapter behind the [storage
port](#2-one-storage-port-three-adapters). What gets written is the same `resume-forge.json` the
desktop backup already writes, so the phone's copy and the laptop's copy are one artefact and
`lib/merge.ts` reconciles both without a second code path.

**What this costs, said plainly.** The file in the user's Drive is *not* encrypted, and it easily
could be — the sealing code is the same either way. The reason not to is the whole argument above:
an encrypted file in their Drive is a file they cannot recover from either, which pays the third
party's price and keeps none of the rescue.

So this is a real change to what the project promises, and it is worth being exact about which
promise. The line in [The principle](#the-principle) is about *us*: no accounts on a database we
operate, nothing readable on a server we run, no login between anyone and their own work. A file in
the user's own Drive breaks none of those — it is a provider they already chose, holding a file they
can see in a folder and revoke in one click. But the README currently says nothing leaves the
browser, and for anyone who switches this on, that stops being true. So: sync stays **off** by
default, the switch says plainly what leaves the browser and where it lands, and the README grows a
sentence. A promise that quietly narrows is worse than one that was never made.

**Two things to get right, whichever adapter is in use:**

- **Sync is never the source of truth.** The local IndexedDB copy is. If Drive is unreachable or the
  Worker is down, the app keeps working and syncs later. Nothing in the UI ever blocks on the
  network.
- **Every adapter is optional, and removable.** A fork with no OAuth client registered simply does
  not offer that option, and nothing else changes. No remote is ever required to open the app, and
  no remote is ever the only place something lives.

### 5. Mobile is a different app shape

Do not responsive-ify the desktop editor. What you do on a phone is not a subset of what you do on a
laptop — it is a different activity.

| | Laptop | Phone |
|---|---|---|
| Write and edit bullets | ✓ the main event | ✗ read-only, "open on a laptop to edit" |
| Tune density, compare variants | ✓ | ✗ |
| Export LaTeX / Overleaf | ✓ | share the PDF or plain text |
| **Log an application you just saw** | ✓ | **✓ the main event** |
| Tick off a practice problem | ✓ | ✓ |
| Check the funnel / review queue | ✓ | ✓ |

So: a mobile shell with a bottom tab bar and three destinations — **Apply**, **Practice**,
**Résumé** (read-only, with a share button). One breakpoint, chosen by container width, not user
agent. The Library matrix and the density controls simply are not there, and the app says why rather
than rendering them badly.

**The feature that makes this worth doing: a Web Share Target.** Once the PWA is installed, register
it in the manifest as a share target for URLs. Then sharing a Greenhouse link from the LinkedIn app
opens Resume Forge with the company, role and ATS already filled in by `lib/ats.ts`. Job spotted to
job logged, four seconds, no typing. That is a demo people screenshot.

Chromium on Android only — iOS does not implement `share_target`. The iOS path is paste-into-quick-add
(which already works) plus, optionally, a published Shortcuts action. Say which is which in the docs
rather than letting an iPhone user wonder why the blog post lied.

---

## Roadmap

Ordered so each phase is shippable on its own and the risky data change lands before there are users
to break.

| Phase | Work | Why now |
|---|---|---|
| **Now** · an afternoon | Make the backup file **non-optional**: offer it on first run, keep a coloured warning in the header until *something* holds a second copy, and stop being quiet about a week with no export | Uses code that already exists, and closes both genuine desktop loss cases today |
| **0** · a weekend | Catalogue → static JSON + weekly Action · `output: "export"` · GitHub Pages workflow · README leads with the hosted link | Removes the setup problem entirely; unblocks every static host |
| **1** · a weekend | Storage port · IndexedDB as source of truth · `storage.persist()` · PWA manifest + service worker · name the unsafe combination out loud | The iOS seven-day case is live right now and completely silent |
| **2** · ~2 days | Schema v3 timestamps + tombstones · `lib/merge.ts` · file backup merges instead of halting | Must precede any sync, and the migration is cheap now and expensive once there are users |
| **3** · ~1 week | Bottom-nav mobile layout · read-only résumé view · share-sheet export · Web Share Target | The phone becomes genuinely useful, not merely survivable |
| **4** · ~1 week | Drive / Dropbox app-folder adapter · OAuth in the browser (`drive.file`) · debounced push, merge on focus · a switch that says what leaves the browser | Phone ↔ laptop, and the user can get the file back without us |
| **5** · later | Worker + KV · WebCrypto seal/open · QR pairing, for anyone who would rather no third party held the bytes · Gist adapter · more résumé templates · a proper docs site | Nice to have, never required |

**Now** is worth doing before anything else on this list: it is a few hours, it needs no new
concepts, and it converts the feature that already exists from something you have to know about into
something the app insists on. Phase 2 is the one to be careful with — write the migration test first.

### For the project's reach

Phase 0 is also the growth work, which is not a coincidence. The thing that makes a repo spread is a
link that works in three seconds on a stranger's phone, and a screenshot above the fold. After that:
a short GIF of ticking bullets and watching the page counter go blue, repo topics, a handful of
`good first issue`s (new templates, more ATS URL patterns in `lib/ats.ts`, translations in
`lib/i18n.ts`), and a `CONTRIBUTING.md`.

---

## Decisions we are deliberately not taking

- **No accounts, and no database that can read what it stores.** A server is allowed; a server that
  could open your applications and read who rejected you is not. Everything else here bends around
  that one line.
- **Sync is never the source of truth.** The local copy is, always. Every remote in this document is
  a convenience that can disappear without costing anyone their data — which is also why none of
  them need an SLA, a backup policy, or an on-call rota.
- **No server-side LaTeX compilation.** Overleaf already does this better and for free, and a
  compile farm is the one feature that would force us to run infrastructure.
- **No CRDT.** See §3.
- **No React Native / native app.** An installed PWA covers the mobile cases above; a second codebase
  does not pay for itself.
- **No telemetry.** Not even anonymous. It is still the case that nothing about how you use this app
  is ever reported to us, and that is worth more than the numbers.
- **A model may be called; it is never ours, and never required.** The Tailor tab sends the posting
  you pasted and the shortlisted lines of your own CV to a provider *you* configured, with *your*
  key, straight from the browser — there is no proxy of ours in the path, so there is no point at
  which we could hold either. It is off until switched on, it degrades to keyword matching when it
  is off, and Ollama makes the whole feature local. The key lives outside the database precisely so
  that exports, backup files and restore points cannot carry it.
- **The model ranks; it never packs, and never writes.** Fitting a page is arithmetic against
  `fit.ts` (`pack.ts` explains why), and every bullet on a tailored résumé is one the user wrote. A
  tool that invents experience is a worse tool, not a more capable one.

---

## Repository layout

```
app/
  page.tsx              resume builder
  library/page.tsx      entry × variant matrix
  tailor/page.tsx       posting -> one tailored page
  applications/page.tsx application tracker
  practice/page.tsx     multi-platform practice tracker
  data/page.tsx         profile, tags, backup file, import/export
  api/deepml/route.ts   the only server code — removed in phase 0
components/
  AppShell.tsx          nav, language toggle, theme toggle
  resume/Preview.tsx    page-accurate live preview
  resume/EntryModal.tsx entry fields + which variants carry it
  resume/CompareVariants.tsx  variant diff
  tailor/Tailor.tsx     paste a posting, read the working, keep the result
  tailor/ModelSettings.tsx  provider, key, model — and what leaves the browser
  ui/bits.tsx           shared inputs, bars, modal
lib/
  *.test.ts             vitest, node environment — the pure modules below
  migrate.ts            persisted state from an older release, brought up to date
  types.ts              the whole data model
  library.ts            entry ↔ variant rules: which section, what order, which bullets
  store.ts              zustand store, persisted
  backup.ts             continuous write to a user-picked file; handle in IndexedDB
  resume.ts             resolve(db, variant) -> LaTeX and preview
  fit.ts                Preview's geometry as arithmetic — how tall, without a DOM
  pack.ts               scores + fit.ts -> exactly one page (knapsack with setup costs)
  retrieve.ts           BM25 over your own bullets; no embeddings, no key, works offline
  agent.ts              the LangGraph loop: read, recall, judge (fan-out), fit, critique
  llm.ts                provider config and the browser-side model client
  import.ts             PDF / LaTeX résumé import
  ats.ts                job-board URL -> company, portal, role
  deepml.ts             Deep-ML catalogues: fetch, cache, search, link → ref
  seed.ts               starter content
  i18n.ts               EN / ZH strings
```

### How tailoring is split

The division of labour is the design, so it is worth stating once:

| Step | Who does it | Why |
|---|---|---|
| Read the posting | model, with a regex fallback | Turning prose into a requirement list is what a model is for; the fallback is what makes the tab work before a key exists |
| Find candidate lines | `retrieve.ts`, BM25 + aliases | A few hundred short documents written by one person. Embeddings would add a provider, a key, a vector store and a round trip to lose on exact terms like `CUDA` or `Verilog` |
| Score them | model, **one judge per requirement, in parallel** | The only genuinely hard judgement: does this line answer that requirement. See below for why it fans out |
| Fill the page | `pack.ts` + `fit.ts` | A model cannot see a line break. Ask one to "fit one page" and it agrees, confidently, at 1.3 pages |
| Report the gaps | `agent.ts` | The output nobody else gives you, and the reason the loop exists |

### Why the judge fans out

Scoring started as one call: every shortlisted line against every requirement, one row of output
per line. Two things are wrong with that. The judge has to hold a dozen rubrics at once, which makes
it worse at each of them; and it has to emit sixty rows, which means it drops some — invisibly,
because a missing row and a zero are the same thing downstream.

So `judge` is a `Send` fan-out: one call per requirement, each asked only *which of these lines are
evidence for this one thing*. The output is a handful of rows instead of sixty, an empty list is a
real answer rather than a malfunction, and each judge has one rubric to apply.

That should cost twelve times as much, and it nearly doesn't:

```
system  ── rubric + every shortlisted CV line ──  identical in all 12 calls  → cached
user    ── one requirement ──                     ~40 tokens, different each time
```

Every judge gets the *whole* shortlist, not the slice retrieved for its own requirement. That is
what keeps the prefix byte-identical, and it is better anyway — a judge can find evidence BM25
ranked low for its requirement and high for someone else's. Anthropic caches that prefix where the
`cache_control` breakpoint marks it; OpenAI caches long prefixes unprompted; Ollama has its own KV
cache. So the run costs one corpus plus twelve short questions.

`usage` carries `cache_read` back from the provider and the agent log prints it, because otherwise
the paragraph above is a claim rather than a measurement. Concurrency is capped (4 by default):
twelve simultaneous requests is a rate limit on a fresh API key and a stalled laptop on Ollama.

The property all of this rests on — that every judge in a run sends the same prefix — is invisible
in the code and holds only because `fanOut` hands each task the same shortlist. `fanout.test.ts`
asserts it directly, with a stand-in model.
