import 'server-only'

import nodemailer from 'nodemailer'

import { env } from '~/env'

let transport: ReturnType<typeof nodemailer.createTransport> | null = null

export function getEmailTransport() {
  if (!env.SMTP_HOST || !env.SMTP_PORT) {
    throw new Error('SMTP_HOST and SMTP_PORT must be configured.')
  }

  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined
  })
  return transport
}
