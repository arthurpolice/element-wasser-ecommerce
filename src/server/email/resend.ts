import 'server-only'

import { Resend } from 'resend'

import { env } from '~/env'

let client: Resend | null = null

export function getResendClient() {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured.')
  }

  client ??= new Resend(env.RESEND_API_KEY)
  return client
}
