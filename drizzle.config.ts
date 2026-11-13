import { defineConfig } from 'drizzle-kit'
import { LOCAL_DATABASE_URL } from './lib/db/migrate-url'

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
  },
})
