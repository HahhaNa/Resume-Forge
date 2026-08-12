# Resume Forge

A local-first workbench for a job hunt: keep every bullet you have ever written in one library,
compose resume variants by ticking boxes, export real LaTeX, and track applications and practice
against the same data.

Built with Next.js 15 + TypeScript + Tailwind + Zustand. No accounts, no database. Everything is
stored in your browser and exportable as one JSON file.

The one server-side file is `app/api/deepml/route.ts`, a read-only passthrough to Deep-ML's public
catalogue endpoints, needed because their CORS allowlist only admits `localhost:3000`. It sends
nothing about you and stores nothing. Nothing else leaves the browser, and no request is made at
all until you press "Sync catalogue".

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

A fresh browser starts on the demo content in `lib/seed.ts` — a fictional candidate, there
only so the tabs have something in them. Overwrite it by editing entries directly, or import
your own JSON export from the **Data** tab. Your copy lives in `localStorage` and is never
written back to the repo.

## Deploy it (free)

```bash
npm i -g vercel
vercel              # answer the prompts; accept the defaults
vercel --prod
```

Or push to GitHub and click "Import Project" on vercel.com. There is nothing to configure,
no environment variables, no database.

Anyone who opens your deployed URL gets their own empty copy in their own browser. Nothing you
type is uploaded anywhere. That is what makes it safe to share.

---

## The tabs

### Resume

The left pane is the variant you are editing; the right pane is a live page-accurate preview.

- **Variants** are named presets — `hw`, `ml`, `sw` ship by default. A variant is nothing but
  an ordered list of sections, the entries inside each section, and the set of bullets that are
  ticked. Duplicating one costs nothing.
- **Bullets are shared.** Every variant reads from the same library, so fixing a typo or updating
  a number fixes it everywhere. Tick a box to include a bullet in the variant you are editing.
  To put one entry into several variants at once, use the Library tab.
- **Tags** (`hw` / `ml` / `sw` / `tw`) are a shortcut, not a rule. `Tagged /hw` selects every
  bullet in that entry carrying the current variant's tag; `All` and `None` do the obvious thing.
- **`**bold**`** inside bullet text becomes `\textbf{}` in LaTeX and bold in the preview. Use it
  on the number that matters, not on whole sentences.
- **An entry with zero ticked bullets disappears** from the output. That is deliberate — it is how
  you drop a project from one variant without deleting it.
- **Page fill** is calibrated against real `pdflatex` output, so `0.94 / 1` means it genuinely
  compiles to one page and `1.03 / 1` means it genuinely spills. Trim until it goes blue.
- **Density / font size** are the last resort, not the first. Cut a bullet before you shrink type.

Export: `Copy .tex`, `Download .tex`, or `Open in Overleaf` (posts the source straight into a new
Overleaf project — it compiles with pdfLaTeX as-is). `Print / Save PDF` renders the preview from
the browser and is fine for a quick look, but the LaTeX output is the one to send.

The generated `.tex` is self-contained: preamble, macros, and content in one file, with the
variant name, build date, and the list of included bullet ids in a header comment.

### Library

The Resume tab shows one variant at a time, which makes adding a new experience feel like it
has to be done once per résumé. It does not. Entries and bullets live once in the library and
a variant only holds references, so this tab is that library seen from above: every entry down
the side, every variant across the top, one cell for each pair.

- **A cell is a reference, not a copy.** Ticking a cell files that entry into that variant —
  editing the text anywhere changes it everywhere, because there is only one copy.
- **`⊕` on a row puts the entry in every variant at once**, and `⊖` takes it out of all of them.
  That is the answer to "I just did a new internship and there are five résumés".
- **The cell reads `2/5`** — bullets switched on, out of bullets the entry has. A dashed `+`
  means the variant does not carry it at all.
- **An amber `0/5` is the trap worth knowing**: the entry is filed in that variant but no bullet
  is ticked, so `resolve` drops it and it silently will not print. Expand the row and tick one.
  Education and awards are exempt — they print with no bullets.
- **Adding to a variant picks the section for you**: the same-titled section that holds it in
  another variant, else the section already full of that kind, else a new one named after the
  kind. Order is mirrored from a variant that already lists it, so a fresh add is not stranded
  at the bottom. Bullets tagged with the variant's slug switch on; if none carry the tag, all do.
- **Expand a row** to get the bullets, with a checkbox per variant. Ticking a bullet in a variant
  that does not carry the entry pulls the entry in too, rather than leaving a tick that renders
  nothing.
- **`Missing somewhere` and `In no variant`** are the two filters that matter: the first is what
  you have not finished distributing, the second is what you wrote and then forgot entirely.
- The bottom row is what each variant actually renders — entries and bullets after the empty ones
  are dropped.

The same variant checkboxes are on the ✎ entry editor, so a new entry can be pushed to every
résumé without leaving the Resume tab.

### Applications

