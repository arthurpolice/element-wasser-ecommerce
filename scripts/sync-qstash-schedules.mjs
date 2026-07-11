import 'dotenv/config'
import { Client } from '@upstash/qstash'

const token = process.env.QSTASH_TOKEN
const baseUrl = process.env.QSTASH_PUBLISH_BASE_URL?.replace(/\/$/, '')

if (!token || !baseUrl) {
  throw new Error(
    'QSTASH_TOKEN and QSTASH_PUBLISH_BASE_URL must be configured to sync schedules.'
  )
}

const qstash = new Client({ token })

const schedules = [
  {
    scheduleId: 'catalog-search-reindex',
    destination: new URL(
      '/api/qstash/catalog/search/reindex',
      `${baseUrl}/`
    ).toString(),
    cron: '*/10 * * * *',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
    retries: 3,
    label: 'catalog-search-reindex'
  }
]

for (const schedule of schedules) {
  await qstash.schedules.create(schedule)
  console.log(`Synced QStash schedule: ${schedule.scheduleId}`)
}
