import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text
} from '@react-email/components'
import React from 'react'

export type OrderCancelledEmailProps = {
  customerFirstName: string
  orderNumber: string
  orderUrl: string
}

export function OrderCancelledEmail({
  customerFirstName,
  orderNumber,
  orderUrl
}: OrderCancelledEmailProps) {
  return (
    <Html lang="de">
      <Head />
      <Preview>Bestellung {orderNumber} wurde storniert</Preview>
      <Body
        style={{ backgroundColor: '#f5f7f5', fontFamily: 'Arial, sans-serif' }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            margin: '32px auto',
            padding: '32px',
            maxWidth: '560px'
          }}
        >
          <Heading>Ihre Bestellung wurde storniert</Heading>
          <Text>Guten Tag {customerFirstName},</Text>
          <Text>
            Ihre gesamte Bestellung {orderNumber} wurde von uns storniert. Sie
            wird nicht mehr bearbeitet oder versendet.
          </Text>
          <Button
            href={orderUrl}
            style={{
              backgroundColor: '#163d32',
              color: '#ffffff',
              padding: '12px 20px'
            }}
          >
            Bestellung ansehen
          </Button>
          <Text>
            Falls Sie Fragen zur Stornierung haben, antworten Sie einfach auf
            diese E-Mail.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

OrderCancelledEmail.PreviewProps = {
  customerFirstName: 'Anna',
  orderNumber: 'EW-2026-00001',
  orderUrl:
    'http://localhost:3000/de/checkout/confirmation?order=EW-2026-00001'
} satisfies OrderCancelledEmailProps

export default OrderCancelledEmail
