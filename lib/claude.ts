import Anthropic from '@anthropic-ai/sdk';

// One client and one model for every agent call, so usage and cost are comparable.
// Credentials come from ANTHROPIC_API_KEY in .env.local.
export const anthropic = new Anthropic();
export const AGENT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

// USD per million tokens, first-party API list prices.
// Cache writes bill at 1.25x input (5-minute TTL).
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
    'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
    'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
    'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
};

export interface UsageSummary {
    inputTokens: number;
    outputTokens: number; // includes thinking tokens
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    costUsd: number | null; // null when the model has no known price
}

interface RawUsage {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
}

export function summarizeUsage(model: string, usage: RawUsage): UsageSummary {
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheReadTokens = usage.cache_read_input_tokens || 0;
    const cacheWriteTokens = usage.cache_creation_input_tokens || 0;

    const price = PRICING[model];
    const costUsd = price
        ? (inputTokens * price.input +
              outputTokens * price.output +
              cacheReadTokens * price.cacheRead +
              cacheWriteTokens * price.input * 1.25) /
          1_000_000
        : null;

    return {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
        costUsd,
    };
}

// Sum usage across the calls of a multi-turn run (e.g. a tool-use loop).
export function addUsage(a: UsageSummary, b: UsageSummary): UsageSummary {
    return {
        inputTokens: a.inputTokens + b.inputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
        cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
        cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
        totalTokens: a.totalTokens + b.totalTokens,
        costUsd: a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd,
    };
}

export const EMPTY_USAGE: UsageSummary = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costUsd: 0,
};
