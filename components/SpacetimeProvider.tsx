'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { DbConnection } from '../lib/module_bindings';

interface SpacetimeContextType {
    connected: boolean;
    identity: string | null;
    conn: DbConnection | null;
}

const SpacetimeContext = createContext<SpacetimeContextType>({
    connected: false,
    identity: null,
    conn: null,
});

export const useSpacetime = () => useContext(SpacetimeContext);

export function SpacetimeProvider({ children }: { children: React.ReactNode }) {
    const [connected, setConnected] = useState(false);
    const [identity, setIdentity] = useState<string | null>(null);
    const [conn, setConn] = useState<DbConnection | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);

        const connection = DbConnection.builder()
            .withUri('https://maincloud.spacetimedb.com')
            .withDatabaseName('org-backend-afa0s-v2') // Must match the published name from Step 1
            .onConnect((c, id) => {
                console.log('Connected to SpacetimeDB Cloud!', id);
                setConnected(true);
                setIdentity(typeof id === 'string' ? id : id.toHexString());
                setConn(c);

                c.subscriptionBuilder().subscribe([
                    'SELECT * FROM org_node',
                    'SELECT * FROM task',
                ]);
            })
            .onDisconnect(() => {
                console.log('Disconnected from SpacetimeDB');
                setConnected(false);
                setConn(null);
            })
            .onConnectError((_, err) => {
                console.error('SpacetimeDB connection error:', err);
            })
            .build();

        return () => {
            connection.disconnect();
        };
    }, []);

    if (!mounted) return null;

    return (
        <SpacetimeContext.Provider value={{ connected, identity, conn }}>
            {children}
        </SpacetimeContext.Provider>
    );
}