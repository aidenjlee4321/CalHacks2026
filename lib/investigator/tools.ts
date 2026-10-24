import { Anthropic } from '@anthropic-ai/sdk';
import { OrgNode, TaskItem } from '@/hooks/useOrgData';
import { getMemoryEvents } from '@/lib/telemetryStore';

export const INVESTIGATOR_TOOLS: Anthropic.Tool[] = [
    {
        name: 'get_task_details',
        description: 'Retrieve task history, status, and assignment for a specific node.',
        input_schema: {
            type: 'object',
            properties: {
                nodeId: { type: 'string', description: 'The target OrgNode ID' },
            },
            required: ['nodeId'],
        },
    },
    {
        name: 'get_recent_events',
        description: 'Fetch recent system, execution, or status events for a target node.',
        input_schema: {
            type: 'object',
            properties: {
                nodeId: { type: 'string', description: 'The target OrgNode ID' },
            },
            required: ['nodeId'],
        },
    },
];

export async function handleToolCall(
    toolName: string,
    input: any,
    context: { nodes: OrgNode[]; tasks: TaskItem[] }
) {
    switch (toolName) {
        case 'get_task_details': {
            const assignedTasks = context.tasks.filter((t) => t.assignedNodeId === input.nodeId);
            return {
                count: assignedTasks.length,
                tasks: assignedTasks,
            };
        }
        case 'get_recent_events': {
            const events = getMemoryEvents(input.nodeId);
            return {
                eventCount: events.length,
                events: events.slice(-10), // Limit payload size
            };
        }
        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}