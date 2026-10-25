'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { SessionUser } from '@/lib/auth';

const SessionContext = createContext<SessionUser | null>(null);

// Loads the signed-in user once per page change (sign-in and sign-out both navigate),
// and holds the page back until then so a lead never sees the full org flash by.
export function SessionProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [session, setSession] = useState<{ path: string; user: SessionUser | null } | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/auth/session', { cache: 'no-store' })
            .then((res) => res.json())
            .then((data) => !cancelled && setSession({ path: pathname, user: data.user ?? null }))
            .catch(() => !cancelled && setSession({ path: pathname, user: null }));
        return () => {
            cancelled = true;
        };
    }, [pathname]);

    // Right after sign-in the old (signed-out) answer is still here: wait for the new one
    if (!session || (!session.user && pathname !== '/login')) return null;
    return <SessionContext value={session.user}>{children}</SessionContext>;
}

// The signed-in user, or null on the login page
export function useSession() {
    return useContext(SessionContext);
}
