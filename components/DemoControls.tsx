'use client';

import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../lib/module_bindings';

export default function DemoControls() {
  const [tasks] = useTable(tables.task);
  const [nodes] = useTable(tables.orgNode);

  const resetDemo = useReducer(reducers.resetDemo);
  const assignTask = useReducer(reducers.assignTask);
  const requestHelp = useReducer(reducers.requestHelp);

  // The Researcher's current task (if any) and status
  const researcherTask = tasks.find((t) => t.nodeId === 'researcher' && t.status === 'IN_PROGRESS');
  const researcher = nodes.find((n) => n.id === 'researcher');
  const isBlocked = researcher?.status === 'BLOCKED_BY_HUMAN';

  const btn = 'rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-40';

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <span className="mr-2 text-xs font-bold uppercase tracking-wider text-gray-500">Demo</span>

      <button className={`${btn} bg-gray-100 text-gray-800`} onClick={() => resetDemo()}>
        ↺ Reset
      </button>

      <button
        className={`${btn} bg-blue-600 text-white`}
        disabled={!!researcherTask}
        onClick={() => assignTask({ nodeId: 'researcher', description: 'Research Acme Corp as a sales lead' })}
      >
        1. Assign task
      </button>

      <button
        className={`${btn} bg-red-600 text-white`}
        disabled={!researcherTask || isBlocked}
        onClick={() =>
          researcherTask &&
          requestHelp({
            taskId: researcherTask.id,
            question: 'Website says 500 employees, job posts suggest ~20. Which is right?',
            context: 'Sources: acme.com/about, LinkedIn job posts',
          })
        }
      >
        2. Agent hits a conflict
      </button>
    </div>
  );
}