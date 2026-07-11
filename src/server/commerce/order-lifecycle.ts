import type { Prisma, PrismaClient } from '../../../generated/prisma/client'

import {
  orderListInclude,
  type OrderListRow
} from '~/server/commerce/order-placement'
import { getOrderAccessExpiry } from '~/server/commerce/order-access-token'
import { publishEmailNotificationSafely } from '~/server/commerce/email-notifications'
import { orderEmailNotificationKey } from '~/server/commerce/email-notification-key'
import { SWISS_POST_CARRIER_CODE } from '~/lib/order-tracking'
import { expireStripeCheckoutSession } from '~/server/payments/stripe-checkout'
import { projectOrderPaymentStatus } from '~/server/commerce/payment-outcome'
import { mapWithConcurrency } from '~/utils/map-with-concurrency'

export const orderLifecycleInclude = {
  ...orderListInclude
} satisfies Prisma.OrderInclude

type OrderLifecycleRow = Prisma.OrderGetPayload<{
  include: typeof orderLifecycleInclude
}>

export type OrderLifecycleErrorCode =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_ALREADY_FULFILLED'
  | 'ORDER_ALREADY_DISPATCHED'
  | 'ORDER_NOT_DISPATCHED'
  | 'ORDER_PAYMENT_NOT_PAID'
  | 'ORDER_CANCELLED'

export class OrderLifecycleError extends Error {
  constructor(
    readonly code: OrderLifecycleErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'OrderLifecycleError'
  }
}

type OrderLifecycleDeps = {
  now?: () => Date
}

type Db = Pick<PrismaClient, '$transaction'>

export const PAYMENT_EXPIRY_BATCH_SIZE = 50
export const PAYMENT_EXPIRY_CONCURRENCY = 5
export const PAYMENT_EXPIRY_LEASE_DURATION_MS = 10 * 60 * 1000

function nowFromDeps(deps: OrderLifecycleDeps) {
  return deps.now?.() ?? new Date()
}

function normalizeTrackingNumber(value: string | undefined) {
  const trackingNumber = value?.trim()
  if (!trackingNumber) return null
  return trackingNumber
}

async function findOrder(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<OrderLifecycleRow> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: orderLifecycleInclude
  })

  if (!order) {
    throw new OrderLifecycleError('ORDER_NOT_FOUND', 'Order not found.')
  }

  return order
}

async function releaseStockReservation(
  tx: Prisma.TransactionClient,
  order: Pick<OrderLifecycleRow, 'lines'>
) {
  const quantities = aggregateProductQuantities(order.lines)
  if (quantities.length === 0) return
  const productIds = quantities.map((item) => item.productId)
  const requestedQuantities = quantities.map((item) => item.quantity)
  const updated = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "Product" product
    SET "stockReserved" = product."stockReserved" - requested."quantity"
    FROM unnest(
      ${productIds}::text[],
      ${requestedQuantities}::integer[]
    ) AS requested("productId", "quantity")
    WHERE product."id" = requested."productId"
      AND product."stockReserved" >= requested."quantity"
    RETURNING product."id"
  `

  if (updated.length !== quantities.length) {
    throw new Error('Stock Reservation release invariant violated.')
  }
}

async function consumeStockReservation(
  tx: Prisma.TransactionClient,
  order: Pick<OrderLifecycleRow, 'lines'>
) {
  const quantities = aggregateProductQuantities(order.lines)
  if (quantities.length === 0) return
  const productIds = quantities.map((item) => item.productId)
  const requestedQuantities = quantities.map((item) => item.quantity)
  const updated = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "Product" product
    SET
      "stockOnHand" = product."stockOnHand" - requested."quantity",
      "stockReserved" = product."stockReserved" - requested."quantity"
    FROM unnest(
      ${productIds}::text[],
      ${requestedQuantities}::integer[]
    ) AS requested("productId", "quantity")
    WHERE product."id" = requested."productId"
      AND product."stockOnHand" >= requested."quantity"
      AND product."stockReserved" >= requested."quantity"
    RETURNING product."id"
  `

  if (updated.length !== quantities.length) {
    throw new Error('Stock Reservation consumption invariant violated.')
  }
}

function aggregateProductQuantities(
  lines: Array<{ productId: string; quantity: number }>
) {
  const quantities = new Map<string, number>()
  for (const line of lines) {
    quantities.set(
      line.productId,
      (quantities.get(line.productId) ?? 0) + line.quantity
    )
  }
  return Array.from(quantities, ([productId, quantity]) => ({
    productId,
    quantity
  }))
}

/**
 * Cancels an order whose payment provider has authoritatively reported that
 * its payment window expired. This is deliberately separate from
 * `cancelOrder`: an expiry is an automated lifecycle transition and must not
 * send the merchant-cancellation email.
 */
