'use client';

import { useTable } from 'spacetimedb/react';
import { tables } from '../lib/module_bindings';
import TopologyMap from './TopologyMap';
import type { OrgNode, Task } from '../lib/store';

// Turns '["a","b"]' into ['a', 'b']
function parseList(json: string): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export default function LiveOrgChart() {
  const [nodeRows, nodesReady] = useTable(tables.orgNode);
  const [taskRows] = useTable(tables.task);
  const [handoffRows] = useTable(tables.handoff);
  const waitingOn = handoffRows.filter((h) => h.status === 'OPEN').map((h) => h.assignedToId);

  if (!nodesReady) {
    return <p className="text-sm text-gray-500">Connecting to SpacetimeDB…</p>;
  }

  // Convert database rows into the shape TopologyMap expects
  const nodes: Record<string, OrgNode> = {};
  for (const n of nodeRows) {
    nodes[n.id] = {
      id: n.id,
      name: n.name,
      type: n.type as OrgNode['type'],
      status: n.status as OrgNode['status'],
      tasks: taskRows
        .filter((t) => t.nodeId === n.id)
        .map((t) => ({ id: t.id, description: t.description, status: t.status as Task['status'] })),
      reportsTo: parseList(n.reportsToJson),
      subordinates: parseList(n.subordinatesJson),
    };
  }

  // The top of the chart is whoever reports to nobody
  const root = Object.values(nodes).find((n) => n.reportsTo.length === 0);
  if (!root) {
    return <p className="text-sm text-gray-500">No org yet. Run reset_demo.</p>;
  }

  return <TopologyMap nodes={nodes} rootId={root.id} highlightIds={waitingOn}/>;
}