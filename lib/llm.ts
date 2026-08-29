"use client";

/* ------------------------------------------------------------------ *
 * Which model does the reading, and where it runs.
 *
 * Three things decide the shape of this file.
 *
 * The first is that the app has no backend and is not getting one for
 * this. Every request here goes from the user's browser straight to the
 * provider they chose, with their own key. Anthropic and OpenAI both
 * refuse browser calls unless the caller opts in explicitly, which is a
 * sensible default for a product with one shared server-side key and
 * the wrong default here: the key belongs to the person typing, it is
 * already on their machine, and routing it through a server of ours
 * would mean *we* had briefly held it. So both opt-ins are set, and the
 * reason is this paragraph rather than the flag's name.
 *
 * The second is that the key is not part of the database. It lives
 * under its own localStorage key, so the JSON export, the backup file,
 * and every restore point stay free of it — a résumé backup that
 * quietly carried a billable credential would be a genuinely bad thing
 * to hand somebody.
 *
 * The third is that model ids go stale faster than this file will be
 * edited. Nothing here hardcodes a catalogue: `listModels` asks the
 * provider what it has, and the settings panel shows that. Ollama and
 * an OpenAI-compatible server answer the same question, so a local
 * model is picked from a list the same way a hosted one is.
 * ------------------------------------------------------------------ */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type ProviderKind = "anthropic" | "openai" | "ollama" | "compatible";

export interface Provider {
  kind: ProviderKind;
  label: string;
  /** what the user is agreeing to when they pick it */
  note: string;
  needsKey: boolean;
  /** true when the traffic never leaves the machine */
  local: boolean;
  defaultBaseUrl: string;
  keyUrl?: string;
  suggested: string;
}

export const PROVIDERS: Provider[] = [
  {
    kind: "anthropic",
    label: "Claude",
    note: "Your key, called straight from this browser. The posting and the shortlisted bullets go to Anthropic.",
    needsKey: true,
    local: false,
    defaultBaseUrl: "https://api.anthropic.com",
    keyUrl: "https://console.anthropic.com/settings/keys",
    suggested: "claude-opus-5",
  },
  {
    kind: "openai",
    label: "ChatGPT",
    note: "Your key, called straight from this browser. The posting and the shortlisted bullets go to OpenAI.",
    needsKey: true,
    local: false,
    defaultBaseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    suggested: "gpt-4o",
  },
  {
    kind: "ollama",
    label: "Ollama (local)",
    note: "An open model on your own machine. Nothing leaves it, and no key is needed.",
    needsKey: false,
    local: true,
    defaultBaseUrl: "http://localhost:11434",
    suggested: "llama3.1:8b",
  },
  {
    kind: "compatible",
    label: "OpenAI-compatible",
    note: "Any server that speaks the OpenAI API — vLLM, LM Studio, llama.cpp, Together, Groq, OpenRouter.",
    needsKey: false,
    local: false,
    defaultBaseUrl: "http://localhost:8000/v1",
    suggested: "",
  },
];

export const providerOf = (kind: ProviderKind): Provider =>
  PROVIDERS.find((p) => p.kind === kind) ?? PROVIDERS[0];

export interface LlmSettings {
  kind: ProviderKind;
  model: string;
  apiKey: string;
  baseUrl: string;
  /** nothing runs until this is switched on, and switching it off is the whole opt-out */
  enabled: boolean;
}

export const BLANK: LlmSettings = {
  kind: "anthropic",
  model: "",
  apiKey: "",
  baseUrl: "",
  enabled: false,
};

/**
 * Deliberately not the store's key. See the file header: the database is
 * exported, backed up, and snapshotted into restore points, and a credential
 * must not ride along with any of that.
 */
const KEY = "rf.llm.v1";

export function loadSettings(): LlmSettings {
  if (typeof localStorage === "undefined") return BLANK;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return BLANK;
    const s = JSON.parse(raw) as Partial<LlmSettings>;
    return { ...BLANK, ...s, kind: providerOf(s.kind as ProviderKind).kind };
  } catch {
    return BLANK;
  }
}

