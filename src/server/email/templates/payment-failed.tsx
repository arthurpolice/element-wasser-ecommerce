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

export type PaymentFailedEmailProps = {
  customerFirstName: string
  orderNumber: string
  orderUrl: string
}

export function PaymentFailedEmail({
  customerFirstName,
  orderNumber,
  orderUrl
}: PaymentFailedEmailProps) {
  return (
    <Html lang="de">
      <Head />
      <Preview>
        Zahlung für Bestellung {orderNumber} nicht abgeschlossen
      </Preview>
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
          <Heading>Ihre Zahlung konnte nicht abgeschlossen werden</Heading>
          <Text>Guten Tag {customerFirstName},</Text>
          <Text>
            Die Zahlung für Ihre Bestellung {orderNumber} wurde nicht
            abgeschlossen. Ihre Bestellung bleibt vorerst offen.
          </Text>
          <Text>
            Sie können den Zahlungsstatus prüfen und die Zahlung erneut
            versuchen, solange das Zahlungsfenster geöffnet ist.
          </Text>
          <Button
            href={orderUrl}
            style={{
              backgroundColor: '#163d32',
              color: '#ffffff',
              padding: '12px 20px'
            }}
          >
            Zahlung erneut versuchen
          </Button>
          <Text>
            Aus Sicherheitsgründen enthält diese E-Mail keine technischen
            Angaben zum fehlgeschlagenen Zahlungsversuch.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

PaymentFailedEmail.PreviewProps = {
  customerFirstName: 'Anna',
  orderNumber: 'EW-2026-00001',
  orderUrl: 'http://localhost:3000/de/checkout/confirmation?order=EW-2026-00001'
} satisfies PaymentFailedEmailProps

export default PaymentFailedEmail
