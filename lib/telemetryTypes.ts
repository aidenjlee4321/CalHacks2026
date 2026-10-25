// Client-safe telemetry shape (the old lib/telemetryStore.ts held this plus the in-memory cache).
export interface TelemetryRecord {
    id: string;
    nodeId: string;
    agentId: string; // same as nodeId, kept so existing usage code keeps working
    agentName: string;
    taskId: string;
    eventType: string;
    status: string;
    source: string;
    model: string;
    stopReason: string;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    tokens: number; // alias of totalTokens
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number | null;
    error: string;
    resultText: string;
    resultPreview: string;
    details: Record<string, unknown>;
    timestamp: number; // ms since epoch
}
