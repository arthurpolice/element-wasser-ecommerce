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

export type OrderPlacedEmailProps = {
  customerFirstName: string
  orderNumber: string
  orderUrl: string
}

export function OrderPlacedEmail({
  customerFirstName,
  orderNumber,
  orderUrl
}: OrderPlacedEmailProps) {
  return (
    <Html lang="de">
      <Head />
      <Preview>Bestellung {orderNumber} wurde aufgegeben</Preview>
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
          <Heading>Vielen Dank für Ihre Bestellung</Heading>
          <Text>Guten Tag {customerFirstName},</Text>
          <Text>
            Ihre Bestellung {orderNumber} wurde erfolgreich aufgegeben. Der
            Zahlungseingang wird separat bestätigt.
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
            Falls Sie Fragen haben, antworten Sie einfach auf diese E-Mail.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

OrderPlacedEmail.PreviewProps = {
  customerFirstName: 'Anna',
  orderNumber: 'EW-2026-00001',
  orderUrl: 'http://localhost:3000/de/checkout/confirmation?order=EW-2026-00001'
} satisfies OrderPlacedEmailProps

export default OrderPlacedEmail
