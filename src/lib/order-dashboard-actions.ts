type OrderActionState = {
  status: 'PLACED' | 'CANCELLED' | 'COMPLETED'
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED'
  fulfillmentStatus: 'UNFULFILLED' | 'DISPATCHED' | 'FULFILLED' | 'CANCELLED'
}

export function getOrderDashboardActions(order: OrderActionState) {
  const open = order.status === 'PLACED'

  return {
    canCancel: open && order.fulfillmentStatus === 'UNFULFILLED',
    canDispatch:
      open &&
      order.paymentStatus === 'PAID' &&
      order.fulfillmentStatus === 'UNFULFILLED',
    canCompleteFulfillment:
      open &&
      order.paymentStatus === 'PAID' &&
      order.fulfillmentStatus === 'DISPATCHED'
  }
}
