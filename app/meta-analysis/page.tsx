'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { TelemetryRecord } from '@/lib/telemetryStore';
import { DEMO_AGENT_TASKS } from '@/lib/demoAgents';
import { agentRuns, ownedAgents, superiorOf, usageByAgent, usageByOwner } from '@/lib/agentUsage';
import { shortModelName } from '@/lib/agentModels';
import { useOrgData } from '@/hooks/useOrgData';
import { useActivity } from '@/hooks/useActivity';
import ActivityFeed from '@/components/ActivityFeed';
import {
    CumulativeCostChart,
    Legend,
    StatusLabel,
    TokensByAgentChart,
    TokensPerRunChart,
    UsageBreakdownChart,
    formatCompact,
    formatMs,
    formatUsd,
    inputTokensOf,
    outputTokensOf,
    vizStyles,
} from '@/components/UsageCharts';

const SOURCE_FILTERS = [
    { id: 'all', label: 'All runs' },
    { id: 'manual', label: 'Manual' },
    { id: 'demo', label: 'Demo' },
    { id: 'investigation', label: 'Investigations' },
    { id: 'sample', label: 'Sample' },
];

const MAX_RUNS_IN_CHART = 40;

// One agent or one person (with their agents) that the charts, table and activity feed narrow to
interface Focus {
    label: string;
    ids: Set<string>;
}

