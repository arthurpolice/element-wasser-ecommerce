export type FlatCategoryRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sortOrder: number;
  parentId: string | null;
  productCount: number;
  childCount: number;
  createdAt: Date;
};

export type CategoryTreeNode = FlatCategoryRow & {
  children: CategoryTreeNode[];
};

export type CategoryDropIntent =
  | { type: "inside"; targetId: string }
  | { type: "before"; targetId: string }
  | { type: "after"; targetId: string };

export type CategoryMoveInput =
  | { categoryId: string; intent: "inside"; targetCategoryId: string; position?: number }
  | { categoryId: string; intent: "before"; targetCategoryId: string }
  | { categoryId: string; intent: "after"; targetCategoryId: string };

export const OPTIMISTIC_CATEGORY_ID_PREFIX = "optimistic-";

export function isOptimisticCategoryId(id: string) {
  return id.startsWith(OPTIMISTIC_CATEGORY_ID_PREFIX);
}

export function createOptimisticCategoryId() {
  return `${OPTIMISTIC_CATEGORY_ID_PREFIX}${crypto.randomUUID()}`;
}

export function buildOptimisticCategoryRow(
  id: string,
  name: string,
  parentId: string | null,
): FlatCategoryRow {
  return {
    id,
    name,
    slug: "…",
    active: true,
    sortOrder: 0,
    parentId,
    productCount: 0,
    childCount: 0,
    createdAt: new Date(),
  };
}

export function applyOptimisticCategoryCreate(
  categories: FlatCategoryRow[],
  name: string,
  parentId: string | null,
  optimisticId = createOptimisticCategoryId(),
): { categories: FlatCategoryRow[]; optimisticId: string } {
  const bumped = categories.map((category) =>
    category.parentId === parentId
      ? { ...category, sortOrder: category.sortOrder + 1 }
      : category,
  );

  return {
    categories: [
      ...bumped,
      buildOptimisticCategoryRow(optimisticId, name, parentId),
    ],
    optimisticId,
  };
}

function compareCategoryRows(
  left: Pick<FlatCategoryRow, "sortOrder" | "name">,
  right: Pick<FlatCategoryRow, "sortOrder" | "name">,
) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  return left.name.localeCompare(right.name);
}

export function buildCategoryTree(categories: FlatCategoryRow[]): CategoryTreeNode[] {
  const nodes = new Map<string, CategoryTreeNode>(
    categories.map((category) => [category.id, { ...category, children: [] }]),
  );
  const roots: CategoryTreeNode[] = [];

  for (const category of categories) {
    const node = nodes.get(category.id);
    if (!node) {
      continue;
    }

    if (category.parentId) {
      nodes.get(category.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sortChildren(node: CategoryTreeNode) {
    node.children.sort(compareCategoryRows);
    node.children.forEach(sortChildren);
  }

  roots.sort(compareCategoryRows);
  roots.forEach(sortChildren);

  return roots;
}

export function collectDescendantIds(
  categories: Array<{ id: string; parentId: string | null }>,
  rootId: string,
): Set<string> {
  const ids = new Set<string>();
  let added = true;

  while (added) {
    added = false;
    for (const category of categories) {
      if (
        category.parentId &&
        (category.parentId === rootId || ids.has(category.parentId)) &&
        !ids.has(category.id)
      ) {
        ids.add(category.id);
        added = true;
      }
    }
  }

  return ids;
}

export function isCategoryDescendant(
  categories: Array<{ id: string; parentId: string | null }>,
  ancestorId: string,
  candidateId: string,
): boolean {
  if (ancestorId === candidateId) {
    return true;
  }

  return collectDescendantIds(categories, ancestorId).has(candidateId);
}

export function resolveMoveTarget(
  categories: Array<{ id: string; parentId: string | null; sortOrder: number }>,
  input: CategoryMoveInput,
): { parentId: string | null; index: number } {
  const siblings = (parentId: string | null) =>
    categories
      .filter((category) => category.parentId === parentId)
      .sort((left, right) => left.sortOrder - right.sortOrder);

  if (input.intent === "inside") {
    const children = siblings(input.targetCategoryId);
    const index =
      input.position == null
        ? children.filter((child) => child.id !== input.categoryId).length
        : Math.max(
            0,
            Math.min(
              input.position,
              children.filter((child) => child.id !== input.categoryId).length,
            ),
          );

    return { parentId: input.targetCategoryId, index };
  }

  const target = categories.find((category) => category.id === input.targetCategoryId);
  if (!target) {
    throw new Error("Target category not found.");
  }

  const targetSiblings = siblings(target.parentId);
  const targetIndex = targetSiblings.findIndex(
    (category) => category.id === input.targetCategoryId,
  );

  return {
    parentId: target.parentId,
    index: input.intent === "before" ? targetIndex : targetIndex + 1,
  };
}

export function applyOptimisticCategoryMove(
  categories: FlatCategoryRow[],
  input: CategoryMoveInput,
): FlatCategoryRow[] {
  const moving = categories.find((entry) => entry.id === input.categoryId);
  if (!moving) {
    return categories;
  }

  const { parentId: nextParentId, index } = resolveMoveTarget(categories, input);
  const oldParentId = moving.parentId;

  let next = categories.map((entry) =>
    entry.id === moving.id ? { ...entry, parentId: nextParentId } : { ...entry },
  );

  const siblingsFor = (
    rows: FlatCategoryRow[],
    parentId: string | null,
    excludeId?: string,
  ) =>
    rows
      .filter((entry) => entry.parentId === parentId && entry.id !== excludeId)
      .sort(compareCategoryRows);

  const reorderGroup = (
    rows: FlatCategoryRow[],
    parentId: string | null,
    orderedIds: string[],
  ) =>
    rows.map((entry) => {
      if (entry.parentId !== parentId) {
        return entry;
      }

      const order = orderedIds.indexOf(entry.id);
      return order === -1 ? entry : { ...entry, sortOrder: order };
    });

  const nextSiblingIds = siblingsFor(next, nextParentId, moving.id).map(
    (entry) => entry.id,
  );
  nextSiblingIds.splice(index, 0, moving.id);
  next = reorderGroup(next, nextParentId, nextSiblingIds);

  if (oldParentId !== nextParentId) {
    const oldSiblingIds = siblingsFor(next, oldParentId).map((entry) => entry.id);
    next = reorderGroup(next, oldParentId, oldSiblingIds);
  }

  return next;
}

export function resolveDropIntentFromRect(
  categoryId: string,
  rect: { top: number; height: number },
  clientY: number,
): CategoryDropIntent {
  const relativeY = clientY - rect.top;
  const zoneHeight = rect.height / 3;

  if (relativeY < zoneHeight) {
    return { type: "before", targetId: categoryId };
  }

  if (relativeY > rect.height - zoneHeight) {
    return { type: "after", targetId: categoryId };
  }

  return { type: "inside", targetId: categoryId };
}

export function resolveDropIntentFromPointer(
  rowElement: HTMLElement,
  clientY: number,
): CategoryDropIntent {
  const rect = rowElement.getBoundingClientRect();
  const categoryId = rowElement.dataset.categoryId ?? "";

  return resolveDropIntentFromRect(categoryId, rect, clientY);
}

export function dropIntentToMoveInput(
  draggedCategoryId: string,
  intent: CategoryDropIntent,
): CategoryMoveInput {
  if (intent.type === "inside") {
    return {
      categoryId: draggedCategoryId,
      intent: "inside",
      targetCategoryId: intent.targetId,
    };
  }

  return {
    categoryId: draggedCategoryId,
    intent: intent.type,
    targetCategoryId: intent.targetId,
  };
}
