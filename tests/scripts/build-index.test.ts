// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { upsertRoutes } from "@/scripts/build-index";
import { testDb, truncateAll, closeDb } from "../helpers/test-db";
import { routes } from "@/lib/schema";

beforeEach(truncateAll);
afterAll(closeDb);

describe("upsertRoutes", () => {
  it("inserts new rows and updates existing slug+name when slug changes", async () => {
    await upsertRoutes([{ id: 1, slug: "old-slug" }]);
    await upsertRoutes([{ id: 1, slug: "new-slug" }, { id: 2, slug: "second" }]);
    const rows = await testDb.select().from(routes);
    const map = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(map[1].slug).toBe("new-slug");
    expect(map[1].name).toBe("New Slug");
    expect(map[2].slug).toBe("second");
  });
});
