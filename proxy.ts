import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, decodeSession } from '@/lib/session';

// Send signed-out visitors to /login, and signed-in ones away from it
export function proxy(req: NextRequest) {
    const user = decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
    const onLogin = req.nextUrl.pathname === '/login';

    if (!user && !onLogin) {
        return NextResponse.redirect(new URL('/login', req.nextUrl));
    }
    if (user && onLogin) {
        return NextResponse.redirect(new URL('/', req.nextUrl));
    }
    return NextResponse.next();
}

// API routes stay open (the pages call them); skip static assets
export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)'],
};
