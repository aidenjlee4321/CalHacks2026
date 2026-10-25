'use client';

import { useEffect, useMemo, useState } from 'react';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from '../lib/module_bindings';

export default function LiveSpacetimeProvider({ children }: { children: React.ReactNode }) {
  // Only connect in the browser (not while Next.js renders on the server)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const connectionBuilder = useMemo(() => {
    const rawHost =
      process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ||
      process.env.NEXT_PUBLIC_SPACETIMEDB_URI ||
      'wss://maincloud.spacetimedb.com';
    const dbName =
      process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ||
      process.env.NEXT_PUBLIC_SPACETIMEDB_NAME ||
      'org-backend-afa0s-v2';

    const wsUri = rawHost.startsWith('http')
      ? rawHost.replace(/^http/, 'ws')
      : rawHost;

    return DbConnection.builder().withUri(wsUri).withDatabaseName(dbName);
  }, []);

  if (!mounted) return null;

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      {children}
    </SpacetimeDBProvider>
  );
}