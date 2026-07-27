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
  region: "US" | "TW" | "EU" | "Other";
  variantId: string;
  snapshot?: Snapshot;
  status: AppStatus;
  appliedAt: string;
  deadline: string;
  source: string;
  referral: string;
  jdUrl: string;
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
  entries: Entry[];
  skills: SkillGroup[];
  variants: Variant[];
  applications: Application[];
  platforms: Platform[];
  problems: Problem[];
}

export const REVIEW_INTERVALS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 };
