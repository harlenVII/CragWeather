"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { QrScanner } from "@/components/QrScanner";

type SyncModalProps = {
  open: boolean;
  onClose: () => void;
  listId: string | null;
  createSyncedList: () => Promise<string | null>;
  unlink: () => void;
};

type Mode = "choose" | "share" | "join";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function extractUuid(input: string): string | null {
  const match = input.match(UUID_RE);
  return match ? match[0] : null;
}

export function SyncModal({ open, onClose, listId, createSyncedList, unlink }: SyncModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  if (!open) return null;

  // When already linked, skip the choice screen and go straight to share
  const effectiveMode = listId && mode === "choose" ? "share" : mode;

  const shareUrl = listId
    ? (typeof window !== "undefined" ? `${window.location.origin}/list/${listId}` : `/list/${listId}`)
    : null;

  function handleClose() {
    setMode("choose");
    setError(null);
    setJoinInput("");
    setJoinError(null);
    setScanning(false);
    setScanError(null);
    onClose();
  }

  async function handleCreate() {
    setPending(true);
    setError(null);
    const id = await createSyncedList();
    setPending(false);
    if (!id) {
      setError("Could not create shared list. Try again.");
    } else {
      setMode("share");
    }
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
    handleClose();
  }

  function handleJoin() {
    const uuid = extractUuid(joinInput.trim());
    if (!uuid) {
      setJoinError("Couldn't find a valid list link. Paste the full URL or just the link ID.");
      return;
    }
    router.push(`/list/${uuid}`);
    handleClose();
  }

  function handleDecode(text: string) {
    const uuid = extractUuid(text);
    if (!uuid) {
      setScanError("That QR code isn't a CragWeather list link");
      return;
    }
    router.push(`/list/${uuid}`);
    handleClose();
  }

  function handleScanError(_reason: "denied" | "no-camera" | "other") {
    setScanning(false);
    setScanError("Camera unavailable — paste the link instead");
  }

  return (
    <div className="sync-modal" role="dialog" aria-modal="true" aria-label="Sync saved routes">
      <div className="sync-modal__backdrop" onClick={handleClose} />
      <div className="sync-modal__panel">
        <button className="sync-modal__close" onClick={handleClose} aria-label="Close">×</button>

        {effectiveMode === "choose" && (
          <>
            <h2>Sync to another device</h2>
            <p>What would you like to do?</p>
            <div className="sync-modal__choices">
              <button className="sync-modal__choice" onClick={() => { setError(null); setMode("share"); }}>
                <span className="sync-modal__choice-title">Share my list</span>
                <span className="sync-modal__choice-desc">Create a link so another device can join your saved routes</span>
              </button>
              <button className="sync-modal__choice" onClick={() => { setJoinError(null); setMode("join"); }}>
                <span className="sync-modal__choice-title">Join a list</span>
                <span className="sync-modal__choice-desc">Paste a link from another device to sync this browser</span>
              </button>
            </div>
          </>
        )}

        {effectiveMode === "share" && (
          <>
            <h2>Share my list</h2>
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
            {!listId && (
              <button className="sync-modal__back" onClick={() => setMode("choose")}>← Back</button>
            )}
          </>
        )}

        {effectiveMode === "join" && (
          <>
            <h2>Join a list</h2>
            {!scanning && (
              <>
                <p>Paste the link from the other device.</p>
                <div className="sync-modal__join">
                  <input
                    className="sync-modal__join-input"
                    type="text"
                    value={joinInput}
                    onChange={(e) => { setJoinInput(e.target.value); setJoinError(null); }}
                    placeholder="https://cragweather.app/list/…"
                    autoFocus
                  />
                  <button onClick={handleJoin} disabled={!joinInput.trim()}>Join</button>
                </div>
                {joinError && <p className="sync-modal__error">{joinError}</p>}
                <button onClick={() => { setScanError(null); setScanning(true); }}>
                  📷 Scan QR code
                </button>
                <p className="sync-modal__hint">
                  You can also scan the QR code with your camera app — it opens the same join page.
                </p>
              </>
            )}
            {scanning && (
              <>
                <div className="sync-modal__scanner">
                  <QrScanner onDecode={handleDecode} onError={handleScanError} />
                </div>
                <button className="sync-modal__scan-cancel" onClick={() => setScanning(false)}>
                  Cancel scan
                </button>
              </>
            )}
            {scanError && <p className="sync-modal__error">{scanError}</p>}
            <button className="sync-modal__back" onClick={() => setMode("choose")}>← Back</button>
          </>
        )}
      </div>
    </div>
  );
}
