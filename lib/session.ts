import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { DEMO_USERS, SessionUser, findUser } from '@/lib/auth';

// Server-only session handling: an HMAC-signed cookie holding the user id.

export const SESSION_COOKIE = 'org_session';

const SECRET = process.env.AUTH_SECRET || 'spacetime-org-demo-secret';

// Demo passwords, keyed by email
const PASSWORDS: Record<string, string> = {
    'ceo@spacetime.org': 'ceo-demo',
    'lead@spacetime.org': 'lead-demo',
};

function sign(userId: string) {
    return createHmac('sha256', SECRET).update(userId).digest('base64url');
}

export function encodeSession(userId: string) {
    return `${userId}.${sign(userId)}`;
}

// Returns the user for a cookie value, or null if it's missing or tampered with
export function decodeSession(value: string | undefined): SessionUser | null {
    if (!value) return null;
    const dot = value.lastIndexOf('.');
    if (dot < 0) return null;
    const userId = value.slice(0, dot);
    const given = Buffer.from(value.slice(dot + 1));
    const expected = Buffer.from(sign(userId));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return findUser(userId);
}

export function checkCredentials(email: string, password: string): SessionUser | null {
    const normalized = email.trim().toLowerCase();
    if (!PASSWORDS[normalized] || PASSWORDS[normalized] !== password) return null;
    return DEMO_USERS.find((u) => u.email === normalized) || null;
}

export async function getSessionUser() {
    return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}
