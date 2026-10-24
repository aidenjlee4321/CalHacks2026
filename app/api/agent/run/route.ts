import { NextResponse } from 'next/server';
import { anthropic, AGENT_MODEL, SUPPORTS_FALLBACKS, summarizeUsage } from '@/lib/claude';
import { getAgentModel } from '@/lib/agentModels';
import { recordTelemetry } from '@/lib/telemetryStore';
import { logClaudeError, logClaudeRequest, logClaudeResponse } from '@/lib/logClaudeCall';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: Request) {
    const {
        agentId,
        agentName,
        taskId,
        prompt,
        delaySeconds = 0,
        source = 'manual',
    } = await req.json();

    // 1. Simulate API delay if requested (kept out of the measured latency)
    if (delaySeconds > 0) {
        await sleep(delaySeconds * 1000);
    }

    const startTime = Date.now();
    const base = {
        id: crypto.randomUUID(),
        agentId: agentId || 'unknown-agent',
        agentName: agentName || 'Agent',
        taskId,
        source,
    };

    // Each agent runs on its own assigned model
    const model = getAgentModel(agentId, AGENT_MODEL);
    const actor = { actorId: base.agentId, actorName: base.agentName };
    const taskText = prompt || 'Execute the assigned task efficiently.';
    const requestId = logClaudeRequest(actor, model, `Task (${source}): ${taskText}`);

    try {
        // 2. Run the task. Server-side fallbacks retry a declined request on another model.
        const response = await anthropic.beta.messages.create({
            model,
            max_tokens: 16000,
            ...(SUPPORTS_FALLBACKS.has(model) && {
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default' as const,
            }),
            system: `You are ${agentName || 'an AI agent'}, an AI agent working inside a company org chart alongside human employees. Complete the assigned task and reply with a concise work report.`,
            messages: [
                { role: 'user', content: taskText },
            ],
        });

        const latencyMs = Date.now() - startTime;
        const textBlock = response.content.find((block) => block.type === 'text');
        const resultText = textBlock?.type === 'text' ? textBlock.text : 'No response generated.';
        const usage = summarizeUsage(response.model, response.usage);
        const refused = response.stop_reason === 'refusal';
        logClaudeResponse(actor, requestId, {
            model: response.model,
            usage,
            latencyMs,
            stopReason: response.stop_reason,
            summary: resultText,
        });

        // 3. Record run telemetry
        recordTelemetry({
            ...base,
            model: response.model,
            status: refused ? 'REFUSED' : 'SUCCESS',
            stopReason: response.stop_reason,
            latencyMs,
            tokens: usage.totalTokens,
            totalTokens: usage.totalTokens,
            promptTokens: usage.inputTokens,
            completionTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            costUsd: usage.costUsd,
            resultText,
            timestamp: Date.now(),
        });

        return NextResponse.json({
            success: !refused,
            resultText,
            tokens: usage.totalTokens,
            usage,
            latencyMs,
            modelUsed: response.model,
            ...(refused && { error: 'The model declined this task.' }),
        });
    } catch (error) {
        console.error('Claude API Error:', error);
        logClaudeError(actor, requestId, model, Date.now() - startTime, error);
        recordTelemetry({
            ...base,
            model,
            status: 'FAILED',
            latencyMs: Date.now() - startTime,
            tokens: 0,
            costUsd: 0,
            error: String(error),
            timestamp: Date.now(),
        });
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
}
