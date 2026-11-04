export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { STAFF_COOKIE } from '@/lib/stock/session';

/** POST /api/stock/logout — ends a staff PIN session on this phone. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
