/*
 * Liveness for the container healthcheck, and the deployed revision.
 *
 * Unauthenticated by design and reveals nothing but the git sha the image was
 * built from — which is how a deploy is verified (docs/DEPLOYMENT.md). No
 * database read: the db service has its own healthcheck, and a Postgres blip
 * should not restart-loop the app.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ ok: true, revision: process.env.GIT_REVISION ?? 'dev' })
}
