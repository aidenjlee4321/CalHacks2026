import { Anthropic } from '@anthropic-ai/sdk';
import { OrgNode, TaskItem } from '@/hooks/useOrgData';
import * as telemetryStore from '@/lib/telemetryStore';
import { getApprovedLessons } from './lessons';

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
    {
        name: 'get_lessons',
        description: 'Retrieve approved workflow lessons and learned rules from past human feedback for this node.',
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
            return { count: assignedTasks.length, tasks: assignedTasks };
        }
        case 'get_recent_events': {
            const events = typeof telemetryStore.getMemoryEvents === 'function'
                ? telemetryStore.getMemoryEvents(input.nodeId)
                : telemetryStore.getTelemetryByNode(input.nodeId);
            return { eventCount: events.length, events: events.slice(-10) };
        }
        case 'get_lessons': {
            const lessons = getApprovedLessons(input.nodeId);
            return { lessonCount: lessons.length, lessons };
        }
        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}