export async function cancelOrderForExpiredPayment(
  db: Db,
  input: { orderId: string },
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow | null> {
  const cancelledAt = nowFromDeps(deps)

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE
    `
    const order = await findOrder(tx, input.orderId)

    if (
      order.status === 'CANCELLED' ||
      order.paymentStatus === 'PAID' ||
      order.fulfillmentStatus === 'FULFILLED' ||
      order.fulfillmentStatus === 'DISPATCHED' ||
      (order.payments ?? []).some((payment) => payment.status === 'CAPTURED')
    ) {
      return null
    }

    await releaseStockReservation(tx, order)
    await tx.payment.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        failureReason: 'Payment Window expired.'
      }
    })
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        paymentExpiryStartedAt: null,
        cancelledAt
      }
    })
    await projectOrderPaymentStatus(tx, order.id, cancelledAt)

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: orderListInclude
    })
  })
}

export async function cancelOrder(
  db: Db,
  input: { orderId: string },
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow> {
  const cancelledAt = nowFromDeps(deps)
  const current = await db.$transaction((tx) => findOrder(tx, input.orderId))
  const activePayment = (current.payments ?? []).find(
    (payment) => payment.status === 'PENDING'
  )

  if (
    current.paymentStatus !== 'PAID' &&
    activePayment?.stripeCheckoutSessionId
  ) {
    await expireStripeCheckoutSession(activePayment.stripeCheckoutSessionId)
  }

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE
    `
    const order = await findOrder(tx, input.orderId)

    if (order.status === 'CANCELLED') {
      return { order, emailNotificationId: null }
    }

    if (order.fulfillmentStatus === 'DISPATCHED') {
      throw new OrderLifecycleError(
        'ORDER_ALREADY_DISPATCHED',
        'Dispatched Orders cannot be cancelled.'
      )
    }

    if (order.fulfillmentStatus === 'FULFILLED') {
      throw new OrderLifecycleError(
        'ORDER_ALREADY_FULFILLED',
        'Fulfilled Orders cannot be cancelled.'
      )
    }

    await releaseStockReservation(tx, order)
    await tx.payment.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        failureReason: 'Order cancelled by merchant.'
      }
    })

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        fulfillmentStatus: 'CANCELLED',
        cancelledAt
      },
      include: orderListInclude
    })
    await projectOrderPaymentStatus(tx, order.id, cancelledAt)
    const cancelledOrder = await tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: orderListInclude
    })

    const emailNotification = await tx.emailNotification.upsert({
      where: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: order.id,
          type: 'ORDER_CANCELLED',
          recipientEmail: order.customerEmail
        })
      },
      create: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: order.id,
          type: 'ORDER_CANCELLED',
          recipientEmail: order.customerEmail
        }),
        orderId: order.id,
        type: 'ORDER_CANCELLED',
        recipientEmail: order.customerEmail,
        accessExpiresAt: order.customer.userId
          ? null
          : getOrderAccessExpiry(cancelledAt)
      },
      update: {}
    })

    return {
      order: cancelledOrder,
      emailNotificationId: emailNotification.id
    }
  })

  if (result.emailNotificationId) {
    void publishEmailNotificationSafely(result.emailNotificationId)
  }

  return result.order
}

