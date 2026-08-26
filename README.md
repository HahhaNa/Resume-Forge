<div align="center">

# Resume Forge

**Write each bullet point once. Build a different résumé for every kind of job you apply to. Keep track of where you sent them.**

[**▸ Open Resume Forge**](https://resume-forge-blond.vercel.app) · [User guide](docs/guide.md) · [How it's built](docs/architecture.md)

Free · open source · no sign-up · nothing is uploaded anywhere

</div>

<!--
  TODO: drop a screenshot of the Resume tab here, e.g.
  ![Resume Forge](docs/screenshot.png)
  Don't use _preview_air-1.png — that's a real résumé with real contact details.
-->

---

## The problem

Most job hunts end up with three or four résumé files that slowly drift apart. You fix a typo in one
and forget the others. You tailor one for a hardware role, then six weeks later you can't remember
what it says that the machine-learning one doesn't. And when a company finally emails back, you have
no idea which version they actually read.

Resume Forge keeps **one library of everything you have ever done**, and treats each résumé as
nothing more than a set of tick-boxes over that library. Fix a typo once and it's fixed everywhere.

---

## What you get

**One library, many résumés.** Write a bullet point once. Tick it into whichever résumés should
carry it. There is only ever one copy of the text.

**Real, professional PDF output.** The app writes LaTeX — the typesetting system most engineering
and academic résumés are built with. *You do not need to know LaTeX.* You press a button and it
either downloads a file or opens in [Overleaf](https://www.overleaf.com), a free website that turns
that file into a PDF. (There's also a plain "Print / Save PDF" if you'd rather not bother.)

**A page counter that doesn't lie.** The live preview is measured against real LaTeX output, so when
it says `0.94 / 1` your résumé genuinely fits on one page, and `1.03 / 1` genuinely spills onto two.

**An application tracker.** Paste a job link; the company name, the role and the application system
are read out of the URL. Every row remembers **which résumé you sent** — a frozen copy is taken
automatically the moment an application leaves "saved", so months later you can still see exactly
what that company received.

**A practice tracker.** LeetCode, NeetCode, Deep-ML, HDLBits, or anything else you add. It
cross-references what you've practised against the topics on the jobs you've actually applied to,
so you can see what you're weakest on where it counts.

**Your data stays yours.** Everything lives on your own computer. No account, no server, no company
holding your job hunt. Export the whole thing as one file whenever you like.

---

## Five minutes to your first résumé

1. **[Open the app](https://resume-forge-blond.vercel.app).** You'll land on a made-up candidate's data —
   that's just so the screens aren't blank. Nothing is saved anywhere but your own browser.

2. **Go to the Data tab and set up a backup file first.** Press `Choose a backup file` and save it
   somewhere that syncs — iCloud Drive, Dropbox, OneDrive, Google Drive. From then on every edit is
   written to that file a second later, so your browser is never the only copy. *(This needs Chrome
   or Edge. On Safari or Firefox, use `Export JSON` regularly instead — the app will remind you.)*

3. **Put your own details in.** Still on the Data tab: your name, email, phone, links.

4. **Replace the demo content.** Two ways:
   - *Already have a résumé?* Use **Import a résumé** on the Data tab — drop in your existing PDF
     or `.tex` file and it pulls out the entries and bullets for you.
   - *Starting fresh?* Go to the Resume tab and edit the demo entries directly, or delete them and
     add your own.

5. **Tick the bullets you want** and watch the preview on the right. Keep trimming until the page
   counter goes blue.

6. **Export.** `Download .tex` and upload it to Overleaf, or press `Open in Overleaf` to skip a
   step. It compiles as-is.

Then, when you want a second résumé for a different kind of role: duplicate the variant, untick what
doesn't apply, tick what does. It costs you a minute, not an afternoon.

---

## Where your data is kept

There is no server and no database. Everything is held by your browser, on your machine.

**Closing the tab does not lose your work, and neither does shutting down.** Browser storage is
written to disk, not held in memory. Close the tab, quit the browser, restart the laptop, run the
battery flat mid-sentence — it is all still there when you come back. Every change is saved the
instant you make it; there is no "save" button because there is nothing to press.

What *does* lose it: clearing your browsing data, using a private/incognito window, or leaving it
untouched for a week in Safari on an iPhone. And a laptop that gets lost or stolen takes its copy
with it.

That's private, but browser storage is **not a backup** — it's tied to one exact web address, and
clearing your browsing data takes it with it. So the app gives you three ways to keep a real copy:

| | How | Good for |
|---|---|---|
| **Backup file** *(recommended)* | Data tab → `Choose a backup file`. Every edit is written to it automatically. | Everyday use. Chrome and Edge only. |
| **Export JSON** | Data tab → `Export JSON`. One file with everything in it. | Safari and Firefox, or moving to a new computer. |
| **Restore points** | Taken automatically before anything destructive. Last 12 kept. | Undoing a mistake you made an hour ago. |

**Putting that backup file in a synced folder is also how you use Resume Forge on two computers.**
Point both at the same file. When they disagree, the app **stops and asks you** which side to keep,
showing how many entries and applications each one has. It will never quietly merge them and it will
never pick for you — that's the only way to be sure nothing gets silently lost.

**Undo works everywhere.** ⌘Z / Ctrl+Z, or the ↺ button in the header. ⇧⌘Z redoes. Sixty steps of
history, per session.

---

## On your phone

Right now Resume Forge is built for a laptop, and the phone experience is honest about that: you can
open it and read things, but the two-pane editor is cramped and there is no automatic backup file,
because phone browsers don't support that feature.

**If you use it on a phone, export a JSON file before you close the tab.** Especially on iPhone —
iOS deletes a website's stored data after seven days of not visiting it.

Making the phone a real, safe place to log applications is the next big piece of work; the plan is
written up in [docs/architecture.md](docs/architecture.md).

---

## Questions people ask

**Do I need to know LaTeX?** No. You never see it unless you go looking. Press `Open in Overleaf`
and you get a PDF.

**Is my résumé uploaded anywhere?** No. Nothing you type leaves your browser. The app only ever
makes one outbound request, and only if you press `Sync catalogue` on the Practice tab — that fetches
Deep-ML's public list of exercises, and sends nothing about you.

**Can I share the link with a friend?** Yes, and that's safe. They get their own empty copy in their
own browser. They cannot see anything of yours.

**What if I clear my browser data?** Everything is gone unless you set up the backup file or exported
a JSON. Please do step 2 above.

**Can I use this for a non-technical résumé?** Yes. Nothing about the data model is engineering-
specific; the LaTeX template is a fairly classic one-column-with-dates layout.

**Chinese / CJK résumés?** The default template can't typeset Chinese. There's a two-line fix in the
[user guide](docs/guide.md#a-chinese-résumé).

**Something went wrong and my data looks empty.** Don't panic and don't start retyping — see
[Troubleshooting](#troubleshooting).

---

## Troubleshooting

**"I opened the app and everything is gone."**
Almost always this means you're at a slightly different web address than last time. Browser storage
is tied to the exact address, down to the number after the colon. If you normally use
`localhost:3000` and today it opened on `localhost:3001`, the app is looking in a different drawer —
your data is still in the other one. Close whatever else is using port 3000 and reopen it there. This
is the single best reason to use the hosted link, whose address never moves.

**"The header says `backup paused`."**
Your backup file and this browser disagree — usually because another computer edited it. Go to the
Data tab and pick which side to keep. Nothing is lost until you choose.

**"The header says `backup locked`."**
The browser dropped permission to write the file, which happens after a restart. Data tab →
reconnect. One click.

**"`Sync catalogue` on the Practice tab does nothing."**
Deep-ML's server is unreachable or slow. It's the only external service the app touches and
everything else keeps working without it.

---

## Run it on your own computer

You don't need to — [the hosted version](https://resume-forge-blond.vercel.app) is the same app and your
data still stays on your machine. This is for people who want to change the code.

You'll need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/HahhaNa/Resume-Forge.git
```

```bash
cd Resume-Forge && npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

> **Watch the port.** If something else is already using 3000, Next.js quietly starts on 3001 — and
> because browser storage is per-address, the app will look empty. Use `npm run dev -- -p 3000` and
> fix the conflict rather than accepting the new port, or just connect a backup file so it doesn't
> matter.

### Deploy your own copy

Push the repo to GitHub, go to [vercel.com](https://vercel.com), click *Import Project*, and accept
every default. There are no environment variables, no database, and nothing to configure. Or from
the terminal:

```bash
npx vercel --prod
```

---

## How it's built

Next.js 15 (App Router) · TypeScript · Tailwind · Zustand. About 11k lines. The only server-side file
in the whole repo is a 60-line read-only proxy for Deep-ML's public catalogue.

- **[docs/guide.md](docs/guide.md)** — what every tab does, in detail. Read this if you're using the app seriously.
- **[docs/architecture.md](docs/architecture.md)** — the data model, why there's no backend, and the plan for mobile and sync.

```
app/        one folder per tab, plus api/deepml/ (the only server code)
components/ AppShell, the resume preview, entry editor, shared UI
lib/        types, store, resolve() → LaTeX, backup, import, i18n, seed data
lib/*.test.ts  the pure half, under test — run with npm test
```

`lib/resume.ts`'s `resolve()` is the single source of truth: the on-screen preview and the exported
LaTeX both read from it, so what you see is what compiles.

## Contributing

Issues and pull requests are welcome. Good first areas: résumé templates beyond the default one,
importers for other formats, more job-board URL patterns in `lib/ats.ts`, and translations
(strings live in `lib/i18n.ts`).

Before you open a PR:

```bash
npm run typecheck && npm test
```

The tests cover `lib/` — LaTeX generation, résumé import, dates, variant rules, and the schema
migration. They run in a couple of hundred milliseconds, so `npm run test:watch` while you work is
comfortable. The same two commands plus `npm run build` run in CI on every push.

## License

MIT — see [LICENSE](LICENSE). The bundled XCharter webfonts in `public/fonts/` have their own
licence, in `public/fonts/LICENSE.txt`.
