'use client';

import { useEffect, useState } from 'react';
import type { TelemetryRecord } from '@/lib/telemetryStore';

// Polls the server's agent telemetry (newest first, as stored), the default model
// for new runs, and each agent's assigned model
export function useTelemetry(pollMs = 5000) {
    const [records, setRecords] = useState<TelemetryRecord[]>([]);
    const [defaultModel, setDefaultModel] = useState<string | null>(null);
    const [agentModels, setAgentModels] = useState<Record<string, string>>({});
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let active = true;

        const load = async () => {
            try {
                const res = await fetch('/api/telemetry');
                if (!res.ok) return;

                const data = await res.json();
                if (!active) return;

                if (data.telemetry) setRecords(data.telemetry);
                if (data.model) setDefaultModel(data.model);
                if (data.agentModels) setAgentModels(data.agentModels);
            } catch {
                // Ignore network/dev-server reload errors during polling
            }
        };

        load();
        const interval = setInterval(load, pollMs);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [pollMs, version]);

    // Reload now instead of waiting for the next poll
    const refresh = () => setVersion((v) => v + 1);

    return { records, defaultModel, agentModels, refresh };
}