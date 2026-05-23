import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

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