export async function fulfillOrder(
  db: Db,
  input: { orderId: string },
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow> {
  const completedAt = nowFromDeps(deps)

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE
    `
    const order = await findOrder(tx, input.orderId)

    if (order.fulfillmentStatus === 'FULFILLED') {
      return order
    }

    if (order.status === 'CANCELLED') {
      throw new OrderLifecycleError(
        'ORDER_CANCELLED',
        'Cancelled Orders cannot be fulfilled.'
      )
    }

    if (order.paymentStatus !== 'PAID') {
      throw new OrderLifecycleError(
        'ORDER_PAYMENT_NOT_PAID',
        'Only paid Orders can be fulfilled.'
      )
    }

    if (order.fulfillmentStatus !== 'DISPATCHED') {
      throw new OrderLifecycleError(
        'ORDER_NOT_DISPATCHED',
        'Only dispatched Orders can complete Fulfillment.'
      )
    }

    await consumeStockReservation(tx, order)

    return tx.order.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        fulfillmentStatus: 'FULFILLED',
        completedAt
      },
      include: orderListInclude
    })
  })
}

export async function dispatchOrder(
  db: Db,
  input: { orderId: string; trackingNumber?: string },
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow> {
  const dispatchedAt = nowFromDeps(deps)
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber)

  const result = await db.$transaction(async (tx) => {
    const order = await findOrder(tx, input.orderId)

    if (order.fulfillmentStatus === 'DISPATCHED') {
      return { order, emailNotificationId: null }
    }

    if (order.status === 'CANCELLED') {
      throw new OrderLifecycleError(
        'ORDER_CANCELLED',
        'Cancelled Orders cannot be dispatched.'
      )
    }

    if (order.fulfillmentStatus !== 'UNFULFILLED') {
      throw new OrderLifecycleError(
        'ORDER_ALREADY_FULFILLED',
        'Only unfulfilled Orders can be dispatched.'
      )
    }

    if (order.paymentStatus !== 'PAID') {
      throw new OrderLifecycleError(
        'ORDER_PAYMENT_NOT_PAID',
        'Only paid Orders can be dispatched.'
      )
    }

    const dispatchedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        fulfillmentStatus: 'DISPATCHED',
        dispatchCarrier: SWISS_POST_CARRIER_CODE,
        trackingNumber,
        dispatchedAt
      },
      include: orderListInclude
    })

    const emailNotification = await tx.emailNotification.upsert({
      where: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: order.id,
          type: 'ORDER_DISPATCHED',
          recipientEmail: order.customerEmail
        })
      },
      create: {
        deduplicationKey: orderEmailNotificationKey({
          orderId: order.id,
          type: 'ORDER_DISPATCHED',
          recipientEmail: order.customerEmail
        }),
        orderId: order.id,
        type: 'ORDER_DISPATCHED',
        recipientEmail: order.customerEmail,
        accessExpiresAt: order.customer.userId
          ? null
          : getOrderAccessExpiry(dispatchedAt)
      },
      update: {}
    })

    return {
      order: dispatchedOrder,
      emailNotificationId: emailNotification.id
    }
  })

  if (result.emailNotificationId) {
    void publishEmailNotificationSafely(result.emailNotificationId)
  }

  return result.order
}

export async function expirePendingPaymentOrders(
  db: Db,
  deps: OrderLifecycleDeps = {}
): Promise<OrderListRow[]> {
  const cancelledAt = nowFromDeps(deps)
  const leaseExpiredBefore = new Date(
    cancelledAt.getTime() - PAYMENT_EXPIRY_LEASE_DURATION_MS
  )
  const expiredOrders = await db.$transaction(async (tx) => {
    const claimedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Order"
      WHERE "status" = 'PLACED'
        AND "paymentStatus" IN ('PENDING', 'FAILED', 'CANCELLED')
        AND "fulfillmentStatus" = 'UNFULFILLED'
        AND "paymentExpiresAt" <= ${cancelledAt}
        AND (
          "paymentExpiryStartedAt" IS NULL
          OR "paymentExpiryStartedAt" <= ${leaseExpiredBefore}
      )
      ORDER BY "paymentExpiresAt" ASC, "id" ASC
      LIMIT ${PAYMENT_EXPIRY_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `
    const claimedIds = claimedRows.map((row) => row.id)

    if (claimedIds.length === 0) {
      return []
    }

    await tx.order.updateMany({
      where: { id: { in: claimedIds } },
      data: { paymentExpiryStartedAt: cancelledAt }
    })

    return tx.order.findMany({
      where: { id: { in: claimedIds } },
      include: orderLifecycleInclude,
      orderBy: [{ paymentExpiresAt: 'asc' }, { id: 'asc' }]
    })
  })

  const results = await mapWithConcurrency(
    expiredOrders,
    PAYMENT_EXPIRY_CONCURRENCY,
    async (candidate) => {
      const activePayment = (candidate.payments ?? []).find(
        (payment) => payment.status === 'PENDING'
      )
      if (activePayment?.stripeCheckoutSessionId) {
        try {
          await expireStripeCheckoutSession(
            activePayment.stripeCheckoutSessionId
          )
        } catch {
          return null
        }
      }

      return db.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE
        `
        const order = await findOrder(tx, candidate.id)
        if (
          order.paymentExpiryStartedAt?.getTime() !== cancelledAt.getTime() ||
          order.status !== 'PLACED' ||
          order.fulfillmentStatus !== 'UNFULFILLED'
        ) {
          return null
        }

        if (order.paymentStatus === 'PAID') {
          await tx.order.update({
            where: { id: order.id },
            data: { paymentExpiryStartedAt: null }
          })
          return null
        }

        await tx.payment.updateMany({
          where: { orderId: order.id, status: 'PENDING' },
          data: {
            status: 'CANCELLED',
            failureReason: 'Payment Window expired.'
          }
        })
        await releaseStockReservation(tx, order)
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'CANCELLED',
            fulfillmentStatus: 'CANCELLED',
            paymentExpiryStartedAt: null,
            cancelledAt
          }
        })
        await projectOrderPaymentStatus(tx, order.id, cancelledAt)
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: orderListInclude
        })
      })
    }
  )

  return results.filter((order): order is OrderListRow => order !== null)
}
