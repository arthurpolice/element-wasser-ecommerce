import { describe, expect, it } from "vitest";

import {
  applyOptimisticCategoryCreate,
  applyOptimisticCategoryMove,
  buildCategoryTree,
  collectDescendantIds,
  isCategoryDescendant,
  isOptimisticCategoryId,
  resolveDropIntentFromRect,
  resolveMoveTarget,
  type FlatCategoryRow,
} from "~/lib/category-tree";

const flatCategories: FlatCategoryRow[] = [
  {
    id: "root-a",
    name: "Root A",
    slug: "root-a",
    active: true,
    sortOrder: 0,
    parentId: null,
    productCount: 2,
    childCount: 2,
    createdAt: new Date(),
  },
  {
    id: "root-b",
    name: "Root B",
    slug: "root-b",
    active: true,
    sortOrder: 1,
    parentId: null,
    productCount: 0,
    childCount: 0,
    createdAt: new Date(),
  },
  {
    id: "child-a1",
    name: "Child A1",
    slug: "child-a1",
    active: true,
    sortOrder: 0,
    parentId: "root-a",
    productCount: 1,
    childCount: 1,
    createdAt: new Date(),
  },
  {
    id: "child-a2",
    name: "Child A2",
    slug: "child-a2",
    active: true,
    sortOrder: 1,
    parentId: "root-a",
    productCount: 0,
    childCount: 0,
    createdAt: new Date(),
  },
  {
    id: "grandchild-a1",
    name: "Grandchild A1",
    slug: "grandchild-a1",
    active: true,
    sortOrder: 0,
    parentId: "child-a1",
    productCount: 0,
    childCount: 0,
    createdAt: new Date(),
  },
];

describe("buildCategoryTree", () => {
  it("builds nested children in sort order", () => {
    const tree = buildCategoryTree(flatCategories);

    expect(tree.map((node) => node.id)).toEqual(["root-a", "root-b"]);
    expect(tree[0]?.children.map((node) => node.id)).toEqual([
      "child-a1",
      "child-a2",
    ]);
    expect(tree[0]?.children[0]?.children.map((node) => node.id)).toEqual([
      "grandchild-a1",
    ]);
  });
});

describe("category move helpers", () => {
  it("detects descendants for invalid drops", () => {
    expect(
      isCategoryDescendant(flatCategories, "root-a", "child-a1"),
    ).toBe(true);
    expect(
      isCategoryDescendant(flatCategories, "root-a", "grandchild-a1"),
    ).toBe(true);
    expect(
      isCategoryDescendant(flatCategories, "child-a1", "root-a"),
    ).toBe(false);
  });

  it("collects descendant ids", () => {
    expect([...collectDescendantIds(flatCategories, "root-a")]).toEqual([
      "child-a1",
      "child-a2",
      "grandchild-a1",
    ]);
  });

  it("resolves sibling before and after targets", () => {
    expect(
      resolveMoveTarget(flatCategories, {
        categoryId: "root-b",
        intent: "before",
        targetCategoryId: "child-a2",
      }),
    ).toEqual({ parentId: "root-a", index: 1 });

    expect(
      resolveMoveTarget(flatCategories, {
        categoryId: "root-b",
        intent: "after",
        targetCategoryId: "child-a1",
      }),
    ).toEqual({ parentId: "root-a", index: 1 });
  });

  it("resolves inside targets at the end of the child list", () => {
    expect(
      resolveMoveTarget(flatCategories, {
        categoryId: "root-b",
        intent: "inside",
        targetCategoryId: "root-a",
      }),
    ).toEqual({ parentId: "root-a", index: 2 });
  });

  it("applies optimistic sibling reordering", () => {
    const next = applyOptimisticCategoryMove(flatCategories, {
      categoryId: "child-a2",
      intent: "before",
      targetCategoryId: "child-a1",
    });

    const siblings = next
      .filter((category) => category.parentId === "root-a")
      .sort((left, right) => left.sortOrder - right.sortOrder);

    expect(siblings.map((category) => category.id)).toEqual([
      "child-a2",
      "child-a1",
    ]);
  });

  it("inserts an optimistic category as the first sibling", () => {
    const { categories, optimisticId } = applyOptimisticCategoryCreate(
      flatCategories,
      "New Child",
      "root-a",
      "optimistic-test",
    );

    const siblings = categories
      .filter((category) => category.parentId === "root-a")
      .sort((left, right) => left.sortOrder - right.sortOrder);

    expect(siblings.map((category) => category.id)).toEqual([
      "optimistic-test",
      "child-a1",
      "child-a2",
    ]);
    expect(siblings[0]?.name).toBe("New Child");
    expect(isOptimisticCategoryId(optimisticId)).toBe(true);
  });
});

describe("resolveDropIntentFromRect", () => {
  it("maps pointer position to before, inside, and after zones", () => {
    const rect = { top: 100, height: 90 };

    expect(resolveDropIntentFromRect("child-a1", rect, 110)).toEqual({
      type: "before",
      targetId: "child-a1",
    });
    expect(resolveDropIntentFromRect("child-a1", rect, 145)).toEqual({
      type: "inside",
      targetId: "child-a1",
    });
    expect(resolveDropIntentFromRect("child-a1", rect, 175)).toEqual({
      type: "after",
      targetId: "child-a1",
    });
  });
});
