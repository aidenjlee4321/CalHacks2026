'use client';

import { useEffect, useState } from 'react';
import type { TelemetryRecord } from '@/lib/telemetryStore';

// Polls the server's agent telemetry (newest first, as stored)
export function useTelemetry(pollMs = 5000) {
    const [records, setRecords] = useState<TelemetryRecord[]>([]);

    useEffect(() => {
        let active = true;
        const load = () =>
            fetch('/api/telemetry')
                .then((res) => res.json())
                .then((data) => {
                    if (active && data.telemetry) setRecords(data.telemetry);
                })
                .catch((err) => console.error('Failed to fetch telemetry:', err));

        load();
        const interval = setInterval(load, pollMs);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [pollMs]);

    return records;
}
