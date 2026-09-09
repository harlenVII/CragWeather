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

  it("serves stale meta when the refresh scrape fails", async () => {
    await testDb.insert(routes).values({ id: 105924807, slug: "the-nose", name: "The Nose" });
    await testDb.insert(routeMeta).values({
      id: 105924807,
      lat: 37.73,
      lng: -119.64,
      areaPath: "Yosemite > El Capitan",
      grade: "5.9",
      fetchedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days → stale
    });

    server.use(
      http.get("https://www.mountainproject.com/route/:id", () => new HttpResponse(null, { status: 500 })),
      http.get("https://api.open-meteo.com/v1/forecast", () => HttpResponse.json(omFixture)),
    );

    const res = await GET(new Request("http://localhost/api/route/105924807"), ctx("105924807"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.route).toMatchObject({ id: 105924807, lat: 37.73, lng: -119.64, grade: "5.9" });
    expect(j.weather.daily).toHaveLength(14);

    // Verify the stale row was NOT refreshed (fetchedAt must still be ~100 days ago)
    const persisted = await testDb.query.routeMeta.findFirst();
    expect(persisted?.fetchedAt.getTime()).toBeLessThan(Date.now() - 99 * 24 * 60 * 60 * 1000);
  });
});

describe("GET /api/route/[id] — air quality", () => {
  it("returns an air field alongside weather", async () => {
    await testDb.insert(routes).values({ id: 1, slug: "the-nose", name: "The Nose" });
    await testDb.insert(routeMeta).values({
      id: 1, lat: 37.734, lng: -119.637, areaPath: "Yosemite", grade: "5.9",
      fetchedAt: new Date(),
    });
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(omFixture),
      ),
      http.get("https://air-quality-api.open-meteo.com/v1/air-quality", () =>
        HttpResponse.json({
          hourly: { time: ["2026-09-08T00:00"], us_aqi: [42] },
        }),
      ),
    );

    const res = await GET(new Request("http://localhost/api/route/1"), ctx("1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.air.hourly[0]).toEqual({ datetime: "2026-09-08T00:00", usAqi: 42 });
  });

  it("still returns weather when the air quality endpoint fails", async () => {
    await testDb.insert(routes).values({ id: 1, slug: "the-nose", name: "The Nose" });
    await testDb.insert(routeMeta).values({
      id: 1, lat: 37.734, lng: -119.637, areaPath: "Yosemite", grade: "5.9",
      fetchedAt: new Date(),
    });
    server.use(
      http.get("https://api.open-meteo.com/v1/forecast", () =>
        HttpResponse.json(omFixture),
      ),
      http.get("https://air-quality-api.open-meteo.com/v1/air-quality", () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    );

    const res = await GET(new Request("http://localhost/api/route/1"), ctx("1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.air).toBeNull();
    expect(body.weather.hourly.length).toBeGreaterThan(0);
  });
});
