"use client";

import { useStore } from "@/lib/store";
import { exportFile, invitePending, useBackup } from "@/lib/backup";
import { useT } from "@/lib/i18n";
import { Modal } from "@/components/ui/bits";

/**
 * The backup file has been opt-in since it was built, which means the people
 * most likely to lose everything are exactly the ones who never went looking
 * for it. So the app asks, once, unprompted — in terms of what it protects
 * rather than what it is.
 *
 * Waving it away on an empty app answers "not yet", not "no", so it returns
 * the first time there is work on the line. After that it stays gone: a
 * dialog that keeps coming back is one people learn to dismiss unread, and
 * the coloured badge in the header carries the message from then on.
 */
export default function BackupInvite() {
  const t = useT();
  const hydrated = useStore((s) => s.hydrated);
  const ownWorkAt = useStore((s) => s.ownWorkAt);
  const b = useBackup();

  // `ready` matters: before init settles, status is still the default `off`,
  // and asking someone who connected a file months ago would be a bug
  const open = hydrated && b.ready && invitePending(b.status, b.invite, !!ownWorkAt);

  return (
    <Modal open={open} onClose={b.dismissInvite} title={t("inviteTitle")}>
      <p className="mb-4 text-[13px] leading-[1.6]" style={{ color: "var(--muted)" }}>
        {t(b.status === "unsupported" ? "inviteBodyUnsupported" : "inviteBody")}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {b.status === "unsupported" ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              exportFile();
              b.dismissInvite();
            }}
          >
            ↓ {t("exportJson")}
          </button>
        ) : (
          <>
            {/* no dismiss on these: a cancelled picker should leave the question standing */}
            <button className="btn btn-primary" onClick={() => void b.connectNew()}>
              {t("backupChoose")}
            </button>
            <button className="btn" onClick={() => void b.connectExisting()}>
              {t("backupUseExisting")}
            </button>
          </>
        )}
        <button className="btn" onClick={b.dismissInvite}>
          {t("inviteLater")}
        </button>
      </div>

      <p className="mt-3.5 text-[11.5px]" style={{ color: "var(--faint)" }}>
        {t("inviteFootnote")}
      </p>
    </Modal>
  );
}
