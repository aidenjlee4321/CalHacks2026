// Shared, client-safe vocabulary. These strings are exactly what the SpacetimeDB module stores.
export type NodeType = 'LEAD' | 'WORKER' | 'AGENT';
export type NodeStatus = 'IDLE' | 'WORKING' | 'BLOCKED_BY_HUMAN' | 'OFFLINE';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export const NODE_TYPES: NodeType[] = ['LEAD', 'WORKER', 'AGENT'];
export const HUMAN_STATUSES: NodeStatus[] = ['IDLE', 'WORKING', 'OFFLINE'];

// Mirrors the module: who a node type may report to. Nobody may report to an AGENT.
export const ALLOWED_PARENT_TYPES: Record<NodeType, NodeType[]> = {
    LEAD: ['LEAD'],
    WORKER: ['LEAD'],
    AGENT: ['LEAD', 'WORKER'],
};

export const TYPE_LABELS: Record<NodeType, string> = {
    LEAD: 'Lead',
    WORKER: 'Worker',
    AGENT: 'Agent',
};
