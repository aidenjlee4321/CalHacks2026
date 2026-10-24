export interface Lesson {
    id: string;
    nodeId?: string;       // Scope to specific node or global
    triggerPattern: string; // e.g. "zero events on batch jobs"
    correction: string;     // e.g. "Lead #001 runs batch jobs silently"
    approved: boolean;
    createdAt: number;
}

// In-memory fallback array
const memoryLessons: Lesson[] = [
    {
        id: 'lesson-1',
        nodeId: 'node-1',
        triggerPattern: 'zero events during neural weight processing',
        correction: 'Executive Lead #001 does not emit intermediate telemetry during weight batch jobs. Check task creation time before flagging as stalled.',
        approved: true,
        createdAt: Date.now(),
    },
];

const seenLessonIds = new Set<string>(memoryLessons.map((l) => l.id));

export function getApprovedLessons(nodeId?: string): Lesson[] {
    return memoryLessons.filter(
        (l) => l.approved && (!l.nodeId || l.nodeId === nodeId)
    );
}

export function addLesson(
    lesson: Omit<Lesson, 'id' | 'createdAt'>,
    conn?: any
): Lesson {
    const newLesson: Lesson = {
        ...lesson,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
    };

    // Deduplicate
    if (!seenLessonIds.has(newLesson.id)) {
        seenLessonIds.add(newLesson.id);
        memoryLessons.push(newLesson);
    }

    // Persist to SpacetimeDB if connected
    if (conn?.reducers?.recordLesson) {
        try {
            conn.reducers.recordLesson(newLesson);
        } catch (err) {
            console.error('Failed to write lesson to SpacetimeDB:', err);
        }
    }

    return newLesson;
}