export function saveSettings(s: LlmSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* over quota, or storage disabled — the session's copy still works */
  }
}

export function forgetKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do; the caller has already cleared its own state */
  }
}

export const baseUrlOf = (s: LlmSettings) => s.baseUrl.trim() || providerOf(s.kind).defaultBaseUrl;

/** Enough to try: a model, and a key wherever one is required. */
export function ready(s: LlmSettings): boolean {
  if (!s.enabled || !s.model.trim()) return false;
  return !providerOf(s.kind).needsKey || !!s.apiKey.trim();
}

/* ------------------------------------------------------------------ *
 * asking the provider what it has
 * ------------------------------------------------------------------ */

/**
 * The model list, from the provider itself. Hardcoding one would be wrong twice
 * over: it goes stale, and for a local server the only true answer is whatever
 * that machine has actually pulled.
 */
export async function listModels(s: LlmSettings): Promise<string[]> {
  const base = baseUrlOf(s).replace(/\/+$/, "");
  const key = s.apiKey.trim();

  if (s.kind === "ollama") {
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
    const json = (await res.json()) as { models?: { name?: string }[] };
    return (json.models ?? []).map((m) => String(m.name ?? "")).filter(Boolean).sort();
  }

  if (s.kind === "anthropic") {
    const res = await fetch(`${base}/v1/models?limit=100`, {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    if (!res.ok) throw new Error(await message(res));
    const json = (await res.json()) as { data?: { id?: string }[] };
    return (json.data ?? []).map((m) => String(m.id ?? "")).filter(Boolean);
  }

  const res = await fetch(`${base}/models`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
  if (!res.ok) throw new Error(await message(res));
  const json = (await res.json()) as { data?: { id?: string }[] };
  return (json.data ?? []).map((m) => String(m.id ?? "")).filter(Boolean).sort();
}

/** Providers all report failures as JSON, and all under a different key. */
async function message(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } | string; message?: string };
    const e = j.error;
    const text = typeof e === "string" ? e : e?.message || j.message;
    if (text) return `${res.status}: ${text}`;
  } catch {
    /* not JSON — the status alone is the whole story */
  }
  return `Provider answered ${res.status}`;
}

/* ------------------------------------------------------------------ *
 * the model
 * ------------------------------------------------------------------ */

/**
 * LangChain is imported here and nowhere else, and it is imported lazily. The
 * provider packages are several megabytes between them, and someone who never
 * opens the Tailor tab should not be made to download a model client to look at
 * their own résumé.
 */
export async function chatModel(s: LlmSettings): Promise<BaseChatModel> {
  const base = baseUrlOf(s).replace(/\/+$/, "");
  const model = s.model.trim();
  const apiKey = s.apiKey.trim();

  if (s.kind === "anthropic") {
    const { ChatAnthropic } = await import("@langchain/anthropic");
    return new ChatAnthropic({
      model,
      apiKey,
      anthropicApiUrl: base,
      maxTokens: 8000,
      /* the opt-in the file header explains: the key is the user's own, and it
         is already in this browser */
      clientOptions: { dangerouslyAllowBrowser: true },
    }) as unknown as BaseChatModel;
  }

  if (s.kind === "ollama") {
    const { ChatOllama } = await import("@langchain/ollama");
    return new ChatOllama({ model, baseUrl: base }) as unknown as BaseChatModel;
  }

  const { ChatOpenAI } = await import("@langchain/openai");
  return new ChatOpenAI({
    model,
    /* a local vLLM or LM Studio wants no key, and the SDK insists on a string */
    apiKey: apiKey || "not-needed",
    configuration: { baseURL: base, dangerouslyAllowBrowser: true },
  }) as unknown as BaseChatModel;
}

/** A one-token round trip, so a wrong key fails in the settings panel and not mid-run. */
export async function probe(s: LlmSettings): Promise<void> {
  const model = await chatModel(s);
  await model.invoke([{ role: "user", content: "Reply with the single word: ok" }]);
}
