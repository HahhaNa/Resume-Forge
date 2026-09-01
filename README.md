<div align="center">

# Resume Forge

**Write each bullet point once. Build a different résumé for every kind of job. Keep track of where you sent them.**

[**▸ Open the app**](https://resume-forge-blond.vercel.app) · [User guide](docs/guide.md) · [Architecture](docs/architecture.md)

Free · open source · no sign-up · nothing leaves your browser unless you connect your own model

</div>

<!--
  TODO: drop a screenshot of the Resume tab here, e.g.
  ![Resume Forge](docs/screenshot.png)
  Don't use _preview_air-1.png — that's a real résumé with real contact details.
-->

---

## What it does

Most job hunts end up with four résumé files that slowly drift apart. You fix a typo in one and
forget the others; a company emails back and you can't remember which version they read.

Resume Forge keeps **one library of everything you have ever done**, and treats each résumé as a set
of tick-boxes over that library.

| | |
|---|---|
| **One library, many résumés** | Write a bullet once. Tick it into whichever résumés carry it. There is only ever one copy of the text. |
| **Real LaTeX output** | The app writes LaTeX and hands you a `.tex` or an [Overleaf](https://www.overleaf.com) link. You never have to read it. |
| **A page counter that doesn't lie** | The live preview is measured against real LaTeX geometry, so `0.94 / 1` genuinely fits and `1.03 / 1` genuinely spills. |
| **Tailored to one posting** | Paste a job description — or a link, on the boards that can be read — and it fills exactly one page with the lines of your own history that answer it, then lists the requirements **nothing** of yours answers. |
| **Reworded, never invented** | A line can be reworded to speak the posting's language. A guard refuses any rewrite that adds a number, tool or name the original did not have, so the wording moves and the claim does not. |
| **Gaps across every posting** | Ask that same question of every role you have applied to at once: what you keep failing to answer — and which projects would close the most of it, counted against the applications each would have helped. |
| **Application tracker** | Paste a job link; company, role and ATS are read from the URL. Each row freezes the résumé you actually sent. |
| **Practice tracker** | LeetCode, NeetCode, Deep-ML, HDLBits. Cross-referenced against the topics on the jobs you applied to. |
| **Your data stays yours** | No account and no database. Your résumé lives in your browser and is exportable as one file; the two server routes fetch public pages and hold nothing. |

It **never invents a claim.** Every fact on the page is one you wrote. A bullet can be reworded to
match a posting's vocabulary, but nothing is applied until you accept it, and a rewrite that smuggles
in a number or a tool the original did not have is refused rather than offered.

Tailoring works with no setup at all, matching on keywords. Connect a model — Claude, ChatGPT, or an
open model on your own machine via Ollama — and it matches on meaning instead.

---

## How it works

The Tailor tab is the part worth reading code for.

```mermaid
flowchart LR
  S([start]) --> read
  read["<b>read</b><br/>posting → requirements"] --> recall
  recall["<b>recall</b><br/>BM25 over your own bullets"] -->|Send × N| judge
  recall -.->|no model connected| score
  judge["<b>judgeOne</b><br/>one per requirement,<br/>in parallel"] --> fit
  score["<b>score</b><br/>retrieval only"] --> fit
  fit["<b>fit</b><br/>knapsack onto one page"] --> critique
  critique{"<b>critique</b><br/>anything unanswered?"} -->|terms not yet searched| widen
  critique -->|no, or nowhere new to look| E([done])
  widen["<b>widen</b><br/>add the model's own keywords"] --> recall
```

Seven nodes, one loop, built on LangGraph. Four things about it are worth a line each:

- **`critique → widen → recall` is what makes it an agent, not a pipeline.** The first search uses
  the posting's own words, so the requirement it cannot answer is exactly the one whose evidence is
  phrased differently in your library. Unanswered requirements get searched again with terms the
  model proposed. At most two rounds, and only when there is somewhere new to look.

- **The judge fans out, one call per requirement.** One call holding a dozen rubrics drops rows
  invisibly — a missing row and a zero are the same thing downstream. N small calls cost nearly the
  same as one, because every judge is handed the *whole* shortlist, which keeps the prompt prefix
  byte-identical and cacheable. The agent log prints the provider's own `cache_read` count, so that
  is a measurement rather than a claim. `lib/fanout.test.ts` asserts the prefix property directly.

- **The model ranks; it never packs.** Ask a model to fill exactly one page and it agrees,
  confidently, at 1.3 pages — nothing in a prompt can see a line break. `fit` is a knapsack with
  setup costs, against geometry re-derived from the same table the LaTeX preamble is built from. It
  agrees with the whole-document estimate to 1e-6.

- **Where it writes, the writing is checked.** Two things here generate rather than select —
  rewording a line, and proposing a project to close your gaps — and both are split the same way:
  the model produces the prose, and the part that would be confidently wrong is computed in code
  instead. A rewrite's checkable facts must be a subset of what licenses them; a number has to come
  from the original line, while a tool or a name may also come from that entry's own org, title and
  tags. The posting is never a licence — an advert saying TensorRT must not be what puts TensorRT on
  your résumé. Likewise a suggested project names which gaps it closes, and *how much that is worth*
  is counted from your own applications rather than asserted: "3 applications · 2 required", every
  name traceable to a row on the same screen. `lib/rephrase.test.ts` tests the guard against a model
  that embellishes, which is the realistic failure rather than the adversarial one — though a *test*
  is not the *eval* that `lib/eval/` is for the matcher, and
  [docs/architecture.md](docs/architecture.md) says so rather than letting the distinction slide.

- **The posting is untrusted input.** It is pasted from a job board, nobody reads all of it, and it
  goes straight into a prompt. The prize for an attacker is the *scores* — talk a judge into
  crediting everything and the honest gap report becomes a lie. So a requirement is bounded to 120
  characters and ten terms before it can reach a judge, and a judge crediting more than half your CV
  for one requirement is disbelieved and replaced with lexical scoring, which cannot be talked into
  anything. `lib/injection.test.ts` runs a hostile posting through the real graph.

### It is measured, not asserted

`lib/eval/` is an answer key: five postings' worth of requirements hand-labelled against a fixed
fifteen-line CV. Each requirement carries the lines that genuinely **are** evidence, and **traps** —
lines on the same topic that are not. Traps are the half that matters: a matcher that returns
everything on the right topic scores perfectly on recall and is useless.

```
case               shortlist    recall   precis.     traps      gaps
ml-inference            100%       56%       56%        0%      100%
frontend                100%       67%      100%        0%      100%
hardware                100%       75%       75%        0%      100%
vocabulary-gap          100%        0%        —         0%        0%
off-domain                —         —         —         —       100%
total                   100%       55%       71%        0%       88%
```

| | |
|---|---|
| **shortlist** | did retrieval put the evidence in front of the judges at all — the ceiling on everything else |
| **recall** | of the lines that are evidence, how many were credited |
| **precision** | of the lines credited, how many the key agrees with |
| **traps** | of the predicted over-claims, how many were made *(lower is better)* |

Retrieval mode needs no key and takes a fifth of a second, so it runs in `npm test` on **every
commit**. `npm run eval` prints the report in full; `EVAL_MODEL=… npm run eval` runs the same key
through a provider.

Three findings it produced:

- **It overturned a constant.** The evidence threshold had been `0.2`, set by feel against two
  postings tried by hand. `0.14` beats it on **all four columns at once** — not a precision/recall
  trade, just a worse number that nothing before this could detect.
- **Retrieval is not the bottleneck.** Every labelled line reaches the judges, which is the argument
  against reaching for embeddings over a corpus this size.
- **`vocabulary-gap` scores zero and stays in the report.** It is the case where posting and CV
  describe the same work in different words, and the test asserts it *keeps* failing. Deleting it
  would raise the average and hide the one thing a model is actually for.

### The stack

Next.js 15 (App Router) · TypeScript · Tailwind · Zustand · LangChain + LangGraph. About 18k lines,
**330 tests**, with typecheck, tests and build in CI on every push.

```
app/             one folder per tab, plus the two API routes — the only server code here
components/      AppShell, résumé preview, entry editor, shared UI

lib/agent.ts     the graph above
lib/retrieve.ts  BM25 with an alias pass. No embeddings: a few hundred short documents
                 written by one person is the size where lexical search wins outright
lib/fit.ts       the knapsack that fills exactly one page
lib/gaps.ts      the same question asked of every posting at once
lib/jd.ts        read a posting off a link, from an allowlist of hosts it may read
lib/rephrase.ts  reword a line; refuse anything new in it
lib/suggest.ts   what to build, with the payoff counted rather than claimed
lib/untrusted.ts sanitise · fence · bound — the trust boundary
lib/llm.ts       Claude · ChatGPT · Ollama · any OpenAI-compatible server, from the browser
lib/eval/        the answer key
lib/*.test.ts    the pure half, under test — npm test
```

`lib/resume.ts`'s `resolve()` is the single source of truth: the on-screen preview and the exported
LaTeX both read from it, so what you see is what compiles.

**The full version — the data model, why there is no backend, what is deliberately *not* built, and
the plan for mobile and sync — is [docs/architecture.md](docs/architecture.md).**

---

## Five minutes to your first résumé

1. **[Open the app](https://resume-forge-blond.vercel.app).** You land on a made-up candidate's data,
   just so the screens aren't blank. Nothing is saved anywhere but your own browser.

2. **Data tab → `Choose a backup file`.** Save it somewhere that syncs — iCloud, Dropbox, OneDrive,
   Drive. Every edit is written there a second later, so your browser is never the only copy.
   *(Chrome or Edge. On Safari and Firefox use `Export JSON` instead — the app will remind you.)*

3. **Put your own details in** — name, email, phone, links.

4. **Replace the demo content.** Either **Import a résumé** (drop in your existing PDF or `.tex` and
   it pulls out the entries and bullets), or edit the demo entries on the Resume tab directly.

5. **Tick the bullets you want** and watch the preview. Keep trimming until the page counter goes blue.

6. **Export.** `Download .tex` for Overleaf, or `Open in Overleaf` to skip a step. It compiles as-is.

For a second résumé: duplicate the variant, untick what doesn't apply. A minute, not an afternoon.

---

## Where your data is kept

There is no server and no database. Everything is held by your browser, on your machine — and that
survives closing the tab, quitting the browser, and restarting the laptop. What loses it: clearing
your browsing data, a private window, or a week untouched in Safari on an iPhone.

So browser storage is **not a backup**. There are three ways to keep a real copy:

| | How | Good for |
|---|---|---|
| **Backup file** *(recommended)* | Data tab → `Choose a backup file`. Every edit written automatically. | Everyday use. Chrome and Edge. |
| **Export JSON** | Data tab → `Export JSON`. One file with everything. | Safari and Firefox, or a new computer. |
| **Restore points** | Taken automatically before anything destructive. Last 12 kept. | Undoing an hour ago. |

**Pointing two computers at the same synced backup file is also how you use Resume Forge on both.**
When they disagree the app **stops and asks you** which side to keep, showing how many entries and
applications each has. It never merges quietly and never picks for you.

**Undo works everywhere.** ⌘Z / Ctrl+Z, ⇧⌘Z to redo. Sixty steps per session.

**On a phone**, it is honest about being built for a laptop: readable, but the two-pane editor is
cramped and there is no automatic backup file, because phone browsers don't support it. Export a JSON
before you close the tab — iOS deletes a site's storage after seven days away. Making the phone a
real place to log applications is the next big piece of work; the plan is in
[docs/architecture.md](docs/architecture.md).

---

## Questions people ask

<details>
<summary><b>Is my résumé uploaded anywhere?</b></summary>

Never. Nothing about you is sent anywhere you did not ask for, and three things leave at all:

- **`Sync catalogue`** on the Practice tab fetches Deep-ML's public exercise list. It sends nothing
  about you.
- **Reading a posting from a link** asks this app's own server to fetch that public job page. It
  sends the URL you pasted and nothing else — no résumé, no cookies, no key — and stores none of it.
- **The Tailor tab, once you connect a model and switch it on.** Then two things go to the provider
  *you* chose, with *your* key, straight from your browser: the job description, and the résumé
  lines the search shortlisted. Never your applications, your notes, who referred you, or your
  contact details. Your key is kept apart from your résumé data, so it is not in any export, backup
  file or restore point. Pick Ollama and nothing leaves your machine.

Your résumé itself is only ever sent in the third case, and only the lines a search already picked.
</details>

<details>
<summary><b>Do I need to know LaTeX?</b></summary>

No. You never see it unless you go looking. Press `Open in Overleaf` and you get a PDF.
</details>

<details>
<summary><b>Can I share the link with a friend?</b></summary>

Yes, and it's safe. They get their own empty copy in their own browser and cannot see anything of yours.
</details>

<details>
<summary><b>Can I use this for a non-technical résumé? For Chinese?</b></summary>

Non-technical, yes — nothing about the data model is engineering-specific and the template is a
classic one-column-with-dates layout. For CJK the default template can't typeset Chinese; there's a
two-line fix in the [user guide](docs/guide.md#a-chinese-résumé).
</details>

<details>
<summary><b>"I opened the app and everything is gone."</b></summary>

Almost always you're at a slightly different address than last time — browser storage is tied to the
exact address, down to the number after the colon. If you normally use `localhost:3000` and today it
opened on `localhost:3001`, your data is in the other drawer. Reopen it on 3000. This is the best
reason to use the hosted link, whose address never moves.

Otherwise: clearing browsing data loses everything unless you set up a backup file or exported a JSON.
</details>

<details>
<summary><b>The header says <code>backup paused</code> / <code>backup locked</code>.</b></summary>

**Paused**: your backup file and this browser disagree, usually because another computer edited it.
Data tab → pick which side to keep. Nothing is lost until you choose.

**Locked**: the browser dropped permission to write the file, which happens after a restart. Data tab
→ reconnect. One click.
</details>

<details>
<summary><b><code>Sync catalogue</code> does nothing.</b></summary>

Deep-ML's server is unreachable or slow. It is the only external service the app touches and
everything else works without it.
</details>

---

## Run it locally

You don't need to — [the hosted version](https://resume-forge-blond.vercel.app) is the same app and
your data still stays on your machine. This is for people who want to change the code. Node 20+.

```bash
git clone https://github.com/HahhaNa/Resume-Forge.git && cd Resume-Forge && npm install && npm run dev
```

Then open <http://localhost:3000>.

> **Watch the port.** If something else holds 3000, Next quietly starts on 3001 — and because storage
> is per-address, the app looks empty. Use `npm run dev -- -p 3000`, or connect a backup file so it
> doesn't matter.

**Deploy your own copy:** push to GitHub and import at [vercel.com](https://vercel.com), accepting
every default. No environment variables, no database, nothing to configure. Or `npx vercel --prod`.

## Contributing

Issues and pull requests are welcome. Good first areas: résumé templates beyond the default one,
importers for other formats, more job-board URL patterns in `lib/ats.ts`, and translations (strings
live in `lib/i18n.ts`).

Before you open a PR:

```bash
npm run typecheck && npm test
```

They run in a couple of hundred milliseconds, so `npm run test:watch` while you work is comfortable.
The same two commands plus `npm run build` run in CI on every push.

## License

MIT — see [LICENSE](LICENSE). The bundled XCharter webfonts in `public/fonts/` have their own
licence, in `public/fonts/LICENSE.txt`.
