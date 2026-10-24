'use client';

import { useEffect, useMemo, useState } from 'react';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from '../lib/module_bindings';

export default function SpacetimeProvider({ children }: { children: React.ReactNode }) {
  // Only connect in the browser (not while Next.js renders on the server)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const connectionBuilder = useMemo(
    () =>
      DbConnection.builder()
        .withUri('wss://maincloud.spacetimedb.com')
        .withDatabaseName('org-backend-afa0s'),
    []
  );

  if (!mounted) return null;

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      {children}
    </SpacetimeDBProvider>
  );
}