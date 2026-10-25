'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, checkCredentials, encodeSession } from '@/lib/session';

export async function signIn(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
    const user = checkCredentials(String(formData.get('email') || ''), String(formData.get('password') || ''));
    if (!user) return { error: 'Wrong email or password.' };

    (await cookies()).set(SESSION_COOKIE, encodeSession(user.id), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
    });
    redirect('/');
}

export async function signOut() {
    (await cookies()).delete(SESSION_COOKIE);
    redirect('/login');
}
