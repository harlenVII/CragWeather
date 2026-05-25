# QR Scan for "Join a List" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app QR scanner to the Join-a-list screen of `SyncModal` so mobile users can join a shared list by scanning the QR code on another device instead of pasting a URL.

**Architecture:** A thin `QrScanner` wrapper around `@yudiel/react-qr-scanner` exposes a clean `onDecode(text)` / `onError(reason)` API. `SyncModal` gets a "Scan QR code" button in Join mode that swaps the paste view for an inline viewfinder. A successful decode runs through the existing `extractUuid` helper and reuses the existing `router.push('/list/<uuid>')` → `ConfirmJoin` flow. No new routes or APIs.

**Tech Stack:** Next.js 14 + React 18, TypeScript, Vitest + React Testing Library, `@yudiel/react-qr-scanner` (new).

**Spec:** `docs/superpowers/specs/2026-05-24-qr-scan-join-design.md`

---

## File Structure

| Path | Responsibility | Status |
|------|----------------|--------|
| `components/QrScanner.tsx` | Thin wrapper around `@yudiel/react-qr-scanner`. Exposes `onDecode(text)` / `onError(reason)` and maps library events to that simpler API. | New |
| `components/SyncModal.tsx` | Owns sync UI. Add `scanning`/`scanError` state, scan button, viewfinder render in Join mode, and decode/error handlers. | Modify |
| `app/globals.css` | Add `.sync-modal__scanner` and `.sync-modal__scan-cancel` rules. | Modify |
| `tests/components/SyncModal.test.tsx` | Cover valid scan, invalid scan, and camera-unavailable cases. `QrScanner` is mocked at the module level. | Modify |
| `package.json` / `package-lock.json` | Adds `@yudiel/react-qr-scanner` dependency. | Modify |

---

## Task 1: Install `@yudiel/react-qr-scanner` [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the dependency**

Run from repo root:
```bash
npm install @yudiel/react-qr-scanner
```

- [ ] **Step 2: Verify install**

Run:
```bash
node -e "console.log(require('@yudiel/react-qr-scanner/package.json').version)"
```
Expected: a printed version string (e.g. `2.x.y`), no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @yudiel/react-qr-scanner for in-app QR scanning"
```

---

## Task 2: Create `QrScanner` wrapper component [model: claude-sonnet-4-6]

This wrapper isolates the library's API (which yields an array of `IDetectedBarcode` objects with a `rawValue` field) and converts errors into a small union (`"denied" | "no-camera" | "other"`). Keeping the library's surface area inside one file makes `SyncModal` easier to test and easier to swap libraries later if needed.

**Files:**
- Create: `components/QrScanner.tsx`

- [ ] **Step 1: Write the wrapper**

Create `components/QrScanner.tsx` with this exact content:

```tsx
"use client";

import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";

type QrScannerProps = {
  onDecode: (text: string) => void;
  onError: (reason: "denied" | "no-camera" | "other") => void;
};

function classifyError(err: unknown): "denied" | "no-camera" | "other" {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: string }).name;
    if (name === "NotAllowedError" || name === "SecurityError") return "denied";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "no-camera";
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices) return "no-camera";
  return "other";
}

