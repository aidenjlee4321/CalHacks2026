import { NextResponse } from 'next/server';
import { getAgentModels, setAgentModel, shortModelName } from '@/lib/agentModels';
import { AGENT_MODEL } from '@/lib/claude';
import { logActivity } from '@/lib/activityLog';

// Assign the model an agent uses for its next runs
export async function POST(req: Request) {
    const { agentId, agentName, model } = await req.json();
    if (!agentId || !model) {
        return NextResponse.json({ success: false, error: 'agentId and model are required' }, { status: 400 });
    }
    const previous = getAgentModels()[agentId] || AGENT_MODEL;
    try {
        setAgentModel(agentId, model);
    } catch (err) {
        return NextResponse.json({ success: false, error: String(err) }, { status: 400 });
    }
    logActivity({
        kind: 'SYSTEM',
        level: 'info',
        actorId: agentId,
        actorName: agentName,
        title: `Model changed from ${shortModelName(previous)} to ${shortModelName(model)}`,
        meta: { model },
    });
    return NextResponse.json({ success: true, agentModels: getAgentModels() });
}
