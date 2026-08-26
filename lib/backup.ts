"use client";

/* ------------------------------------------------------------------ *
 * Backup to a real file, via the File System Access API.
 *
 * `localStorage` is not a backup. It is scoped to an origin — so a dev
 * server that lands on :3001 instead of :3000 looks like total data loss —
 * and any browser cleanup takes it with it. Here you pick a file once,
 * ideally inside iCloud Drive or Dropbox, and every edit is written to it
 * a second later. That is a durable copy, a sync channel between machines
 * and a thing you can open in a text editor, for no backend at all.
 *
 * The handle lives in IndexedDB: a FileSystemFileHandle survives a reload
 * but is not JSON, so `localStorage` cannot hold one. Only the timestamps
 * are persisted the ordinary way.
 *
 * Chrome and Edge have the API; Safari and Firefox do not, and there the
 * store reports `unsupported` so the Data tab can fall back to nagging
 * about manual exports.
 * ------------------------------------------------------------------ */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useStore } from "./store";
import type { DB } from "./types";

/* The picker and the permission methods are not in TypeScript's DOM lib. */
type Perm = "granted" | "denied" | "prompt";

interface Writable {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

export interface FileHandle {
  readonly name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<Writable>;
  queryPermission: (d: { mode: "readwrite" }) => Promise<Perm>;
  requestPermission: (d: { mode: "readwrite" }) => Promise<Perm>;
}

interface Picker {
  showSaveFilePicker?: (o: unknown) => Promise<FileHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<FileHandle[]>;
}

const picker = () => (typeof window === "undefined" ? {} : (window as unknown as Picker));

export const backupSupported = () =>
  typeof window !== "undefined" && typeof picker().showSaveFilePicker === "function";

const PICK_OPTS = {
  suggestedName: "resume-forge.json",
  types: [{ description: "Resume Forge backup", accept: { "application/json": [".json"] } }],
};

/* ---- the handle, in IndexedDB ------------------------------------- */

const IDB_NAME = "resume-forge-backup";
const IDB_STORE = "handles";
const IDB_KEY = "file";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

const readHandle = () => tx<FileHandle | undefined>("readonly", (s) => s.get(IDB_KEY));
const writeHandle = (h: FileHandle) => tx("readwrite", (s) => s.put(h, IDB_KEY));
const dropHandle = () => tx("readwrite", (s) => s.delete(IDB_KEY));

/* ---- state -------------------------------------------------------- */

/**
 * `locked` — the handle survived the reload but the permission did not, and
 * re-asking needs a click. `conflict` — the file holds something this device
 * did not write, which is what a second machine looks like; overwriting
 * blindly would be the one way to actually lose work, so it waits.
 */
export type BackupStatus = "unsupported" | "off" | "on" | "locked" | "conflict" | "error";

interface Backup {
  status: BackupStatus;
  fileName: string;
  lastSavedAt: string;
  lastExportAt: string;
  error: string;
  /** Not persisted — the parsed file, held only while `status` is `conflict`. */
  incoming: DB | null;

