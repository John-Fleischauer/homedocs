import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('/api/health', () => {
  // The deploy job reads `revision` to confirm the new image is running.
  it('reports ok and the revision', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, revision: process.env.GIT_REVISION ?? 'dev' })
  })
})
