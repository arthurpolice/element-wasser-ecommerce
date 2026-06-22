import { describe, expect, it } from 'vitest'

import { getOrderDashboardActions } from './order-dashboard-actions'

describe('Order dashboard actions', () => {
  it('shows Dispatch and cancellation separately for a paid unfulfilled Order', () => {
    expect(
      getOrderDashboardActions({
        status: 'PLACED',
        paymentStatus: 'PAID',
        fulfillmentStatus: 'UNFULFILLED'
      })
    ).toEqual({
      canCancel: true,
      canDispatch: true,
      canCompleteFulfillment: false
    })
  })

  it('shows only Fulfillment Completion after Dispatch', () => {
    expect(
      getOrderDashboardActions({
        status: 'PLACED',
        paymentStatus: 'PAID',
        fulfillmentStatus: 'DISPATCHED'
      })
    ).toEqual({
      canCancel: false,
      canDispatch: false,
      canCompleteFulfillment: true
    })
  })

  it('shows no lifecycle actions for a fulfilled Order', () => {
    expect(
      getOrderDashboardActions({
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        fulfillmentStatus: 'FULFILLED'
      })
    ).toEqual({
      canCancel: false,
      canDispatch: false,
      canCompleteFulfillment: false
    })
  })
})
