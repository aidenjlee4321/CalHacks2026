import { AGENT_MODEL, summarizeUsage } from '@/lib/claude';
import { recordTelemetry, telemetryData } from '@/lib/telemetryStore';

// Simulated run history for the 4 demo agents (see lib/demoAgents.ts), tagged source 'sample'
// so it can always be told apart from real runs. Seeded RNG keeps it identical on every load.

interface AgentProfile {
    agentId: string;
    agentName: string;
    task: string;
    runs: number;
    input: [number, number];
    output: [number, number];
    latencyMs: [number, number];
    failures?: number;
}

const PROFILES: AgentProfile[] = [
    { agentId: 'node-37', agentName: 'Agent #037', task: 'Investigate production error logs', runs: 8, input: [1500, 3000], output: [600, 1500], latencyMs: [7000, 14000] },
    { agentId: 'node-38', agentName: 'Agent #038', task: 'Draft prospect follow-up emails', runs: 6, input: [300, 600], output: [200, 500], latencyMs: [3000, 6000] },
    { agentId: 'node-46', agentName: 'Agent #046', task: 'Compile weekly leadership report', runs: 5, input: [4000, 9000], output: [1500, 3500], latencyMs: [15000, 30000], failures: 1 },
    { agentId: 'node-76', agentName: 'Agent #076', task: 'Triage incoming support tickets', runs: 12, input: [400, 900], output: [150, 400], latencyMs: [2500, 5000] },
];

const HISTORY_HOURS = 6;

function mulberry32(seed: number) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function seedSampleUsage() {
    // Replace any earlier sample history, keep real runs
    for (let i = telemetryData.length - 1; i >= 0; i--) {
        if (telemetryData[i].source === 'sample') telemetryData.splice(i, 1);
    }

    const rand = mulberry32(13);
    const between = ([lo, hi]: [number, number]) => Math.round(lo + rand() * (hi - lo));
    const now = Date.now();

    const runs = PROFILES.flatMap((p) =>
        Array.from({ length: p.runs }, (_, i) => {
            const failed = i < (p.failures || 0);
            const usage = summarizeUsage(AGENT_MODEL, {
                input_tokens: failed ? 0 : between(p.input),
                output_tokens: failed ? 0 : between(p.output),
            });
            return {
                profile: p,
                failed,
                usage,
                latencyMs: between(p.latencyMs),
                timestamp: now - Math.round(rand() * HISTORY_HOURS * 3_600_000),
            };
        })
    );

    // Oldest first, so the newest ends up at the top of the store
    runs.sort((a, b) => a.timestamp - b.timestamp);
    for (const run of runs) {
        recordTelemetry({
            id: crypto.randomUUID(),
            agentId: run.profile.agentId,
            agentName: run.profile.agentName,
            source: 'sample',
            model: AGENT_MODEL,
            status: run.failed ? 'FAILED' : 'SUCCESS',
            latencyMs: run.latencyMs,
            tokens: run.usage.totalTokens,
            totalTokens: run.usage.totalTokens,
            promptTokens: run.usage.inputTokens,
            completionTokens: run.usage.outputTokens,
            costUsd: run.usage.costUsd,
            resultText: run.failed ? undefined : `Sample run: ${run.profile.task}`,
            error: run.failed ? 'Sample failure: upstream data source timed out' : undefined,
            timestamp: run.timestamp,
        });
    }
}
