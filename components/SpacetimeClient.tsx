'use client';

import { useEffect } from 'react';
import { DbConnection } from '../lib/module_bindings';

let globalConn: DbConnection | null = null;

export default function SpacetimeClient({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        if (globalConn) {
            (window as any).conn = globalConn;
            return;
        }

        console.log('⚡ Initializing SpacetimeClient connection...');

        try {
            globalConn = DbConnection.builder()
                .withUri(process.env.NEXT_PUBLIC_SPACETIMEDB_URI || 'ws://127.0.0.1:3001')
                .withDatabaseName(process.env.NEXT_PUBLIC_SPACETIMEDB_NAME || 'spacetime-org')
                .onConnect((connection, identity) => {
                    console.log('✅ Connected to SpacetimeDB:', identity);

                    // Subscribe to all tables explicitly
                    if (connection.subscriptionBuilder) {
                        connection.subscriptionBuilder().subscribe([
                            'SELECT * FROM org_node',
                            'SELECT * FROM task'
                        ]);
                    }
                })
                .onDisconnect(() => {
                    console.log('🔌 Disconnected from SpacetimeDB');
                    globalConn = null;
                })
                .onConnectError((_ctx, err) => {
                    console.error('❌ SpacetimeDB Connection Error:', err);
                })
                .build();

            (window as any).conn = globalConn;
        } catch (err) {
            console.error('💥 Failed to initialize SpacetimeDB Connection:', err);
        }
    }, []);

    return <>{children}</>;
}