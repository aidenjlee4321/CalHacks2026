// A single timeline of everything happening in the org: Claude API calls, tool calls,
// task and org changes, human input and system events. Kept on globalThis so every
// route handler shares it (like lib/telemetryStore.ts). Types are client-safe.

export type ActivityKind = 'API_CALL' | 'TOOL_CALL' | 'TASK' | 'ORG' | 'HUMAN' | 'SYSTEM';
export type ActivityLevel = 'info' | 'success' | 'warning' | 'error';

export interface ActivityEvent {
    id: string;
    timestamp: number;
    kind: ActivityKind;
    level: ActivityLevel;
    actorId?: string;
    actorName?: string;
    title: string;
    detail?: string;
    meta?: {
        model?: string;
        inputTokens?: number;
        outputTokens?: number;
        costUsd?: number | null;
        latencyMs?: number;
        stopReason?: string | null;
        tool?: string;
        requestId?: string; // links a request event to its response
    };
}

export type NewActivityEvent = Omit<ActivityEvent, 'id' | 'timestamp'> & { timestamp?: number };

// Kinds the browser may report; API and tool calls are only logged server-side
export const CLIENT_REPORTABLE_KINDS: ActivityKind[] = ['TASK', 'ORG', 'HUMAN', 'SYSTEM'];

const MAX_EVENTS = 2000;

const store = globalThis as typeof globalThis & { __activityLog?: ActivityEvent[] };
const events: ActivityEvent[] = (store.__activityLog ??= []);

export function logActivity(event: NewActivityEvent): ActivityEvent {
    const full: ActivityEvent = { id: crypto.randomUUID(), ...event, timestamp: event.timestamp ?? Date.now() };
    events.unshift(full); // newest first
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
    return full;
}

export function getActivity(limit = 500): ActivityEvent[] {
    return events.slice(0, limit);
}

export function clearActivity() {
    events.length = 0;
}
