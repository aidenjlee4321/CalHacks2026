'use client';

import { useState, useEffect, useRef } from 'react';
import { DbConnection } from '../lib/module_bindings';

export interface OrgNode {
    id: string;
    name: string;
    type: string;
    role: string;
    status: string;
    superior?: string;
    superiorId?: string;
    parentId?: string;
    reportsTo?: string;
    reportsToJson?: string;
    subordinates: string[];
    children: OrgNode[];
}

export interface TaskItem {
    id: string;
    assignedNodeId: string;
    title: string;
    completed: boolean;
}

export function useOrgData() {
    const [nodes, setNodes] = useState<OrgNode[]>([]);
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [identity, setIdentity] = useState<string | null>(null);
    const listenersAttached = useRef(false);

    useEffect(() => {
        const checkAndBindConnection = () => {
            const conn: DbConnection | undefined = (window as any).conn;
            if (!conn) return false;

            setIsConnected(true);

            if (conn.identity) {
                setIdentity(
                    typeof conn.identity.toHexString === 'function'
                        ? conn.identity.toHexString()
                        : String(conn.identity)
                );
            }

            const updateNodes = () => {
                if (conn.db?.orgNode) {
                    const rawRows = Array.from(conn.db.orgNode.iter()) as any[];

                    // 1. Extract raw nodes & resolve parent IDs
                    const rawMapped = rawRows.map((r) => {
                        let superior: string | undefined = undefined;
                        const rawReports = r.reportsToJson ?? r.reports_to_json ?? '[]';

                        try {
                            const parsed = JSON.parse(rawReports);
                            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]) {
                                superior = String(parsed[0]);
                            }
                        } catch { }

                        if (!superior) {
                            const directSuperior = r.superior ?? r.superiorId ?? r.superior_id ?? r.parentId ?? r.parent_id;
                            if (directSuperior) superior = String(directSuperior);
                        }

                        const nodeType = String(r.type || r.role || 'Worker');

                        return {
                            id: String(r.id),
                            name: String(r.name || 'Unnamed Agent'),
                            type: nodeType,
                            role: nodeType,
                            status: String(r.status || 'IDLE'),
                            superior,
                            superiorId: superior,
                            parentId: superior,
                            reportsTo: superior,
                            reportsToJson: rawReports,
                        };
                    });

                    // 2. Build map and attach children/subordinates cleanly
                    const nodeMap = new Map<string, OrgNode>();
                    rawMapped.forEach((node) => {
                        nodeMap.set(node.id, {
                            ...node,
                            subordinates: [],
                            children: [],
                        });
                    });

                    const finalizedNodes: OrgNode[] = [];

                    nodeMap.forEach((node) => {
                        if (node.superior && nodeMap.has(node.superior)) {
                            const parent = nodeMap.get(node.superior);
                            if (parent) {
                                parent.subordinates.push(node.id);
                                parent.children.push(node);
                            }
                        }
                        finalizedNodes.push(node);
                    });

                    setNodes(finalizedNodes);
                }
            };

            const updateTasks = () => {
                if (conn.db?.task) {
                    const rawRows = Array.from(conn.db.task.iter()) as any[];
                    const mapped: TaskItem[] = rawRows.map((r) => ({
                        id: String(r.id),
                        assignedNodeId: String(r.nodeId || r.assignedNodeId || r.assigned_node_id || ''),
                        title: String(r.description || r.title || ''),
                        completed: Boolean(r.completed),
                    }));
                    setTasks(mapped);
                }
            };

            updateNodes();
            updateTasks();

            if (!listenersAttached.current) {
                listenersAttached.current = true;
                const nodeTable = conn.db?.orgNode;
                const taskTable = conn.db?.task;

                if (nodeTable) {
                    nodeTable.onInsert(updateNodes);
                    nodeTable.onUpdate(updateNodes);
                    nodeTable.onDelete(updateNodes);
                }

                if (taskTable) {
                    taskTable.onInsert(updateTasks);
                    taskTable.onUpdate(updateTasks);
                    taskTable.onDelete(updateTasks);
                }
            }

            return true;
        };

        const interval = setInterval(() => {
            checkAndBindConnection();
        }, 300);

        return () => clearInterval(interval);
    }, []);

    const addNode = (name: string, type: string, superiorId: string = ''): string => {
        const id = crypto.randomUUID();
        const conn: DbConnection | undefined = (window as any).conn;

        if (conn?.reducers) {
            const reportsJsonStr = superiorId && superiorId.trim() !== ''
                ? JSON.stringify([superiorId])
                : '[]';

            conn.reducers.addNode({
                id,
                name,
                type,
                status: 'IDLE',
                reportsToJson: reportsJsonStr,
                reports_to_json: reportsJsonStr,
                subordinatesToJson: '[]',
                subordinates_json: '[]',
            } as any);
        }

        return id;
    };

    const updateNodeStatus = (id: string, status: string) => {
        const conn: DbConnection | undefined = (window as any).conn;
        if (conn?.reducers) {
            conn.reducers.updateStatus({ id, status });
        }
    };

    const updateNode = (id: string, name?: string, type?: string) => {
        const conn: DbConnection | undefined = (window as any).conn;
        if (conn?.reducers) {
            if ((conn.reducers as any).updateNode) {
                (conn.reducers as any).updateNode({ id, name: name || '', type: type || '' });
            } else if (conn.reducers.updateStatus) {
                conn.reducers.updateStatus({ id, status: type || '' });
            }
        }
    };

    const deleteNode = (id: string) => {
        const conn: DbConnection | undefined = (window as any).conn;
        if (conn?.reducers && (conn.reducers as any).deleteNode) {
            (conn.reducers as any).deleteNode({ id });
        }
    };

    const toggleTask = (id: string) => {
        const conn: DbConnection | undefined = (window as any).conn;
        if (conn?.reducers) {
            conn.reducers.completeTask({ taskId: id });
        }
    };

    const addTask = (assignedNodeId: string, title: string) => {
        const conn: DbConnection | undefined = (window as any).conn;
        if (conn?.reducers) {
            conn.reducers.assignTask({ nodeId: assignedNodeId, description: title });
        }
    };

    const deleteTask = (id: string) => {
        const conn: DbConnection | undefined = (window as any).conn;
        if (conn?.reducers && (conn.reducers as any).deleteTask) {
            (conn.reducers as any).deleteTask({ taskId: id });
        }
    };

    return {
        nodes,
        tasks,
        isConnected,
        identity,
        updateNodeStatus,
        updateNode,
        deleteNode,
        toggleTask,
        addTask,
        deleteTask,
        addNode,
    };
}