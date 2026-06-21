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

export type PaymentConfirmedEmailProps = {
  customerFirstName: string
  orderNumber: string
  orderUrl: string
  lines: Array<{
    productName: string
    quantity: number
    lineTotal: string
  }>
  total: string
}

export function PaymentConfirmedEmail({
  customerFirstName,
  orderNumber,
  orderUrl,
  lines,
  total
}: PaymentConfirmedEmailProps) {
  return (
    <Html lang="de">
      <Head />
      <Preview>Zahlung für Bestellung {orderNumber} bestätigt</Preview>
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
          <Heading>Ihre Zahlung ist eingegangen</Heading>
          <Text>Guten Tag {customerFirstName},</Text>
          <Text>
            Wir haben Ihre Zahlung für die Bestellung {orderNumber} erhalten.
          </Text>
          {lines.map((line) => (
            <Text key={`${line.productName}-${line.quantity}`}>
              {line.quantity} × {line.productName}: {line.lineTotal}
            </Text>
          ))}
          <Text>
            <strong>Gesamtbetrag: {total}</strong>
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
        </Container>
      </Body>
    </Html>
  )
}

export default PaymentConfirmedEmail
