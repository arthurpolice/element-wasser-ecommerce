import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    AWS_ACCESS_KEY_ID:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    AWS_SECRET_ACCESS_KEY:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    S3_BUCKET:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    S3_REGION:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    S3_ENDPOINT: z.string().url().optional(),
    S3_PUBLIC_URL_BASE: z.string().url().optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
    QSTASH_TOKEN:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    QSTASH_CURRENT_SIGNING_KEY:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    QSTASH_NEXT_SIGNING_KEY:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    QSTASH_PUBLISH_BASE_URL:
      process.env.NODE_ENV === 'production'
        ? z.string().url()
        : z.string().url().optional(),
    APP_BASE_URL:
      process.env.NODE_ENV === 'production'
        ? z.string().url()
        : z.string().url().optional(),
    CRON_SECRET:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    ORDER_ACCESS_SECRET:
      process.env.NODE_ENV === 'production'
        ? z.string().min(32)
        : z.string().min(32).optional(),
    RESEND_API_KEY:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    RESEND_WEBHOOK_SECRET:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    EMAIL_FROM:
      process.env.NODE_ENV === 'production'
        ? z.string().email()
        : z.string().email().optional(),
    EMAIL_REPLY_TO:
      process.env.NODE_ENV === 'production'
        ? z.string().email()
        : z.string().email().optional(),
    EMAIL_INTERNAL_RECIPIENT:
      process.env.NODE_ENV === 'production'
        ? z.string().email()
        : z.string().email().optional(),
    STRIPE_SECRET_KEY:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    STRIPE_WEBHOOK_SECRET:
      process.env.NODE_ENV === 'production' ? z.string() : z.string().optional()
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_PUBLIC_URL_BASE: process.env.S3_PUBLIC_URL_BASE,
    S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    QSTASH_PUBLISH_BASE_URL: process.env.QSTASH_PUBLISH_BASE_URL,
    APP_BASE_URL: process.env.APP_BASE_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    ORDER_ACCESS_SECRET: process.env.ORDER_ACCESS_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    EMAIL_INTERNAL_RECIPIENT: process.env.EMAIL_INTERNAL_RECIPIENT,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true
})
