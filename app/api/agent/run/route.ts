import { createWithWebTools } from '@/lib/apifyWebTool';
import { NextResponse } from 'next/server';
import { AGENT_MODEL, SUPPORTS_FALLBACKS, summarizeUsage } from '@/lib/claude';
import { callReducer, getAgentModel, getOrg, stdb } from '@/lib/server/stdb';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// This route owns everything about a run: the agent's status, its task, telemetry, and reporting a
// failure to the manager. The browser never sets agent status, so closing the tab can't strand an agent.
export async function POST(req: Request) {
    const {
        agentId,
        agentName,
        taskId: givenTaskId,
        prompt,
        delaySeconds = 0,
        source = 'manual',
    } = await req.json();

    if (!agentId) {
        return NextResponse.json({ success: false, error: 'agentId is required' }, { status: 400 });
    }

    const { nodes, tasks } = await getOrg();
    const agent = nodes.find((n) => n.id === agentId);
    if (!agent || agent.type !== 'AGENT') {
        return NextResponse.json({ success: false, error: `${agentId} is not an agent` }, { status: 400 });
    }

    const name: string = agentName || agent.name;
    const promptText = String(prompt || 'Execute the assigned task efficiently.');
    const existing = givenTaskId ? tasks.find((t) => t.id === givenTaskId) : undefined;
    const taskId: string = existing ? existing.id : `adhoc-${crypto.randomUUID()}`;
    const statusIfNotDone = existing?.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING';

    // 1. Claim the agent. The module refuses agents that have no manager.
    try {
        await stdb.updateStatus(agentId, 'WORKING');
    } catch (err) {
        return NextResponse.json({ success: false, error: String(err) }, { status: 409 });
    }

    // 2. Attach the run to a task, so a WORKING agent always has one (an ad-hoc prompt gets its own)
    try {
        if (!existing) await callReducer('add_task', [taskId, agentId, promptText.slice(0, 140)]);
        await stdb.setTaskStatus(taskId, 'IN_PROGRESS');
    } catch (err) {
        console.error('Could not attach run to a task:', err);
    }

    let outcome: 'SUCCESS' | 'REFUSED' | 'FAILED' = 'FAILED';
    let failureNote = '';
    let model = '';
    let startTime = Date.now();
    const base = { id: crypto.randomUUID(), nodeId: agentId, agentName: name, taskId, source };

    // Telemetry problems are logged, never allowed to change the outcome of the run
    const record = async (r: Parameters<typeof stdb.recordTelemetry>[0]) => {
        try {
            await stdb.recordTelemetry(r);
        } catch (err) {
            console.error('Failed to record telemetry:', err);
        }
    };

    try {
        model = await getAgentModel(agentId, AGENT_MODEL);

        // Simulated API delay is kept out of the measured latency
        if (delaySeconds > 0) await sleep(delaySeconds * 1000);
        startTime = Date.now();

        const response = await createWithWebTools({
            model,
            max_tokens: 16000,
            ...(SUPPORTS_FALLBACKS.has(model) && {
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default' as const,
            }),
            system: `You are ${name}, an AI agent working inside a company org chart alongside human employees. Complete the assigned task and reply with a concise work report.`,
            messages: [{ role: 'user', content: promptText }],
        });

        const latencyMs = Date.now() - startTime;
        const textBlock = response.content.find((block: any) => block.type === 'text');
        const resultText = textBlock?.type === 'text' ? textBlock.text : 'No response generated.';
        const usage = summarizeUsage(response.model, response.usage);
        const refused = response.stop_reason === 'refusal';
        outcome = refused ? 'REFUSED' : 'SUCCESS';
        if (refused) failureNote = 'The model declined this task.';

        await record({
            ...base,
            model: response.model,
            status: refused ? 'REFUSED' : 'SUCCESS',
            eventType: refused ? 'AGENT_RUN_FAILED' : 'AGENT_RUN_SUCCESS',
            stopReason: response.stop_reason,
            latencyMs,
            totalTokens: usage.totalTokens,
            promptTokens: usage.inputTokens,
            completionTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            costUsd: usage.costUsd,
            resultText,
        });

        return NextResponse.json({
            success: !refused,
            resultText,
            tokens: usage.totalTokens,
            usage,
            latencyMs,
            modelUsed: response.model,
            ...(refused && { error: failureNote }),
        });
    } catch (error) {
        console.error('Claude API Error:', error);
        failureNote = String(error);
        await record({
            ...base,
            model: model || AGENT_MODEL,
            status: 'FAILED',
            eventType: 'AGENT_RUN_FAILED',
            latencyMs: Date.now() - startTime,
            error: failureNote,
        });
        return NextResponse.json({ success: false, error: failureNote }, { status: 500 });
    } finally {
        // Always hand the agent back, whatever happened above
        try {
            await stdb.updateStatus(agentId, 'IDLE');
        } catch (err) {
            console.error('Failed to reset agent status:', err);
        }
        try {
            if (outcome === 'SUCCESS') {
                await callReducer('complete_task', [taskId]);
            } else if (existing) {
                await stdb.setTaskStatus(taskId, statusIfNotDone);
            } else {
                await callReducer('delete_task', [taskId]); // don't leave a dead ad-hoc task behind
            }
        } catch (err) {
            console.error('Failed to settle task:', err);
        }
        // A failed or refused run is a blocker: tell the manager
        if (outcome !== 'SUCCESS') {
            try {
                await stdb.reportAnomaly({
                    fromNodeId: 'system',
                    subjectNodeId: agentId,
                    severity: 'MEDIUM',
                    title: outcome === 'REFUSED' ? 'Agent Run Refused' : 'Agent Run Failed',
                    question: `${name}: ${failureNote.slice(0, 300)} Should it retry, or does the task need to change?`,
                    context: `Task: ${promptText.slice(0, 300)}`,
                });
            } catch (err) {
                console.error('Failed to report run failure:', err);
            }
        }
    }
}