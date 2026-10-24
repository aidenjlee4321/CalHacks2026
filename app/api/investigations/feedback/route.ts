import { NextResponse } from 'next/server';
import { addLesson } from '@/lib/investigator/lessons';

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

        return NextResponse.json({ success: true, lesson });
    } catch (err) {
        console.error('Feedback Route Error:', err);
        return NextResponse.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}