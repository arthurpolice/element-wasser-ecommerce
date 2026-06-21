import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text
} from '@react-email/components'
import React from 'react'

export type NewPaidOrderEmailProps = {
  orderNumber: string
  customerName: string
  customerEmail: string
  shippingAddress: string[]
  lines: Array<{
    productName: string
    productSku: string
    quantity: number
    lineTotal: string
  }>
  total: string
}

export function NewPaidOrderEmail({
  orderNumber,
  customerName,
  customerEmail,
  shippingAddress,
  lines,
  total
}: NewPaidOrderEmailProps) {
  return (
    <Html lang="de">
      <Head />
      <Preview>Neue bezahlte Bestellung {orderNumber}</Preview>
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
          <Heading>Neue bezahlte Bestellung</Heading>
          <Text>Die Bestellung {orderNumber} wurde erfolgreich bezahlt.</Text>
          <Text>
            <strong>Kunde:</strong> {customerName} ({customerEmail})
          </Text>
          {lines.map((line) => (
            <Text key={`${line.productSku}-${line.quantity}`}>
              {line.quantity} × {line.productName} ({line.productSku}):{' '}
              {line.lineTotal}
            </Text>
          ))}
          <Text>
            <strong>Gesamtbetrag: {total}</strong>
          </Text>
          <Text>
            <strong>Lieferadresse:</strong>
            <br />
            {shippingAddress.map((part) => (
              <React.Fragment key={part}>
                {part}
                <br />
              </React.Fragment>
            ))}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default NewPaidOrderEmail