  init: () => Promise<void>;
  connectNew: () => Promise<void>;
  connectExisting: () => Promise<void>;
  unlock: () => Promise<void>;
  disconnect: () => Promise<void>;
  takeIncoming: () => void;
  keepLocal: () => Promise<void>;
  markExported: () => void;
  /** Write the file now instead of a second from now. See the Save button. */
  saveNow: () => Promise<void>;
}

let handle: FileHandle | null = null;
const stamp = () => new Date().toISOString();
const serialise = (db: DB) => JSON.stringify(db, null, 2);

export const useBackup = create<Backup>()(
  persist(
    (set, get) => ({
      status: "off",
      fileName: "",
      lastSavedAt: "",
      lastExportAt: "",
      error: "",
      incoming: null,

      init: async () => {
        if (!backupSupported()) {
          set({ status: "unsupported" });
          return;
        }
        let h: FileHandle | undefined;
        try {
          h = await readHandle();
        } catch {
          /* private windows can refuse IndexedDB outright */
        }
        if (!h) {
          set({ status: "off", fileName: "" });
          return;
        }
        handle = h;
        set({ fileName: h.name });

        if ((await h.queryPermission({ mode: "readwrite" })) !== "granted") {
          set({ status: "locked" });
          return;
        }
        await reconcile();
      },

      connectNew: async () => {
        const pick = picker().showSaveFilePicker;
        if (!pick) return;
        try {
          const h = await pick(PICK_OPTS);
          handle = h;
          await writeHandle(h);
          set({ fileName: h.name, status: "on", error: "", incoming: null });
          await flush();
          watch();
        } catch (e) {
          if (!aborted(e)) set({ status: "error", error: message(e) });
        }
      },

      connectExisting: async () => {
        const pick = picker().showOpenFilePicker;
        if (!pick) return;
        try {
          const [h] = await pick({ ...PICK_OPTS, multiple: false });
          if (!h) return;
          handle = h;
          await writeHandle(h);
          set({ fileName: h.name, error: "" });
          await reconcile();
        } catch (e) {
          if (!aborted(e)) set({ status: "error", error: message(e) });
        }
      },

      unlock: async () => {
        if (!handle) {
          await get().init();
          return;
        }
        try {
          if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") {
            set({ status: "locked" });
            return;
          }
          await reconcile();
        } catch (e) {
          set({ status: "error", error: message(e) });
        }
      },

      disconnect: async () => {
        handle = null;
        unwatch();
        try {
          await dropHandle();
        } catch {
          /* nothing worth reporting — the handle is already unreachable */
        }
        set({ status: "off", fileName: "", incoming: null, error: "" });
      },

      takeIncoming: () => {
        const db = get().incoming;
        if (!db) return;
        useStore.getState().importDB(db);
        set({ status: "on", incoming: null, lastSavedAt: stamp() });
        watch();
      },

      keepLocal: async () => {
        set({ status: "on", incoming: null });
        await flush();
        watch();
      },

      markExported: () => set({ lastExportAt: stamp() }),

      /**
       * Everything is already saved — that is the point of the debounce and of
       * `persist`. What this is for is the person who cannot see that, and who
       * would like to press something and be told. So it cuts the wait short
       * and writes the file this instant, and the answer it gives back is a
       * true one rather than a reassuring animation.
       */
      saveNow: async () => {
        if (timer) clearTimeout(timer);
        timer = null;
        await flush();
      },
    }),
    {
      name: "resume-forge-backup",
      partialize: (s) => ({
        fileName: s.fileName,
        lastSavedAt: s.lastSavedAt,
        lastExportAt: s.lastExportAt,
      }),
    }
  )
);

/* ---- reading, writing, reconciling -------------------------------- */

const aborted = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const looksLikeDb = (x: unknown): x is DB =>
  !!x && typeof x === "object" && Array.isArray((x as DB).entries) && Array.isArray((x as DB).variants);

/**
 * Decide what the connected file means for this device. Identical to what we
 * would write, or empty, and backup simply resumes; anything else came from
 * somewhere other than this browser and the user gets to choose.
 */
async function reconcile() {
  if (!handle) return;
  try {
    const text = (await (await handle.getFile()).text()).trim();
    if (text && text !== serialise(useStore.getState().db)) {
      const parsed: unknown = JSON.parse(text);
      if (looksLikeDb(parsed)) {
        return useBackup.setState({ status: "conflict", incoming: parsed, error: "" });
      }
    }
  } catch (e) {
    // an unreadable or unparseable file is not a conflict: treat it as empty
    // and let the next write replace it, but say so if the read itself failed
    if (!(e instanceof SyntaxError)) {
      return useBackup.setState({ status: "error", error: message(e) });
    }
  }
  useBackup.setState({ status: "on", incoming: null, error: "" });
  await flush();
  watch();
}

let writing = false;
let queued = false;

async function flush() {
  const h = handle;
  if (!h || useBackup.getState().status === "conflict") return;
  if (writing) {
    queued = true;
    return;
  }
  writing = true;
  try {
    const w = await h.createWritable();
    await w.write(serialise(useStore.getState().db));
    await w.close();
    useBackup.setState({ status: "on", lastSavedAt: stamp(), error: "" });
  } catch (e) {
    useBackup.setState({ status: "error", error: message(e) });
  } finally {
    writing = false;
    if (queued) {
      queued = false;
      void flush();
    }
  }
}

/** A second of quiet after the last keystroke — typing a bullet is not eight saves. */
const DEBOUNCE = 1000;

let stop: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Hiding the tab is the last reliable moment before it is closed. Without this
 * an edit made inside the debounce window never reaches the file, and the next
 * launch sees a file that disagrees with this browser — a conflict prompt for
 * what is really just a second of lag.
 */
function flushNow() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (document.visibilityState === "hidden") void flush();
}

function watch() {
  if (stop) return;
  const unsubscribe = useStore.subscribe((s, prev) => {
    if (s.db === prev.db) return;
    if (useBackup.getState().status !== "on") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), DEBOUNCE);
  });
  document.addEventListener("visibilitychange", flushNow);
  stop = () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", flushNow);
  };
}

function unwatch() {
  if (timer) clearTimeout(timer);
  timer = null;
  stop?.();
  stop = null;
}

/** Days since an ISO stamp, or null if it never happened. */
export function daysSince(at: string): number | null {
  if (!at) return null;
  const ms = Date.now() - new Date(at).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}
