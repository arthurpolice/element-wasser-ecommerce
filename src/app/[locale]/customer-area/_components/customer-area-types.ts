import type { RouterOutputs } from "~/trpc/react";

export type CustomerArea = Extract<
  RouterOutputs["customer"]["me"],
  { status: "registered" }
>;

export type RegisteredCustomer = CustomerArea["customer"];

export type CustomerAddress = RegisteredCustomer["addresses"][number];

export type CustomerOrder = RegisteredCustomer["orders"][number];

export type CustomerOrderLine = CustomerOrder["lines"][number];
