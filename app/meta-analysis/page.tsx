'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { TelemetryRecord } from '@/lib/telemetryStore';
import { DEMO_AGENT_TASKS } from '@/lib/demoAgents';
import { agentRuns, usageByOwner } from '@/lib/agentUsage';
import { shortModelName } from '@/lib/agentModels';
import { useOrgData } from '@/hooks/useOrgData';
import UserMenu from '@/components/UserMenu';
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

export default function MetaAnalysisPage() {
    const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [sourceFilter, setSourceFilter] = useState('all');
    const [demoRunning, setDemoRunning] = useState(false);
    const [demoDone, setDemoDone] = useState(0);

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

    // A lead only sees runs from agents in their own team
    const { nodes, visibleIds } = useOrgData();

    // Agent runs only (oldest → newest), scoped by the source filter
    const runs = useMemo(
        () =>
            agentRuns(telemetry)
                .filter((r) => !visibleIds || visibleIds.has(r.agentId || ''))
                .filter((r) => sourceFilter === 'all' || (r.source || 'manual') === sourceFilter)
                .sort((a, b) => Number(a.timestamp) - Number(b.timestamp)),
        [telemetry, sourceFilter, visibleIds]
    );

    // Each agent's spend rolled up to the person it reports to
    const ownerRows = useMemo(() => usageByOwner(runs, nodes), [runs, nodes]);

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

    return (
        <main className="usage-viz min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
            <style>{vizStyles}</style>
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">
                            AI Usage
                        </h1>
                        <p className="text-xs text-slate-400 mt-1">
                            Tokens, cost and latency for every Claude call your agents make
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <UserMenu compact />
                        <Link
                            href="/"
                            className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-medium rounded-lg transition-colors"
                        >
                            ← Back to Org Tree
                        </Link>
                    </div>
                </div>

                {/* Filters & actions */}
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                            {models.length ? models.join(', ') : 'List prices'}
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
                        <p className="text-sm text-slate-300">No agent runs recorded yet.</p>
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
                                <TokensPerRunChart runs={runs.slice(-MAX_RUNS_IN_CHART)} />
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
                                        <p className="text-[11px] text-slate-500">Which agents use the most, with cost</p>
                                    </div>
                                    <Legend items={tokenLegend} />
                                </div>
                                <TokensByAgentChart runs={runs} />
                            </div>

                            <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h2 className="text-sm font-semibold text-white">Cost by person</h2>
                                        <p className="text-[11px] text-slate-500">Each agent&apos;s usage, counted toward the person it reports to</p>
                                    </div>
                                    <Legend items={tokenLegend} />
                                </div>
                                <UsageBreakdownChart rows={ownerRows} label="Agent tokens per person" />
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
                                                    {record.agentName}
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
        </main>
    );
}
