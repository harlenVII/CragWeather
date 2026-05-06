// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET } from "@/app/api/route/[id]/route";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { routes, routeMeta } from "@/lib/schema";
import { server } from "../mocks/server";

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
