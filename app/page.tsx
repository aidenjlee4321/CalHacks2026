'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSpacetime } from '@/components/SpacetimeProvider';
import type { OrgNode } from '@/lib/module_bindings';

export default function Dashboard() {
  const { conn, connected, identity } = useSpacetime();
  const [nodes, setNodes] = useState<OrgNode[]>([]);

  const refreshNodes = useCallback(() => {
    if (!conn) return;
    try {
      const currentNodes = Array.from(conn.db.orgNode.iter());
      console.log('SpacetimeDB Cached Nodes:', currentNodes);
      setNodes(currentNodes);
    } catch (err) {
      console.error('Error fetching nodes:', err);
    }
  }, [conn]);

  useEffect(() => {
    if (!connected || !conn) return;

    // 1. Initial refresh attempt
    refreshNodes();

    // 2. Poll once after initial subscription sync completes (~300ms)
    const timeoutId = setTimeout(refreshNodes, 300);

    // 3. Register real-time event listeners
    const handleInsert = () => refreshNodes();
    const handleUpdate = () => refreshNodes();
    const handleDelete = () => refreshNodes();

    conn.db.orgNode.onInsert(handleInsert);
    conn.db.orgNode.onUpdate(handleUpdate);
    conn.db.orgNode.onDelete(handleDelete);

    return () => {
      clearTimeout(timeoutId);
      conn.db.orgNode.removeOnInsert(handleInsert);
      conn.db.orgNode.removeOnUpdate(handleUpdate);
      conn.db.orgNode.removeOnDelete(handleDelete);
    };
  }, [connected, conn, refreshNodes]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Org Topology Dashboard</h1>
            <p className="text-xs text-slate-400 mt-1">
              Status:{' '}
              <span className={connected ? 'text-emerald-400 font-semibold' : 'text-rose-400'}>
                {connected ? '● Connected' : '○ Disconnected'}
              </span>
              {identity && <span className="ml-3 font-mono opacity-75">ID: {identity.slice(0, 8)}...</span>}
            </p>
          </div>

          <button
            onClick={refreshNodes}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors shadow-sm"
          >
            Force Refresh
          </button>
        </div>

        {/* Stats Panel */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex justify-between items-center">
          <span className="text-sm text-slate-300">
            Total Active Nodes: <strong className="text-white text-base ml-1">{nodes.length}</strong>
          </span>
        </div>

        {/* Nodes Grid */}
        {nodes.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-800 rounded-lg text-center text-slate-500">
            No organizational nodes found in SpacetimeDB.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {nodes.map((node) => (
              <div key={node.id} className="p-5 bg-slate-900 border border-slate-800 rounded-lg shadow-sm space-y-2">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-lg text-slate-100">{node.name}</h3>
                  <span className="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {node.type}
                  </span>
                </div>
                <p className="text-xs font-mono text-slate-400">ID: {node.id}</p>
                <div className="pt-2 flex justify-between text-xs text-slate-400 border-t border-slate-800">
                  <span>Status: <strong className="text-slate-200">{node.status}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}