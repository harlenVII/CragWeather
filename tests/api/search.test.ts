import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/search/route";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { routes } from "@/lib/schema";

// @vitest-environment node

beforeEach(async () => {
  await truncateAll();
  await testDb.insert(routes).values([
    { id: 1, slug: "the-nose", name: "The Nose" },
    { id: 2, slug: "astroman", name: "Astroman" },
  ]);
});

afterAll(async () => {
  await closeDb();
});

function makeReq(q: string) {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
}

describe("GET /api/search", () => {
  it("returns matches for a query", async () => {
    const res = await GET(makeReq("nose"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.results.map((r: { id: number }) => r.id)).toContain(1);
  });

  it("returns empty array for missing q", async () => {
    const res = await GET(new Request("http://localhost/api/search"));
    const j = await res.json();
    expect(j.results).toEqual([]);
  });
});
