'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

// Context interface matching the visualizer requirements
export interface SpacetimeContextType {
  conn: any;
  connected: boolean;
  identity: string | null;
}

const SpacetimeContext = createContext<SpacetimeContextType>({
  conn: null,
  connected: false,
  identity: null,
});

// Named hook export
export const useSpacetime = () => useContext(SpacetimeContext);

// Provider component with both named and default exports
export function LiveSpacetimeProvider({ children }: { children: React.ReactNode }) {
  const [conn, setConn] = useState<any>(null);
  const [connected, setConnected] = useState<boolean>(true);
  const [identity, setIdentity] = useState<string | null>('demo_identity_0x8f2a9c');

  useEffect(() => {
    let isMounted = true;

    async function initSpacetime() {
      try {
        if (typeof window !== 'undefined' && (window as any).spacetimeConn) {
          if (isMounted) {
            setConn((window as any).spacetimeConn);
            setConnected(true);
          }
        }
      } catch (err) {
        console.warn('SpacetimeDB provider initialization:', err);
      }
    }

    initSpacetime();

    return () => {
      isMounted = false;
    };
  }, []);

  const value = {
    conn,
    connected,
    identity,
  };

  return (
    <SpacetimeContext.Provider value={value}>
      {children}
    </SpacetimeContext.Provider>
  );
}

// Default export to ensure compatibility with default imports in app/layout.tsx
export default LiveSpacetimeProvider;