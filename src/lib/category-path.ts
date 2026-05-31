export type FlatCategory = {
  id: string;
  slug: string;
  parentId: string | null;
};

export function buildCategorySlugPath(slugs: string[]): string {
  return slugs.join("/");
}

export function parseCategorySlugSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export function resolveCategoryPath(
  categories: FlatCategory[],
  slugSegments: string[],
): { categoryId: string; slugPath: string } | null {
  if (slugSegments.length === 0) {
    return null;
  }

  let parentId: string | null = null;
  const resolvedSlugs: string[] = [];
  let resolvedId: string | null = null;

  for (const slug of slugSegments) {
    const match = categories.find(
      (category) => category.slug === slug && category.parentId === parentId,
    );

    if (!match) {
      return null;
    }

    resolvedSlugs.push(match.slug);
    resolvedId = match.id;
    parentId = match.id;
  }

  if (!resolvedId) {
    return null;
  }

  return {
    categoryId: resolvedId,
    slugPath: buildCategorySlugPath(resolvedSlugs),
  };
}

export function collectDescendantCategoryIds(
  categories: FlatCategory[],
  rootId: string,
): string[] {
  const ids = new Set<string>([rootId]);
  let added = true;

  while (added) {
    added = false;
    for (const category of categories) {
      if (
        category.parentId &&
        ids.has(category.parentId) &&
        !ids.has(category.id)
      ) {
        ids.add(category.id);
        added = true;
      }
    }
  }

  return [...ids];
}
