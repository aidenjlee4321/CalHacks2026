'use client';

import { useEffect, useState } from 'react';
import type { ActivityEvent } from '@/lib/activityLog';

// Polls the shared activity log (newest first). Pass live=false to freeze it.
export function useActivity(pollMs = 2000, live = true) {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        if (!live) return;
        let active = true;
        const load = () =>
            fetch('/api/activity')
                .then((res) => res.json())
                .then((data) => {
                    if (!active) return;
                    if (data.events) setEvents(data.events);
                    setLoaded(true);
                })
                .catch((err) => console.error('Failed to fetch activity:', err));
        load();
        const interval = setInterval(load, pollMs);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [pollMs, live, version]);

    const clear = async () => {
        await fetch('/api/activity', { method: 'DELETE' });
        setVersion((v) => v + 1);
    };

    return { events, loaded, clear };
}