export default function MetaAnalysisPage() {
    const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [sourceFilter, setSourceFilter] = useState('all');
    const [focus, setFocus] = useState<Focus | null>(null);
    const [demoRunning, setDemoRunning] = useState(false);
    const [demoDone, setDemoDone] = useState(0);
    const [activityLive, setActivityLive] = useState(true);
    const activity = useActivity(2000, activityLive);

    const fetchTelemetry = async () => {
        try {
            const res = await fetch('/api/telemetry');
            const data = await res.json();
            if (data.telemetry) {
                setTelemetry(data.telemetry);
            }
        } catch (err) {
            console.error('Failed to fetch telemetry:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTelemetry();
        const interval = setInterval(fetchTelemetry, 3000); // Poll every 3 seconds
        return () => clearInterval(interval);
    }, []);

    // Fire every demo agent at once; each one is a real Claude call
    const runDemoAgents = async () => {
        setDemoRunning(true);
        setDemoDone(0);
        await Promise.all(
            DEMO_AGENT_TASKS.map(async (task) => {
                try {
                    await fetch('/api/agent/run', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...task, source: 'demo' }),
                    });
                } catch (err) {
                    console.error('Demo agent failed:', err);
                } finally {
                    setDemoDone((d) => d + 1);
                    fetchTelemetry();
                }
            })
        );
        setDemoRunning(false);
    };

    const clearTelemetry = async () => {
        await fetch('/api/telemetry', { method: 'DELETE' });
        fetchTelemetry();
    };

    const loadSampleData = async () => {
        await fetch('/api/telemetry', { method: 'POST' });
        fetchTelemetry();
    };

    const { nodes } = useOrgData();

    // Agent runs only (oldest → newest), scoped by the source filter
    const sourceRuns = useMemo(
        () =>
            agentRuns(telemetry)
                .filter((r) => sourceFilter === 'all' || (r.source || 'manual') === sourceFilter)
                .sort((a, b) => Number(a.timestamp) - Number(b.timestamp)),
        [telemetry, sourceFilter]
    );
    const agentOptions = useMemo(() => [...usageByAgent(sourceRuns).values()].sort((a, b) => a.name.localeCompare(b.name)), [sourceRuns]);

    // ...then by the focused agent or person
    const runs = useMemo(
        () => (focus ? sourceRuns.filter((r) => r.agentId && focus.ids.has(r.agentId)) : sourceRuns),
        [sourceRuns, focus]
    );

    // Each agent's spend rolled up to the person it reports to
    const ownerRows = useMemo(() => usageByOwner(runs, nodes), [runs, nodes]);

    const focusAgent = (agentId: string, name: string) => setFocus({ label: name, ids: new Set([agentId]) });
    const focusPerson = (personId: string, name: string) => {
        if (personId === 'unassigned') {
            // Agents with no owner in the org, e.g. the investigator
            const nodeIds = new Set(nodes.map((n) => n.id));
            const orphans = agentOptions.filter((a) => !nodeIds.has(a.key) || !superiorOf(nodes.find((n) => n.id === a.key)!));
            setFocus({ label: name, ids: new Set(orphans.map((a) => a.key)) });
            return;
        }
        setFocus({ label: name, ids: new Set([personId, ...ownedAgents(personId, nodes).map((a) => a.id)]) });
    };

    // Aggregated Analytics
    const totalInput = runs.reduce((sum, r) => sum + inputTokensOf(r), 0);
    const totalOutput = runs.reduce((sum, r) => sum + outputTokensOf(r), 0);
    const totalCost = runs.reduce((sum, r) => sum + (r.costUsd || 0), 0);
    const failed = runs.filter((r) => r.status === 'FAILED' || r.status === 'REFUSED').length;
    const succeeded = runs.filter((r) => r.status !== 'FAILED' && r.status !== 'REFUSED');
    const avgLatency = succeeded.length
        ? succeeded.reduce((sum, r) => sum + (r.latencyMs || 0), 0) / succeeded.length
        : 0;
    const models = [...new Set(runs.map((r) => r.model).filter(Boolean))];

    const tokenLegend = [
        { label: 'Input', color: 'var(--series-input)' },
        { label: 'Output', color: 'var(--series-output)' },
    ];

    const clickHint = 'Click a bar to focus the page on it';

    return (
        <main className="usage-viz min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
            <style>{vizStyles}</style>
            <div className="max-w-[1400px] mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">
                            Analytics
                        </h1>
                        <p className="text-xs text-slate-400 mt-1">
                            Tokens, cost and latency for every Claude call your agents make, with a live activity feed
                        </p>
                    </div>
                    <Link
                        href="/"
                        className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-medium rounded-lg transition-colors"
                    >
                        ← Back to Org Tree
                    </Link>
                </div>

                {/* Filters & actions: scope everything below */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                            {SOURCE_FILTERS.map((f) => (
                                <button
                                    key={f.id}
                                    onClick={() => setSourceFilter(f.id)}
                                    className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${sourceFilter === f.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <select
                            aria-label="Focus on an agent"
                            value={focus && focus.ids.size === 1 ? [...focus.ids][0] : ''}
                            onChange={(e) => {
                                const agent = agentOptions.find((a) => a.key === e.target.value);
                                if (agent) focusAgent(agent.key, agent.name);
                                else setFocus(null);
                            }}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-300"
                        >
                            <option value="">All agents</option>
                            {agentOptions.map((a) => (
                                <option key={a.key} value={a.key}>{a.name}</option>
                            ))}
                        </select>
                        {focus && (
                            <span className="flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-xs text-indigo-200">
                                Focused on <b className="text-white">{focus.label}</b>
                                <button onClick={() => setFocus(null)} aria-label="Clear focus" className="w-5 h-5 rounded hover:bg-indigo-900 text-indigo-300">
                                    ✕
                                </button>
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadSampleData}
                            disabled={demoRunning}
                            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-40"
                        >
                            Load sample data
                        </button>
                        <button
                            onClick={clearTelemetry}
                            disabled={demoRunning || telemetry.length === 0}
                            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-40"
                        >
                            Clear data
                        </button>
                        <button
                            onClick={runDemoAgents}
                            disabled={demoRunning}
                            className="px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60"
                        >
                            {demoRunning
                                ? `Running agents… ${demoDone}/${DEMO_AGENT_TASKS.length}`
                                : `▶ Run ${DEMO_AGENT_TASKS.length} demo agents`}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
                    <div className="space-y-6 min-w-0">
                        {/* Stat tiles */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                                <span className="text-xs text-slate-400 font-medium block">Total tokens</span>
                                <span className="text-3xl font-semibold text-white mt-2 block">
                                    {formatCompact(totalInput + totalOutput)}
                                </span>
                                <span className="text-[11px] text-slate-500 mt-1 block">
                                    {formatCompact(totalInput)} in · {formatCompact(totalOutput)} out
                                </span>
                            </div>

                            <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                                <span className="text-xs text-slate-400 font-medium block">Estimated cost</span>
                                <span className="text-3xl font-semibold text-white mt-2 block">
                                    {formatUsd(totalCost)}
                                </span>
                                <span className="text-[11px] text-slate-500 mt-1 block truncate">
                                    {models.length ? models.map(shortModelName).join(', ') : 'List prices'}
                                </span>
                            </div>

                            <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                                <span className="text-xs text-slate-400 font-medium block">Agent runs</span>
                                <span className="text-3xl font-semibold text-white mt-2 block">
                                    {runs.length}
                                </span>
                                <span className="text-[11px] text-slate-500 mt-1 block">
                                    {failed ? (
                                        <span style={{ color: 'var(--status-critical)' }}>✕ {failed} failed or declined</span>
                                    ) : (
                                        'No failures'
                                    )}
                                </span>
                            </div>

                            <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                                <span className="text-xs text-slate-400 font-medium block">Avg latency</span>
                                <span className="text-3xl font-semibold text-white mt-2 block">
                                    {formatMs(avgLatency)}
                                </span>
                                <span className="text-[11px] text-slate-500 mt-1 block">Per successful run</span>
                            </div>
                        </div>

                        {loading ? (
                            <p className="text-xs text-slate-500 py-8 text-center">Loading telemetry...</p>
                        ) : runs.length === 0 ? (
                            <div className="p-10 bg-slate-900/60 border border-slate-800/80 rounded-xl text-center space-y-2">
                                <p className="text-sm text-slate-300">No agent runs recorded{focus ? ` for ${focus.label}` : ''} yet.</p>
                                <p className="text-xs text-slate-500">
                                    Run the demo agents above, or execute a task from the Org Visualizer or the Worker page.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Charts */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <h2 className="text-sm font-semibold text-white">Tokens per run</h2>
                                                <p className="text-[11px] text-slate-500">
                                                    {runs.length > MAX_RUNS_IN_CHART ? `Last ${MAX_RUNS_IN_CHART} runs` : 'Every run'}, oldest to newest
                                                </p>
                                            </div>
                                            <Legend items={tokenLegend} />
                                        </div>
                                        <TokensPerRunChart
                                            runs={runs.slice(-MAX_RUNS_IN_CHART)}
                                            onSelect={(r) => r.agentId && focusAgent(r.agentId, r.agentName || r.agentId)}
                                        />
                                    </div>

                                    <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-3">
                                        <div>
                                            <h2 className="text-sm font-semibold text-white">Cumulative cost</h2>
                                            <p className="text-[11px] text-slate-500">Estimated from list prices per model</p>
                                        </div>
                                        <CumulativeCostChart runs={runs} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <h2 className="text-sm font-semibold text-white">Tokens by agent</h2>
                                                <p className="text-[11px] text-slate-500">{clickHint}</p>
                                            </div>
                                            <Legend items={tokenLegend} />
                                        </div>
                                        <TokensByAgentChart runs={runs} onSelect={(row) => focusAgent(row.key, row.name)} />
                                    </div>

                                    <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <h2 className="text-sm font-semibold text-white">Cost by person</h2>
                                                <p className="text-[11px] text-slate-500">Agent usage counted toward the person it reports to</p>
                                            </div>
                                            <Legend items={tokenLegend} />
                                        </div>
                                        <UsageBreakdownChart
                                            rows={ownerRows}
                                            label="Agent tokens per person"
                                            onSelect={(row) => focusPerson(row.key, row.name)}
                                        />
                                    </div>
                                </div>

                                {/* Telemetry table */}
                                <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-4">
                                    <h2 className="text-sm font-semibold text-white">All runs</h2>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead>
                                                <tr className="border-b border-slate-800 text-slate-400 font-medium">
                                                    <th className="pb-3 px-2">Time</th>
                                                    <th className="pb-3 px-2">Agent</th>
                                                    <th className="pb-3 px-2">Status</th>
                                                    <th className="pb-3 px-2">Model</th>
                                                    <th className="pb-3 px-2 text-right">Input</th>
                                                    <th className="pb-3 px-2 text-right">Output</th>
                                                    <th className="pb-3 px-2 text-right">Cost</th>
                                                    <th className="pb-3 px-2 text-right">Latency</th>
                                                    <th className="pb-3 px-2">Output preview</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                                {runs.slice().reverse().map((record) => (
                                                    <tr key={record.id} className="hover:bg-slate-800/30 transition-colors">
                                                        <td className="py-3 px-2 tabular-nums text-slate-500">
                                                            {new Date(record.timestamp).toLocaleTimeString()}
                                                        </td>
                                                        <td className="py-3 px-2 font-medium text-slate-200">
                                                            <button
                                                                onClick={() => record.agentId && focusAgent(record.agentId, record.agentName || record.agentId)}
                                                                className="hover:text-indigo-300 hover:underline text-left"
                                                            >
                                                                {record.agentName}
                                                            </button>
                                                            <span className="block text-[10px] text-slate-500">{record.source || 'manual'}</span>
                                                        </td>
                                                        <td className="py-3 px-2 whitespace-nowrap">
                                                            <StatusLabel status={record.status} />
                                                        </td>
                                                        <td className="py-3 px-2 whitespace-nowrap text-slate-400">{shortModelName(record.model)}</td>
                                                        <td className="py-3 px-2 text-right tabular-nums">{inputTokensOf(record).toLocaleString()}</td>
                                                        <td className="py-3 px-2 text-right tabular-nums">{outputTokensOf(record).toLocaleString()}</td>
                                                        <td className="py-3 px-2 text-right tabular-nums">{formatUsd(record.costUsd)}</td>
                                                        <td className="py-3 px-2 text-right tabular-nums">{formatMs(record.latencyMs)}</td>
                                                        <td className="py-3 px-2 text-slate-400 max-w-xs truncate">
                                                            {record.error || record.resultText}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Live activity, scoped by the same focus */}
                    <aside className="flex flex-col p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl h-[70vh] xl:h-[calc(100vh-4rem)] xl:sticky xl:top-8">
                        <div className="flex items-center justify-between gap-2 pb-3 mb-1 border-b border-slate-800">
                            <div>
                                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                                    Live activity
                                    <span className={`w-2 h-2 rounded-full ${activityLive ? 'bg-[#0ca30c] animate-pulse' : 'bg-slate-600'}`} />
                                </h2>
                                <p className="text-[11px] text-slate-500">
                                    {focus ? `Events for ${focus.label}` : 'API calls, tool calls, tasks and system events'}
                                </p>
                            </div>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={() => setActivityLive((l) => !l)}
                                    className="px-2 py-1 text-[11px] rounded-md border border-slate-800 text-slate-300 hover:border-slate-700"
                                >
                                    {activityLive ? '❚❚ Pause' : '▶ Resume'}
                                </button>
                                <button
                                    onClick={activity.clear}
                                    disabled={activity.events.length === 0}
                                    className="px-2 py-1 text-[11px] rounded-md border border-slate-800 text-slate-300 hover:border-slate-700 disabled:opacity-40"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 pt-2">
                            <ActivityFeed events={activity.events} loaded={activity.loaded} actorIds={focus?.ids} />
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
}
