'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useOrgData } from '@/hooks/useOrgData'; // Uses existing hook
import { getStatusColor } from '@/app/page';
import UserMenu from '@/components/UserMenu';

export default function WorkerPortalPage() {
    const { nodes, tasks, updateNodeStatus, toggleTask, addTask } = useOrgData();

    // 1. All Worker nodes available to impersonate
    const workerNodes = useMemo(
        () => nodes.filter((n) => n.type === 'Worker'),
        [nodes]
    );

    // Selected Worker ID (Defaults to first worker)
    const [activeWorkerId, setActiveWorkerId] = useState<string>(
        workerNodes[0]?.id || 'node-6'
    );

    const activeWorker = nodes.find((n) => n.id === activeWorkerId);

    // 2. Agents reporting directly to this worker
    const assignedAgents = useMemo(
        () => nodes.filter((n) => n.type === 'Agent' && n.superior === activeWorkerId),
        [nodes, activeWorkerId]
    );

    // 3. Tasks assigned to this worker
    const workerTasks = useMemo(
        () => tasks.filter((t) => t.assignedNodeId === activeWorkerId),
        [tasks, activeWorkerId]
    );

    // Agent Dispatch State
    const [selectedAgentId, setSelectedAgentId] = useState<string>('');
    const [customPrompt, setCustomPrompt] = useState<string>('');
    const [isExecuting, setIsExecuting] = useState<boolean>(false);
    const [agentOutput, setAgentOutput] = useState<string | null>(null);

    // Handle Agent Command Dispatch
    const handleDispatchAgent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAgentId || !customPrompt.trim()) return;

        const targetAgent = nodes.find((n) => n.id === selectedAgentId);
        if (!targetAgent) return;

        setIsExecuting(true);
        setAgentOutput(null);
        updateNodeStatus(targetAgent.id, 'Busy');

        try {
            const res = await fetch('/api/agent/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: targetAgent.id,
                    agentName: targetAgent.name,
                    prompt: customPrompt,
                }),
            });

            const data = await res.json();
            if (data.success) {
                setAgentOutput(data.resultText);
                setCustomPrompt('');
            }
        } catch (err) {
            console.error('Agent dispatch failed:', err);
        } finally {
            setIsExecuting(false);
            updateNodeStatus(targetAgent.id, 'Idle');
        }
    };

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header Navigation */}
                <header className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-bold text-white">Worker Workspace</h1>
                        {/* Worker Selector */}
                        <select
                            value={activeWorkerId}
                            onChange={(e) => setActiveWorkerId(e.target.value)}
                            className="bg-slate-900 border border-slate-800 text-xs text-indigo-300 font-semibold px-3 py-1.5 rounded-lg focus:outline-none"
                        >
                            {workerNodes.map((w) => (
                                <option key={w.id} value={w.id}>
                                    Impersonate: {w.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-4">
                        <UserMenu compact />
                        <Link
                            href="/"
                            className="px-3 py-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 transition-colors"
                        >
                            ← Back to Org Tree
                        </Link>
                    </div>
                </header>

                {/* Status Bar */}
                {activeWorker && (
                    <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between">
                        <div>
                            <span className="text-xs text-slate-400 block">Logged in as</span>
                            <span className="text-lg font-bold text-white">{activeWorker.name}</span>
                        </div>

                        {/* Set Operational Status */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 mr-2">Set My Status:</span>
                            {['Active', 'Busy', 'Idle', 'Offline'].map((status) => {
                                const isCurrent = activeWorker.status === status;
                                return (
                                    <button
                                        key={status}
                                        onClick={() => updateNodeStatus(activeWorker.id, status)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${isCurrent
                                                ? getStatusColor(status).badge + ' ring-1 ring-indigo-500'
                                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                                            }`}
                                    >
                                        {status}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 2-Column Dashboard Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column: Personal Task Desk */}
                    <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-xl space-y-4">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                            My Assigned Tasks ({workerTasks.length})
                        </h2>

                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {workerTasks.length === 0 ? (
                                <p className="text-xs text-slate-500 italic">No active tasks.</p>
                            ) : (
                                workerTasks.map((task) => (
                                    <div
                                        key={task.id}
                                        className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={task.completed}
                                                onChange={() => toggleTask(task.id)}
                                                className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                                            />
                                            <span
                                                className={`text-xs ${task.completed ? 'line-through text-slate-500' : 'text-slate-200'
                                                    }`}
                                            >
                                                {task.title}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Right Column: Fleet Command & Dispatch */}
                    <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-xl space-y-4">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400">
                            My Agent Fleet ({assignedAgents.length})
                        </h2>

                        {/* List of My Subordinate Agents */}
                        <div className="grid grid-cols-2 gap-2">
                            {assignedAgents.map((agent) => (
                                <div
                                    key={agent.id}
                                    className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between"
                                >
                                    <span className="text-xs font-semibold text-slate-200 truncate">
                                        {agent.name}
                                    </span>
                                    <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(agent.status).dot}`} />
                                </div>
                            ))}
                        </div>

                        {/* Prompt Dispatcher Form */}
                        <form onSubmit={handleDispatchAgent} className="space-y-3 border-t border-slate-800 pt-4">
                            <label className="text-xs font-semibold text-slate-300 block">
                                Command AI Agent
                            </label>

                            <select
                                value={selectedAgentId}
                                onChange={(e) => setSelectedAgentId(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                                required
                            >
                                <option value="">Select an assigned agent...</option>
                                {assignedAgents.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name} ({a.status || 'Idle'})
                                    </option>
                                ))}
                            </select>

                            <textarea
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                placeholder="Enter prompt instructions for the agent..."
                                className="w-full h-20 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                                required
                            />

                            <button
                                type="submit"
                                disabled={isExecuting}
                                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors"
                            >
                                {isExecuting ? 'Agent Working...' : '⚡ Dispatch Agent Prompt'}
                            </button>
                        </form>

                        {/* Output Feed */}
                        {agentOutput && (
                            <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-lg space-y-1">
                                <span className="text-[10px] font-bold uppercase text-indigo-400 block">
                                    Agent Response
                                </span>
                                <p className="text-xs text-slate-200 whitespace-pre-wrap">{agentOutput}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}