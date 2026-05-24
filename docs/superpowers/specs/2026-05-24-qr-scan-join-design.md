# QR scan for "Join a list"

**Date:** 2026-05-24
**Status:** Approved

## Goal

Let users on mobile join a shared list by scanning the QR code shown on another device, instead of typing or pasting the URL. The current Join flow only accepts a pasted link, which is awkward on a phone.

## Scope

- In-app QR scanner inside the existing `SyncModal` Join screen.
- Camera permission is requested by the browser when the scanner starts.
- The scanned URL is run through the existing `extractUuid` helper and reuses the existing `router.push('/list/<uuid>')` → `ConfirmJoin` page flow. No new routes or APIs.

**Out of scope:** front/rear camera switching, scanning an uploaded image file, scanning QR codes outside the Join flow.

## Dependency

Add `@yudiel/react-qr-scanner` (peer-dep: `react`). Used only inside `SyncModal` and the new `QrScanner` wrapper.

## UX flow

1. User opens the sync modal and clicks **Join a list**.
2. Join screen renders the existing paste-input + Join button, and a new full-width **"📷 Scan QR code"** button below them (secondary style, matching existing modal buttons).
3. Clicking the scan button replaces the button area with an inline viewfinder (~240×240px) inside the modal panel. A small **"Cancel"** link sits below the viewfinder and returns to the paste view.
4. The browser prompts for camera permission natively (via `getUserMedia`, triggered by the library).
5. On successful decode:
   - The decoded text is passed to `extractUuid`.
   - If a valid UUID is found → modal closes and we `router.push('/list/<uuid>')`. The existing `ConfirmJoin` page handles confirmation.
   - If no UUID is found → show inline error "That QR code isn't a CragWeather list link" and keep scanning so the user can try a different code without re-prompting.
6. On permission denied / no camera / insecure context (no `navigator.mediaDevices`) → hide the viewfinder and show inline message "Camera unavailable — paste the link instead". Paste input remains usable.

## Component structure

**New: `components/QrScanner.tsx`** — thin wrapper around `@yudiel/react-qr-scanner`.

Props:
- `onDecode(text: string): void` — fires for every successful scan.
- `onError(reason: "denied" | "no-camera" | "other"): void` — fires once when the camera cannot be used.

Keeping the wrapper thin makes `SyncModal` clean and lets tests mock `QrScanner` to drive `onDecode`/`onError` directly without touching the real library or camera.

**Modified: `components/SyncModal.tsx`**

New local state in the existing component:
- `scanning: boolean` — whether the viewfinder is shown.
- `scanError: string | null` — inline error for invalid QR or camera unavailable.

In the `effectiveMode === "join"` branch:
- When `!scanning`: render the existing input + Join button, plus a new "📷 Scan QR code" button that sets `scanning = true`.
- When `scanning`: render `<QrScanner onDecode={...} onError={...} />` inside a `.sync-modal__scanner` container, with a "Cancel" link that sets `scanning = false`.
- `scanError` renders in the existing `.sync-modal__error` style position; it is cleared whenever the user toggles the scanner or edits the paste input.

`handleClose` is extended to reset `scanning` and `scanError` alongside the existing reset of `mode`, `joinInput`, etc.

## Decode handling

```ts
function handleDecode(text: string) {
  const uuid = extractUuid(text);
  if (!uuid) {
    setScanError("That QR code isn't a CragWeather list link");
    return; // keep scanning
  }
  router.push(`/list/${uuid}`);
  handleClose();
}

function handleScanError(reason: "denied" | "no-camera" | "other") {
  setScanning(false);
  setScanError("Camera unavailable — paste the link instead");
}
```

`extractUuid` already exists in `SyncModal.tsx` and matches any UUID substring, so it works whether the QR encodes the full URL (`https://cragweather.app/list/<uuid>`) or just the UUID.

## Styling

Reuse existing modal-button and `.sync-modal__error` styles. New CSS additions:

- `.sync-modal__scanner` — rounded box framing the viewfinder, matches the existing rounded look of `.sync-modal__qr`.
- `.sync-modal__scan-cancel` — small text link below the viewfinder.

No changes to other modal styles.

## Error handling summary

| Situation | Behavior |
|---|---|
| User denies camera permission | Hide viewfinder, show "Camera unavailable — paste the link instead". Paste input still usable. |
| No camera / `navigator.mediaDevices` missing (e.g. insecure http) | Same as denied: hide viewfinder, show same message. |
| QR decoded but no UUID match | Show "That QR code isn't a CragWeather list link", keep scanning. |
| QR decoded with valid UUID | `router.push('/list/<uuid>')`, close modal. |

## Testing

Extend `tests/components/SyncModal.test.tsx`:

1. **Valid scan navigates and closes:** Mock `QrScanner` so its `onDecode` fires synchronously with `https://cragweather.app/list/<uuid>`. Click "Scan QR code", assert `router.push` was called with `/list/<uuid>` and modal closed.
2. **Invalid scan shows error and keeps scanning:** Mock `QrScanner` to fire `onDecode("https://example.com/foo")`. Assert the error message appears, `router.push` was not called, and the viewfinder is still mounted.
3. **Camera unavailable falls back to paste:** Mock `QrScanner` to fire `onError("denied")` on mount. Assert error message appears, viewfinder unmounts, paste input is still usable.

The wrapper component itself and real camera access are not tested (we trust the library).

## Out of scope / future ideas

- Front/rear camera switcher (the library defaults to rear-facing on mobile, which is correct).
- Scan from an uploaded image file.
- A standalone `/scan` route or PWA shortcut.
