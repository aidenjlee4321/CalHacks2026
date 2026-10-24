'use client';

import { useTable } from 'spacetimedb/react';
import { tables } from '../lib/module_bindings';

// Icon + color for each kind of event
const KIND: Record<string, { icon: string; color: string }> = {
  SYSTEM: { icon: '⚙️', color: 'text-gray-700' },
  ACTION: { icon: '✅', color: 'text-green-700' },
  REASONING: { icon: '🧠', color: 'text-purple-700' },
  HUMAN: { icon: '👤', color: 'text-amber-700' },
};

export default function LiveActivityFeed() {
  const [rows] = useTable(tables.activity);
  const [nodes] = useTable(tables.orgNode);

  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  // Newest first, show the latest 30
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 30);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-gray-900">
      <h2 className="mb-3 text-lg font-bold">📜 Activity Feed</h2>

      {sorted.length === 0 && <p className="text-sm text-gray-500">Nothing yet.</p>}

      <ul className="space-y-2">
        {sorted.map((row) => {
          const kind = KIND[row.kind] ?? KIND.SYSTEM;
          const time = new Date(Number(row.createdAt.microsSinceUnixEpoch / 1000n)).toLocaleTimeString();
          return (
            <li key={row.id.toString()} className="flex gap-3 text-sm">
              <span className="w-20 shrink-0 font-mono text-xs text-gray-400">{time}</span>
              <span>{kind.icon}</span>
              <span className={kind.color}>
                <b>{nameOf(row.nodeId)}:</b> {row.message}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}