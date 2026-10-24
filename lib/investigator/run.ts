import Anthropic from '@anthropic-ai/sdk';
import { INVESTIGATOR_TOOLS, handleToolCall } from './tools';
import { OrgNode, TaskItem } from '@/hooks/useOrgData';
import { anthropic, AGENT_MODEL, EMPTY_USAGE, addUsage, summarizeUsage } from '@/lib/claude';
import { recordTelemetry } from '@/lib/telemetryStore';

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

    try {
        while (toolTurns < MAX_TURNS) {
            const response = await anthropic.messages.create({
                model: AGENT_MODEL,
                max_tokens: 16000,
                tools: INVESTIGATOR_TOOLS,
                messages,
            });
            usage = addUsage(usage, summarizeUsage(response.model, response.usage));

            if (response.stop_reason === 'tool_use') {
                toolTurns++;
                messages.push({ role: 'assistant', content: response.content });

                const toolResults: Anthropic.ToolResultBlockParam[] = [];
                for (const block of response.content) {
                    if (block.type === 'tool_use') {
                        const resultData = await handleToolCall(block.name, block.input, { nodes, tasks });
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
        throw err;
    }

    recordRun('FAILED', { error: 'Exceeded maximum tool turns' });
    throw new Error('Investigation loop exceeded maximum tool turn limit.');
}
