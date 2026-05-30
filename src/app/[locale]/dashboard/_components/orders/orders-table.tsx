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

type OrderRow = RouterOutputs["order"]["list"]["items"][number];

type SortField =
  | "orderNumber"
  | "customerName"
  | "customerEmail"
  | "status"
  | "paymentStatus"
  | "fulfillmentStatus"
  | "totalCents"
  | "placedAt"
  | "shippingCity"
  | "shippingCountryCode";

type OrdersTableProps = {
  items: OrderRow[];
  sortBy: SortField;
  sortDir: "asc" | "desc";
  onSortChange: (sortBy: SortField, sortDir: "asc" | "desc") => void;
};

function formatCustomerName(order: OrderRow) {
  return `${order.customerFirstName} ${order.customerLastName}`.trim();
}

function formatShippingLocation(order: OrderRow) {
  return `${order.shippingCity}, ${order.shippingCountryCode}`;
}

export function OrdersTable({
  items,
  sortBy,
  sortDir,
  onSortChange,
}: OrdersTableProps) {
  const t = useTranslations("Orders.table");
  const tOrderStatus = useTranslations("OrderStatus");
  const tOrderPaymentStatus = useTranslations("OrderPaymentStatus");
  const tFulfillmentStatus = useTranslations("FulfillmentStatus");
  const tPaymentStatus = useTranslations("PaymentStatus");
  const tPaymentProvider = useTranslations("PaymentProvider");
  const format = useFormatter();

  const sorting = useMemo<SortingState>(
    () => [{ id: sortBy, desc: sortDir === "desc" }],
    [sortBy, sortDir],
  );

  const columns = useMemo<ColumnDef<OrderRow>[]>(
    () => [
      {
        id: "orderNumber",
        accessorKey: "orderNumber",
        header: t("columns.orderNumber"),
      },
      {
        id: "customerName",
        accessorFn: (row) => formatCustomerName(row),
        header: t("columns.customer"),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-dash-ink">
              {formatCustomerName(row.original)}
            </p>
            <p className="text-xs text-dash-muted">{row.original.customerEmail}</p>
          </div>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: t("columns.orderStatus"),
        cell: ({ row }) => tOrderStatus(row.original.status),
      },
      {
        id: "paymentStatus",
        accessorKey: "paymentStatus",
        header: t("columns.paymentStatus"),
        cell: ({ row }) => tOrderPaymentStatus(row.original.paymentStatus),
      },
      {
        id: "fulfillmentStatus",
        accessorKey: "fulfillmentStatus",
        header: t("columns.fulfillmentStatus"),
        cell: ({ row }) => tFulfillmentStatus(row.original.fulfillmentStatus),
      },
      {
        id: "totalCents",
        accessorKey: "totalCents",
        header: t("columns.total"),
        cell: ({ row }) =>
          format.number(row.original.totalCents / 100, {
            style: "currency",
            currency: row.original.currencyCode,
          }),
      },
      {
        id: "latestPayment",
        accessorFn: (row) =>
          row.latestPayment
            ? `${row.latestPayment.provider}:${row.latestPayment.status}`
            : null,
        header: t("columns.latestPayment"),
        cell: ({ row }) => {
          const payment = row.original.latestPayment;

          if (!payment) {
            return t("noPayment");
          }

          return (
            <div>
              <p className="font-medium text-dash-ink">
                {tPaymentProvider(payment.provider)}
              </p>
              <p className="text-xs text-dash-muted">
                {tPaymentStatus(payment.status)}
              </p>
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: "shippingCity",
        accessorFn: (row) => formatShippingLocation(row),
        header: t("columns.shipping"),
        cell: ({ row }) => formatShippingLocation(row.original),
      },
      {
        id: "placedAt",
        accessorKey: "placedAt",
        header: t("columns.placedAt"),
        cell: ({ row }) =>
          format.dateTime(row.original.placedAt, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
      },
    ],
    [
      format,
      t,
      tFulfillmentStatus,
      tOrderPaymentStatus,
      tOrderStatus,
      tPaymentProvider,
      tPaymentStatus,
    ],
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
