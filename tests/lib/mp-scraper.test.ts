import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { parseRoutePage, scrapeRoute } from "@/lib/mp-scraper";

const fixture = (id: number) =>
  readFileSync(join(__dirname, "..", "fixtures", "mp", `${id}.html`), "utf8");

describe("parseRoutePage — name + coords", () => {
  it("extracts The Nose", () => {
    const r = parseRoutePage(fixture(105924807));
    expect(r.name).toBe("The Nose");
    expect(r.lat).toBeCloseTo(37.73, 1);
    expect(r.lng).toBeCloseTo(-119.64, 1);
  });

  it("extracts The Naked Edge", () => {
    const r = parseRoutePage(fixture(105748786));
    expect(r.name).toBe("The Naked Edge");
    expect(r.lat).toBeGreaterThan(39);
    expect(r.lat).toBeLessThan(40);
    expect(r.lng).toBeLessThan(-105);
    expect(r.lng).toBeGreaterThan(-106);
  });

  it("extracts High Exposure", () => {
    const r = parseRoutePage(fixture(105748131));
    expect(r.name).toBe("High Exposure");
    expect(r.lat).toBeGreaterThan(39);
    expect(r.lat).toBeLessThan(41);
    expect(r.lng).toBeLessThan(-105);
    expect(r.lng).toBeGreaterThan(-106);
  });
});

describe("parseRoutePage — area path", () => {
  it("includes deep nested area for The Nose", () => {
    const r = parseRoutePage(fixture(105924807));
    expect(r.area).toMatch(/El Capitan/i);
    expect(r.area).toMatch(/Yosemite/i);
    expect(r.area!.split(" > ").length).toBeGreaterThanOrEqual(2);
  });

  it("includes area for The Naked Edge", () => {
    const r = parseRoutePage(fixture(105748786));
    expect(r.area).toMatch(/Eldorado|Colorado/i);
  });
});

describe("parseRoutePage — grade", () => {
  it("returns grade for The Nose", () => {
    const r = parseRoutePage(fixture(105924807));
    expect(r.grade).toMatch(/^5\.[0-9]+/);
  });

  it("returns grade for The Naked Edge", () => {
    expect(parseRoutePage(fixture(105748786)).grade).toMatch(/^5\.11/);
  });

  it("returns null when no YDS grade is present", () => {
    const r = parseRoutePage(
      `<html><body><h1>X</h1><a href="https://webmap.onxmaps.com/backcountry/map/mountain-project/routes/1/overview?mode=climb&referrer=bc_climb-route-1#15/37.0/-119.0/0/60">m</a></body></html>`,
    );
    expect(r.grade).toBeNull();
  });
});

describe("scrapeRoute", () => {
  it("requests the right URL with a User-Agent and returns parsed data", async () => {
    let receivedUA = "";
    server.use(
      http.get("https://www.mountainproject.com/route/:id", ({ request, params }) => {
        receivedUA = request.headers.get("user-agent") ?? "";
        if (params.id !== "105924807") return new HttpResponse(null, { status: 404 });
        return HttpResponse.text(fixture(105924807));
      }),
    );

    const r = await scrapeRoute(105924807);
    expect(r.name).toBe("The Nose");
    expect(receivedUA).toMatch(/CragWeather/);
  });

  it("throws on non-200 responses", async () => {
    server.use(
      http.get("https://www.mountainproject.com/route/:id", () =>
        new HttpResponse(null, { status: 404 }),
      ),
    );
    await expect(scrapeRoute(999999999)).rejects.toThrow(/404/);
  });
});
