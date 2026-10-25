import type { TelemetryRecord } from '@/lib/telemetryStore';
import type { OrgNode } from '@/hooks/useOrgData';

// Aggregations of agent telemetry, shared by the org view and the usage page.

export interface UsageTotals {
    input: number;
    output: number;
    cost: number;
    runs: number;
    failed: number;
    latencyMs: number; // summed over successful runs
}

export interface UsageRow extends UsageTotals {
    key: string;
    name: string;
    model?: string; // model that served the most recent run
    models?: string[]; // every model that has served a run
    lastRunAt?: number;
}

export const emptyTotals = (): UsageTotals => ({ input: 0, output: 0, cost: 0, runs: 0, failed: 0, latencyMs: 0 });

// Input side of a run: fresh input plus cached input
export function inputTokensOf(r: TelemetryRecord) {
    return (r.promptTokens || 0) + (r.cacheReadTokens || 0) + (r.cacheWriteTokens || 0);
}

export function outputTokensOf(r: TelemetryRecord) {
    return r.completionTokens || 0;
}

export function isFailed(r: TelemetryRecord) {
    return r.status === 'FAILED' || r.status === 'REFUSED';
}

function addRun(t: UsageTotals, r: TelemetryRecord) {
    t.input += inputTokensOf(r);
    t.output += outputTokensOf(r);
    t.cost += r.costUsd || 0;
    t.runs += 1;
    if (isFailed(r)) t.failed += 1;
    else t.latencyMs += r.latencyMs || 0;
}

function mergeTotals(into: UsageTotals, t: UsageTotals) {
    into.input += t.input;
    into.output += t.output;
    into.cost += t.cost;
    into.runs += t.runs;
    into.failed += t.failed;
    into.latencyMs += t.latencyMs;
}

// Agent runs only (telemetry also carries status-change and tool-error events)
export function agentRuns(records: TelemetryRecord[]) {
    return records.filter((r) => r.eventType !== 'TASK_STATUS_CHANGE' && r.eventType !== 'TOOL_ERROR');
}

export function usageByAgent(records: TelemetryRecord[]): Map<string, UsageRow> {
    const byAgent = new Map<string, UsageRow>();
    for (const r of agentRuns(records)) {
        const key = r.agentId || r.agentName || 'unknown';
        const row = byAgent.get(key) || { key, name: r.agentName || key, ...emptyTotals(), models: [] };
        addRun(row, r);
        if (r.model) {
            if (!row.models!.includes(r.model)) row.models!.push(r.model);
            const at = Number(r.timestamp);
            if (row.lastRunAt === undefined || at >= row.lastRunAt) {
                row.lastRunAt = at;
                row.model = r.model;
            }
        }
        byAgent.set(key, row);
    }
    return byAgent;
}

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

export function superiorOf(node: OrgNode): string | undefined {
    return superiorsOf(node)[0];
}

// Agents that report directly to this person
export function ownedAgents(personId: string, nodes: OrgNode[]) {
    return nodes.filter(
        (n) => n.type?.toUpperCase() === 'AGENT' && superiorsOf(n).includes(personId)
    );
}

// Agents anywhere below this person: their own plus their reports' agents
export function teamAgentIds(personId: string, nodes: OrgNode[]) {
    const below = new Set<string>();
    const queue = [personId];
    while (queue.length) {
        const id = queue.shift()!;
        for (const n of nodes) {
            const sups = superiorsOf(n);
            if (sups.includes(id) && !below.has(n.id)) {
                below.add(n.id);
                queue.push(n.id);
            }
        }
    }
    return new Set(
        nodes
            .filter((n) => n.type?.toUpperCase() === 'AGENT' && below.has(n.id))
            .map((n) => n.id)
    );
}

export function sumTotals(agentIds: Iterable<string>, byAgent: Map<string, UsageRow>) {
    const total = emptyTotals();
    for (const id of agentIds) {
        const row = byAgent.get(id);
        if (row) mergeTotals(total, row);
    }
    return total;
}

// Spend grouped by the person each agent reports to directly
export function usageByOwner(records: TelemetryRecord[], nodes: OrgNode[]): UsageRow[] {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const byOwner = new Map<string, UsageRow>();
    for (const [agentId, row] of usageByAgent(records)) {
        const agent = nodeById.get(agentId);
        const ownerIds = agent ? superiorsOf(agent) : [];
        if (ownerIds.length === 0) {
            const key = 'unassigned';
            const ownerRow = byOwner.get(key) || { key, name: 'Unassigned', ...emptyTotals() };
            mergeTotals(ownerRow, row);
            byOwner.set(key, ownerRow);
        } else {
            for (const ownerId of ownerIds) {
                const owner = nodeById.get(ownerId);
                const key = owner?.id || ownerId;
                const ownerRow = byOwner.get(key) || { key, name: owner?.name || ownerId, ...emptyTotals() };
                mergeTotals(ownerRow, row);
                byOwner.set(key, ownerRow);
            }
        }
    }
    return [...byOwner.values()];
}