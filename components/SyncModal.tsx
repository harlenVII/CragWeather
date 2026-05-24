"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useFavorites } from "@/lib/favorites";

export function SyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { listId, createSyncedList, unlink } = useFavorites();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const shareUrl = listId
    ? (typeof window !== "undefined" ? `${window.location.origin}/list/${listId}` : `/list/${listId}`)
    : null;

  async function handleCreate() {
    setPending(true);
    setError(null);
    const id = await createSyncedList();
    setPending(false);
    if (!id) setError("Could not create shared list. Try again.");
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // ignore — user can still select the text
    }
  }

  function handleUnlink() {
    unlink();
    onClose();
  }

  return (
    <div className="sync-modal" role="dialog" aria-modal="true" aria-label="Sync saved routes">
      <div className="sync-modal__backdrop" onClick={onClose} />
      <div className="sync-modal__panel">
        <button className="sync-modal__close" onClick={onClose} aria-label="Close">×</button>
        <h2>Sync to another device</h2>

        {!listId && (
          <>
            <p>Create a shareable link, then open it on your other device.</p>
            <button onClick={handleCreate} disabled={pending}>
              {pending ? "Creating…" : "Create shared list"}
            </button>
            {error && <p className="sync-modal__error">{error}</p>}
          </>
        )}

        {listId && shareUrl && (
          <>
            <p>Open this link on your other device to sync.</p>
            <div className="sync-modal__url">
              <code>{shareUrl}</code>
              <button onClick={handleCopy}>Copy</button>
            </div>
            <div className="sync-modal__qr">
              <QRCodeSVG value={shareUrl} size={180} />
            </div>
            <button className="sync-modal__unlink" onClick={handleUnlink}>
              Unlink this device
            </button>
            <p className="sync-modal__hint">
              Unlinking only affects this device. Other linked devices keep working.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
