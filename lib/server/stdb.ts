// SERVER ONLY (API routes). Talks to SpacetimeDB over HTTP so a route doesn't need a websocket.
// The browser uses the generated websocket client instead.
import 'server-only';

const HOST = (
    process.env.SPACETIMEDB_HTTP_HOST ||
    process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ||
    'http://127.0.0.1:3000'
).replace(/^ws/, 'http'); // ws -> http, wss -> https
const DB = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE || 'spacetime-org';

// Reducer args are positional JSON, in the same order the module declares them.
export async function callReducer(name: string, args: unknown[] = []): Promise<void> {
    const res = await fetch(`${HOST}/v1/database/${DB}/call/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        cache: 'no-store',
    });
    if (!res.ok) {
        throw new Error(`${name} failed (${res.status}): ${(await res.text()).trim()}`);
    }
}

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

// Runs one SELECT and returns rows as objects with camelCase keys.
// (No WHERE clauses on purpose: filter in JS so we don't depend on column-name casing.)
export async function sql<T = Record<string, any>>(query: string): Promise<T[]> {
    const res = await fetch(`${HOST}/v1/database/${DB}/sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query,
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`sql failed (${res.status}): ${(await res.text()).trim()}`);
    const data = await res.json();
    const first = data?.[0];
    if (!first) return [];
    const cols: string[] = first.schema.elements.map((e: any) => camel(e.name?.some ?? e.name));
    return first.rows.map((row: any[]) => Object.fromEntries(cols.map((c, i) => [c, row[i]])) as T);
}

// ---------- reads ----------
export interface DbNode { id: string; name: string; type: string; status: string }
export interface DbEdge { childId: string; parentId: string; rank: number }
export interface DbTask { id: string; nodeId: string; description: string; status: string; assignedById: string }
export interface DbLesson { id: number; nodeId: string; triggerPattern: string; correction: string; approved: boolean }

export async function getOrg() {
    const [nodes, edges, tasks] = await Promise.all([
        sql<DbNode>('SELECT * FROM org_node'),
        sql<DbEdge>('SELECT * FROM reports_to'),
        sql<DbTask>('SELECT * FROM task'),
    ]);
    return { nodes, edges, tasks };
}

export async function getSettings(): Promise<Record<string, string>> {
    const rows = await sql<{ key: string; value: string }>('SELECT * FROM settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getAgentModels(): Promise<Record<string, string>> {
    const rows = await sql<{ agentId: string; model: string }>('SELECT * FROM agent_config');
    return Object.fromEntries(rows.map((r) => [r.agentId, r.model]));
}

// The model an agent runs on: its own assignment, else the default setting, else `fallback`.
export async function getAgentModel(agentId: string | undefined, fallback: string): Promise<string> {
    const [models, settings] = await Promise.all([getAgentModels(), getSettings()]);
    return (agentId && models[agentId]) || settings.default_model || fallback;
}

export async function getApprovedLessons(nodeId?: string): Promise<DbLesson[]> {
    const rows = await sql<DbLesson>('SELECT * FROM lesson');
    return rows.filter((l) => l.approved && (!l.nodeId || l.nodeId === nodeId));
}

export async function getTelemetryForNode(nodeId: string) {
    const rows = await sql<{ nodeId: string }>('SELECT * FROM telemetry');
    return rows.filter((r) => r.nodeId === nodeId);
}

// ---------- writes (typed wrappers, positional args match the module) ----------
export const stdb = {
    updateStatus: (id: string, status: string) => callReducer('update_status', [id, status]),
    setTaskStatus: (taskId: string, status: string) => callReducer('set_task_status', [taskId, status]),
    logActivity: (nodeId: string, kind: string, message: string) =>
        callReducer('log_activity', [nodeId, kind, message]),
    reportAnomaly: (a: {
        fromNodeId: string; subjectNodeId: string; severity: string;
        title: string; question: string; context: string;
    }) =>
        callReducer('report_anomaly', [
            a.fromNodeId, a.subjectNodeId, a.severity, a.title, a.question, a.context,
        ]),
    resetDemo: (keepLessons: boolean) => callReducer('reset_demo', [keepLessons]),

    recordTelemetry: (r: {
        id?: string; nodeId?: string; agentName?: string; taskId?: string; eventType?: string;
        status?: string; source?: string; model?: string; stopReason?: string | null;
        latencyMs?: number; promptTokens?: number; completionTokens?: number; totalTokens?: number;
        cacheReadTokens?: number; cacheWriteTokens?: number; costUsd?: number | null;
        error?: string; resultText?: string; details?: Record<string, unknown>;
        occurredAtMs?: number; // when the run really happened (default: now)
    }) => {
        const n = (v?: number) => Math.max(0, Math.round(v ?? 0)); // u32 columns
        return callReducer('record_telemetry', [
            r.id ?? crypto.randomUUID(),
            r.nodeId ?? '',
            r.agentName ?? 'Agent',
            r.taskId ?? '',
            r.eventType ?? (r.status === 'FAILED' ? 'AGENT_RUN_FAILED' : 'AGENT_RUN_SUCCESS'),
            r.status ?? 'SUCCESS',
            r.source ?? 'manual',
            r.model ?? '',
            r.stopReason ?? '',
            n(r.latencyMs),
            n(r.promptTokens),
            n(r.completionTokens),
            n(r.totalTokens),
            n(r.cacheReadTokens),
            n(r.cacheWriteTokens),
            r.costUsd ?? 0,
            r.error ?? '',
            r.resultText ?? '',
            JSON.stringify(r.details ?? {}),
            r.occurredAtMs ?? 0,
        ]);
    },
};