/* ------------------------------------------------------------------ *
 * What to go and build.
 *
 * `gaps.ts` ends on a list of things postings keep asking for that
 * nothing in your library answers. That list is already the useful
 * output, and for a while it was the whole feature. But it is phrased
 * in the employer's words — "experience with distributed training",
 * "production API ownership" — and a list of things you lack is not a
 * plan. The question underneath it is *what would I build this month
 * that would take the most of these off the list at once*.
 *
 * That is a generative question and there is no honest way to answer it
 * with a rule, so a model answers it. What a model must not do is tell
 * you how much the answer is worth: "this project would unlock 6 of
 * your applications" is exactly the sort of confident number that is
 * wrong and unfalsifiable. So the split is the same one `gaps.ts`
 * makes — the model proposes a project and names which themes it
 * closes, and the counting is done here, from the hits already
 * recorded, where you can read the arithmetic.
 *
 * A suggestion naming a theme that does not exist is dropped rather
 * than repaired. It has no payoff to compute, and a project justified
 * by a requirement nobody asked for is the model writing fiction.
 * ------------------------------------------------------------------ */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { type Msg, type Usage, NO_USAGE, structured } from "./agent";
import type { Theme } from "./gaps";
import type { DB } from "./types";
import { fence, nonce } from "./untrusted";

/** What the model returns: a project, and the gaps it claims to close. */
export interface Idea {
  title: string;
  /** what you would actually build, in one line */
  what: string;
  /** why it answers those gaps rather than merely touching them */
  why: string;
  /** theme ids it claims to close */
  themeIds: string[];
}

/** An idea with its payoff worked out from the record rather than asserted. */
export interface Suggestion extends Idea {
  /** the themes that actually exist, resolved from `themeIds` */
  themes: Theme[];
  /** postings that asked for one of those and had nothing answering it */
  postings: number;
  /** of those asks, how many the posting called required */
  musts: number;
  /** which ones, by name — a count nobody can trace is a count nobody trusts */
  helps: { appId: string; company: string; role: string }[];
}

/**
 * How many themes are worth putting in front of the model.
 *
 * The tail of the gap list is single postings phrased oddly, and asking for a
 * project to close one of those produces advice about one advert.
 */
export const MAX_THEMES = 12;

/** Theme labels come from job adverts, so they are capped before they travel. */
const MAX_LABEL = 90;

/**
 * The gaps worth building for: nothing of yours answers them, hardest first.
 *
 * Ordered by how many postings called it *required* before how many asked at
 * all. Something two postings insisted on beats something four mentioned in
 * passing — the first is why you were filtered out, the second is a preference.
 */
export function worthBuilding(themes: Theme[]): Theme[] {
  return themes
    .filter((t) => t.missing > 0)
    .sort((a, b) => b.missingMusts - a.missingMusts || b.missing - a.missing || a.label.localeCompare(b.label))
    .slice(0, MAX_THEMES);
}

/**
 * What a project is worth, counted from the hits rather than claimed.
 *
 * A posting counts once however many of the themes it asked for — the unit is
 * "an application that would have gone better", not "a requirement". Only
 * `none` hits count: a theme your library already answers is not a reason to
 * build anything, whatever the model thought.
 */
export function payoff(themes: Theme[]): Pick<Suggestion, "postings" | "musts" | "helps"> {
  const apps = new Map<string, { appId: string; company: string; role: string }>();
  let musts = 0;
  for (const t of themes)
    for (const h of t.hits) {
      if (h.answer !== "none") continue;
      if (!apps.has(h.appId)) apps.set(h.appId, { appId: h.appId, company: h.company, role: h.role });
      if (h.kind === "must") musts++;
    }
  return { postings: apps.size, musts, helps: [...apps.values()] };
}

/**
 * Ideas, grounded against the themes that actually exist.
 *
 * Exported on its own because it is the whole guard, and it is worth being able
 * to test without a model in the way.
 */
