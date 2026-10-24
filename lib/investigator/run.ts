import Anthropic from '@anthropic-ai/sdk';
import { INVESTIGATOR_TOOLS, handleToolCall } from './tools';
import { OrgNode, TaskItem } from '@/hooks/useOrgData';
import { anthropic, AGENT_MODEL, EMPTY_USAGE, addUsage, summarizeUsage } from '@/lib/claude';
import { recordTelemetry } from '@/lib/telemetryStore';
import { logActivity } from '@/lib/activityLog';
import { logClaudeError, logClaudeRequest, logClaudeResponse } from '@/lib/logClaudeCall';

const ACTOR = { actorId: 'investigator', actorName: 'Investigator' };

export interface FindingResult {
    facts: string[];
    hypothesis: string;
    recommendedActions: string[];
    unknowns: string[];
}

export async function runInvestigation(
    targetNode: OrgNode,
    nodes: OrgNode[],
    tasks: TaskItem[]
): Promise<FindingResult> {
    const startTime = Date.now();
    let usage = EMPTY_USAGE;

    // One telemetry record per investigation, with usage summed across every turn
    const recordRun = (status: string, extra: { resultText?: string; error?: string } = {}) =>
        recordTelemetry({
            agentId: 'investigator',
            agentName: 'Investigator',
            source: 'investigation',
            model: AGENT_MODEL,
            status,
            latencyMs: Date.now() - startTime,
            tokens: usage.totalTokens,
            totalTokens: usage.totalTokens,
            promptTokens: usage.inputTokens,
            completionTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            costUsd: usage.costUsd,
            details: { targetNodeId: targetNode.id },
            timestamp: Date.now(),
            ...extra,
        });

    const messages: Anthropic.MessageParam[] = [
        {
            role: 'user',
            content: `Investigate operational bottlenecks or status issues for node "${targetNode.name}" (ID: ${targetNode.id}, Type: ${targetNode.type}, Status: ${targetNode.status || 'Idle'}).

Gather evidence with available tools, then provide a structured diagnosis.
Return strictly JSON matching this structure:
{
  "facts": ["Itemized factual observations from tool outputs"],
  "hypothesis": "Concise 1-2 sentence diagnosis of what is likely happening.",
  "recommendedActions": ["Clear, step-by-step actionable recommendations"],
  "unknowns": ["Missing information or unconfirmed factors"]
}`,
        },
    ];;

    let toolTurns = 0;
    const MAX_TURNS = 5;

    logActivity({ kind: 'SYSTEM', level: 'info', ...ACTOR, title: `Investigation started on ${targetNode.name}` });

    try {
        while (toolTurns < MAX_TURNS) {
            const callStart = Date.now();
            const requestId = logClaudeRequest(ACTOR, AGENT_MODEL, `Turn ${toolTurns + 1} investigating ${targetNode.name}`);
            let response: Anthropic.Message;
            try {
                response = await anthropic.messages.create({
                    model: AGENT_MODEL,
                    max_tokens: 16000,
                    tools: INVESTIGATOR_TOOLS,
                    messages,
                });
            } catch (err) {
                logClaudeError(ACTOR, requestId, AGENT_MODEL, Date.now() - callStart, err);
                throw err;
            }
            const callUsage = summarizeUsage(response.model, response.usage);
            usage = addUsage(usage, callUsage);
            const toolNames = response.content.flatMap((b) => (b.type === 'tool_use' ? [b.name] : []));
            logClaudeResponse(ACTOR, requestId, {
                model: response.model,
                usage: callUsage,
                latencyMs: Date.now() - callStart,
                stopReason: response.stop_reason,
                summary: toolNames.length ? `Requested tools: ${toolNames.join(', ')}` : undefined,
            });

            if (response.stop_reason === 'tool_use') {
                toolTurns++;
                messages.push({ role: 'assistant', content: response.content });

                const toolResults: Anthropic.ToolResultBlockParam[] = [];
                for (const block of response.content) {
                    if (block.type === 'tool_use') {
                        const resultData = await handleToolCall(block.name, block.input, { nodes, tasks });
                        logActivity({
                            kind: 'TOOL_CALL',
                            level: 'info',
                            ...ACTOR,
                            title: `Called ${block.name}`,
                            detail: `Input: ${JSON.stringify(block.input)}\nResult: ${JSON.stringify(resultData).slice(0, 500)}`,
                            meta: { tool: block.name },
                        });
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: block.id,
                            content: JSON.stringify(resultData),
                        });
                    }
                }
                messages.push({ role: 'user', content: toolResults });
            } else {
                // Final response text
                const textBlock = response.content.find((b) => b.type === 'text');
                const rawText = textBlock?.type === 'text' ? textBlock.text : '';
                recordRun(response.stop_reason === 'refusal' ? 'REFUSED' : 'SUCCESS', { resultText: rawText });
                logActivity({
                    kind: 'SYSTEM',
                    level: response.stop_reason === 'refusal' ? 'warning' : 'success',
                    ...ACTOR,
                    title: `Investigation finished on ${targetNode.name}`,
                    detail: rawText,
                    meta: { model: response.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, latencyMs: Date.now() - startTime },
                });

                try {
                    // Parse structured JSON finding
                    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) return JSON.parse(jsonMatch[0]);
                } catch { }

                return {
                    facts: ['Investigation completed with unstructured output.'],
                    hypothesis: rawText,
                    recommendedActions: ['Review node status manually.'],
                    unknowns: [],
                };
            }
        }
    } catch (err) {
        recordRun('FAILED', { error: String(err) });
        logActivity({ kind: 'SYSTEM', level: 'error', ...ACTOR, title: `Investigation failed on ${targetNode.name}`, detail: String(err) });
        throw err;
    }

    recordRun('FAILED', { error: 'Exceeded maximum tool turns' });
    logActivity({ kind: 'SYSTEM', level: 'error', ...ACTOR, title: `Investigation gave up on ${targetNode.name}`, detail: `No answer after ${MAX_TURNS} tool turns` });
    throw new Error('Investigation loop exceeded maximum tool turn limit.');
}
