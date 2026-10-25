'use client';

import { useTable } from 'spacetimedb/react';
import { tables } from '../lib/module_bindings';
import TopologyMap from './TopologyMap';
import type { OrgNode, Task } from '../lib/store';

export default function LiveOrgChart() {
  const [nodeRows, nodesReady] = useTable(tables.orgNode);
  const [taskRows] = useTable(tables.task);
  const [handoffRows] = useTable(tables.handoff);
  const [reportsToRows] = useTable(tables.reportsTo);

  const rawNodes = Array.isArray(nodeRows) ? nodeRows : [];
  const rawTasks = Array.isArray(taskRows) ? taskRows : [];
  const rawHandoffs = Array.isArray(handoffRows) ? handoffRows : [];
  const rawReportsTo = Array.isArray(reportsToRows) ? reportsToRows : [];

  const waitingOn = rawHandoffs
    .filter((h) => h.status === 'OPEN')
    .map((h) => h.assignedToId);

  if (!nodesReady) {
    return <p className="text-sm text-gray-500">Connecting to SpacetimeDB…</p>;
  }

  // Convert database rows into the shape TopologyMap expects
  const nodes: Record<string, OrgNode> = {};

  for (const n of rawNodes) {
    // Determine parent node IDs ordered by rank
    const parents = rawReportsTo
      .filter((r) => r.childId === n.id)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((r) => r.parentId);

    // Determine direct subordinate node IDs
    const children = rawReportsTo
      .filter((r) => r.parentId === n.id)
      .map((r) => r.childId);

    nodes[n.id] = {
      id: n.id,
      name: n.name,
      type: n.type as OrgNode['type'],
      status: n.status as OrgNode['status'],
      tasks: rawTasks
        .filter((t) => t.nodeId === n.id)
        .map((t) => ({ id: t.id, description: t.description, status: t.status as Task['status'] })),
      reportsTo: parents,
      subordinates: children,
    };
  }

  // The top of the chart is whoever reports to nobody
  const root = Object.values(nodes).find((n) => n.reportsTo.length === 0);
  if (!root) {
    return <p className="text-sm text-gray-500">No org yet. Run reset_demo.</p>;
  }

  return <TopologyMap nodes={nodes} rootId={root.id} highlightIds={waitingOn} />;
}