'use client';

import { useRef, useState } from 'react';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../lib/module_bindings';

export default function ResearchPanel() {
  const [tasks] = useTable(tables.task);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks; // always the latest tasks

  const assignTask = useReducer(reducers.assignTask);
  const logActivity = useReducer(reducers.logActivity);
  const requestHelp = useReducer(reducers.requestHelp);
  const completeTask = useReducer(reducers.completeTask);

  const [url, setUrl] = useState('https://');
  const [busy, setBusy] = useState(false);

  async function research() {
    setBusy(true);
    assignTask({ nodeId: 'researcher', description: `Research ${url}` });
    logActivity({ nodeId: 'researcher', kind: 'WEB', message: `Hired Apify Website Crawler for ${url}` });

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      logActivity({ nodeId: 'researcher', kind: 'WEB', message: `Apify read ${data.pagesRead} pages` });
      logActivity({ nodeId: 'researcher', kind: 'REASONING', message: data.summary });

      // Find the task we just created
      const task = tasksRef.current.find((t) => t.nodeId === 'researcher' && t.status === 'IN_PROGRESS');
      if (!task) return;

      if (data.conflict) {
        requestHelp({
          taskId: task.id,
          question: data.question,
          context: `Evidence scraped by Apify:\n${(data.sources ?? []).join('\n')}`,
        });
      } else {
        completeTask({ taskId: task.id });
      }
    } catch (e: any) {
      logActivity({ nodeId: 'researcher', kind: 'SYSTEM', message: `Research failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3">
      <span className="text-xs font-bold uppercase tracking-wider text-orange-700">🌐 Apify</span>
      <input
        className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://company.com"
      />
      <button
        className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        disabled={busy || url.length < 10}
        onClick={research}
      >
        {busy ? 'Researching…' : '🔍 Research'}
      </button>
    </div>
  );
}