export function ground(ideas: Idea[], themes: Theme[]): Suggestion[] {
  const by = new Map(themes.map((t) => [t.id, t]));
  return ideas
    .map((i) => {
      const matched = [...new Set(i.themeIds)].map((id) => by.get(id)).filter((t): t is Theme => !!t);
      return { ...i, themes: matched, ...payoff(matched) };
    })
    /* no real theme behind it means no gap it closes and no payoff to print */
    .filter((s) => s.themes.length > 0)
    .sort((a, b) => b.musts - a.musts || b.postings - a.postings);
}

/* ------------------------------------------------------------------ *
 * asking
 * ------------------------------------------------------------------ */

/**
 * A short view of what the person can already do.
 *
 * Titles and tags, never the bullets. Partly for size, mostly because the job
 * here is to suggest something *adjacent* — a project that starts from what you
 * already know is one you will actually finish, and one that starts from
 * nothing is a new year's resolution.
 */
export function background(db: DB): string {
  const entries = db.entries
    .filter((e) => e.kind === "experience" || e.kind === "project")
    .map((e) => [e.org, e.title].filter(Boolean).join(" — "))
    .filter(Boolean);
  const tags = [...new Set(db.entries.flatMap((e) => e.tags))];
  const skills = db.skills.map((s) => s.items).join("; ");
  return [
    entries.length ? `Has worked on:\n${entries.map((e) => `- ${e}`).join("\n")}` : "",
    skills ? `Skills: ${skills}` : "",
    tags.length ? `Areas: ${tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          what: { type: "string" },
          why: { type: "string" },
          themeIds: { type: "array", items: { type: "string" } },
        },
        required: ["title", "what", "why", "themeIds"],
      },
    },
  },
  required: ["ideas"],
} as const;

export const RULE = `You suggest projects a job applicant could build to close gaps in their experience.

You are given: gaps (things postings keep asking for that nothing of theirs answers), each with an id; and a short summary of what they can already do.

Rules:
- Suggest 3 to 5 projects. Each must be finishable by one person in a few weeks.
- Prefer a project that closes SEVERAL gaps at once over one that closes a single gap well.
- Start from what they already know. A project adjacent to their background gets built; one starting from nothing does not.
- In "themeIds", list only ids you were given. Never invent one.
- Do not estimate how many applications a project would help. That is computed elsewhere.
- "what" is one line describing what gets built. "why" is one line on why it is real evidence for those gaps rather than a tutorial.

Return JSON: {"ideas":[{"title":"...","what":"...","why":"...","themeIds":["..."]}]}`;

export interface SuggestInput {
  themes: Theme[];
  db: DB;
  model: BaseChatModel;
  kind: "anthropic" | "openai" | "ollama" | "compatible";
}

/**
 * Ask for projects, and count what they are worth here.
 *
 * The gap labels are text from job adverts and are fenced like every other
 * posting-derived string in this app. The blast radius is smaller than the
 * judges' — the output is prose the user reads and decides about, not a score
 * that silently changes a résumé — but "smaller" is not a reason to skip it.
 */
export async function suggest(input: SuggestInput): Promise<{ suggestions: Suggestion[]; usage: Usage }> {
  const themes = worthBuilding(input.themes);
  if (!themes.length) return { suggestions: [], usage: NO_USAGE };

  const id = nonce();
  const listed = themes
    .map((t) => `${t.id} :: ${t.label.slice(0, MAX_LABEL)} (${t.missing} postings, ${t.missingMusts} required)`)
    .join("\n");

  const msgs: Msg[] = [
    input.kind === "anthropic"
      ? { role: "system", content: [{ type: "text", text: RULE, cache_control: { type: "ephemeral" } }] }
      : { role: "system", content: RULE },
    { role: "user", content: `${fence(listed, id, "GAPS")}\n\n${background(input.db)}` },
  ];

  try {
    const { value, usage } = await structured<{ ideas: Idea[] }>(input.model, SCHEMA, msgs);
    return { suggestions: ground(value?.ideas ?? [], themes), usage };
  } catch {
    /* the gap list is the output that matters and it is already on screen;
       a failed suggestion is a section that does not appear */
    return { suggestions: [], usage: NO_USAGE };
  }
}
