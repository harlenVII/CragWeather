# PWA Installable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CragWeather installable as a PWA (Add to Home Screen) on mobile and desktop with no offline caching.

**Architecture:** A static `public/manifest.json` declares app metadata; a no-op `public/sw.js` satisfies Chrome's service worker installability requirement without caching anything; a `"use client"` component registers the SW on mount; `app/layout.tsx` links the manifest and renders the registration component.

**Tech Stack:** Next.js 14 App Router, `sharp` (devDependency, one-time icon generation from SVG), Vitest + Testing Library

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/generate-icons.ts` | Create | One-time script: renders SVG → PNG icons using sharp |
| `public/icon-192.png` | Create (generated) | 192×192 home screen icon |
| `public/icon-512.png` | Create (generated) | 512×512 splash/desktop icon |
| `public/manifest.json` | Create | Web app manifest |
| `public/sw.js` | Create | No-op pass-through service worker |
| `components/ServiceWorkerRegistration.tsx` | Create | Client component that registers SW on mount |
| `tests/components/ServiceWorkerRegistration.test.tsx` | Create | Unit tests for SW registration component |
| `app/layout.tsx` | Modify | Add manifest link, PWA meta tags, render registration component |

---

## Task 1: Generate placeholder icons [model: sonnet]

**Files:**
- Create: `scripts/generate-icons.ts`
- Create: `public/icon-192.png` (generated output)
- Create: `public/icon-512.png` (generated output)

- [ ] **Step 1: Install sharp as devDependency**

```bash
npm install --save-dev sharp @types/sharp
```

Expected: `package.json` devDependencies gains `sharp` and `@types/sharp`.

- [ ] **Step 2: Create icon generation script**

Create `scripts/generate-icons.ts`:

```typescript
import sharp from "sharp";
import path from "node:path";

const publicDir = path.join(process.cwd(), "public");

function makeSvg(size: number): Buffer {
  const fontSize = Math.round(size * 0.375);
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="#c2410c"/>
  <text
    x="${size / 2}"
    y="${size / 2 + fontSize * 0.37}"
    font-family="system-ui, Arial, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    fill="white"
    text-anchor="middle"
  >CW</text>
</svg>`;
  return Buffer.from(svg);
}

async function main() {
  await sharp(makeSvg(192)).png().toFile(path.join(publicDir, "icon-192.png"));
  console.log("✓ icon-192.png");

  await sharp(makeSvg(512)).png().toFile(path.join(publicDir, "icon-512.png"));
  console.log("✓ icon-512.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Run the script**

```bash
npx tsx scripts/generate-icons.ts
```

Expected output:
```
✓ icon-192.png
✓ icon-512.png
```

Verify files exist:
```bash
ls -lh public/icon-*.png
```

Expected: two PNG files, each a few KB.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-icons.ts public/icon-192.png public/icon-512.png package.json package-lock.json
git commit -m "feat: add PWA placeholder icons"
```

---

## Task 2: Create manifest and service worker [model: haiku]

**Files:**
- Create: `public/manifest.json`
- Create: `public/sw.js`

- [ ] **Step 1: Create `public/manifest.json`**

```json
{
  "name": "CragWeather",
  "short_name": "CragWeather",
  "description": "14-day weather windows for rock climbing routes.",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#c2410c",
  "background_color": "#fafafa",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: Create `public/sw.js`**

```js
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
```

- [ ] **Step 3: Commit**

```bash
git add public/manifest.json public/sw.js
git commit -m "feat: add PWA manifest and no-op service worker"
```

---

## Task 3: ServiceWorkerRegistration component (TDD) [model: sonnet]

**Files:**
- Create: `components/ServiceWorkerRegistration.tsx`
- Create: `tests/components/ServiceWorkerRegistration.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ServiceWorkerRegistration.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

describe("ServiceWorkerRegistration", () => {
  afterEach(() => {
    // Restore navigator.serviceWorker to its original descriptor after each test
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it("registers /sw.js when serviceWorker is supported", () => {
    const register = vi.fn().mockResolvedValue({});
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });

    render(<ServiceWorkerRegistration />);

    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing when serviceWorker is not supported", () => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });

    // Should not throw
    expect(() => render(<ServiceWorkerRegistration />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/components/ServiceWorkerRegistration.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ServiceWorkerRegistration'`

- [ ] **Step 3: Implement the component**

Create `components/ServiceWorkerRegistration.tsx`:

```tsx
"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/components/ServiceWorkerRegistration.test.tsx
```

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/ServiceWorkerRegistration.tsx tests/components/ServiceWorkerRegistration.test.tsx
git commit -m "feat: add ServiceWorkerRegistration client component"
```

---

## Task 4: Wire up app/layout.tsx [model: haiku]

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update layout.tsx**

Replace the entire contents of `app/layout.tsx` with:

```tsx
import "./globals.css";
import type { Metadata } from "next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "CragWeather",
  description: "14-day weather windows for climbing routes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#c2410c" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CragWeather" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: all existing tests pass (layout changes don't affect API/component tests).

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wire PWA manifest, meta tags, and SW registration into layout"
```

---

## Verification

After all tasks are complete, verify installability in a browser:

1. Run `npm run build && npm run start`
2. Open `http://localhost:3000` in Chrome
3. Open DevTools → Application → Manifest — confirm manifest loads with correct fields
4. Open Application → Service Workers — confirm `sw.js` is registered and active
5. Check for install prompt in address bar (Chrome) or three-dot menu → "Install CragWeather"
6. On iOS Safari: Share → "Add to Home Screen" should work
