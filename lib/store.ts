export type NodeType = 'AGENT' | 'HUMAN';
export type NodeStatus = 'IDLE' | 'WORKING' | 'BLOCKED_BY_HUMAN';

export interface Task {
    id: string;
    description: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface OrgNode {
    id: string;
    name: string;
    type: NodeType;
    status: NodeStatus;
    tasks: Task[];
    reportsTo: string[];        // Connection UP (Now an Array)
    subordinates: string[];     // Connections DOWN
}

// Mock Database for the Hackathon Demo
export const initialOrgData: Record<string, OrgNode> = {
    'node-1': {
        id: 'node-1',
        name: 'Alice (Director)',
        type: 'HUMAN',
        status: 'IDLE',
        tasks: [],
        reportsTo: [],
        subordinates: ['node-2', 'node-3'],
    },
    'node-2': {
        id: 'node-2',
        name: 'Auto-Refund Agent',
        type: 'AGENT',
        status: 'WORKING',
        tasks: [{ id: 't1', description: 'Process $50 refund', status: 'IN_PROGRESS' }],
        reportsTo: ['node-1'],
        subordinates: [],
    },
    'node-3': {
        id: 'node-3',
        name: 'Escalation Agent',
        type: 'AGENT',
        status: 'BLOCKED_BY_HUMAN',
        tasks: [{ id: 't2', description: 'Review $5,000 refund limit', status: 'PENDING' }],
        reportsTo: ['node-1'],
        subordinates: [],
    }
};