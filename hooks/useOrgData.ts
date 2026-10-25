'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { useSession } from '@/components/SessionProvider';
import { visibleNodeIds } from '@/lib/auth';

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

// Initial Base Dataset Generator
const createBaseDataset = () => {
    const taskTemplates = [
        'Audit workspace security permissions',
        'Process neural network weight batch',
        'Optimize database index performance',
        'Execute automated regression suite',
        'Review architecture design proposal',
    ];

    // Agents get tasks that need the live web, so running any agent shows the Apify browse_web tool at work
    const agentTaskTemplates = [
        'Research the top 3 competitors of Stripe and compare their pricing',
        'Compare the pricing plans of Notion, Coda and Airtable',
        'Find 3 upcoming AI hackathons in the Bay Area',
        'Summarize what Apify does in 3 bullet points',
        'Find the latest SpacetimeDB release and summarize what changed',
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
                title: `${(node.type === 'Agent' ? agentTaskTemplates : taskTemplates)[taskCounter % 5]} [Job #${taskCounter}]`,
                completed: taskCounter % 3 === 0,
            });
            taskCounter++;
        }
    });

    return { nodes, tasks };
};

const { nodes: INITIAL_NODES, tasks: INITIAL_TASKS } = createBaseDataset();

export function useOrgData() {
    // Read active connection state directly from SpacetimeDB React SDK
    const { isActive: isConnected, identity: rawIdentity, getConnection } = useSpacetimeDB() as any;
    const conn = typeof getConnection === 'function' ? getConnection() : null;
    const identity = rawIdentity ? (rawIdentity.toHexString ? rawIdentity.toHexString() : String(rawIdentity)) : null;

    const [demoNodes, setDemoNodes] = useState<OrgNode[]>(INITIAL_NODES);
    const [nodes, setNodes] = useState<OrgNode[]>(INITIAL_NODES);
    const [demoTasks, setDemoTasks] = useState<TaskItem[]>(INITIAL_TASKS);
    const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);

    // Synchronize SpacetimeDB table subscriptions & event listeners
    useEffect(() => {
        if (!conn) {
            setNodes(demoNodes);
            setTasks(demoTasks);
            return;
        }

        // Subscribe to SpacetimeDB queries
        if (typeof conn.subscribe === 'function') {
            conn.subscribe([
                'SELECT * FROM org_node',
                'SELECT * FROM task_item',
            ]);
        }

        const updateNodes = () => {
            const table = conn.db?.orgNode || conn.tables?.orgNode;
            if (table && typeof table.iter === 'function') {
                const rows = Array.from(table.iter()) as OrgNode[];
                // Empty table -> keep showing the local demo org so edits stay visible
                setNodes(rows.length > 0 ? rows.filter((r) => r.type !== 'System') : demoNodes);
            }
        };

        const updateTasks = () => {
            const table = conn.db?.taskItem || conn.db?.task || conn.tables?.task;
            if (table && typeof table.iter === 'function') {
                const rows = Array.from(table.iter()) as TaskItem[];
                setTasks(rows.length > 0 ? rows : demoTasks);
            }
        };

        // Initial table load
        updateNodes();
        updateTasks();

        // Attach event listeners for real-time broadcasts
        const nodeTable = conn.db?.orgNode || conn.tables?.orgNode;
        const taskTable = conn.db?.taskItem || conn.db?.task || conn.tables?.task;

        if (nodeTable?.onInsert) nodeTable.onInsert(updateNodes);
        if (nodeTable?.onUpdate) nodeTable.onUpdate(updateNodes);
        if (nodeTable?.onDelete) nodeTable.onDelete(updateNodes);

        if (taskTable?.onInsert) taskTable.onInsert(updateTasks);
        if (taskTable?.onUpdate) taskTable.onUpdate(updateTasks);
        if (taskTable?.onDelete) taskTable.onDelete(updateTasks);

        return () => {
            if (nodeTable?.removeOnInsert) nodeTable.removeOnInsert(updateNodes);
            if (nodeTable?.removeOnUpdate) nodeTable.removeOnUpdate(updateNodes);
            if (nodeTable?.removeOnDelete) nodeTable.removeOnDelete(updateNodes);

            if (taskTable?.removeOnInsert) taskTable.removeOnInsert(updateTasks);
            if (taskTable?.removeOnUpdate) taskTable.removeOnUpdate(updateTasks);
            if (taskTable?.removeOnDelete) taskTable.removeOnDelete(updateTasks);
        };
    }, [conn, demoNodes, demoTasks]);

    // Mutation Methods with SpacetimeDB Reducer Calls + Fallback
    const addNode = (name: string, type: string, superiorId: string) => {
        const newId = crypto.randomUUID();
        const finalName = name.trim() || 'New Member';
        const newNode: OrgNode = { id: newId, name: finalName, type, status: 'Idle', superior: superiorId || undefined };

        if (conn?.reducers?.addNode) {
            conn.reducers.addNode(newNode);
        } else {
            setDemoNodes((prev) => [...prev, newNode]);
        }
        return newId;
    };

    const updateNode = (id: string, name: string, type: string, superiorId: string) => {
        if (conn?.reducers?.updateNode) {
            conn.reducers.updateNode({ id, name: name.trim() || 'Unnamed Node', type, superior: superiorId || '' });
        } else {
            setDemoNodes((prev) =>
                prev.map((n) => (n.id === id ? { ...n, name: name.trim() || 'Unnamed Node', type, superior: superiorId || undefined } : n))
            );
        }
    };

    const updateNodeStatus = (id: string, status: string) => {
        if (conn?.reducers?.updateNodeStatus) {
            conn.reducers.updateNodeStatus({ id, status });
        } else {
            setDemoNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
            setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
        }
    };

    const deleteNode = (id: string) => {
        if (conn?.reducers?.deleteNode) {
            conn.reducers.deleteNode({ id });
        } else {
            setDemoNodes((prev) => prev.filter((n) => n.id !== id));
        }
    };

    const addTask = (nodeId: string, title: string) => {
        const newTask: TaskItem = { id: crypto.randomUUID(), assignedNodeId: nodeId, title, completed: false };
        if (conn?.reducers?.addTask) {
            conn.reducers.addTask(newTask);
        } else {
            setDemoTasks((prev) => [...prev, newTask]);
        }
    };

    const deleteTask = (taskId: string) => {
        if (conn?.reducers?.deleteTask) {
            conn.reducers.deleteTask({ taskId });
        } else {
            setDemoTasks((prev) => prev.filter((t) => t.id !== taskId));
        }
    };

    const toggleTask = (taskId: string) => {
        if (conn?.reducers?.toggleTask) {
            conn.reducers.toggleTask({ taskId });
        } else {
            setDemoTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)));
        }
    };

    // Role-based view: the CEO sees everyone, a lead only their own subtree
    const user = useSession();
    const visibleIds = useMemo(() => visibleNodeIds(user, nodes), [user, nodes]);
    const scopedNodes = useMemo(
        () => (visibleIds ? nodes.filter((n) => visibleIds.has(n.id)) : nodes),
        [nodes, visibleIds]
    );
    const scopedTasks = useMemo(
        () => (visibleIds ? tasks.filter((t) => visibleIds.has(t.assignedNodeId)) : tasks),
        [tasks, visibleIds]
    );

    return {
        nodes: scopedNodes,
        tasks: scopedTasks,
        user,
        visibleIds,
        setNodes,
        setTasks,
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