import { NextResponse } from 'next/server';
import { addLesson } from '@/lib/investigator/lessons';
import { logActivity } from '@/lib/activityLog';

export async function POST(req: Request) {
    try {
        const { nodeId, triggerPattern, correction } = await req.json();

        if (!correction || !correction.trim()) {
            return NextResponse.json(
                { success: false, error: 'Correction text is required' },
                { status: 400 }
            );
        }

        const lesson = addLesson({
            nodeId,
            triggerPattern: triggerPattern || 'General Correction',
            correction: correction.trim(),
            approved: true, // Auto-approve human feedback
        });

        logActivity({
            kind: 'HUMAN',
            level: 'info',
            actorId: nodeId,
            title: 'Human correction saved as a lesson',
            detail: lesson.correction,
        });

        return NextResponse.json({ success: true, lesson });
    } catch (err) {
        console.error('Feedback Route Error:', err);
        return NextResponse.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}