'use client';

import React from 'react';
import type { OrgNode } from '@/hooks/useOrgData';
import { UsageRow, UsageTotals, ownedAgents, sumTotals, teamAgentIds } from '@/lib/agentUsage';
import { formatCompact, formatMs, formatUsd } from '@/components/UsageCharts';

const INPUT_COLOR = '#3987e5';
const OUTPUT_COLOR = '#d95926';

function TotalsLine({ label, totals }: { label: string; totals: UsageTotals }) {
    return (
        <div className="flex items-baseline justify-between text-xs">
            <span className="text-slate-400">{label}</span>
            <span className="tabular-nums text-slate-200">
                <span className="font-semibold text-white">{formatUsd(totals.cost)}</span>
                {' · '}
                {formatCompact(totals.input + totals.output)} tok
                {' · '}
                {totals.runs} run{totals.runs === 1 ? '' : 's'}
            </span>
        </div>
    );
}

// Input/output split bar, scaled against the largest agent in the list
function SplitBar({ row, max }: { row: UsageRow; max: number }) {
    const inPct = (row.input / max) * 100;
    const outPct = (row.output / max) * 100;
    return (
        <div className="flex h-2 w-full items-center gap-[2px]" title={`${row.input.toLocaleString()} in · ${row.output.toLocaleString()} out`}>
            {inPct > 0 && <div className="h-full" style={{ width: `${inPct}%`, background: INPUT_COLOR, borderRadius: outPct > 0 ? 0 : '0 4px 4px 0' }} />}
            {outPct > 0 && <div className="h-full" style={{ width: `${outPct}%`, background: OUTPUT_COLOR, borderRadius: '0 4px 4px 0' }} />}
        </div>
    );
}

export default function AgentSpendPanel({
    node,
    nodes,
    byAgent,
}: {
    node: OrgNode;
    nodes: OrgNode[];
    byAgent: Map<string, UsageRow>;
}) {
    // An agent: its own usage
    if (node.type === 'Agent') {
        const own = byAgent.get(node.id);
        const succeeded = own ? own.runs - own.failed : 0;
        return (
            <div className="border-t border-slate-800 pt-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">AI Usage</h3>
                {!own ? (
                    <p className="text-xs text-slate-500 italic">No runs recorded for this agent yet.</p>
                ) : (
                    <>
                        <TotalsLine label="Total" totals={own} />
                        <div className="flex justify-between text-[11px] text-slate-400">
                            <span>{own.input.toLocaleString()} in · {own.output.toLocaleString()} out</span>
                            <span>{succeeded ? `${formatMs(own.latencyMs / succeeded)} avg` : ''}</span>
                        </div>
                        {own.failed > 0 && <p className="text-[11px] text-red-400">✕ {own.failed} failed run{own.failed === 1 ? '' : 's'}</p>}
                    </>
                )}
            </div>
        );
    }

    // A person: the agents they own, then their whole team's agents
    const direct = ownedAgents(node.id, nodes)
        .map((a) => byAgent.get(a.id) || { key: a.id, name: a.name, input: 0, output: 0, cost: 0, runs: 0, failed: 0, latencyMs: 0 })
        .sort((a, b) => b.cost - a.cost);
    const directTotals = sumTotals(direct.map((r) => r.key), byAgent);
    const teamIds = teamAgentIds(node.id, nodes);
    const teamTotals = sumTotals(teamIds, byAgent);
    const hasTeamBeyondDirect = teamIds.size > direct.length;
    const max = Math.max(1, ...direct.map((r) => r.input + r.output));

    return (
        <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Agent Spend</h3>
                <span className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: INPUT_COLOR }} />In</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: OUTPUT_COLOR }} />Out</span>
                </span>
            </div>

            {direct.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No agents report to {node.name}.</p>
            ) : (
                <div className="space-y-2.5">
                    {direct.map((row) => (
                        <div key={row.key} className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                                <span className="text-slate-300">{row.name}</span>
                                <span className="tabular-nums text-slate-400">
                                    {row.runs ? `${formatCompact(row.input + row.output)} · ${formatUsd(row.cost)}` : 'no runs'}
                                </span>
                            </div>
                            <SplitBar row={row} max={max} />
                        </div>
                    ))}
                </div>
            )}

            <div className="space-y-1.5 rounded-lg bg-slate-950 border border-slate-800 p-2.5">
                <TotalsLine label="Own agents" totals={directTotals} />
                {hasTeamBeyondDirect && <TotalsLine label={`Whole team (${teamIds.size} agents)`} totals={teamTotals} />}
            </div>
        </div>
    );
}
