import { NextResponse } from 'next/server';
import { clearTelemetry, getTelemetry } from '@/lib/telemetryStore';
import { seedSampleUsage } from '@/lib/sampleUsage';
import { AGENT_MODEL } from '@/lib/claude';
import { getAgentModels } from '@/lib/agentModels';

// Load the sample history once per server process, so the demo never opens empty
const flags = globalThis as typeof globalThis & { __sampleUsageLoaded?: boolean };

export async function GET() {
    if (!flags.__sampleUsageLoaded) {
        flags.__sampleUsageLoaded = true;
        seedSampleUsage();
    }
    return NextResponse.json({ telemetry: getTelemetry(), model: AGENT_MODEL, agentModels: getAgentModels() });
}

// Reload the sample history (real runs are kept)
export async function POST() {
    flags.__sampleUsageLoaded = true;
    seedSampleUsage();
    return NextResponse.json({ success: true });
}

export async function DELETE() {
    flags.__sampleUsageLoaded = true;
    clearTelemetry();
    return NextResponse.json({ success: true });
}
