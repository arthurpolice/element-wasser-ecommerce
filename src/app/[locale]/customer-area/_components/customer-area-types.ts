import type { RouterOutputs } from "~/trpc/react";

export type CustomerArea = Extract<
  RouterOutputs["customer"]["me"],
  { status: "registered" }
>;

export type RegisteredCustomer = CustomerArea["customer"];

export type CustomerAddress = RegisteredCustomer["addresses"][number];

export type CustomerOrder =
  RouterOutputs["customer"]["myOrders"]["items"][number];

export type CustomerOrderDetails = RouterOutputs["customer"]["myOrderDetails"];

export type CustomerOrderLine = CustomerOrderDetails["lines"][number];
