import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';

// The signed-in user (or null), read from the signed session cookie
export async function GET() {
    return NextResponse.json({ user: await getSessionUser() });
}
