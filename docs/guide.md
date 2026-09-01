# Resume Forge — user guide

The [README](../README.md) gets you to a first résumé. This is the rest: what every tab does, and
the handful of rules that aren't obvious from looking at the screen.

- [Resume](#resume)
- [Library](#library)
- [Tailor](#tailor)
- [Applications](#applications)
- [Practice](#practice)
- [Data](#data)
- [Undo](#undo)
- [A Chinese résumé](#a-chinese-résumé)

---

## Resume

The left pane is the variant you are editing; the right pane is a live, page-accurate preview.

**Variants** are named presets — `hw`, `ml`, `sw` ship by default. A variant is nothing but an
ordered list of sections, the entries inside each section, and the set of bullets that are ticked.
Duplicating one costs nothing.

**Bullets are shared.** Every variant reads from the same library, so fixing a typo or updating a
number fixes it everywhere. Tick a box to include a bullet in the variant you are editing. To put
one entry into several variants at once, use the [Library](#library) tab.

**Tags** are your own vocabulary, edited in the Data tab — the demo ships `hw` / `ml` / `sw` / `tw`,
but rename or replace them and every bullet carrying the old name follows. They are a shortcut, not
a rule: `Tagged /hw` selects every bullet in that entry carrying the current variant's tag; `All`
and `None` do the obvious thing. A variant named after a tag shares its colour.

**`**bold**` inside bullet text** becomes `\textbf{}` in LaTeX and bold in the preview. Use it on
the number that matters, not on whole sentences.

**An entry with zero ticked bullets disappears** from the output. That is deliberate — it is how you
drop a project from one variant without deleting it.

**Page fill** is calibrated against real `pdflatex` output, so `0.94 / 1` means it genuinely compiles
to one page and `1.03 / 1` means it genuinely spills. Trim until it goes blue.

**Density / font size** are the last resort, not the first. Cut a bullet before you shrink type.

**⇄ Compare** puts this variant next to another one and shows only where they disagree — entries one
carries and the other does not, and, for the entries both carry, the bullets each one ticks alone.
What they share is a single number at the top. This is the view for tailoring the second résumé,
when the question is "what does `/ml` say that `/hw` doesn't".

### Getting it out

- **`Copy .tex` / `Download .tex`** — the LaTeX source. This is the one to send.
- **`Open in Overleaf`** — posts the source straight into a new [Overleaf](https://www.overleaf.com)
  project. It compiles with pdfLaTeX as-is; you don't have to install anything.
- **`Print / Save PDF`** — renders the on-screen preview from the browser. Fine for a quick look,
  but the LaTeX output is the one to send.
- **`Copy text`** — for the other thing application forms ask for: the "or paste your résumé here"
  box. Copying out of the PDF interleaves the two columns into nonsense, so this generates the same
  résumé as plain text — no columns, no tabs, no bold markers, hyphens for bullets, section titles
  in caps.

The generated `.tex` is self-contained: preamble, macros, and content in one file, with the variant
name, build date, and the list of included bullet ids in a header comment.

---

## Library

The Resume tab shows one variant at a time, which makes adding a new experience feel like it has to
be done once per résumé. It does not. Entries and bullets live once in the library and a variant
only holds references, so this tab is that library seen from above: every entry down the side, every
variant across the top, one cell for each pair.

**A cell is a reference, not a copy.** Ticking a cell files that entry into that variant — editing
the text anywhere changes it everywhere, because there is only one copy.

**`⊕` on a row puts the entry in every variant at once**, and `⊖` takes it out of all of them. That
is the answer to "I just did a new internship and there are five résumés".

**The cell reads `2/5`** — bullets switched on, out of bullets the entry has. A dashed `+` means the
variant does not carry it at all.

**An amber `0/5` is the trap worth knowing**: the entry is filed in that variant but no bullet is
ticked, so it gets dropped and silently will not print. Expand the row and tick one. Education and
awards are exempt — they print with no bullets.

**Adding to a variant picks the section for you**: the same-titled section that holds it in another
variant, else the section already full of that kind, else a new one named after the kind. Order is
mirrored from a variant that already lists it, so a fresh add is not stranded at the bottom. Bullets
tagged with the variant's slug switch on; if none carry the tag, all do.

**Expand a row** to get the bullets, with a checkbox per variant. Ticking a bullet in a variant that
does not carry the entry pulls the entry in too, rather than leaving a tick that renders nothing.

**`Missing somewhere` and `In no variant`** are the two filters that matter: the first is what you
have not finished distributing, the second is what you wrote and then forgot entirely.

The bottom row is what each variant actually renders — entries and bullets after the empty ones are
dropped.

The same variant checkboxes are on the ✎ entry editor, so a new entry can be pushed to every résumé
without leaving the Resume tab.

---

## Tailor

Paste a job description. You get back a proposal for a one-page résumé aimed at it, plus the working
behind that proposal.

What happens, in order: the posting is turned into a list of the capabilities it asks for; your
bullet library is searched for lines that answer each one; the lines are scored; and then the page is
filled with the best of them, stopping at exactly one page. If a required capability ends up with
nothing on the page answering it, the posting is searched again with different words before it gives
up and reports the gap.

**The gap list is the part worth reading.** Everything else is a résumé you could have assembled by
hand with enough patience. "Nothing in your library answers this" is the thing you cannot see by
looking at your own CV, and it is better to find out now than in the interview.

**Nothing is written until you press `Create variant`.** Up to then this is a suggestion. What you
get is an ordinary variant — same as one you built by hand, editable on the Resume tab, deletable,
undoable. Only the typography, margins and header row are inherited from the variant you started
from; the section list and the ticks are the ones just computed.

**It never invents a claim.** It selects; it does not draft. A résumé that says something you did not
do is a worse outcome than a résumé with a gap in it.

### Rewording a line for the posting

Next to each line on the page there is a `Reword` button, once a model is connected. It rewrites that
one sentence in the posting's vocabulary — "cut decode latency" for a posting that says "LLM
inference optimisation" — and shows the result under the original for you to accept or ignore.

**The facts cannot move, only the words.** Before a rewrite is offered it is checked against the
original, and refused outright if it introduces:

- **a number** the original did not have — 40%, 7B, p99, three weeks. These come from the original
  line or nowhere. No amount of surrounding context makes up a figure nobody measured.
- **a claim of magnitude, primacy or seniority** — `doubled`, `eliminated`, `first`, `sole`, `led`,
  `owned`, `architected`. These are the ones that get caught in an interview, and they are as
  protected as numbers: an entry tagged `ml` does not make you the person who led the team.
- **a tool, language or company name** that neither the line nor its entry mentions. A name *may*
  come from the entry's own org, title or tags — a bullet under *ML Systems Intern* tagged `llm` is
  about LLM work whether or not it uses the letters — but **never from the posting**. An advert
  asking for TensorRT is not permission to put TensorRT on your résumé.

A refused rewrite is still shown, with what it tried to add. There is no "accept anyway": the Resume
tab already lets you edit any bullet by hand, and a sentence you typed yourself is one you have read.

**A rewording belongs to the résumé, not to the library.** The original bullet is untouched and every
other variant goes on saying what it said. The page counter reads the new wording, so a rewrite two
words longer shows up as a fuller page rather than a surprise at the bottom of the second one.

**Keep the posting.** Under the results there is a box that files the posting under an application —
an existing row, or a new one it fills in from the link. Worth doing every time, for two reasons: the
advert comes down the week they fill the role, and the [Applications](#applications) tab can only read
back postings that were kept. A link on its own is not enough; nothing here can fetch a job page.

### With and without a model

The tab works with nothing connected. It matches on keywords, and it is honest about it: the banner
says so, and the scoring is stricter about what counts as an answer, because a word in common is not
evidence.

Connecting a model changes the two steps that need judgement rather than lookup — reading the posting,
and deciding whether a line really answers a requirement. The second of those runs as one call per
requirement, in parallel, so each judge has a single thing to weigh; the agent log shows how many
calls that took and how much of the input the provider served from its cache. Four options:

| | Where it runs | Key |
|---|---|---|
| **Claude** | Anthropic | Yours |
| **ChatGPT** | OpenAI | Yours |
| **Ollama** | Your own machine | None |
| **OpenAI-compatible** | Wherever you point it — vLLM, LM Studio, llama.cpp, Together, Groq, OpenRouter | Depends |

The model list is fetched from the provider rather than typed, so it cannot go stale. `Test` saves
and tries the connection in one step — a key that was saved but never tried is a setting that looks
finished and fails halfway through a run.

**What is sent, when a model is connected:** the posting you pasted, and the résumé lines the search
shortlisted. That is all. Not your applications, not your notes, not who referred you, not your
contact details. The panel says the same thing on screen before you run anything.

**Where your key is kept:** its own corner of browser storage, deliberately *not* part of your résumé
database — so it is never inside an export, a backup file, or a restore point. `Forget key` removes
it. Pick Ollama and nothing leaves your machine at all.

### When the page does not fill

The percentage is measured the same way the Resume tab's page counter is, so `88%` here means the
same thing there. If it comes back low, the library did not have enough that scored well enough —
either the posting is far from your experience, or the bullets that would answer it are worded in
vocabulary the search does not connect. Adding a tag to those bullets and putting it in `Focus tags`
is the quickest fix. So is connecting a model.

---

## Applications

The quick-add row is the normal way in: paste the job link and the company, and the application
system (the "ATS") and often the role are read straight out of the URL — Greenhouse, Lever, Ashby,
Workday, Workable, SmartRecruiters, Taleo, iCIMS, Cake and a dozen more, plus the company's own
careers page as a fallback. Nothing is fetched; the company name is simply in the path. Fill in what
is missing, press Enter, done.

The full form is still behind ✎ when you want the portal, the referral and the next-action date, and
it keeps the rarely-used half folded away under "More details".

**The snapshot is taken for you.** Every row records which variant you used, and the first time an
application moves out of `saved`, the exact `.tex` and the exact list of bullet ids are frozen onto
that row. Moving it further down the funnel never overwrites that — what was sent was sent. Change
your résumé as much as you like afterwards; the snapshot still shows what that company received.
**Lock snapshot** is still there by hand, for rows that predate the automatic one.

The funnel, the response rate, and the per-variant comparison are computed from the rows, so once
you have twenty applications you can see whether `hw` or `ml` is actually getting callbacks.

`Prep topics` on an application feeds the [Practice](#practice) tab.

### What every posting keeps asking for

At the foot of the tab is the one thing the Tailor tab cannot do on its own: **Read every posting**
takes every application with a posting filed against it, tailors your résumé to each in turn, and
adds the results up. A blue dot beside a company name means that row has a posting to read.

Two lists come out.

**What goes unanswered** is the useful one — it is the list of what to go and build. Requirements are
folded together first, so three companies asking for "CUDA kernels", "GPU performance work" and
"experience writing CUDA" count as one thing asked three times rather than three things asked once.
Each row separates two counts that look alike and are not:

- *nothing you have written answers it* — a real hole. This is the build-next list.
- *answered in your library, but it did not fit the page* — you have the line; the page was full. A
  shorter variant or a two-page target fixes it, and writing something new does not.

**Roles you already answer** ranks the postings by how much of each one your page actually answered,
counting a required item twice, measured against the résumé that row records — what you actually
sent, not a variant chosen for the report.

It costs what it says. Each posting is a full tailoring run, so with a model connected the button
tells you roughly how many calls it is about to make; results appear one posting at a time and
**Stop** keeps what has been read so far. With no model connected it runs on keyword matching alone,
for free, and says so — the folding is weaker that way, because the requirements it has to compare
are whole sentences lifted out of the advert rather than short capabilities.

---

### What to build next

Under the gap list there is a `Suggest projects` button. It reads the gaps nothing of yours answers
and proposes three to five projects — each one finishable by one person in a few weeks, and chosen to
close several gaps at once rather than one gap well.

**The model proposes; the arithmetic is done here.** Beside each project is something like
`3 applications · 2 required`, followed by the company names. That count is not the model's estimate.
It is counted from the postings on this screen — the ones that asked for those gaps and had nothing
of yours answering them — and every name in it is a row you can scroll up and find. A project the
model justified with a requirement nobody actually asked for is dropped rather than shown.

It suggests things adjacent to what you already do, on the grounds that a project starting from what
you know is one you finish and a project starting from nothing is a new year's resolution.

## Practice

Platforms are user-defined — LeetCode, NeetCode, Deep-ML, and HDLBits are seeded, but the
`+ Add platform` button takes anything (name, URL, kind, target count, colour). Progress, activity,
and the review queue all aggregate across platforms.

### Deep-ML is wired to the real catalogues

All four of them, not just `/problems`:

| | count | url |
|---|---|---|
| problems | ~1230 | `/problems/<id>` |
| project steps | ~1000 | `/projects/<project>/step/<step>` |
| maths | ~31 | `/math-problems/<id>` |
| labs | ~38 | `/labs/<id>` |

Press `Sync catalogue` once and the quick-add box becomes a search over all of it: type an id, a few
words of the title, the project name — or **paste the Deep-ML link you have open**, which resolves to
exactly that item. Press Enter and the ref, title, URL, difficulty and category all come from
Deep-ML. Steps are stored as `Project name · step name` so a row still means something on its own.
Refs are namespaced (`M1`, `L1`) so the four catalogues cannot collide.

The catalogue is cached in its own browser-storage key, outside your exported JSON. What it cannot
know is which items you have *finished* — that sits behind Deep-ML's login — so ticking them off is
still your call. No other platform publishes a usable open endpoint; they stay manual.

### The rest

**Bulk paste** takes `ref | title | difficulty | topic, topic` one per line — the fastest way to
backfill what you have already solved. On Deep-ML a bare ref or a pasted link on its own line is
enough.

**Gaps vs. your active applications** cross-references the topics you listed on open applications
against what you have actually practiced, sorted by what you have practiced least. This is the point
of putting the two trackers in the same app.

**Review queue** uses simple spaced repetition (1 / 3 / 7 / 16 / 35 days by how the attempt felt).

---

## Data

Profile fields, the tag vocabulary, the backup file, JSON export/import, and reset. The exported
JSON is the whole database, so importing it on another machine moves everything.

### Backup file

Browser storage is not a backup: it belongs to one web address and any cleanup takes it with it.
Press `Choose a backup file`, put the file somewhere that syncs — iCloud Drive, Dropbox, a
git-tracked folder — and every edit is written to it a second later. The header says `saved · file`
once it is running.

This needs the File System Access API, so **Chrome and Edge only**; Safari and Firefox show the
manual export with a warning once it goes a week without one.

That file is also how two machines share a job hunt. Each one connects to the same synced file, and
on launch the app compares the file against what that browser holds:

- same, or the file is empty → backup resumes silently
- different → writing **stops** and you pick, with the entry and application counts of each side
  shown on the buttons

It never merges and it never picks for you. Two machines editing between syncs is a genuine fork,
and the only way to actually lose work here would be to guess at it.

### Importing a résumé

Three destinations, because "I already have a résumé" usually does not mean "start my library over":

- **Replace /hw** — the common one, and the default. Keeps your library and every other variant;
  only the variant you are standing on changes, and it keeps its own slug, label, density and page
  target. Use this when the import *is* what that one variant should say.
- **Add to my library** — files the import alongside what you have, under a new variant.
- **Replace everything** — throws the library away. It asks first, and it is rarely what you want.

All three take a restore point, and all three are one Undo away.

### Restore points

Importing a résumé with "Replace everything" throws away the current entries, skills and variants —
so a copy of the whole database is taken first, and the same goes for a JSON import, a reset, and any
deletion that carries a lot with it: an entry and its bullets, a variant, a platform and its solve
log, a tag. Undo is offered on the spot when the import finishes, and the last twelve points stay
listed here with a timestamp and what each one holds. Restoring is itself undoable: whatever was on
screen becomes a point of its own.

---

## Undo

Every change to the database is undoable — ⌘Z / Ctrl+Z, the ↺ in the header, or the Undo on the toast
that appears when something is deleted. ⇧⌘Z redoes.

Inside a text box the shortcut stays the browser's, so it walks back through your typing the way it
does everywhere else; ours takes over where the last thing that happened was a click. A run of edits
to one field counts as one step, not one per keystroke.

The history is per-session and holds sixty steps. It lives in memory rather than in browser storage,
where each step would be re-serialised in full on every keystroke — undo is for the mistake you
notice now, and the restore points above are for the one you notice tomorrow.

---

## A Chinese résumé

The LaTeX generator emits pdfLaTeX-compatible source, which will not typeset CJK. For a Chinese
variant, export the `.tex` and swap the preamble's font setup for:

```tex
\usepackage{xeCJK}
\setCJKmainfont{PingFang TC}
```

then compile with XeLaTeX (in Overleaf: Menu → Compiler → XeLaTeX). Keep the Chinese bullets in the
same library with a `tw` tag so the two languages stay in sync.

---

## Notes for people changing the code

- Colours come from a colourblind-checked palette; light and dark are separately chosen, not flipped.
- The preview calibration constant lives at the top of `components/resume/Preview.tsx`. If you change
  the LaTeX preamble's spacing, recompile a variant and re-measure.
- `resolve()` in `lib/resume.ts` is the single source of truth: the preview and the LaTeX generator
  both read from it, so what you see is what compiles.

See [architecture.md](architecture.md) for the data model and the roadmap.
