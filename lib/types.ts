export type Lang = "en" | "zh";

export type EntryKind = "education" | "experience" | "project" | "award" | "activity";

export interface Bullet {
  id: string;
  text: string; // supports **bold**
  tags: string[];
}

export interface Entry {
  id: string;
  kind: EntryKind;
  org: string; // institution, company, or project name
  title: string; // degree, role, or tech stack
  location: string;
  period: string;
  url?: string;
  bullets: Bullet[];
  tags: string[];
}

export interface SkillGroup {
  id: string;
  label: string;
  items: string;
  tags: string[];
}

export interface Profile {
  name: string;
  headline: string;
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  site: string;
  location: string;
}

export type ContactField = "email" | "phone" | "linkedin" | "github" | "site";
export const CONTACT_FIELDS: ContactField[] = ["email", "phone", "linkedin", "github", "site"];

export type SectionType = "entries" | "skills";

export interface VariantSection {
  id: string;
  title: string;
  type: SectionType;
  ids: string[]; // entry ids or skill-group ids, in render order
}

export interface Variant {
  id: string;
  name: string; // short slug used in filenames, e.g. "hw"
  label: string;
  note: string;
  sections: VariantSection[];
  bulletIds: string[]; // whitelist of bullets that render
  header: { phone: boolean; linkedin: boolean; github: boolean; site: boolean };
  /** Per-variant contact values. Blank or absent falls back to the profile —
   *  so a public CV can carry a different phone, or the profile's own. */
  contact?: Partial<Record<ContactField, string>>;
  /** Header links render as the full URL, or as a short label. */
  linkStyle?: "full" | "short";
  density: "tight" | "normal" | "airy";
  fontSize: 10 | 10.5 | 11;
  pageTarget: 1 | 2;
  updatedAt: string;
}

export type AppStatus =
  | "saved"
  | "applied"
  | "oa"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "ghosted";

export const APP_STATUSES: AppStatus[] = [
  "saved",
  "applied",
  "oa",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
];

export const FUNNEL: AppStatus[] = ["applied", "oa", "interview", "offer"];
export const CLOSED: AppStatus[] = ["rejected", "withdrawn", "ghosted"];

export interface AppEvent {
  at: string;
  status: AppStatus;
  note?: string;
}

export interface Snapshot {
  builtAt: string;
  variantName: string;
  bulletIds: string[];
  tex: string;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  team: string;
  location: string;
  /** Free text. Past entries are offered as suggestions rather than a fixed list. */
  region: string;
  variantId: string;
  snapshot?: Snapshot;
  status: AppStatus;
  appliedAt: string;
  deadline: string;
  source: string;
  referral: string;
  jdUrl: string;
  /**
   * The posting itself, as it was pasted. Empty until a tailor run is attached.
   *
   * Kept rather than re-fetched because it cannot be re-fetched: the app has no
   * server, a job board will not serve its page to another origin, and reaching
   * out for it would be the first thing that ever left the browser. A link rots
   * — the posting is taken down the week they fill the role — so the text is the
   * only durable record of what was asked for.
   *
   * It stays untrusted: this is text written by whoever wrote the advert, stored
   * verbatim, and every run puts it back through `sanitise` rather than trusting
   * that it was cleaned when it arrived. Capped at `MAX_JD`, which is where
   * `sanitise` would truncate it anyway — storing more would be keeping bytes
   * nothing will ever read.
   */
  jd: string;
  portal: string;
  nextAction: string;
  nextActionAt: string;
  notes: string;
  prepTopics: string[];
  events: AppEvent[];
}

export type PlatformKind = "algorithms" | "ml" | "hardware" | "systems" | "other";

export interface Platform {
  id: string;
  name: string;
  url: string;
  kind: PlatformKind;
  color: string;
  target: number; // goal problem count, 0 = no goal
  archived?: boolean;
}

export type ProblemStatus = "todo" | "solved" | "review";

export interface Problem {
  id: string;
  platformId: string;
  title: string;
  ref: string;
  url: string;
  difficulty: "easy" | "medium" | "hard" | "";
  topics: string[];
  status: ProblemStatus;
  solvedAt: string;
  attempts: number;
  confidence: 1 | 2 | 3 | 4 | 5;
  nextReviewAt: string;
  notes: string;
}

export interface DB {
  version: number;
  profile: Profile;
  /** The tag vocabulary, in display order. Position picks the colour. */
  tags: string[];
  entries: Entry[];
  skills: SkillGroup[];
  variants: Variant[];
  applications: Application[];
  platforms: Platform[];
  problems: Problem[];
}

/**
 * A whole-database copy taken immediately before something destructive.
 *
 * Importing with "replace" used to drop every entry, skill and variant with no
 * way back — the reason this exists. Points are persisted alongside the data, so
 * a mistake noticed a day later is still undoable.
 */
export interface RestorePoint {
  id: string;
  at: string;
  /** What was about to happen, e.g. `Before importing resume.tex`. */
  label: string;
  db: DB;
}

/** Oldest points fall off the end. Each is roughly the size of the database. */
export const MAX_RESTORE_POINTS = 12;

/**
 * One step of the undo history: the database as it stood *before* an action, so
 * undoing is just putting it back.
 *
 * `db` is the previous object, not a copy. Every action in the store rebuilds the
 * objects it touches and leaves the rest alone, so an old database still points at
 * the parts that never changed and a step costs only what the action actually
 * rewrote. That is what makes a stack this deep affordable — and it is why nothing
 * in the store may ever mutate a database in place.
 *
 * The stack is deliberately not persisted: a step is cheap in memory but not in
 * localStorage, where it would be serialised in full on every keystroke. Undo is
 * for the mistake you notice now; the restore points on the Data tab are for the
 * one you notice tomorrow.
 */
export interface UndoStep {
  id: string;
  /** What the action did, e.g. `Bullet deleted` — read back as "Undone — …". */
  label: string;
  at: number;
  /** Actions sharing a key, back to back and close in time, collapse into one step. */
  coalesce?: string;
  db: DB;
  activeVariantId: string;
}

/** Undo depth. Structural sharing means this costs far less than 60 databases. */
export const MAX_UNDO = 60;

/** How long a run of edits to the same field stays one undo step. */
export const UNDO_COALESCE_MS = 1000;

export const REVIEW_INTERVALS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 };
