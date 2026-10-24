'use client';

import { useEffect, useMemo, useState } from 'react';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from '../lib/module_bindings';

export default function LiveSpacetimeProvider({ children }: { children: React.ReactNode }) {
  // Only connect in the browser (not while Next.js renders on the server)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const connectionBuilder = useMemo(() => {
    const rawHost = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST || 'ws://127.0.0.1:3000';
    const dbName = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE || 'spacetime-org';

    // Ensure the connection URI uses the WebSocket protocol (ws:// or wss://)
    const wsUri = rawHost.startsWith('http')
      ? rawHost.replace(/^http/, 'ws')
      : rawHost;

    return DbConnection.builder()
      .withUri(wsUri)
      .withDatabaseName(dbName);
  }, []);

  if (!mounted) return null;

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      {children}
    </SpacetimeDBProvider>
  );
}