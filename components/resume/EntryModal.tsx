"use client";

import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Field, Modal, Select, TagChips } from "@/components/ui/bits";
import VariantPicker from "@/components/resume/VariantPicker";
import { ALL_TAGS, KINDS } from "@/lib/library";
import type { Entry, EntryKind } from "@/lib/types";

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
  const e = s.db.entries.find((x) => x.id === entryId);
  if (!e) return null;
  const p = (patch: Partial<Entry>) => s.patchEntry(e.id, patch);
  return (
    <Modal open onClose={onClose} title={e.org}>
      <div className="space-y-3">
        <Field label="Organization / project" value={e.org} onChange={(v) => p({ org: v })} />
        <Field label="Role / tech" value={e.title} onChange={(v) => p({ title: v })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("location")} value={e.location} onChange={(v) => p({ location: v })} />
          <Field label="Period" value={e.period} onChange={(v) => p({ period: v })} />
        </div>
        <Select
          label="Kind"
          value={e.kind}
          onChange={(v) => p({ kind: v as EntryKind })}
          options={KINDS.map((k) => ({ value: k, label: k }))}
        />
        <div>
          <span className="lbl">{t("tags")}</span>
          <TagChips
            tags={e.tags}
            all={ALL_TAGS}
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
      </div>
    </Modal>
  );
}
