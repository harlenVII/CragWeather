// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/list/route";
import { GET, PUT } from "@/app/api/list/[id]/route";
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

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/list/[id]", () => {
  it("returns the routes for an existing list", async () => {
    const routes = [{ id: 7, name: "Astroman", area: "Yosemite", grade: "5.11c" }];
    const [row] = await testDb.insert(sharedLists).values({ routes }).returning({ id: sharedLists.id });

    const res = await GET(new Request(`http://localhost/api/list/${row.id}`), ctx(row.id));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.routes).toEqual(routes);
  });

  it("returns 404 for unknown id", async () => {
    const fakeUuid = "00000000-0000-0000-0000-000000000000";
    const res = await GET(new Request(`http://localhost/api/list/${fakeUuid}`), ctx(fakeUuid));
    expect(res.status).toBe(404);
  });

  it("returns 400 for malformed uuid", async () => {
    const res = await GET(new Request("http://localhost/api/list/not-a-uuid"), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/list/[id]", () => {
  function putReq(id: string, body: unknown) {
    return new Request(`http://localhost/api/list/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("replaces routes for an existing list", async () => {
    const original = [{ id: 1, name: "A", area: null, grade: null }];
    const updated = [
      { id: 1, name: "A", area: null, grade: null },
      { id: 2, name: "B", area: "Yosemite", grade: "5.10" },
    ];
    const [row] = await testDb.insert(sharedLists).values({ routes: original }).returning({ id: sharedLists.id });

    const res = await PUT(putReq(row.id, { routes: updated }), ctx(row.id));
    expect(res.status).toBe(200);

    const after = await testDb.query.sharedLists.findFirst();
    expect(after?.routes).toEqual(updated);
  });

  it("bumps updated_at", async () => {
    const [row] = await testDb.insert(sharedLists).values({ routes: [] }).returning({ id: sharedLists.id });
    const before = await testDb.query.sharedLists.findFirst();

    // wait a moment so timestamps differ
    await new Promise((r) => setTimeout(r, 20));
    await PUT(putReq(row.id, { routes: [{ id: 1, name: "x", area: null, grade: null }] }), ctx(row.id));

    const after = await testDb.query.sharedLists.findFirst();
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });

  it("returns 404 for unknown id", async () => {
    const fakeUuid = "00000000-0000-0000-0000-000000000000";
    const res = await PUT(putReq(fakeUuid, { routes: [] }), ctx(fakeUuid));
    expect(res.status).toBe(404);
  });

  it("returns 400 for malformed uuid", async () => {
    const res = await PUT(putReq("nope", { routes: [] }), ctx("nope"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for > 50 routes", async () => {
    const [row] = await testDb.insert(sharedLists).values({ routes: [] }).returning({ id: sharedLists.id });
    const many = Array.from({ length: 51 }, (_, i) => ({ id: i, name: `r${i}`, area: null, grade: null }));
    const res = await PUT(putReq(row.id, { routes: many }), ctx(row.id));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed body", async () => {
    const [row] = await testDb.insert(sharedLists).values({ routes: [] }).returning({ id: sharedLists.id });
    const res = await PUT(putReq(row.id, { routes: "nope" }), ctx(row.id));
    expect(res.status).toBe(400);
  });
});
