import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSitemapIndex, parseRouteSitemap, slugToName } from "@/lib/sitemap";

const fix = (n: string) => readFileSync(join(__dirname, "..", "fixtures", n), "utf8");

describe("parseSitemapIndex", () => {
  it("returns only route sub-sitemap URLs", () => {
    const urls = parseSitemapIndex(fix("sitemap-index.xml"));
    expect(urls).toEqual([
      "https://www.mountainproject.com/sitemap-routes-1.xml",
      "https://www.mountainproject.com/sitemap-routes-2.xml",
    ]);
  });
});

describe("parseRouteSitemap", () => {
  it("extracts {id, slug} for each /route/<id>/<slug> entry, ignoring areas", () => {
    const rows = parseRouteSitemap(fix("sitemap-routes.xml"));
    expect(rows).toEqual([
      { id: 105924807, slug: "the-nose" },
      { id: 105748786, slug: "the-naked-edge" },
      { id: 105845493, slug: "astroman" },
    ]);
  });
});

describe("slugToName", () => {
  it("title-cases hyphenated slugs", () => {
    expect(slugToName("the-nose")).toBe("The Nose");
    expect(slugToName("the-naked-edge")).toBe("The Naked Edge");
    expect(slugToName("a-and-b")).toBe("A And B");
  });
});
