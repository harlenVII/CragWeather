import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });

  // Ensure localStorage methods exist in jsdom environment
  if (typeof localStorage !== "undefined" && !localStorage.getItem) {
    const storage: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem(key: string) {
        return storage[key] ?? null;
      },
      setItem(key: string, value: string) {
        storage[key] = value;
      },
      removeItem(key: string) {
        delete storage[key];
      },
      clear() {
        Object.keys(storage).forEach((key) => delete storage[key]);
      },
      get length() {
        return Object.keys(storage).length;
      },
      key(index: number) {
        const keys = Object.keys(storage);
        return keys[index] ?? null;
      },
    };
  }
});

afterEach(() => server.resetHandlers());
afterAll(() => server.close());
