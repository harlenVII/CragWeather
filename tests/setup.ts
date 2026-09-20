import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

// jsdom ships no ResizeObserver, and ChartCrosshair constructs one. It lives
// here rather than in one test file because ForecastChart mounts the crosshair,
// so any test rendering the forecast stack needs it too. A no-op stub leaves the
// resize path itself untested — acceptable: jsdom cannot produce a resize, and
// the initial measure plus the MutationObserver fallback are both covered in
// tests/components/ChartCrosshair.test.tsx.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });

  // vitest's jsdom does not expose localStorage methods as callable functions
  // globally; replace with a fully-functional in-memory implementation.
  if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") {
    const storage: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem(key: string) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
      setItem(key: string, value: string) { storage[key] = String(value); },
      removeItem(key: string) { delete storage[key]; },
      clear() { Object.keys(storage).forEach((k) => delete storage[k]); },
      get length() { return Object.keys(storage).length; },
      key(index: number) { return Object.keys(storage)[index] ?? null; },
    };
  }
});

afterEach(() => server.resetHandlers());
afterAll(() => server.close());
