import Anthropic from '@anthropic-ai/sdk';
import { INVESTIGATOR_TOOLS, handleToolCall } from './tools';
import { OrgNode, TaskItem } from '@/hooks/useOrgData';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface FindingResult {
    facts: string[];
    hypothesis: string;
    recommendedAction: string;
    unknowns: string[];
}

export async function runInvestigation(
    targetNode: OrgNode,
    nodes: OrgNode[],
    tasks: TaskItem[]
): Promise<FindingResult> {
    let modelId = 'claude-3-5-sonnet-latest';
    try {
        const list = await anthropic.models.list();
        if (list.data?.[0]?.id) modelId = list.data[0].id;
    } catch { }

    const messages: Anthropic.MessageParam[] = [
        {
            role: 'user',
            content: `Investigate operational bottlenecks or status issues for node "${targetNode.name}" (ID: ${targetNode.id}, Type: ${targetNode.type}, Status: ${targetNode.status || 'Idle'}). Use available tools to gather evidence, then summarize findings in JSON format with keys: facts, hypothesis, recommendedAction, unknowns.`,
        },
    ];

    let toolTurns = 0;
    const MAX_TURNS = 5;

    while (toolTurns < MAX_TURNS) {
        const response = await anthropic.messages.create({
            model: modelId,
            max_tokens: 1024,
            tools: INVESTIGATOR_TOOLS,
            messages,
        });

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
            const rawText = textBlock ? textBlock.text : '';

            try {
                // Parse structured JSON finding
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) return JSON.parse(jsonMatch[0]);
            } catch { }

            return {
                facts: ['Investigation completed with unstructured output.'],
                hypothesis: rawText,
                recommendedAction: 'Review node status manually.',
                unknowns: [],
            };
        }
    }

    throw new Error('Investigation loop exceeded maximum tool turn limit.');
}