import { NextResponse } from 'next/server';
import { runInvestigation } from '@/lib/investigator/run';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('Incoming investigation payload:', body);

        const { targetNode, nodes, tasks } = body;

        if (!targetNode?.id) {
            console.error('Validation failed: targetNode or targetNode.id is missing', targetNode);
            return NextResponse.json({ success: false, error: 'Target node is required' }, { status: 400 });
        }

        const finding = await runInvestigation(targetNode, nodes || [], tasks || []);

        return NextResponse.json({
            success: true,
            finding,
        });
    } catch (err) {
        console.error('Investigation Endpoint Error:', err);
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}