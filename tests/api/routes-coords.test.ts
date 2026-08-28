// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/routes/coords/route";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { routes, routeMeta } from "@/lib/schema";

beforeEach(async () => {
  await truncateAll();
  await testDb.insert(routes).values([
    { id: 101, slug: "the-nose", name: "The Nose" },
    { id: 102, slug: "astroman", name: "Astroman" },
    { id: 103, slug: "no-meta", name: "No Meta" },
  ]);
  await testDb.insert(routeMeta).values([
    { id: 101, lat: 47.55425, lng: -121.54968, areaPath: "Yosemite", grade: "5.14a" },
    { id: 102, lat: 37.734, lng: -119.637, areaPath: "Yosemite", grade: "5.11c" },
  ]);
});

afterAll(async () => {
  await closeDb();
});

function reqWith(body: unknown) {
  return new Request("http://localhost/api/routes/coords", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/routes/coords", () => {
  it("returns coordinates for the requested route ids", async () => {
    const res = await POST(reqWith({ ids: [101, 102] }));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { coords: { id: number; lat: number; lng: number }[] };
    expect([...j.coords].sort((a, b) => a.id - b.id)).toEqual([
      { id: 101, lat: 47.55425, lng: -121.54968 },
      { id: 102, lat: 37.734, lng: -119.637 },
    ]);
  });

  it("omits ids that have no route_meta row", async () => {
    const res = await POST(reqWith({ ids: [101, 103] }));
    const j = (await res.json()) as { coords: { id: number }[] };
    expect(j.coords.map((c) => c.id)).toEqual([101]);
  });

  it("omits ids that do not exist at all", async () => {
    const res = await POST(reqWith({ ids: [999999] }));
    expect(res.status).toBe(200);
    expect((await res.json()).coords).toEqual([]);
  });

  it("returns an empty array for an empty id list", async () => {
    const res = await POST(reqWith({ ids: [] }));
    expect(res.status).toBe(200);
    expect((await res.json()).coords).toEqual([]);
  });

  it("rejects a body whose ids field is not an array", async () => {
    expect((await POST(reqWith({ ids: "101" }))).status).toBe(400);
  });

  it("rejects more than 50 ids", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    expect((await POST(reqWith({ ids }))).status).toBe(400);
  });

  it("rejects non-integer ids", async () => {
    expect((await POST(reqWith({ ids: [1.5] }))).status).toBe(400);
    expect((await POST(reqWith({ ids: ["101"] }))).status).toBe(400);
  });

  it("rejects malformed json", async () => {
    const bad = new Request("http://localhost/api/routes/coords", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);
  });
});
