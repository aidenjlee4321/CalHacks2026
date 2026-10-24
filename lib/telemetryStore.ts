export interface TelemetryRecord {
    id: string;
    agentId: string;
    agentName: string;
    taskId?: string;
    latencyMs?: number;
    durationMs?: number;
    tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    status?: 'SUCCESS' | 'FAILED' | string;
    resultText?: string;
    resultPreview?: string;
    timestamp: number | string;
}

// Alias for compatibility across older/newer routes
export type TelemetryEvent = TelemetryRecord;

// In-memory storage array
export const telemetryData: TelemetryRecord[] = [];

export function recordTelemetry(record: TelemetryRecord) {
    telemetryData.unshift(record); // Add newest events to the top
}

export function getTelemetry(): TelemetryRecord[] {
    return telemetryData;
}