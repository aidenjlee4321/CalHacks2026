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

    useEffect(() => {
        const connection = DbConnection.builder()
            .withUri('http://127.0.0.1:3000')
            .withDatabaseName('org-backend')
            .onConnect((c, id) => {
                console.log('Connected to SpacetimeDB!', id);
                setConnected(true);
                setIdentity(typeof id === 'string' ? id : id.toHexString());
                setConn(c);

                // Subscribe to queries
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

    return (
        <SpacetimeContext.Provider value={{ connected, identity, conn }}>
            {children}
        </SpacetimeContext.Provider>
    );
}