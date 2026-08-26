"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useBackup } from "@/lib/backup";
import { useT } from "@/lib/i18n";
import { Field, Modal, Select, TagChips } from "@/components/ui/bits";
import PeriodField from "@/components/resume/PeriodField";
import VariantPicker from "@/components/resume/VariantPicker";
import { KINDS } from "@/lib/library";
import type { Entry, EntryKind } from "@/lib/types";

/** Long enough to read the tick, short enough not to feel like waiting on a spinner. */
const CONFIRM_MS = 900;

/** The one place an entry's own fields are edited — plus which variants carry it. */
export default function EntryModal({
  entryId,
  onClose,
}: {
  entryId: string | null;
  onClose: () => void;
}) {
  const s = useStore();
  const t = useT();
  const status = useBackup((b) => b.status);
  const fileName = useBackup((b) => b.fileName);
  const [said, setSaid] = useState<"" | "saved" | "failed">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Closing does not unmount this — `entryId` just goes null — so the tick has
     to be cleared by hand, or the next entry opens already claiming to be saved. */
  useEffect(() => {
    setSaid("");
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [entryId]);

  const e = s.db.entries.find((x) => x.id === entryId);
  if (!e) return null;
  const p = (patch: Partial<Entry>) => s.patchEntry(e.id, patch);

  /**
   * Every field here writes as it is typed, and has since the first version.
   * That is invisible, and invisible saving is indistinguishable from no saving
   * — so there is a button, it flushes the backup file rather than waiting out
   * the debounce, and it says so when it is done. Which means it also has to
   * say so when it is not: a tick that appears whatever happened is worth less
   * than no tick at all.
   */
  const toFile = status === "on";
  const save = async () => {
    await useBackup.getState().saveNow();
    if (useBackup.getState().status === "error") {
      setSaid("failed");
      return;
    }
    setSaid("saved");
    timer.current = setTimeout(onClose, CONFIRM_MS);
  };

  return (
    <Modal open onClose={onClose} title={e.org}>
      <div className="space-y-3">
        <Field label="Organization / project" value={e.org} onChange={(v) => p({ org: v })} />
        <Field label="Role / tech" value={e.title} onChange={(v) => p({ title: v })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("location")} value={e.location} onChange={(v) => p({ location: v })} />
          <Select
            label="Kind"
            value={e.kind}
            onChange={(v) => p({ kind: v as EntryKind })}
            options={KINDS.map((k) => ({ value: k, label: k }))}
          />
        </div>
        <PeriodField value={e.period} onChange={(v) => p({ period: v })} />
        <div>
          <span className="lbl">{t("tags")}</span>
          <TagChips
            tags={e.tags}
            all={s.db.tags}
            onToggle={(tg) =>
              p({ tags: e.tags.includes(tg) ? e.tags.filter((x) => x !== tg) : [...e.tags, tg] })
            }
          />
        </div>

        <VariantPicker
          id={e.id}
          onSet={(vid, on) => s.setEntryInVariant(vid, e.id, on)}
          onSetAll={(on) => s.setEntryEverywhere(e.id, on)}
        />

        <div className="flex items-center gap-2 pt-1">
          <button
            className="btn"
            style={{ color: "var(--crit)" }}
            onClick={() => {
              s.removeEntry(e.id);
              onClose();
            }}
          >
            {t("remove")}
          </button>
          <span
            className="mono ml-auto max-w-[260px] text-right text-[9.5px] leading-[1.4]"
            style={{ color: said === "failed" ? "var(--crit)" : "var(--faint)" }}
            title={toFile ? fileName : undefined}
          >
            {said === "failed" ? t("saveFailed") : toFile ? t("keptFile") : t("keptLocal")}
          </span>
          <button
            className="btn btn-primary shrink-0"
            onClick={save}
            disabled={said === "saved"}
          >
            {said === "saved" ? `✓ ${t("saved")}` : t("save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
