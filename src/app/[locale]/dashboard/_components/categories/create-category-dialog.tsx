"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  DashboardButton,
  dashDialogClass,
  dashInputClass,
  dashSelectClass,
} from "~/app/[locale]/dashboard/_components/dashboard-ui";
import { api } from "~/trpc/react";

type CreateCategoryDialogProps = {
  parentOptions: Array<{ id: string; label: string }>;
};

export function CreateCategoryDialog({ parentOptions }: CreateCategoryDialogProps) {
  const t = useTranslations("Categories.create");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const utils = api.useUtils();

  const createCategory = api.category.create.useMutation({
    onSuccess: async () => {
      await utils.category.listFlat.invalidate();
      setName("");
      setParentId("");
      setSortOrder("0");
      setActive(true);
      setError(null);
      setOpen(false);
    },
    onError: () => setError(t("validation.generic")),
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleClose() {
    if (createCategory.isPending) {
      return;
    }

    setError(null);
    setOpen(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    createCategory.mutate({
      name,
      parentId: parentId || undefined,
      sortOrder: Number.parseInt(sortOrder, 10) || 0,
      active,
    });
  }

  return (
    <>
      <DashboardButton onClick={() => setOpen(true)}>{t("button")}</DashboardButton>

      <dialog
        ref={dialogRef}
        className={`${dashDialogClass} max-w-lg`}
        onCancel={(event) => {
          event.preventDefault();
          handleClose();
        }}
        onClose={handleClose}
      >
        <form className="flex flex-col gap-5 p-6" onSubmit={handleSubmit}>
          <div>
            <h2 className="font-display text-xl font-semibold text-dash-ink">
              {t("title")}
            </h2>
            <p className="mt-1 text-sm text-dash-muted">{t("description")}</p>
          </div>

          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-dash-muted">
              {t("fields.name")}
            </span>
            <input
              className={dashInputClass}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-dash-muted">
              {t("fields.parent")}
            </span>
            <select
              className={`${dashSelectClass} w-full`}
              onChange={(event) => setParentId(event.target.value)}
              value={parentId}
            >
              <option value="">{t("fields.rootCategory")}</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-dash-muted">
              {t("fields.sortOrder")}
            </span>
            <input
              className={dashInputClass}
              min={0}
              onChange={(event) => setSortOrder(event.target.value)}
              type="number"
              value={sortOrder}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-dash-ink">
            <input
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              type="checkbox"
            />
            {t("fields.active")}
          </label>

          {error ? <p className="text-sm text-dash-danger">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <DashboardButton onClick={handleClose} type="button" variant="secondary">
              {t("cancel")}
            </DashboardButton>
            <DashboardButton disabled={createCategory.isPending} type="submit">
              {createCategory.isPending ? t("submitting") : t("submit")}
            </DashboardButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
