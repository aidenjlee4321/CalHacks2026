import { NextResponse } from 'next/server';
import { scanForAnomalies } from '@/lib/investigator/scanner';

export async function POST(req: Request) {
    try {
        const { nodes, tasks } = await req.json();

        const alerts = scanForAnomalies(nodes || [], tasks || []);

        return NextResponse.json({
            success: true,
            alertCount: alerts.length,
            alerts,
        });
    } catch (err) {
        console.error('Scan Route Error:', err);
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}