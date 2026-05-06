// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET } from "@/app/api/route/[id]/route";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { routes, routeMeta } from "@/lib/schema";
import { server } from "../mocks/server";
import { readFileSync as rfs } from "node:fs";
const mpHtml = rfs(join(__dirname, "..", "fixtures", "mp", "105924807.html"), "utf8");

const omFixture = JSON.parse(
  readFileSync(join(__dirname, "..", "fixtures", "open-meteo.json"), "utf8"),
);

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/route/[id] — cache hit", () => {
  it("uses cached meta and returns weather", async () => {
    await testDb.insert(routes).values({ id: 105924807, slug: "the-nose", name: "The Nose" });
    await testDb.insert(routeMeta).values({
      id: 105924807,
      lat: 37.73,
      lng: -119.64,
      areaPath: "Yosemite > El Capitan",
      grade: "5.9",
    });

    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(omFixture)),
      http.get("https://www.mountainproject.com/*", () => {
        throw new Error("scraper called on cache hit");
      }),
    );

    const res = await GET(new Request("http://localhost/api/route/105924807"), ctx("105924807"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.route).toMatchObject({
      id: 105924807,
      name: "The Nose",
      slug: "the-nose",
      area: "Yosemite > El Capitan",
      grade: "5.9",
      lat: 37.73,
      lng: -119.64,
      mpUrl: "https://www.mountainproject.com/route/105924807",
    });
    expect(j.weather.daily).toHaveLength(14);
    expect(res.headers.get("cache-control")).toMatch(/public.*max-age=600/);
  });

  it("returns 404 for unknown route id", async () => {
    const res = await GET(new Request("http://localhost/api/route/1"), ctx("1"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/route/[id] — cache miss", () => {
  it("scrapes MP, persists meta, returns weather", async () => {
    await testDb.insert(routes).values({ id: 105924807, slug: "the-nose", name: "the nose" });

    let scrapeCalls = 0;
    server.use(
      http.get("https://www.mountainproject.com/route/:id", () => {
        scrapeCalls++;
        return HttpResponse.text(mpHtml);
      }),
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(omFixture)),
    );

    const res = await GET(new Request("http://localhost/api/route/105924807"), ctx("105924807"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(scrapeCalls).toBe(1);
    expect(j.route.name).toBe("The Nose");
    expect(j.route.lat).toBeCloseTo(37.73, 1);

    // Verify meta was persisted
    const persisted = await testDb.query.routeMeta.findFirst();
    expect(persisted?.id).toBe(105924807);
    expect(persisted?.lat).toBeCloseTo(37.73, 1);

    // Verify routes.name was upgraded to canonical
    const r = await testDb.query.routes.findFirst();
    expect(r?.name).toBe("The Nose");
  });

  it("returns 502 when scrape fails", async () => {
    await testDb.insert(routes).values({ id: 999, slug: "x", name: "x" });
    server.use(
      http.get("https://www.mountainproject.com/route/:id", () => new HttpResponse(null, { status: 500 })),
    );
    const res = await GET(new Request("http://localhost/api/route/999"), ctx("999"));
    expect(res.status).toBe(502);
    const j = await res.json();
    expect(j.error).toBe("route_unavailable");
  });
});
