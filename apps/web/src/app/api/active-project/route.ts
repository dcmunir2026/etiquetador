import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACTIVE_PROJECT_COOKIE } from '@/lib/session';

export async function POST(req: Request) {
  const { projectId } = await req.json();
  if (!projectId || typeof projectId !== 'string') {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }
  cookies().set(ACTIVE_PROJECT_COOKIE, projectId, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  return NextResponse.json({ ok: true });
}
