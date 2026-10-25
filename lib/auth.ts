import type { OrgNode } from '@/hooks/useOrgData';

// Demo auth: who is signed in and which part of the org they can see.
// Client-safe (no passwords); the credentials live in lib/session.ts.

export type Role = 'ceo' | 'lead' | 'CEO' | 'LEAD';

export interface SessionUser {
    id: string;
    name: string;
    title: string;
    email: string;
    role: Role;
    nodeId: string; // the org node this person is in the tree
}

export const DEMO_USERS: SessionUser[] = [
    {
        id: 'u-ceo',
        name: 'Avery Chen',
        title: 'Chief Executive Officer',
        email: 'ceo@spacetime.org',
        role: 'ceo',
        nodeId: 'node-1', // Executive Lead #001, top of the org
    },
    {
        id: 'u-eng-lead',
        name: 'Sam Patel',
        title: 'Engineering Lead',
        email: 'lead@spacetime.org',
        role: 'lead',
        nodeId: 'node-2', // Engineering Lead #002
    },
];

export function findUser(id: string) {
    return DEMO_USERS.find((u) => u.id === id) || null;
}

// Helper to extract all superior manager IDs (handles single string, string arrays, or JSON arrays)
export function superiorsOf(node: OrgNode): string[] {
    if (node.superior) return [node.superior];
    if (node.reportsToJson) {
        try {
            const parsed = JSON.parse(node.reportsToJson);
            if (Array.isArray(parsed)) return parsed.map(String);
            if (typeof parsed === 'string' && parsed) return [parsed];
        } catch {
            if (typeof node.reportsToJson === 'string' && node.reportsToJson) {
                return [node.reportsToJson];
            }
        }
    }
    return [];
}

// Node ids this user may see: null means everything (CEO),
// otherwise the lead's own node plus everyone below them.
export function visibleNodeIds(user: SessionUser | null, nodes: OrgNode[]): Set<string> | null {
    if (!user || user.role?.toLowerCase() === 'ceo') return null;
    const visible = new Set([user.nodeId]);
    const queue = [user.nodeId];
    while (queue.length) {
        const id = queue.shift()!;
        for (const n of nodes) {
            const sups = superiorsOf(n);
            if (sups.includes(id) && !visible.has(n.id)) {
                visible.add(n.id);
                queue.push(n.id);
            }
        }
    }
    return visible;
}