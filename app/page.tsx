'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSpacetime } from '@/components/SpacetimeProvider';
import type { OrgNode } from '@/lib/module_bindings';

export default function Dashboard() {
  const { conn, connected, identity } = useSpacetime();
  const [nodes, setNodes] = useState<OrgNode[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [nodeType, setNodeType] = useState('Human');
  const [status, setStatus] = useState('Active');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    refreshNodes();
    const timeoutId = setTimeout(refreshNodes, 300);

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

  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conn || !name.trim()) return;

    setIsSubmitting(true);
    try {
      const newId = `node_${Date.now()}`;

      // Invoke generated reducer (supports camelCase or snake_case bindings)
      if (typeof (conn.reducers as any).addNode === 'function') {
        (conn.reducers as any).addNode(newId, name, nodeType, status, '[]', '[]');
      } else if (typeof (conn.reducers as any).add_node === 'function') {
        (conn.reducers as any).add_node(newId, name, nodeType, status, '[]', '[]');
      } else {
        console.error('addNode reducer not found on connection handle');
      }

      setName('');
    } catch (err) {
      console.error('Failed to dispatch addNode reducer:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

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
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md text-sm font-medium transition-colors"
          >
            Force Refresh
          </button>
        </div>

        {/* Add Node Form Panel */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg space-y-4">
          <h2 className="text-lg font-semibold text-slate-200">Add New Org Node</h2>
          <form onSubmit={handleAddNode} className="grid gap-4 md:grid-cols-4 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Node Name / Title</label>
              <input
                type="text"
                placeholder="e.g. Chief AI Officer"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Entity Type</label>
              <select
                value={nodeType}
                onChange={(e) => setNodeType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="Human">Human</option>
                <option value="AI Agent">AI Agent</option>
                <option value="Hybrid Team">Hybrid Team</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Initial Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="Active">Active</option>
                <option value="Idle">Idle</option>
                <option value="Offline">Offline</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!connected || isSubmitting}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium rounded-md text-sm transition-colors shadow-sm"
            >
              {isSubmitting ? 'Adding...' : 'Add Node'}
            </button>
          </form>
        </div>

        {/* Stats Panel */}
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg flex justify-between items-center">
          <span className="text-sm text-slate-300">
            Total Active Nodes: <strong className="text-white text-base ml-1">{nodes.length}</strong>
          </span>
        </div>

        {/* Nodes Grid */}
        {nodes.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-800 rounded-lg text-center text-slate-500">
            No organizational nodes found in SpacetimeDB. Use the form above to create your first node.
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
                  <span>
                    Status: <strong className="text-slate-200">{node.status}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}