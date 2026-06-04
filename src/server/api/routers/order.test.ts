import { describe, expect, it, vi } from "vitest";

import { createCallerFactory } from "~/server/api/trpc";
import { orderRouter } from "~/server/api/routers/order";

const createCaller = createCallerFactory(orderRouter);

function createOwnerCaller(db: ReturnType<typeof createMockDb>) {
  return createCaller({
    db: db as never,
    session: {
      user: { id: "owner-1", role: "owner" },
      session: { id: "session-1" },
    } as never,
    headers: new Headers(),
  });
}

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
        discountPercent: null,
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
        placedAt: new Date("2026-05-15T10:00:00Z"),
        payments: [],
      })),
    },
    $transaction: vi.fn(async (callback) => callback(db)),
  };

  return db;
}

describe("order router Address Book Entry snapshots", () => {
  it("copies the selected Address Book Entry into Shipping Address and Billing Address snapshots", async () => {
    const db = createMockDb();
    const caller = createOwnerCaller(db);

    await caller.create({
      customerId: "customer-1",
      productId: "product-1",
      quantity: 1,
      shippingCents: 900,
      addressId: "address-main",
      shippingFirstName: "Manual",
      shippingLastName: "Address",
      shippingStreetLine1: "Manualstrasse 1",
      shippingPostalCode: "9999",
      shippingCity: "Manual City",
      shippingCountryCode: "DE",
    });

    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
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
});
