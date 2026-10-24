import { NextResponse } from 'next/server';
import { getAgentModels, setAgentModel } from '@/lib/agentModels';

// Assign the model an agent uses for its next runs
export async function POST(req: Request) {
    const { agentId, model } = await req.json();
    if (!agentId || !model) {
        return NextResponse.json({ success: false, error: 'agentId and model are required' }, { status: 400 });
    }
    try {
        setAgentModel(agentId, model);
    } catch (err) {
        return NextResponse.json({ success: false, error: String(err) }, { status: 400 });
    }
    return NextResponse.json({ success: true, agentModels: getAgentModels() });
}
