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

export type OrderDispatchedEmailProps = {
  customerFirstName: string
  orderNumber: string
  orderUrl: string
  trackingUrl: string | null
}

export function OrderDispatchedEmail({
  customerFirstName,
  orderNumber,
  orderUrl,
  trackingUrl
}: OrderDispatchedEmailProps) {
  return (
    <Html lang="de">
      <Head />
      <Preview>Bestellung {orderNumber} wurde versendet</Preview>
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
          <Heading>Ihre Bestellung ist unterwegs</Heading>
          <Text>Guten Tag {customerFirstName},</Text>
          <Text>
            Ihre Bestellung {orderNumber} wurde an die Schweizerische Post
            übergeben.
          </Text>
          {trackingUrl ? (
            <Button
              href={trackingUrl}
              style={{
                backgroundColor: '#ffcc00',
                color: '#1a1a1a',
                padding: '12px 20px'
              }}
            >
              Sendung verfolgen
            </Button>
          ) : null}
          <Text>
            <a href={orderUrl}>Bestellung ansehen</a>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default OrderDispatchedEmail
