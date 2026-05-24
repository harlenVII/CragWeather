// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/list/route";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { sharedLists } from "@/lib/schema";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

function reqWith(body: unknown) {
  return new Request("http://localhost/api/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/list", () => {
  it("creates a list and returns its uuid", async () => {
    const routes = [{ id: 1, name: "The Nose", area: "Yosemite", grade: "5.9" }];
    const res = await POST(reqWith({ routes }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await testDb.query.sharedLists.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].routes).toEqual(routes);
  });

  it("accepts an empty routes array", async () => {
    const res = await POST(reqWith({ routes: [] }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects malformed body with 400", async () => {
    const res = await POST(reqWith({ routes: "not-an-array" }));
    expect(res.status).toBe(400);
  });

  it("rejects > 50 routes with 400", async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      id: i, name: `r${i}`, area: null, grade: null,
    }));
    const res = await POST(reqWith({ routes: many }));
    expect(res.status).toBe(400);
  });

  it("rejects non-JSON body with 400", async () => {
    const req = new Request("http://localhost/api/list", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
