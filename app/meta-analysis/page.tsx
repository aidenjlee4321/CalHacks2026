'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { TelemetryRecord } from '@/lib/telemetryStore';

export default function MetaAnalysisPage() {
    const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([]);
    const [loading, setLoading] = useState(true);

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

    // Aggregated Analytics
    const totalTokens = telemetry.reduce((sum, r) => sum + (r.tokens || 0), 0);
    const totalCompleted = telemetry.filter((r) => r.status !== 'FAILED').length;
    const avgLatency = telemetry.length
        ? Math.round(
            telemetry.reduce((sum, r) => sum + (r.latencyMs || 0), 0) / telemetry.length
        )
        : 0;

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">
                            Meta Analysis Dashboard
                        </h1>
                        <p className="text-xs text-slate-400 mt-1">
                            Live API telemetry & agent efficiency analytics
                        </p>
                    </div>
                    <Link
                        href="/"
                        className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-medium rounded-lg transition-colors"
                    >
                        ← Back to Org Tree
                    </Link>
                </div>

                {/* Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                        <span className="text-xs text-slate-400 font-medium block">Total Tokens Used</span>
                        <span className="text-3xl font-extrabold text-indigo-400 mt-2 block">
                            {totalTokens.toLocaleString()}
                        </span>
                        <span className="text-[11px] text-slate-500 mt-1 block">Prompt + Completion</span>
                    </div>

                    <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                        <span className="text-xs text-slate-400 font-medium block">Tasks Completed</span>
                        <span className="text-3xl font-extrabold text-emerald-400 mt-2 block">
                            {totalCompleted}
                        </span>
                        <span className="text-[11px] text-slate-500 mt-1 block">From {telemetry.length} API calls</span>
                    </div>

                    <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                        <span className="text-xs text-slate-400 font-medium block">Avg Execution Latency</span>
                        <span className="text-3xl font-extrabold text-amber-400 mt-2 block">
                            {avgLatency} <span className="text-base font-normal">ms</span>
                        </span>
                        <span className="text-[11px] text-slate-500 mt-1 block">Per task execution</span>
                    </div>

                    <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                        <span className="text-xs text-slate-400 font-medium block">Success Rate</span>
                        <span className="text-3xl font-extrabold text-cyan-400 mt-2 block">
                            {telemetry.length ? '100%' : '0%'}
                        </span>
                        <span className="text-[11px] text-slate-500 mt-1 block">Active vs Failed</span>
                    </div>
                </div>

                {/* Telemetry Stream */}
                <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-4">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                        Live Agent Telemetry Stream
                    </h2>

                    {loading ? (
                        <p className="text-xs text-slate-500 py-8 text-center">Loading telemetry...</p>
                    ) : telemetry.length === 0 ? (
                        <p className="text-xs text-slate-500 py-8 text-center">
                            No API executions recorded yet. Trigger an agent from the Org Visualizer!
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                                        <th className="pb-3 px-2">Timestamp</th>
                                        <th className="pb-3 px-2">Agent</th>
                                        <th className="pb-3 px-2">Tokens</th>
                                        <th className="pb-3 px-2">Duration</th>
                                        <th className="pb-3 px-2">Output Preview</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                    {telemetry.map((record) => (
                                        <tr key={record.id} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="py-3 px-2 font-mono text-slate-500">
                                                {new Date(record.timestamp).toLocaleTimeString()}
                                            </td>
                                            <td className="py-3 px-2 font-medium text-indigo-300">
                                                {record.agentName}
                                            </td>
                                            <td className="py-3 px-2 font-mono">{record.tokens || 0}</td>
                                            <td className="py-3 px-2 font-mono text-amber-300">
                                                {record.latencyMs} ms
                                            </td>
                                            <td className="py-3 px-2 text-slate-400 max-w-md truncate">
                                                {record.resultText}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}