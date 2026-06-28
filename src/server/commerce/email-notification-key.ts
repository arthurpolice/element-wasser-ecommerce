import type { EmailNotificationType } from '../../../generated/prisma/client'

export function orderEmailNotificationKey(input: {
  orderId: string
  type: EmailNotificationType
  recipientEmail: string
}) {
  return `order:${input.orderId}:${input.type}:${input.recipientEmail}`
}

export function paymentEmailNotificationKey(input: {
  paymentId: string
  type: EmailNotificationType
}) {
  return `payment:${input.paymentId}:${input.type}`
}
