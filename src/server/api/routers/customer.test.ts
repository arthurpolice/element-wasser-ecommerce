import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCallerFactory } from "~/server/api/trpc";
import { customerRouter } from "~/server/api/routers/customer";

const createCaller = createCallerFactory(customerRouter);

function createMockDb(): any {
  const db = {
    user: {
      update: vi.fn(async ({ data }) => ({ id: "user-1", ...data })),
    },
    customer: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({
        id: "customer-1",
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        salutation: data.salutation ?? null,
        userId: data.user.connect.id,
      })),
      update: vi.fn(async ({ data }) => ({
        id: "customer-1",
        ...data,
      })),
    },
    address: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async ({ data }) => ({ id: "address-1", ...data })),
      findFirst: vi.fn(async () => ({ id: "address-1" })),
      update: vi.fn(async ({ data }) => ({ id: "address-1", ...data })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (callback) => callback(db)),
  };

  return db;
}

function createCustomerCaller(db: ReturnType<typeof createMockDb>) {
  return createCaller({
    db: db as never,
    session: {
      user: {
        id: "user-1",
        email: "water@example.com",
        name: "Water Friend",
        role: "customer",
      },
      session: { id: "session-1" },
    } as never,
    headers: new Headers(),
  });
}

describe("customer area", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  it("shows Customer Onboarding for a signed-in User without a Registered Customer", async () => {
    const caller = createCustomerCaller(db);

    await expect(caller.me()).resolves.toEqual({
      status: "needs-onboarding",
      user: {
        id: "user-1",
        email: "water@example.com",
        name: "Water Friend",
      },
    });
  });

  it("creates a Registered Customer linked to the current User from Customer Onboarding", async () => {
    const caller = createCustomerCaller(db);

    await expect(
      caller.completeOnboarding({
        email: "water@example.com",
        firstName: "River",
        lastName: "Stone",
        salutation: "FRAU",
      }),
    ).resolves.toEqual({
      id: "customer-1",
      email: "water@example.com",
      firstName: "River",
      lastName: "Stone",
      salutation: "FRAU",
      userId: "user-1",
    });

    expect(db.customer.create).toHaveBeenCalledWith({
      data: {
        email: "water@example.com",
        firstName: "River",
        lastName: "Stone",
        salutation: "FRAU",
        user: { connect: { id: "user-1" } },
      },
      select: {
        id: true,
        email: true,
        salutation: true,
        firstName: true,
        lastName: true,
        userId: true,
      },
    });
  });

  it("returns the Registered Customer with newest Orders and Address Book Entries", async () => {
    const placedAt = new Date("2026-05-15T10:00:00Z");
    db.customer.findUnique = vi.fn(async () => ({
      id: "customer-1",
      email: "river@example.com",
      firstName: "River",
      lastName: "Stone",
      salutation: "FRAU",
      addresses: [
        {
          id: "address-main",
          isMain: true,
          salutation: "FRAU",
          firstName: "River",
          lastName: "Stone",
          company: null,
          streetLine1: "Springstrasse 1",
          streetLine2: null,
          postalCode: "8000",
          city: "Zurich",
          countryCode: "CH",
          phone: null,
        },
      ],
      orders: [
        {
          id: "order-1",
          orderNumber: "EW-2026-00001",
          status: "PLACED",
          paymentStatus: "PAID",
          fulfillmentStatus: "UNFULFILLED",
          currencyCode: "CHF",
          subtotalCents: 4200,
          shippingCents: 900,
          discountCents: 0,
          totalCents: 5100,
          customerSalutation: "FRAU",
          customerFirstName: "River",
          customerLastName: "Stone",
          customerEmail: "river@example.com",
          shippingSalutation: "FRAU",
          shippingFirstName: "River",
          shippingLastName: "Stone",
          shippingCompany: null,
          shippingStreetLine1: "Springstrasse 1",
          shippingStreetLine2: null,
          shippingPostalCode: "8000",
          shippingCity: "Zurich",
          shippingCountryCode: "CH",
          shippingPhone: null,
          billingSameAsShipping: true,
          billingSalutation: "FRAU",
          billingFirstName: "River",
          billingLastName: "Stone",
          billingCompany: null,
          billingStreetLine1: "Springstrasse 1",
          billingStreetLine2: null,
          billingPostalCode: "8000",
          billingCity: "Zurich",
          billingCountryCode: "CH",
          billingPhone: null,
          placedAt,
          lines: [
            {
              id: "line-1",
              productName: "Filter",
              productSku: "EW-FIL-00001",
              quantity: 2,
              listPriceCents: 2100,
              discountPercent: null,
              unitPriceCents: 2100,
              lineTotalCents: 4200,
            },
          ],
        },
      ],
    }));
    const caller = createCustomerCaller(db);

    await expect(caller.me()).resolves.toMatchObject({
      status: "registered",
      customer: {
        id: "customer-1",
        addresses: [{ id: "address-main", isMain: true }],
        orders: [
          {
            orderNumber: "EW-2026-00001",
            lines: [{ productSku: "EW-FIL-00001" }],
            shippingStreetLine1: "Springstrasse 1",
            billingStreetLine1: "Springstrasse 1",
          },
        ],
      },
    });
  });

  it("updates Registered Customer contact names without changing email", async () => {
    db.customer.findUnique = vi.fn(async () => ({ id: "customer-1" }));
    const caller = createCustomerCaller(db);

    await caller.updateContact({
      firstName: "New",
      lastName: "Name",
      salutation: "HERR",
    });

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "New Name" },
    });
    expect(db.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "customer-1" },
        data: expect.not.objectContaining({ email: expect.anything() }),
      }),
    );
  });

  it("marks exactly one Address Book Entry as the Main Address Book Entry", async () => {
    db.customer.findUnique = vi.fn(async () => ({ id: "customer-1" }));
    const caller = createCustomerCaller(db);

    await caller.createAddress({
      firstName: "River",
      lastName: "Stone",
      streetLine1: "Springstrasse 1",
      postalCode: "8000",
      city: "Zurich",
      countryCode: "ch",
      isMain: true,
    });

    expect(db.address.updateMany).toHaveBeenCalledWith({
      where: { customerId: "customer-1", isMain: true },
      data: { isMain: false },
    });
    expect(db.address.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: "customer-1",
        countryCode: "CH",
        isMain: true,
      }),
    });
  });
});
