'use client';

import React, { useMemo, useState } from 'react';
import type { ActivityEvent, ActivityKind, ActivityLevel } from '@/lib/activityLog';
import { shortModelName } from '@/lib/agentModels';
import { formatCompact, formatMs, formatUsd } from '@/components/UsageCharts';

// Live timeline of the shared activity log, embedded beside the analytics and in the node inspector

const KIND_LABELS: Record<ActivityKind, { icon: string; label: string }> = {
    API_CALL: { icon: '⇄', label: 'API call' },
    TOOL_CALL: { icon: '🔧', label: 'Tool call' },
    TASK: { icon: '☑', label: 'Task' },
    ORG: { icon: '👥', label: 'Org' },
    HUMAN: { icon: '👤', label: 'Human' },
    SYSTEM: { icon: '⚙', label: 'System' },
};

const FILTERS: { id: 'ALL' | ActivityKind; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'API_CALL', label: 'API' },
    { id: 'TOOL_CALL', label: 'Tools' },
    { id: 'TASK', label: 'Tasks' },
    { id: 'ORG', label: 'Org' },
    { id: 'HUMAN', label: 'Human' },
    { id: 'SYSTEM', label: 'System' },
];

// Status colors carry level, always paired with an icon
const LEVEL_STYLES: Record<ActivityLevel, { border: string; icon: string; text: string }> = {
    info: { border: 'border-l-slate-700', icon: '', text: 'text-slate-400' },
    success: { border: 'border-l-[#0ca30c]', icon: '✓', text: 'text-[#0ca30c]' },
    warning: { border: 'border-l-[#fab219]', icon: '⚠', text: 'text-[#fab219]' },
    error: { border: 'border-l-[#d03b3b]', icon: '✕', text: 'text-[#e66767]' },
};

function MetaChips({ event }: { event: ActivityEvent }) {
    const m = event.meta;
    if (!m) return null;
    const chips: string[] = [];
    if (m.model) chips.push(shortModelName(m.model));
    if (m.inputTokens !== undefined || m.outputTokens !== undefined) {
        chips.push(`${formatCompact(m.inputTokens || 0)} in · ${formatCompact(m.outputTokens || 0)} out`);
    }
    if (m.costUsd !== undefined && m.costUsd !== null) chips.push(formatUsd(m.costUsd));
    if (m.latencyMs !== undefined) chips.push(formatMs(m.latencyMs));
    if (m.tool) chips.push(m.tool);
    if (!chips.length) return null;
    return (
        <div className="flex flex-wrap gap-1">
            {chips.map((chip) => (
                <span key={chip} className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-[10px] font-mono text-slate-300">
                    {chip}
                </span>
            ))}
        </div>
    );
}

export default function ActivityFeed({
    events,
    loaded = true,
    actorIds,
    compact = false,
    limit = 200,
    emptyText = 'Nothing has happened yet. Run an agent or change a task to see events here.',
}: {
    events: ActivityEvent[];
    loaded?: boolean;
    actorIds?: Set<string> | null; // only events by these actors
    compact?: boolean; // no filter controls, smaller rows
    limit?: number;
    emptyText?: string;
}) {
    const [kindFilter, setKindFilter] = useState<'ALL' | ActivityKind>('ALL');
    const [problemsOnly, setProblemsOnly] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);

    const scoped = useMemo(
        () => (actorIds ? events.filter((e) => e.actorId && actorIds.has(e.actorId)) : events),
        [events, actorIds]
    );

    // Requests that have a matching response or error; the rest are still in flight
    const answered = useMemo(() => {
        const ids = new Set<string>();
        for (const e of scoped) if (e.kind === 'API_CALL' && e.level !== 'info' && e.meta?.requestId) ids.add(e.meta.requestId);
        return ids;
    }, [scoped]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: scoped.length };
        for (const e of scoped) c[e.kind] = (c[e.kind] || 0) + 1;
        return c;
    }, [scoped]);

    const visible = scoped
        .filter((e) => (kindFilter === 'ALL' || e.kind === kindFilter) && (!problemsOnly || e.level === 'error' || e.level === 'warning'))
        .slice(0, limit);

    return (
        <div className="flex flex-col min-h-0 h-full">
            {!compact && (
                <div className="flex flex-wrap items-center gap-2 pb-3">
                    <div className="flex flex-wrap gap-1">
                        {FILTERS.map((f) => (
                            <button
                                key={f.id}
                                onClick={() => setKindFilter(f.id)}
                                className={`px-2 py-1 text-[11px] rounded-md font-medium transition-colors ${kindFilter === f.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}
                            >
                                {f.label}
                                <span className="ml-1 text-[10px] text-slate-500 tabular-nums">{counts[f.id] || 0}</span>
                            </button>
                        ))}
                    </div>
                    <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                        <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} className="accent-indigo-500" />
                        Problems only
                    </label>
                </div>
            )}

            {!loaded ? (
                <p className="text-xs text-slate-500 py-6 text-center">Loading activity…</p>
            ) : visible.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">{scoped.length ? 'No events match these filters.' : emptyText}</p>
            ) : (
                <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-800/70 -mx-1">
                    {visible.map((e) => {
                        const kind = KIND_LABELS[e.kind] ?? KIND_LABELS.SYSTEM;
                        const level = LEVEL_STYLES[e.level] ?? LEVEL_STYLES.info;
                        const isOpen = expanded === e.id;
                        const waiting = e.kind === 'API_CALL' && e.level === 'info' && e.meta?.requestId && !answered.has(e.meta.requestId);
                        const isResponse = e.kind === 'API_CALL' && e.level !== 'info';
                        return (
                            <li key={e.id} className={`border-l-2 ${level.border}`}>
                                <button
                                    onClick={() => setExpanded(isOpen ? null : e.id)}
                                    className={`w-full text-left ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'} hover:bg-slate-800/30 transition-colors space-y-1`}
                                >
                                    <span className="flex items-center gap-2 text-[10px] text-slate-500">
                                        <span className="font-mono tabular-nums">
                                            {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                        <span>
                                            {kind.icon} {kind.label}
                                        </span>
                                        {level.icon && <span className={level.text}>{level.icon} {e.level}</span>}
                                        {waiting && <span className="animate-pulse">waiting for response…</span>}
                                    </span>
                                    <span className={`block ${compact ? 'text-xs' : 'text-[13px]'} text-slate-200 leading-snug`}>
                                        {isResponse && <span className="text-slate-600 mr-1">↳</span>}
                                        {e.actorName && <span className="font-semibold text-white mr-1">{e.actorName}</span>}
                                        {e.title}
                                    </span>
                                    {e.detail && (
                                        <span className={`block text-[11px] text-slate-400 ${isOpen ? 'whitespace-pre-wrap max-h-72 overflow-y-auto' : 'truncate'}`}>
                                            {e.detail}
                                        </span>
                                    )}
                                    <MetaChips event={e} />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
