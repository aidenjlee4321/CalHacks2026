import { OrgNode, TaskItem } from '@/hooks/useOrgData';
import { getTelemetryByNode } from '@/lib/telemetryStore';

export interface AnomalyAlert {
    id: string;
    nodeId: string;
    nodeName: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    description: string;
    timestamp: number;
}

export function scanForAnomalies(nodes: OrgNode[], tasks: TaskItem[]): AnomalyAlert[] {
    const alerts: AnomalyAlert[] = [];
    const now = Date.now();

    nodes.forEach((node) => {
        const nodeTasks = tasks.filter((t) => t.assignedNodeId === node.id && !t.completed);
        const recentEvents = getTelemetryByNode(node.id);

        // Rule 1: Node marked Busy but has no tasks assigned
        if (node.status?.toLowerCase() === 'busy' && nodeTasks.length === 0) {
            alerts.push({
                id: `alert-busy-notask-${node.id}`,
                nodeId: node.id,
                nodeName: node.name,
                severity: 'MEDIUM',
                title: 'Orphaned Busy Status',
                description: `Node "${node.name}" is marked Busy but has no incomplete tasks assigned.`,
                timestamp: now,
            });
        }

        // Rule 2: Incomplete tasks with zero recent events
        if (nodeTasks.length > 0 && recentEvents.length === 0) {
            alerts.push({
                id: `alert-no-telemetry-${node.id}`,
                nodeId: node.id,
                nodeName: node.name,
                severity: 'HIGH',
                title: 'Telemetry Silent Stalled Task',
                description: `Node "${node.name}" has ${nodeTasks.length} pending task(s) but zero telemetry events recorded.`,
                timestamp: now,
            });
        }

        // Rule 3: Agent node offline with pending tasks
        if (node.type === 'Agent' && node.status?.toLowerCase() === 'offline' && nodeTasks.length > 0) {
            alerts.push({
                id: `alert-offline-agent-${node.id}`,
                nodeId: node.id,
                nodeName: node.name,
                severity: 'HIGH',
                title: 'Offline Agent With Active Tasks',
                description: `Agent "${node.name}" is Offline but still assigned ${nodeTasks.length} pending task(s).`,
                timestamp: now,
            });
        }
    });

    return alerts;
}