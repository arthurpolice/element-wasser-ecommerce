import { describe, expect, it, vi } from "vitest";

import {
  OrderPlacementError,
  placeOrder,
} from "~/server/commerce/order-placement";

const now = new Date("2026-05-15T10:00:00Z");

function createMockDb() {
  const db = {
    customer: {
      findUnique: vi.fn(async () => ({
        id: "customer-1",
        email: "river@example.com",
        firstName: "River",
        lastName: "Stone",
        salutation: "FRAU",
      })),
    },
    product: {
      findUnique: vi.fn(async () => ({
        id: "product-1",
        name: "Filter",
        sku: "EW-FIL-00001",
        priceCents: 2000,
        costCents: 900,
        discountPercent: null as number | null,
        stockOnHand: 10,
        stockReserved: 0,
      })),
      update: vi.fn(async () => null),
    },
    address: {
      findFirst: vi.fn(async () => ({
        id: "address-main",
        customerId: "customer-1",
        salutation: "FRAU",
        firstName: "River",
        lastName: "Stone",
        company: "Element",
        streetLine1: "Snapshotstrasse 7",
        streetLine2: "Atelier",
        postalCode: "8000",
        city: "Zurich",
        countryCode: "ch",
        phone: "+410000000",
      })),
    },
    orderNumberSequence: {
      upsert: vi.fn(async () => ({ nextNumber: 2 })),
    },
    order: {
      create: vi.fn(async ({ data }) => ({
        id: "order-1",
        ...data,
        placedAt: now,
        payments: [],
      })),
    },
    $transaction: vi.fn(async (callback) => callback(db)),
  };

  return db;
}

const baseInput = {
  customerId: "customer-1",
  productId: "product-1",
  quantity: 1,
  shippingCents: 900,
  shippingFirstName: "Manual",
  shippingLastName: "Address",
  shippingStreetLine1: "Manualstrasse 1",
  shippingPostalCode: "9999",
  shippingCity: "Manual City",
  shippingCountryCode: "DE",
};

describe("placeOrder", () => {
  it("copies the selected Address Book Entry into Shipping Address and Billing Address snapshots", async () => {
    const db = createMockDb();

    await placeOrder(
      db as never,
      {
        ...baseInput,
        addressId: "address-main",
      },
      { now: () => now },
    );

    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderNumber: "EW-2026-00001",
          paymentExpiresAt: new Date("2026-05-15T10:15:00Z"),
          shippingFirstName: "River",
          shippingLastName: "Stone",
          shippingStreetLine1: "Snapshotstrasse 7",
          shippingStreetLine2: "Atelier",
          shippingPostalCode: "8000",
          shippingCity: "Zurich",
          shippingCountryCode: "CH",
          billingFirstName: "River",
          billingStreetLine1: "Snapshotstrasse 7",
          billingCountryCode: "CH",
        }),
      }),
    );
  });

  it("uses manual Shipping Address input when no Address Book Entry is selected", async () => {
    const db = createMockDb();

    await placeOrder(db as never, baseInput, { now: () => now });

    expect(db.address.findFirst).not.toHaveBeenCalled();
    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingFirstName: "Manual",
          shippingStreetLine1: "Manualstrasse 1",
          shippingCountryCode: "DE",
          billingFirstName: "Manual",
          billingStreetLine1: "Manualstrasse 1",
          billingCountryCode: "DE",
        }),
      }),
    );
  });

  it("captures discounted Order Line terms and reserves stock", async () => {
    const db = createMockDb();
    db.product.findUnique = vi.fn(async () => ({
      id: "product-1",
      name: "Filter",
      sku: "EW-FIL-00001",
      priceCents: 2000,
      costCents: 900,
      discountPercent: 25,
      stockOnHand: 10,
      stockReserved: 0,
    }));

    await placeOrder(
      db as never,
      {
        ...baseInput,
        quantity: 2,
      },
      { now: () => now },
    );

    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotalCents: 4000,
          discountCents: 1000,
          totalCents: 3900,
          lines: {
            create: expect.objectContaining({
              productName: "Filter",
              productSku: "EW-FIL-00001",
              quantity: 2,
              listPriceCents: 2000,
              discountPercent: 25,
              unitPriceCents: 1500,
              unitCostCents: 900,
              lineTotalCents: 3000,
            }),
          },
        }),
      }),
    );
    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: "product-1" },
      data: { stockReserved: { increment: 2 } },
    });
  });

  it("rejects insufficient stock before creating an Order", async () => {
    const db = createMockDb();
    db.product.findUnique = vi.fn(async () => ({
      id: "product-1",
      name: "Filter",
      sku: "EW-FIL-00001",
      priceCents: 2000,
      costCents: 900,
      discountPercent: null,
      stockOnHand: 1,
      stockReserved: 1,
    }));

    await expect(
      placeOrder(
        db as never,
        {
          ...baseInput,
          quantity: 1,
        },
        { now: () => now },
      ),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
      message: "Insufficient stock available.",
    } satisfies Partial<OrderPlacementError>);

    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.product.update).not.toHaveBeenCalled();
  });
});
