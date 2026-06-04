import { Prisma, PrismaClient, Salutation } from "../../../generated/prisma";

export const PAYMENT_RESERVATION_MINUTES = 15;

export const orderListInclude = {
  payments: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      provider: true,
      status: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderListRow = Prisma.OrderGetPayload<{
  include: typeof orderListInclude;
}>;

export type PlaceOrderInput = {
  customerId: string;
  productId: string;
  quantity: number;
  shippingCents: number;
  addressId?: string;
  shippingSalutation?: Salutation;
  shippingFirstName: string;
  shippingLastName: string;
  shippingCompany?: string;
  shippingStreetLine1: string;
  shippingStreetLine2?: string;
  shippingPostalCode: string;
  shippingCity: string;
  shippingCountryCode: string;
  shippingPhone?: string;
};

export type OrderPlacementErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "ADDRESS_NOT_FOUND";

export class OrderPlacementError extends Error {
  constructor(
    readonly code: OrderPlacementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrderPlacementError";
  }
}

type OrderPlacementDeps = {
  now?: () => Date;
};

type CustomerSnapshot = Prisma.CustomerGetPayload<object>;
type ProductSnapshot = Prisma.ProductGetPayload<object>;
type AddressSnapshot = Prisma.AddressGetPayload<object>;

type ShippingSnapshot = {
  salutation: AddressSnapshot["salutation"] | undefined;
  firstName: string;
  lastName: string;
  company: string | null | undefined;
  streetLine1: string;
  streetLine2: string | null | undefined;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null | undefined;
};

function calculateUnitPriceCents(
  listPriceCents: number,
  discountPercent: number | null,
): number {
  if (!discountPercent) {
    return listPriceCents;
  }

  return Math.round((listPriceCents * (100 - discountPercent)) / 100);
}

function formatOrderNumber(year: number, sequence: number): string {
  return `EW-${year}-${String(sequence).padStart(5, "0")}`;
}

async function allocateOrderNumber(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<string> {
  const year = now.getFullYear();
  const sequence = await tx.orderNumberSequence.upsert({
    where: { year },
    create: { year, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
    select: { nextNumber: true },
  });

  return formatOrderNumber(year, sequence.nextNumber - 1);
}

function assertStockAvailable(product: ProductSnapshot, quantity: number) {
  const availableStock = product.stockOnHand - product.stockReserved;
  if (availableStock < quantity) {
    throw new OrderPlacementError(
      "INSUFFICIENT_STOCK",
      "Insufficient stock available.",
    );
  }
}

function snapshotAddressBookEntry(address: AddressSnapshot): ShippingSnapshot {
  return {
    salutation: address.salutation,
    firstName: address.firstName,
    lastName: address.lastName,
    company: address.company,
    streetLine1: address.streetLine1,
    streetLine2: address.streetLine2,
    postalCode: address.postalCode,
    city: address.city,
    countryCode: address.countryCode,
    phone: address.phone,
  };
}

function snapshotManualShipping(input: PlaceOrderInput): ShippingSnapshot {
  return {
    salutation: input.shippingSalutation ?? null,
    firstName: input.shippingFirstName,
    lastName: input.shippingLastName,
    company: input.shippingCompany,
    streetLine1: input.shippingStreetLine1,
    streetLine2: input.shippingStreetLine2,
    postalCode: input.shippingPostalCode,
    city: input.shippingCity,
    countryCode: input.shippingCountryCode,
    phone: input.shippingPhone,
  };
}

async function resolveShippingSnapshot(
  tx: Prisma.TransactionClient,
  input: PlaceOrderInput,
  customerId: string,
): Promise<ShippingSnapshot> {
  if (!input.addressId) {
    return snapshotManualShipping(input);
  }

  const address = await tx.address.findFirst({
    where: { id: input.addressId, customerId },
  });

  if (!address) {
    throw new OrderPlacementError(
      "ADDRESS_NOT_FOUND",
      "Address Book Entry not found.",
    );
  }

  return snapshotAddressBookEntry(address);
}

function buildOrderLineSnapshot(product: ProductSnapshot, quantity: number) {
  const listPriceCents = product.priceCents;
  const unitPriceCents = calculateUnitPriceCents(
    listPriceCents,
    product.discountPercent,
  );

  return {
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    quantity,
    listPriceCents,
    discountPercent: product.discountPercent,
    unitPriceCents,
    unitCostCents: product.costCents,
    lineTotalCents: unitPriceCents * quantity,
  };
}

function buildOrderTotals(
  line: ReturnType<typeof buildOrderLineSnapshot>,
  shippingCents: number,
) {
  const subtotalCents = line.listPriceCents * line.quantity;
  const discountCents = subtotalCents - line.lineTotalCents;
  const totalCents = line.lineTotalCents + shippingCents;

  return { subtotalCents, discountCents, totalCents };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export async function placeOrder(
  db: Pick<PrismaClient, "$transaction">,
  input: PlaceOrderInput,
  deps: OrderPlacementDeps = {},
): Promise<OrderListRow> {
  const now = deps.now?.() ?? new Date();
  const paymentExpiresAt = addMinutes(now, PAYMENT_RESERVATION_MINUTES);

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
    });

    if (!customer) {
      throw new OrderPlacementError("CUSTOMER_NOT_FOUND", "Customer not found.");
    }

    const product = await tx.product.findUnique({
      where: { id: input.productId },
    });

    if (!product) {
      throw new OrderPlacementError("PRODUCT_NOT_FOUND", "Product not found.");
    }

    assertStockAvailable(product, input.quantity);

    const orderNumber = await allocateOrderNumber(tx, now);
    const shippingSnapshot = await resolveShippingSnapshot(
      tx,
      input,
      customer.id,
    );
    const orderLine = buildOrderLineSnapshot(product, input.quantity);
    const totals = buildOrderTotals(orderLine, input.shippingCents);
    const snapshotCountryCode = shippingSnapshot.countryCode.toUpperCase();

    const created = await tx.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        customerSalutation: customer.salutation,
        customerFirstName: customer.firstName,
        customerLastName: customer.lastName,
        customerEmail: customer.email,
        paymentExpiresAt,
        subtotalCents: totals.subtotalCents,
        shippingCents: input.shippingCents,
        discountCents: totals.discountCents,
        totalCents: totals.totalCents,
        currencyCode: "CHF",
        shippingSalutation: shippingSnapshot.salutation,
        shippingFirstName: shippingSnapshot.firstName,
        shippingLastName: shippingSnapshot.lastName,
        shippingCompany: shippingSnapshot.company,
        shippingStreetLine1: shippingSnapshot.streetLine1,
        shippingStreetLine2: shippingSnapshot.streetLine2,
        shippingPostalCode: shippingSnapshot.postalCode,
        shippingCity: shippingSnapshot.city,
        shippingCountryCode: snapshotCountryCode,
        shippingPhone: shippingSnapshot.phone,
        billingSameAsShipping: true,
        billingSalutation: shippingSnapshot.salutation,
        billingFirstName: shippingSnapshot.firstName,
        billingLastName: shippingSnapshot.lastName,
        billingCompany: shippingSnapshot.company,
        billingStreetLine1: shippingSnapshot.streetLine1,
        billingStreetLine2: shippingSnapshot.streetLine2,
        billingPostalCode: shippingSnapshot.postalCode,
        billingCity: shippingSnapshot.city,
        billingCountryCode: snapshotCountryCode,
        billingPhone: shippingSnapshot.phone,
        lines: {
          create: orderLine,
        },
      },
      include: orderListInclude,
    });

    await tx.product.update({
      where: { id: product.id },
      data: {
        stockReserved: { increment: input.quantity },
      },
    });

    return created;
  });
}
