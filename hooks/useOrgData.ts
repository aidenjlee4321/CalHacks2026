'use client';

import { useState, useEffect, useContext, createContext } from 'react';

// Types
export interface TaskItem {
    id: string;
    assignedNodeId: string;
    title: string;
    completed: boolean;
}

export interface OrgNode {
    id: string;
    name: string;
    type: 'Lead' | 'Worker' | 'Agent' | string;
    status?: string;
    superior?: string;
    reportsToJson?: string;
    subordinatesJson?: string;
}

// Spacetime Context Fallback
interface SpacetimeContextType {
    conn: any;
    connected: boolean;
    identity: string | null;
}

const SpacetimeContext = createContext<SpacetimeContextType>({
    conn: null,
    connected: false,
    identity: null,
});

let externalUseSpacetime: (() => SpacetimeContextType) | null = null;
try {
    // @ts-ignore
    const mod = require('@/components/LiveSpacetimeProvider');
    externalUseSpacetime = mod.useSpacetime || mod.default?.useSpacetime;
} catch { }

function useSpacetimeHook(): SpacetimeContextType {
    if (externalUseSpacetime) {
        try {
            return externalUseSpacetime();
        } catch { }
    }
    return useContext(SpacetimeContext);
}

// Initial Base Dataset Generator
const createBaseDataset = () => {
    const statuses = ['Active', 'Idle', 'Busy', 'Offline'];
    const taskTemplates = [
        'Audit workspace security permissions',
        'Process neural network weight batch',
        'Optimize database index performance',
        'Execute automated regression suite',
        'Review architecture design proposal',
    ];

    const nodes: OrgNode[] = [
        { id: 'node-1', name: 'Executive Lead #001', type: 'Lead', status: 'Active' },
        { id: 'node-2', name: 'Engineering Lead #002', type: 'Lead', status: 'Active', superior: 'node-1' },
        { id: 'node-3', name: 'Sales Lead #003', type: 'Lead', status: 'Active', superior: 'node-1' },
        { id: 'node-4', name: 'Operations Lead #004', type: 'Lead', status: 'Busy', superior: 'node-1' },
        { id: 'node-5', name: 'Product Lead #005', type: 'Lead', status: 'Active', superior: 'node-1' },
    ];

    const leadIds = ['node-2', 'node-3', 'node-4', 'node-5'];

    for (let i = 6; i <= 35; i++) {
        nodes.push({
            id: `node-${i}`,
            name: `Worker #${String(i).padStart(3, '0')}`,
            type: 'Worker',
            status: 'Idle',
            superior: leadIds[(i - 6) % leadIds.length],
        });
    }

    for (let i = 36; i <= 100; i++) {
        const superiorId = i <= 45 ? `node-${((i - 36) % 5) + 1}` : `node-${((i - 46) % 30) + 6}`;
        nodes.push({
            id: `node-${i}`,
            name: `Agent #${String(i).padStart(3, '0')}`,
            type: 'Agent',
            status: 'Idle',
            superior: superiorId,
        });
    }

    const tasks: TaskItem[] = [];
    let taskCounter = 1;

    nodes.forEach((node, idx) => {
        const taskCount = (idx % 2) + 1;
        for (let t = 0; t < taskCount; t++) {
            tasks.push({
                id: `t-${taskCounter}`,
                assignedNodeId: node.id,
                title: `${taskTemplates[taskCounter % taskTemplates.length]} [Job #${taskCounter}]`,
                completed: taskCounter % 3 === 0,
            });
            taskCounter++;
        }
    });

    return { nodes, tasks };
};

const { nodes: INITIAL_NODES, tasks: INITIAL_TASKS } = createBaseDataset();

export function useOrgData() {
    const spacetime = useSpacetimeHook();
    const [demoNodes, setDemoNodes] = useState<OrgNode[]>(INITIAL_NODES);
    const [nodes, setNodes] = useState<OrgNode[]>(INITIAL_NODES);
    const [demoTasks, setDemoTasks] = useState<TaskItem[]>(INITIAL_TASKS);
    const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);

    const isConnected = spacetime.connected || true;
    const identity = spacetime.identity || 'demo_identity_0x8f2a9c';

    useEffect(() => {
        if (!spacetime.conn) {
            setNodes(demoNodes);
            setTasks(demoTasks);
            return;
        }

        const updateNodes = () => {
            const table = (spacetime.conn as any).db?.orgNode || (spacetime.conn as any).tables?.orgNode;
            if (table) {
                const rows = Array.from(table.iter()) as OrgNode[];
                setNodes(rows.filter((r) => r.type !== 'System'));
            }
        };

        const updateTasks = () => {
            const table = (spacetime.conn as any).db?.task || (spacetime.conn as any).tables?.task;
            if (table) {
                const rows = Array.from(table.iter()) as TaskItem[];
                setTasks(rows);
            }
        };

        updateNodes();
        updateTasks();
    }, [spacetime.conn, demoNodes, demoTasks]);

    const addNode = (name: string, type: string, superiorId: string) => {
        const newId = crypto.randomUUID();
        const finalName = name.trim() || 'New Member';
        const newNode: OrgNode = { id: newId, name: finalName, type, status: 'Idle', superior: superiorId || undefined };
        setDemoNodes((prev) => [...prev, newNode]);
        return newId;
    };

    const updateNode = (id: string, name: string, type: string, superiorId: string) => {
        setDemoNodes((prev) =>
            prev.map((n) => (n.id === id ? { ...n, name: name.trim() || 'Unnamed Node', type, superior: superiorId || undefined } : n))
        );
    };

    const deleteNode = (id: string) => {
        setDemoNodes((prev) => prev.filter((n) => n.id !== id));
    };

    const addTask = (nodeId: string, title: string) => {
        const newTask: TaskItem = { id: crypto.randomUUID(), assignedNodeId: nodeId, title, completed: false };
        setDemoTasks((prev) => [...prev, newTask]);
    };

    const deleteTask = (taskId: string) => {
        setDemoTasks((prev) => prev.filter((t) => t.id !== taskId));
    };

    const toggleTask = (taskId: string) => {
        setDemoTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)));
    };

    const updateNodeStatus = (id: string, status: string) => {
        setDemoNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
    };

    return {
        nodes,
        tasks,
        isConnected,
        identity,
        addNode,
        updateNode,
        updateNodeStatus,
        deleteNode,
        addTask,
        deleteTask,
        toggleTask,
    };
}