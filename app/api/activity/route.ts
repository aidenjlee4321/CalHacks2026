import { NextResponse } from 'next/server';
import { CLIENT_REPORTABLE_KINDS, clearActivity, getActivity, logActivity } from '@/lib/activityLog';

export async function GET() {
    return NextResponse.json({ events: getActivity() });
}

// Events reported by the browser (task and org changes happen in client state)
export async function POST(req: Request) {
    const { kind, level = 'info', actorId, actorName, title, detail } = await req.json();
    if (!CLIENT_REPORTABLE_KINDS.includes(kind) || !title) {
        return NextResponse.json({ success: false, error: 'Invalid activity event' }, { status: 400 });
    }
    logActivity({ kind, level, actorId, actorName, title: String(title).slice(0, 300), detail: detail ? String(detail).slice(0, 2000) : undefined });
    return NextResponse.json({ success: true });
}

export async function DELETE() {
    clearActivity();
    logActivity({ kind: 'SYSTEM', level: 'info', title: 'Activity log cleared' });
    return NextResponse.json({ success: true });
}
