import { NextResponse } from 'next/server';
import { getTelemetry } from '@/lib/telemetryStore';

export async function GET() {
    return NextResponse.json({ telemetry: getTelemetry() });
}