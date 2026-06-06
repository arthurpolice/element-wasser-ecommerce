import 'server-only'

import { Client, type PublishJsonRequest } from '@upstash/qstash'
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'

import { env } from '~/env'

const QSTASH_ROUTE_PREFIX = '/api/qstash/'

type PublishQstashJsonInput = Pick<
  PublishJsonRequest,
  | 'body'
  | 'headers'
  | 'delay'
  | 'notBefore'
  | 'deduplicationId'
  | 'contentBasedDeduplication'
  | 'retries'
  | 'retryDelay'
  | 'failureCallback'
  | 'timeout'
  | 'flowControl'
  | 'label'
  | 'redact'
> & {
  path: string
}

type QstashRouteHandler = Parameters<typeof verifySignatureAppRouter>[0]

let qstashClient: Client | null = null
let qstashClientToken: string | null = null

export function isQstashConfigured() {
  return Boolean(
    env.QSTASH_TOKEN &&
    env.QSTASH_CURRENT_SIGNING_KEY &&
    env.QSTASH_NEXT_SIGNING_KEY &&
    getQstashPublishBaseUrl()
  )
}

function getQstashClient() {
  if (!env.QSTASH_TOKEN) {
    throw new Error('QStash publishing is not configured.')
  }

  if (!qstashClient || qstashClientToken !== env.QSTASH_TOKEN) {
    qstashClient = new Client({ token: env.QSTASH_TOKEN })
    qstashClientToken = env.QSTASH_TOKEN
  }

  return qstashClient
}

function getQstashPublishBaseUrl() {
  if (env.QSTASH_PUBLISH_BASE_URL) {
    return env.QSTASH_PUBLISH_BASE_URL.replace(/\/$/, '')
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  if (env.NODE_ENV !== 'production') {
    return `http://localhost:${process.env.PORT ?? 3000}`
  }

  return null
}

function buildQstashPublishUrl(path: string) {
  if (!path.startsWith(QSTASH_ROUTE_PREFIX)) {
    throw new Error(
      `QStash publish path must start with ${QSTASH_ROUTE_PREFIX}.`
    )
  }

  const baseUrl = getQstashPublishBaseUrl()

  if (!baseUrl) {
    throw new Error('QStash publish base URL is not configured.')
  }

  return new URL(path, `${baseUrl}/`).toString()
}

function getQstashSigningConfig() {
  const currentSigningKey = env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = env.QSTASH_NEXT_SIGNING_KEY

  if (!currentSigningKey || !nextSigningKey) {
    throw new Error('QStash signature verification is not configured.')
  }

  return {
    currentSigningKey,
    nextSigningKey
  }
}

export async function publishQstashJson({
  path,
  ...message
}: PublishQstashJsonInput) {
  return getQstashClient().publishJSON({
    ...message,
    url: buildQstashPublishUrl(path)
  })
}

export function verifyQstashSignature(handler: QstashRouteHandler) {
  return verifySignatureAppRouter(handler, getQstashSigningConfig())
}
