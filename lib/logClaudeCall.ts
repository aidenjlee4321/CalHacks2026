import { logActivity } from '@/lib/activityLog';
import { shortModelName } from '@/lib/agentModels';
import type { UsageSummary } from '@/lib/claude';

// Paired activity events for one Claude API call: the request, then its response or error.

interface Actor {
    actorId?: string;
    actorName?: string;
}

export function logClaudeRequest(actor: Actor, model: string, detail?: string) {
    const requestId = crypto.randomUUID();
    logActivity({
        kind: 'API_CALL',
        level: 'info',
        ...actor,
        title: `Sent request to ${shortModelName(model)}`,
        detail,
        meta: { model, requestId },
    });
    return requestId;
}

export function logClaudeResponse(
    actor: Actor,
    requestId: string,
    result: { model: string; usage: UsageSummary; latencyMs: number; stopReason: string | null; summary?: string }
) {
    const refused = result.stopReason === 'refusal';
    logActivity({
        kind: 'API_CALL',
        level: refused ? 'warning' : 'success',
        ...actor,
        title: refused ? `${shortModelName(result.model)} declined the request` : `${shortModelName(result.model)} responded`,
        detail: result.summary,
        meta: {
            model: result.model,
            inputTokens: result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens,
            outputTokens: result.usage.outputTokens,
            costUsd: result.usage.costUsd,
            latencyMs: result.latencyMs,
            stopReason: result.stopReason,
            requestId,
        },
    });
}

export function logClaudeError(actor: Actor, requestId: string, model: string, latencyMs: number, error: unknown) {
    logActivity({
        kind: 'API_CALL',
        level: 'error',
        ...actor,
        title: `Request to ${shortModelName(model)} failed`,
        detail: String(error),
        meta: { model, latencyMs, requestId },
    });
}
