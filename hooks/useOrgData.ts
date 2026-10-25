'use client';

import { useState, useMemo } from 'react';
import { useSpacetimeDB, useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '@/lib/module_bindings';
import { useSession } from '@/components/SessionProvider';
import { visibleNodeIds } from '@/lib/auth';

export interface TaskItem {
    id: string;
    assignedNodeId: string;
    assignedById?: string;
    title: string;
    completed: boolean;
}

export interface OrgNode {
    id: string;
    name: string;
    type: 'LEAD' | 'WORKER' | 'AGENT' | string;
    status: string;
    superior?: string;
    parentId?: string;
    parents: string[];
    reportsTo: string[];
    subordinates: string[];
    children: string[];
    unassigned: boolean;
    reportsToJson?: string;
    subordinatesJson?: string;
}

export function useOrgData() {
    const { isActive: isConnected, identity: rawIdentity } = useSpacetimeDB();
    const identity = rawIdentity
        ? typeof rawIdentity.toHexString === 'function'
            ? rawIdentity.toHexString()
            : String(rawIdentity)
        : null;

    const [error, setError] = useState<string | null>(null);

    // 1. Live Table Subscriptions
    const [nodeRows] = useTable(tables.orgNode);
    const [taskRows] = useTable(tables.task);
    const [reportsToRows] = useTable(tables.reportsTo);

    const rawNodes = Array.isArray(nodeRows) ? nodeRows : [];
    const rawTasks = Array.isArray(taskRows) ? taskRows : [];
    const rawReportsTo = Array.isArray(reportsToRows) ? reportsToRows : [];

    const isReady = isConnected;

    // 2. Reducer Hooks (Safe type assertion on clearData to prevent TS errors prior to generate command)
    const addNodeReducer = useReducer(reducers.addNode);
    const updateNodeReducer = useReducer(reducers.updateNode);
    const updateStatusReducer = useReducer(reducers.updateStatus);
    const deleteNodeReducer = useReducer(reducers.deleteNode);
    const assignTaskReducer = useReducer(reducers.assignTask);
    const deleteTaskReducer = useReducer(reducers.deleteTask);
    const toggleTaskReducer = useReducer(reducers.toggleTask);
    const clearDataReducer = useReducer((reducers as any).clearData || reducers.resetDemo);
    const resetDemoReducer = useReducer(reducers.resetDemo);

    // 3. Process & Deduplicate Nodes
    const nodes: OrgNode[] = useMemo(() => {
        const uniqueRowsMap = new Map<string, any>();
        for (const row of rawNodes) {
            if (row && row.id && !uniqueRowsMap.has(row.id)) {
                uniqueRowsMap.set(row.id, row);
            }
        }
        const uniqueNodes = Array.from(uniqueRowsMap.values());

        return uniqueNodes
            .filter((n: any) => (n.type || '').toUpperCase() !== 'SYSTEM')
            .map((n: any) => {
                const parents = rawReportsTo
                    .filter((r: any) => String(r.parentId ?? r.parent_id ?? '') === String(n.id))
                    .sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0))
                    .map((r: any) => String(r.childId ?? r.child_id ?? ''));

                const subordinates = rawReportsTo
                    .filter((r: any) => String(r.childId ?? r.child_id ?? '') === String(n.id))
                    .map((r: any) => String(r.parentId ?? r.parent_id ?? ''));
                    
                const superior = parents[0] || undefined;
                const typeUpper = (n.type || 'WORKER').toUpperCase();
                const statusUpper = (n.status || 'IDLE').toUpperCase();
                const unassigned = parents.length === 0;

                return {
                    id: n.id,
                    name: n.name,
                    type: typeUpper,
                    status: statusUpper,
                    superior,
                    parentId: superior,
                    parents,
                    reportsTo: parents,
                    subordinates,
                    children: subordinates,
                    unassigned,
                    reportsToJson: JSON.stringify(parents),
                    subordinatesJson: JSON.stringify(subordinates),
                };
            });
    }, [rawNodes, rawReportsTo]);

    // 4. Process & Deduplicate Tasks
    const tasks: TaskItem[] = useMemo(() => {
        const uniqueTasksMap = new Map<string, any>();
        for (const row of rawTasks) {
            if (row && row.id && !uniqueTasksMap.has(row.id)) {
                uniqueTasksMap.set(row.id, row);
            }
        }
        const uniqueTasks = Array.from(uniqueTasksMap.values());

        return uniqueTasks.map((t: any) => ({
            id: t.id,
            assignedNodeId: t.nodeId ?? t.node_id ?? '',
            assignedById: t.assignedById ?? t.assigned_by_id ?? undefined,
            title: t.description || '',
            completed: (t.status || '').toUpperCase() === 'COMPLETED',
        }));
    }, [rawTasks]);

    // 5. Session and Visibility Scoping
    const user = useSession();
    const actingId = user?.nodeId || null;
    const visibleIds = useMemo(() => visibleNodeIds(user, nodes), [user, nodes]);

    const scopedNodes = useMemo(() => {
        if (!visibleIds) return nodes;
        const allowed = new Set(visibleIds);
        return nodes.filter(n => allowed.has(n.id));
    }, [nodes, visibleIds]);

    const scopedTasks = useMemo(() => {
        if (!visibleIds) return tasks;
        const allowed = new Set(visibleIds);
        return tasks.filter(t => allowed.has(t.assignedNodeId));
    }, [tasks, visibleIds]);

    // 6. Reducer Invocation Actions
    const addNode = (name: string, type: string, superiorId: string = ''): string => {
        setError(null);
        const id = crypto.randomUUID();
        const cleanedParentId = superiorId.trim();

        addNodeReducer({
            id,
            name: name.trim() || 'New Member',
            type: type.toUpperCase(),
            parentId: cleanedParentId,
        })
            .then((res: any) => console.log('✅ SpacetimeDB node created:', id, res))
            .catch((err: any) => {
                console.error('❌ Failed to add node:', err);
                setError(err?.message || 'Failed to create node');
            });

        return id;
    };

    const updateNode = (
        id: string,
        name: string,
        type: string,
        parentId: string,
        changeParent: boolean
    ) => {
        setError(null);
        updateNodeReducer({
            id,
            name: name.trim(),
            type: type.toUpperCase(),
            parentId: parentId.trim(),
            changeParent,
        })
            .then(() => console.log('✅ SpacetimeDB node updated:', id))
            .catch((err: any) => {
                console.error('❌ Failed to update node:', err);
                setError(err?.message || 'Failed to update node');
            });
    };

    const updateStatus = (id: string, status: string) => {
        setError(null);
        updateStatusReducer({ id, status: status.toUpperCase() })
            .then(() => console.log('✅ SpacetimeDB status updated:', id))
            .catch((err: any) => {
                console.error('❌ Failed to update status:', err);
                setError(err?.message || 'Failed to update status');
            });
    };

    const deleteNode = (id: string) => {
        setError(null);
        deleteNodeReducer({ id })
            .then(() => console.log('✅ SpacetimeDB node deleted:', id))
            .catch((err: any) => {
                console.error('❌ Failed to delete node:', err);
                setError(err?.message || 'Failed to delete node');
            });
    };

    const assignTask = (nodeId: string, description: string) => {
        setError(null);
        assignTaskReducer({ nodeId, description: description.trim() })
            .then(() => console.log('✅ SpacetimeDB task assigned:', nodeId))
            .catch((err: any) => {
                console.error('❌ Failed to assign task:', err);
                setError(err?.message || 'Failed to assign task');
            });
    };

    const deleteTask = (taskId: string) => {
        setError(null);
        deleteTaskReducer({ taskId })
            .then(() => console.log('✅ SpacetimeDB task deleted:', taskId))
            .catch((err: any) => {
                console.error('❌ Failed to delete task:', err);
                setError(err?.message || 'Failed to delete task');
            });
    };

    const toggleTask = (taskId: string) => {
        setError(null);
        toggleTaskReducer({ taskId })
            .then(() => console.log('✅ SpacetimeDB task toggled:', taskId))
            .catch((err: any) => {
                console.error('❌ Failed to toggle task:', err);
                setError(err?.message || 'Failed to toggle task');
            });
    };

    const clearData = () => {
        setError(null);
        if (typeof clearDataReducer === 'function') {
            clearDataReducer({})
                .then(() => console.log('✅ SpacetimeDB tables cleared'))
                .catch((err: any) => {
                    console.error('❌ Failed to clear database:', err);
                    setError(err?.message || 'Failed to clear database');
                });
        }
    };

    const resetDemo = (keepLessons: boolean = false) => {
        setError(null);
        resetDemoReducer({ keepLessons })
            .then(() => console.log('✅ SpacetimeDB demo data reset'))
            .catch((err: any) => {
                console.error('❌ Failed to reset demo data:', err);
                setError(err?.message || 'Failed to reset demo data');
            });
    };

    return {
        isConnected,
        isReady,
        identity,
        actingId,
        visibleIds,
        nodes: scopedNodes,
        tasks: scopedTasks,
        error,
        addNode,
        updateNode,
        updateStatus,
        deleteNode,
        assignTask,
        deleteTask,
        toggleTask,
        clearData,
        resetDemo,
    };
}