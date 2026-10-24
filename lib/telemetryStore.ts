// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export type EventType =
    | 'AGENT_RUN_START'
    | 'AGENT_RUN_SUCCESS'
    | 'AGENT_RUN_FAILED'
    | 'TASK_STATUS_CHANGE'
    | 'TOOL_ERROR'
    | string;

export interface TelemetryRecord {
    id: string;
    orgId?: string;
    nodeId?: string;
    agentId?: string;
    agentName?: string;
    taskId?: string;
    eventType?: EventType;
    latencyMs?: number;
    durationMs?: number;
    tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    costUsd?: number | null;
    model?: string;
    stopReason?: string | null;
    source?: 'manual' | 'demo' | 'investigation' | string;
    error?: string;
    status?: 'SUCCESS' | 'FAILED' | 'REFUSED' | 'RUNNING' | string;
    resultText?: string;
    resultPreview?: string;
    details?: Record<string, any>;
    timestamp: number | string;
    ingestedAt?: number;
    sourceRef?: string;
}

// Alias for compatibility across older/newer routes
export type TelemetryEvent = TelemetryRecord;

// ============================================================================
// IN-MEMORY LIVE CACHE & DEDUPLICATION
// ============================================================================

// Kept on globalThis so every route handler (and dev hot reloads) share one cache.
const store = globalThis as typeof globalThis & {
    __telemetryData?: TelemetryRecord[];
    __telemetrySeenIds?: Set<string>;
};
export const telemetryData: TelemetryRecord[] = (store.__telemetryData ??= []);
const seenEventIds: Set<string> = (store.__telemetrySeenIds ??= new Set<string>());
const MAX_CACHE_SIZE = 1000;

// ============================================================================
// RECORDING & PERSISTENCE
// ============================================================================

/**
 * Record a telemetry record or system event into SpacetimeDB (if available)
 * and maintain a deduplicated live in-memory cache.
 */
export function recordTelemetry(
    record: Partial<TelemetryRecord> & { timestamp: number | string },
    conn?: any
): TelemetryRecord {
    const eventId = record.id || crypto.randomUUID();

    // Deduplicate repeated ingestions by event ID
    if (seenEventIds.has(eventId)) {
        const existing = telemetryData.find((item) => item.id === eventId);
        if (existing) return existing;
    }

    const now = Date.now();
    const parsedTimestamp =
        typeof record.timestamp === 'number'
            ? record.timestamp
            : new Date(record.timestamp).getTime() || now;

    const fullRecord: TelemetryRecord = {
        id: eventId,
        orgId: record.orgId || 'org-default',
        nodeId: record.nodeId || record.agentId,
        agentId: record.agentId,
        agentName: record.agentName || 'System Agent',
        taskId: record.taskId,
        eventType: record.eventType || (record.status === 'FAILED' ? 'AGENT_RUN_FAILED' : 'AGENT_RUN_SUCCESS'),
        latencyMs: record.latencyMs ?? record.durationMs ?? 0,
        durationMs: record.durationMs ?? record.latencyMs ?? 0,
        tokens: record.tokens ?? record.totalTokens ?? 0,
        promptTokens: record.promptTokens ?? 0,
        completionTokens: record.completionTokens ?? 0,
        totalTokens: record.totalTokens ?? record.tokens ?? 0,
        cacheReadTokens: record.cacheReadTokens ?? 0,
        cacheWriteTokens: record.cacheWriteTokens ?? 0,
        costUsd: record.costUsd ?? null,
        model: record.model,
        stopReason: record.stopReason ?? null,
        source: record.source || 'manual',
        error: record.error,
        status: record.status || 'SUCCESS',
        resultText: record.resultText,
        resultPreview: record.resultPreview || record.resultText?.slice(0, 100),
        details: record.details || {},
        timestamp: parsedTimestamp,
        ingestedAt: now,
        sourceRef: record.sourceRef || 'api/agent/run',
    };

    // 1. Deduplication tracking
    seenEventIds.add(eventId);

    // 2. Write to SpacetimeDB reducer if connection exists
    if (conn?.reducers?.recordTelemetry) {
        try {
            conn.reducers.recordTelemetry(fullRecord);
        } catch (err) {
            console.error('Failed to persist telemetry event to SpacetimeDB:', err);
        }
    }

    // 3. Update in-memory live cache (newest events at top)
    telemetryData.unshift(fullRecord);

    // Bounded cache footprint to prevent memory leaks in dev mode
    if (telemetryData.length > MAX_CACHE_SIZE) {
        const removed = telemetryData.pop();
        if (removed) seenEventIds.delete(removed.id);
    }

    return fullRecord;
}

// Helper alias matching investigator specification
export const recordOrgEvent = recordTelemetry;

// ============================================================================
// READ QUERY HELPERS
// ============================================================================

// ============================================================================
// READ QUERY HELPERS
// ============================================================================

export function getTelemetry(): TelemetryRecord[] {
    return telemetryData;
}

export function clearTelemetry() {
    telemetryData.length = 0;
    seenEventIds.clear();
}

export function getTelemetryByNode(nodeId: string): TelemetryRecord[] {
    return telemetryData.filter(
        (t) => t.nodeId === nodeId || t.agentId === nodeId
    );
}

export function getTelemetryByTask(taskId: string): TelemetryRecord[] {
    return telemetryData.filter((t) => t.taskId === taskId);
}

export function getMemoryEvents(nodeId?: string): TelemetryRecord[] {
    if (!nodeId) return telemetryData;
    return getTelemetryByNode(nodeId);
}