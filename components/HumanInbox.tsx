'use client';

import { useState } from 'react';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../lib/module_bindings';

export default function HumanInbox() {
  const [handoffs] = useTable(tables.handoff);
  const [nodes] = useTable(tables.orgNode);
  const resolveHandoff = useReducer(reducers.resolveHandoff);

  // What the human is typing for each request
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  const open = handoffs.filter((h) => h.status === 'OPEN');

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-gray-900">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        📥 Human Inbox
        {open.length > 0 && (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{open.length}</span>
        )}
      </h2>

      {open.length === 0 && <p className="text-sm text-gray-500">No agents need help right now.</p>}

      <div className="space-y-3">
        {open.map((h) => {
          const key = h.id.toString();
          const answer = answers[key] ?? '';
          return (
            <div key={key} className="rounded-lg border-2 border-red-300 bg-red-50 p-3">
              <div className="text-xs font-semibold uppercase text-red-700">
                ⏸ {nameOf(h.fromNodeId)} is waiting
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Assigned to: <b>{nameOf(h.assignedToId)}</b>
              </div>

              <p className="mt-2 font-medium">{h.question}</p>
              {h.context && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{h.context}</p>}

              <textarea
                className="mt-3 w-full rounded-md border border-gray-300 p-2 text-sm"
                rows={2}
                placeholder="Your decision…"
                value={answer}
                onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
              />
              <button
                className="mt-2 w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                disabled={!answer.trim()}
                onClick={() => {
                  resolveHandoff({ handoffId: h.id, answer: answer.trim() });
                  setAnswers((a) => ({ ...a, [key]: '' }));
                }}
              >
                Resolve &amp; resume agent
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}