// Which Claude model each agent runs on. Client-safe: no SDK imports here.

export const AVAILABLE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

// Starting assignments for the 4 demo agents (see lib/demoAgents.ts).
// Every other agent runs on the server default (AGENT_MODEL in lib/claude.ts).
export const DEFAULT_AGENT_MODELS: Record<string, string> = {
    'node-37': 'claude-opus-5-5', // production debugging needs the strongest reasoning
    'node-38': 'claude-sonnet-5-5', // short sales emails
    'node-46': 'claude-opus-5-5', // long leadership reports
    'node-76': 'claude-haiku-5-5', // high-volume, cheap ticket triage
};

// "claude-haiku-5-5" -> "Haiku 5.5"
export function shortModelName(model?: string | null) {
    if (!model) return 'Unknown';
    const match = model.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?$/);
    if (!match) return model;
    const [, family, major, minor] = match;
    return `${family[0].toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ''}`;
}

// Server-side assignments, changed from the node inspector. Kept on globalThis like the telemetry cache.
const store = globalThis as typeof globalThis & { __agentModels?: Record<string, string> };

export function getAgentModels(): Record<string, string> {
    return (store.__agentModels ??= { ...DEFAULT_AGENT_MODELS });
}

export function getAgentModel(agentId: string | undefined, fallback: string) {
    return (agentId && getAgentModels()[agentId]) || fallback;
}

export function setAgentModel(agentId: string, model: string) {
    if (!AVAILABLE_MODELS.includes(model)) throw new Error(`Unsupported model: ${model}`);
    getAgentModels()[agentId] = model;
}
