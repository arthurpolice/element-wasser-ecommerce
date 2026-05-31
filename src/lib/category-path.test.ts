import { describe, expect, it } from "vitest";

import {
  buildCategorySlugPath,
  collectDescendantCategoryIds,
  parseCategorySlugSegments,
  resolveCategoryPath,
} from "~/lib/category-path";

const categories = [
  { id: "root", slug: "water-filters", parentId: null },
  { id: "child", slug: "replacement-cartridges", parentId: "root" },
  { id: "other-root", slug: "air-filters", parentId: null },
];

describe("category path helpers", () => {
  it("builds and parses slug paths", () => {
    expect(buildCategorySlugPath(["water-filters", "replacement-cartridges"])).toBe(
      "water-filters/replacement-cartridges",
    );
    expect(parseCategorySlugSegments("water-filters/replacement-cartridges")).toEqual([
      "water-filters",
      "replacement-cartridges",
    ]);
  });

  it("resolves nested category paths from the tree", () => {
    expect(
      resolveCategoryPath(categories, ["water-filters", "replacement-cartridges"]),
    ).toEqual({
      categoryId: "child",
      slugPath: "water-filters/replacement-cartridges",
    });
  });

  it("rejects invalid nested paths", () => {
    expect(
      resolveCategoryPath(categories, ["replacement-cartridges"]),
    ).toBeNull();
    expect(
      resolveCategoryPath(categories, ["water-filters", "air-filters"]),
    ).toBeNull();
  });

  it("collects descendant category ids for aggregate views", () => {
    expect(collectDescendantCategoryIds(categories, "root")).toEqual([
      "root",
      "child",
    ]);
    expect(collectDescendantCategoryIds(categories, "other-root")).toEqual([
      "other-root",
    ]);
  });
});
