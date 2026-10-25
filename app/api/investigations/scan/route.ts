import { NextResponse } from 'next/server';
import { scanForAnomalies } from '@/lib/investigator/scanner';

export async function POST(req: Request) {
    try {
        let body: { nodes?: any[]; tasks?: any[] } = {};

        // Safely parse JSON without throwing if body is empty
        try {
            body = await req.json();
        } catch {
            body = {};
        }

        const { nodes = [], tasks = [] } = body;

        const alerts = scanForAnomalies(nodes, tasks);

        return Response.json({ success: true, alerts });
    } catch (error: any) {
        return Response.json(
            { success: false, error: error?.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}