The quick-add row is the normal way in: paste the job link and the company, the ATS and often the
role are read straight out of the URL — Greenhouse, Lever, Ashby, Workday, Workable, SmartRecruiters,
Taleo, iCIMS, Cake and a dozen more, plus the company's own careers page as a fallback. Nothing is
fetched; the company name is simply in the path. Fill in what is missing, press Enter, done. The
full form is still behind ✎ when you want the portal, the referral and the next-action date, and it
keeps the rarely-used half folded away under "More details".

Every row records which variant you used. **Lock snapshot** freezes the exact `.tex` and the exact
list of bullet ids at the moment you applied, and stores it on that row. Change your resume
afterwards as much as you like — the snapshot still shows what that company actually received.

The funnel, the response rate, and the per-variant comparison are computed from the rows, so once
you have twenty applications you can see whether `hw` or `ml` is actually getting callbacks.

`Prep topics` on an application feeds the Practice tab.

### Practice

Platforms are user-defined — LeetCode, NeetCode, Deep-ML, and HDLBits are seeded, but the
`+ Add platform` button takes anything (name, URL, kind, target count, colour). Progress, activity,
and the review queue all aggregate across platforms.

- **Deep-ML is wired to the real catalogues** — all four of them, not just `/problems`:

  | | count | url |
  |---|---|---|
  | problems | ~1230 | `/problems/<id>` |
  | project steps | ~1000 | `/projects/<project>/step/<step>` |
  | maths | ~31 | `/math-problems/<id>` |
  | labs | ~38 | `/labs/<id>` |

  Press `Sync catalogue` once and the quick-add box becomes a search over all of it: type an id, a
  few words of the title, the project name — or **paste the Deep-ML link you have open**, which
  resolves to exactly that item. Press Enter and the ref, title, URL, difficulty and category all
  come from Deep-ML. Steps are stored as `Project name · step name` so a row still means something
  on its own. Refs are namespaced (`M1`, `L1`) so the four catalogues cannot collide.

  The catalogue is cached in its own localStorage key, outside your exported JSON. What it cannot
  know is which items you have *finished* — that sits behind Deep-ML's login — so ticking them off
  is still your call. No other platform publishes a usable open endpoint; they stay manual.
- **Bulk paste** takes `ref | title | difficulty | topic, topic` one per line — the fastest way to
  backfill what you have already solved. On Deep-ML a bare ref or a pasted link on its own line is
  enough.
- **Gaps vs. your active applications** cross-references the topics you listed on open applications
  against what you have actually practiced, sorted by what you have practiced least. This is the
  point of putting the two trackers in the same app.
- **Review queue** uses simple spaced repetition (1 / 3 / 7 / 16 / 35 days by how the attempt felt).

### Data

Profile fields, JSON export/import, and reset. **Export regularly** — browser storage is not a
backup. The exported JSON is the whole database, so importing it on another machine moves
everything.

---

## Adding a Chinese resume variant

The LaTeX generator emits pdfLaTeX-compatible source, which will not typeset CJK. For a Chinese
variant, export the `.tex` and swap the preamble's font setup for:

```tex
\usepackage{xeCJK}
\setCJKmainfont{PingFang TC}
```

then compile with XeLaTeX (Overleaf: Menu → Compiler → XeLaTeX). Keep the Chinese bullets in the
same library with a `tw` tag so the two languages stay in sync.

---

## Layout

```
app/
  page.tsx              resume builder
  library/page.tsx      entry × variant matrix
  applications/page.tsx application tracker
  practice/page.tsx     multi-platform practice tracker
  data/page.tsx         profile, import/export
  api/deepml/route.ts   read-only passthrough to Deep-ML's catalogue
components/
  AppShell.tsx          nav, language toggle, theme toggle
  resume/Preview.tsx    page-accurate live preview
  resume/EntryModal.tsx entry fields + which variants carry it
  resume/VariantPicker.tsx  the variant chips shared by the modal
  ui/bits.tsx           shared inputs, bars, modal
lib/
  types.ts              the whole data model
  library.ts            entry ↔ variant rules: which section, what order, which bullets
  store.ts              zustand store, persisted to localStorage
  resume.ts             resolve(db, variant) -> LaTeX and preview
  ats.ts                job-board URL -> company, portal, role
  deepml.ts             Deep-ML catalogues: fetch, cache, search, link → ref
  seed.ts               starter content
  i18n.ts               EN / ZH strings
```

`resolve()` is the single source of truth: the preview and the LaTeX generator both read from it,
so what you see is what compiles.

## Notes

- Colours come from a colourblind-checked palette; light and dark are separately chosen, not flipped.
- The preview calibration constant lives at the top of `components/resume/Preview.tsx`. If you
  change the LaTeX preamble's spacing, recompile a variant and re-measure.

## License

MIT — see [LICENSE](LICENSE). The bundled XCharter webfonts in `public/fonts/` are covered by
their own licence, in `public/fonts/LICENSE.txt`.