export function QrScanner({ onDecode, onError }: QrScannerProps) {
  return (
    <Scanner
      onScan={(results: IDetectedBarcode[]) => {
        const first = results[0];
        if (first && first.rawValue) onDecode(first.rawValue);
      }}
      onError={(err) => onError(classifyError(err))}
      constraints={{ facingMode: "environment" }}
      formats={["qr_code"]}
      styles={{ container: { width: "100%", height: "100%" } }}
    />
  );
}
```

- [ ] **Step 2: Verify the file type-checks**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. If `@yudiel/react-qr-scanner` exports `IDetectedBarcode` under a different name in the installed version, adjust the import — but keep `rawValue` access and the same exported `QrScanner` signature.

- [ ] **Step 3: Commit**

```bash
git add components/QrScanner.tsx
git commit -m "feat: add QrScanner wrapper around @yudiel/react-qr-scanner"
```

---

## Task 3: Add CSS for the scanner [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `app/globals.css` (append after the existing `.sync-modal__back` rule, around line 253)

- [ ] **Step 1: Append the CSS rules**

Add these rules immediately after the closing `}` of `.sync-modal__back` (search for `.sync-modal__back {` to locate it):

```css
.sync-modal__scanner {
  margin: 0.75rem 0; padding: 0.5rem; background: rgba(127,127,127,0.08);
  border-radius: 0.5rem; aspect-ratio: 1 / 1; max-width: 280px;
  margin-left: auto; margin-right: auto; overflow: hidden;
}
.sync-modal__scan-cancel {
  display: block; margin: 0.25rem auto 0; background: transparent; border: 0;
  padding: 0; color: var(--muted, #6b7280); font-size: 0.85rem; cursor: pointer;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "style: add CSS for QR scanner viewfinder in SyncModal"
```

---

## Task 4: SyncModal — scan button + valid-QR navigation (TDD) [model: claude-sonnet-4-6]

This is the happy path: user clicks "Scan QR code", `QrScanner` fires `onDecode` with a valid list URL, the modal closes and the router pushes `/list/<uuid>`.

**Files:**
- Modify: `components/SyncModal.tsx`
- Modify: `tests/components/SyncModal.test.tsx`

- [ ] **Step 1: Set up the `QrScanner` module mock in tests**

At the top of `tests/components/SyncModal.test.tsx`, immediately after the existing imports (line 5), add:

```tsx
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

let mockScannerProps: { onDecode: (text: string) => void; onError: (reason: "denied" | "no-camera" | "other") => void } | null = null;
vi.mock("@/components/QrScanner", () => ({
  QrScanner: (props: { onDecode: (text: string) => void; onError: (reason: "denied" | "no-camera" | "other") => void }) => {
    mockScannerProps = props;
    return <div data-testid="mock-qr-scanner" />;
  },
}));
```

Update the existing `beforeEach` block (currently `vi.restoreAllMocks()`) to also reset the mocks:

```tsx
beforeEach(() => {
  vi.restoreAllMocks();
  pushMock.mockReset();
  mockScannerProps = null;
});
```

- [ ] **Step 2: Write the failing test**

Add this test inside the `describe("SyncModal", ...)` block (after the existing tests):

```tsx
it("scanning a valid list URL pushes to /list/<uuid> and closes the modal", async () => {
  const onClose = vi.fn();
  render(
    <SyncModal open onClose={onClose} listId={null} createSyncedList={async () => null} unlink={() => {}} />,
  );

  await userEvent.click(screen.getByRole("button", { name: /join a list/i }));
  await userEvent.click(screen.getByRole("button", { name: /scan qr code/i }));

  expect(screen.getByTestId("mock-qr-scanner")).toBeInTheDocument();
  expect(mockScannerProps).not.toBeNull();

  mockScannerProps!.onDecode("https://cragweather.app/list/abcd1234-0000-0000-0000-000000000099");

  expect(pushMock).toHaveBeenCalledWith("/list/abcd1234-0000-0000-0000-000000000099");
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
npx vitest run tests/components/SyncModal.test.tsx -t "scanning a valid"
```
Expected: FAIL with "Unable to find role 'button' with the name /scan qr code/i" (the button doesn't exist yet).

- [ ] **Step 4: Modify `SyncModal.tsx` — imports and state**

In `components/SyncModal.tsx`:

a) Add the `QrScanner` import below the existing `qrcode.react` import (around line 5):

```tsx
import { QrScanner } from "@/components/QrScanner";
```

b) Inside the `SyncModal` function body, add two new `useState` lines immediately after the existing `const [joinError, setJoinError] = useState<string | null>(null);` (around line 30):

```tsx
const [scanning, setScanning] = useState(false);
const [scanError, setScanError] = useState<string | null>(null);
```

c) Extend `handleClose` to reset the new state. The current body of `handleClose` is:

```tsx
function handleClose() {
  setMode("choose");
  setError(null);
  setJoinInput("");
  setJoinError(null);
  onClose();
}
```

Replace it with:

```tsx
function handleClose() {
  setMode("choose");
  setError(null);
  setJoinInput("");
  setJoinError(null);
  setScanning(false);
  setScanError(null);
  onClose();
}
```

- [ ] **Step 5: Modify `SyncModal.tsx` — add decode/error handlers**

Add these two functions inside the `SyncModal` component, immediately after the existing `handleJoin` function (around line 83):

```tsx
function handleDecode(text: string) {
  const uuid = extractUuid(text);
  if (!uuid) {
    setScanError("That QR code isn't a CragWeather list link");
    return;
  }
  router.push(`/list/${uuid}`);
  handleClose();
}

function handleScanError(reason: "denied" | "no-camera" | "other") {
  setScanning(false);
  setScanError("Camera unavailable — paste the link instead");
}
```

(`reason` is intentionally unread inside the function body — all three cases produce the same user-facing message. Keep the parameter named so the type is documented at the call site.)

- [ ] **Step 6: Modify `SyncModal.tsx` — update the Join mode JSX**

Find the `effectiveMode === "join"` JSX block (starts around line 144). Replace the entire block with:

```tsx
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
```

- [ ] **Step 7: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/components/SyncModal.test.tsx -t "scanning a valid"
```
Expected: PASS.

- [ ] **Step 8: Run the full SyncModal test file to confirm no regressions**

Run:
```bash
npx vitest run tests/components/SyncModal.test.tsx
```
Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add components/SyncModal.tsx tests/components/SyncModal.test.tsx
git commit -m "feat: add QR scan button in Join a list flow"
```

---

## Task 5: SyncModal — invalid QR keeps scanning and shows error (TDD) [model: claude-sonnet-4-6]

**Files:**
- Modify: `tests/components/SyncModal.test.tsx`

The implementation already supports this (it's the `if (!uuid)` branch added in Task 4). This task adds the regression test.

- [ ] **Step 1: Write the test**

Add this test inside the `describe("SyncModal", ...)` block, after the test from Task 4:

```tsx
it("scanning a non-list QR shows an error and keeps the scanner mounted", async () => {
  const onClose = vi.fn();
  render(
    <SyncModal open onClose={onClose} listId={null} createSyncedList={async () => null} unlink={() => {}} />,
  );

  await userEvent.click(screen.getByRole("button", { name: /join a list/i }));
  await userEvent.click(screen.getByRole("button", { name: /scan qr code/i }));

  mockScannerProps!.onDecode("https://example.com/some-other-qr");

  expect(pushMock).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText(/isn't a CragWeather list link/i)).toBeInTheDocument();
  expect(screen.getByTestId("mock-qr-scanner")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/components/SyncModal.test.tsx -t "scanning a non-list"
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/components/SyncModal.test.tsx
git commit -m "test: cover invalid QR code in SyncModal scanner"
```

---

## Task 6: SyncModal — camera unavailable falls back to paste (TDD) [model: claude-sonnet-4-6]

**Files:**
- Modify: `tests/components/SyncModal.test.tsx`

- [ ] **Step 1: Write the test**

Add this test inside the `describe("SyncModal", ...)` block:

```tsx
it("when the camera is unavailable, hides the scanner and shows a fallback message", async () => {
  const { act } = await import("@testing-library/react");
  render(
    <SyncModal open onClose={() => {}} listId={null} createSyncedList={async () => null} unlink={() => {}} />,
  );

  await userEvent.click(screen.getByRole("button", { name: /join a list/i }));
  await userEvent.click(screen.getByRole("button", { name: /scan qr code/i }));

  expect(screen.getByTestId("mock-qr-scanner")).toBeInTheDocument();

  act(() => {
    mockScannerProps!.onError("denied");
  });

  expect(screen.queryByTestId("mock-qr-scanner")).not.toBeInTheDocument();
  expect(screen.getByText(/Camera unavailable/i)).toBeInTheDocument();
  // Paste input is still usable
  expect(screen.getByPlaceholderText(/cragweather\.app\/list/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/components/SyncModal.test.tsx -t "camera is unavailable"
```
Expected: PASS.

- [ ] **Step 3: Run the entire test suite to catch regressions**

Run:
```bash
npm test
```
Expected: all tests PASS. If unrelated tests fail, stop and investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add tests/components/SyncModal.test.tsx
git commit -m "test: cover camera-unavailable fallback in SyncModal scanner"
```

---

## Task 7: Type-check and manual verification [model: claude-sonnet-4-6]

**Files:** (verification only — no edits expected)

- [ ] **Step 1: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Build**

Run:
```bash
npm run build
```
Expected: build succeeds. Failures in unrelated routes are out of scope; failures in `SyncModal`/`QrScanner` must be fixed before continuing.

- [ ] **Step 3: Start the dev server and verify in a browser**

Run in the background:
```bash
npm run dev
```

Open `http://localhost:3000`, save a route so the SavedRoutes section shows a sync entry, open the sync modal, click **Join a list**, then click **📷 Scan QR code**.

Verify:
- Browser prompts for camera permission.
- Granting permission shows a live viewfinder inside the modal panel.
- Denying permission shows "Camera unavailable — paste the link instead" and the paste input is still usable.
- Clicking "Cancel scan" returns to the paste view.
- Scanning a real CragWeather list QR (use the one shown in the Share screen on the same device, or another device) navigates to the `/list/<uuid>` page.

Note any browsers/devices tested and the result. If something user-visible misbehaves, file it as a follow-up task — do not silently ship.

- [ ] **Step 4: Stop the dev server**

(End the background `npm run dev` process.)

- [ ] **Step 5: No commit needed for verification**

If the verification surfaced fixes, commit them as their own `fix:` commit referencing what changed.

---

## Self-Review

**Spec coverage**
- Dependency added → Task 1 ✓
- `QrScanner` wrapper component → Task 2 ✓
- Scan button + viewfinder + Cancel in Join mode → Task 4 ✓
- `extractUuid` reuse and `router.push` → Task 4 ✓
- Invalid QR error + keep scanning → Task 4 (impl) + Task 5 (test) ✓
- Camera unavailable fallback → Task 4 (impl) + Task 6 (test) ✓
- CSS additions → Task 3 ✓
- Three test cases from spec → Tasks 4/5/6 ✓
- Out-of-scope items (camera switcher, file upload) → not in plan ✓

**Type consistency**
- `onDecode(text: string)` and `onError(reason: "denied" | "no-camera" | "other")` are used identically in `QrScanner.tsx`, the `SyncModal` handlers, and the test mock module. ✓
- `handleDecode` / `handleScanError` match what's wired in the JSX. ✓
- `mockScannerProps` type in tests matches the real `QrScanner` props. ✓

**Placeholder scan:** No TBDs, TODOs, or hand-waved steps. Every code step shows the full code to write.
