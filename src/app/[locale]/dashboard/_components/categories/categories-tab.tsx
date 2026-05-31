"use client";

import { useTranslations } from "next-intl";

import { CreateCategoryDialog } from "~/app/[locale]/dashboard/_components/categories/create-category-dialog";
import { CategoriesTree } from "~/app/[locale]/dashboard/_components/categories/categories-tree";
import {
  DashboardPanel,
  DashboardSectionHeader,
} from "~/app/[locale]/dashboard/_components/dashboard-ui";
import { api } from "~/trpc/react";

function buildCategoryLabel(
  categories: Array<{ id: string; name: string; parentId: string | null }>,
  categoryId: string,
): string {
  const labels: string[] = [];
  let current = categories.find((category) => category.id === categoryId);

  while (current) {
    labels.unshift(current.name);
    current = current.parentId
      ? categories.find((category) => category.id === current?.parentId)
      : undefined;
  }

  return labels.join(" / ");
}

export function CategoriesTab() {
  const t = useTranslations("Categories");
  const query = api.category.listFlat.useQuery();

  const parentOptions =
    query.data?.map((category) => ({
      id: category.id,
      label: buildCategoryLabel(query.data ?? [], category.id),
    })) ?? [];

  return (
    <section className="space-y-6">
      <DashboardSectionHeader
        action={<CreateCategoryDialog parentOptions={parentOptions} />}
        description={t("description")}
        title={t("title")}
      />

      {query.isLoading ? (
        <DashboardPanel variant="loading">{t("loading")}</DashboardPanel>
      ) : query.isError ? (
        <DashboardPanel variant="danger">{t("error")}</DashboardPanel>
      ) : !query.data?.length ? (
        <DashboardPanel variant="dashed">{t("empty")}</DashboardPanel>
      ) : (
        <CategoriesTree categories={query.data} />
      )}
    </section>
  );
}
