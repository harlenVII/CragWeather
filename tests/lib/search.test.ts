import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { searchRoutes } from "@/lib/search";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { routes } from "@/lib/schema";

beforeEach(async () => {
  await truncateAll();
  await testDb.insert(routes).values([
    { id: 1, slug: "the-nose", name: "The Nose" },
    { id: 2, slug: "astroman", name: "Astroman" },
    { id: 3, slug: "epinephrine", name: "Epinephrine" },
    { id: 4, slug: "the-naked-edge", name: "The Naked Edge" },
    { id: 5, slug: "high-exposure", name: "High Exposure" },
  ]);
});

afterAll(async () => {
  await closeDb();
});

describe("searchRoutes", () => {
  it("returns exact-name matches at the top", async () => {
    const r = await searchRoutes("the nose");
    expect(r[0]).toMatchObject({ id: 1, slug: "the-nose", name: "The Nose" });
  });

  it("tolerates typos via trigrams", async () => {
    const r = await searchRoutes("astroma");
    expect(r.length).toBeGreaterThan(0);
  });

  it("returns empty array for blank input", async () => {
    expect(await searchRoutes("")).toEqual([]);
    expect(await searchRoutes("   ")).toEqual([]);
  });

  it("respects limit parameter", async () => {
    const r = await searchRoutes("the", 2);
    expect(r.length).toBeLessThanOrEqual(2);
  });
});
