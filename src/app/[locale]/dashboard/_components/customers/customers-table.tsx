"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  dashTableClass,
  dashTableHeadClass,
  dashTableRowClass,
  dashTableShellClass,
} from "~/app/[locale]/dashboard/_components/dashboard-ui";
import { type RouterOutputs } from "~/trpc/react";

type CustomerRow = RouterOutputs["customer"]["list"]["items"][number];

type SortField = "name" | "email" | "createdAt" | "orderCount";

type CustomersTableProps = {
  items: CustomerRow[];
  sortBy: SortField;
  sortDir: "asc" | "desc";
  onSortChange: (sortBy: SortField, sortDir: "asc" | "desc") => void;
};

function formatCustomerName(customer: CustomerRow) {
  return `${customer.firstName} ${customer.lastName}`.trim();
}

export function CustomersTable({
  items,
  sortBy,
  sortDir,
  onSortChange,
}: CustomersTableProps) {
  const t = useTranslations("Customers.table");
  const format = useFormatter();

  const sorting = useMemo<SortingState>(
    () => [{ id: sortBy, desc: sortDir === "desc" }],
    [sortBy, sortDir],
  );

  const columns = useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => formatCustomerName(row),
        header: t("columns.name"),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-dash-ink">
              {formatCustomerName(row.original)}
            </p>
            {row.original.hasLinkedUser ? (
              <p className="text-xs text-dash-muted">{t("linkedUser")}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "email",
        accessorKey: "email",
        header: t("columns.email"),
      },
      {
        id: "status",
        accessorFn: (row) => (row.isRegistered ? "registered" : "guest"),
        header: t("columns.status"),
        cell: ({ row }) =>
          row.original.isRegistered ? t("registered") : t("guest"),
        enableSorting: false,
      },
      {
        id: "orderCount",
        accessorKey: "orderCount",
        header: t("columns.orderCount"),
      },
      {
        id: "latestOrder",
        accessorKey: "latestOrderAt",
        header: t("columns.latestOrder"),
        cell: ({ row }) =>
          row.original.latestOrderAt
            ? format.dateTime(row.original.latestOrderAt, {
                dateStyle: "medium",
              })
            : t("noOrders"),
        enableSorting: false,
      },
      {
        id: "totalSpent",
        accessorKey: "totalSpentCents",
        header: t("columns.totalSpent"),
        cell: ({ row }) =>
          format.number(row.original.totalSpentCents / 100, {
            style: "currency",
            currency: "CHF",
          }),
        enableSorting: false,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: t("columns.createdAt"),
        cell: ({ row }) =>
          format.dateTime(row.original.createdAt, {
            dateStyle: "medium",
          }),
      },
    ],
    [format, t],
  );

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: (updater) => {
      const nextSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      const next = nextSorting[0];

      if (!next) {
        return;
      }

      onSortChange(next.id as SortField, next.desc ? "desc" : "asc");
    },
  });

  return (
    <div className={dashTableShellClass}>
      <table className={dashTableClass}>
        <thead className={dashTableHeadClass}>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();

                return (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left"
                  >
                    {canSort ? (
                      <button
                        className="inline-flex items-center gap-1 transition hover:text-dash-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dash-accent/30"
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getIsSorted() === "asc"
                          ? " ↑"
                          : header.column.getIsSorted() === "desc"
                            ? " ↓"
                            : null}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-dash-border bg-dash-surface">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className={dashTableRowClass}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 text-dash-ink/80">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type { SortField };
