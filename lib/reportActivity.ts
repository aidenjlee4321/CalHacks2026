import type { NewActivityEvent } from '@/lib/activityLog';

// Browser-side: send an event to the shared activity log. Fire-and-forget.
export function reportActivity(event: Pick<NewActivityEvent, 'kind' | 'level' | 'actorId' | 'actorName' | 'title' | 'detail'>) {
    fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
    }).catch((err) => console.error('Failed to report activity:', err));
}
