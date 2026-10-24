'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TelemetryRecord } from '@/lib/telemetryStore';
import { UsageRow, inputTokensOf, outputTokensOf, usageByAgent } from '@/lib/agentUsage';
import { shortModelName } from '@/lib/agentModels';

export { inputTokensOf, outputTokensOf };

// ============================================================================
// FORMATTING & SCALES
// ============================================================================

export function formatCompact(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(Math.round(n));
}

export function formatUsd(n: number | null | undefined) {
    if (n === null || n === undefined) return '—';
    if (n === 0) return '$0';
    if (n < 0.01) return `$${n.toFixed(4)}`;
    if (n < 1) return `$${n.toFixed(3)}`;
    return `$${n.toFixed(2)}`;
}

export function formatMs(ms: number | undefined) {
    if (!ms) return '0 ms';
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

// Round an axis max up to 1/2/5 x 10^n and return evenly spaced ticks
function niceTicks(max: number, count = 4) {
    if (max <= 0) return { max: 1, ticks: [0, 1] };
    const rough = max / count;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
    const top = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
    return { max: top, ticks };
}

// Rectangle with 4px rounded top corners, square at the baseline
function roundedTopRect(x: number, y: number, w: number, h: number, r = 4) {
    const rr = Math.min(r, w / 2, h);
    return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

// Rectangle with 4px rounded right corners, square at the left baseline
function roundedRightRect(x: number, y: number, w: number, h: number, r = 4) {
    const rr = Math.min(r, h / 2, w);
    return `M${x},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} H${x} Z`;
}

function useWidth<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        if (!ref.current) return;
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);
    return [ref, width] as const;
}

// ============================================================================
// SHARED CHROME
// ============================================================================

// Chart tokens: categorical slots 1-2 (validated against the slate-900 surface), status, ink
export const vizStyles = `
.usage-viz {
  --surface: #0f172a;
  --ink-1: #f1f5f9;
  --ink-2: #cbd5e1;
  --muted: #94a3b8;
  --grid: #1e293b;
  --axis: #334155;
  --series-input: #3987e5;
  --series-output: #d95926;
  --status-good: #0ca30c;
  --status-warning: #fab219;
  --status-critical: #d03b3b;
}
`;

export function Legend({ items }: { items: { label: string; color: string }[] }) {
    return (
        <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--ink-2)' }}>
            {items.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
                    {item.label}
                </span>
            ))}
        </div>
    );
}

interface TooltipRow {
    label: string;
    value: string;
    color?: string;
}

function Tooltip({ x, y, width, title, rows }: { x: number; y: number; width: number; title: string; rows: TooltipRow[] }) {
    const tipW = 190;
    const left = Math.max(0, Math.min(x + 12, width - tipW));
    return (
        <div
            className="pointer-events-none absolute z-10 rounded-lg border px-3 py-2 text-[11px] shadow-lg"
            style={{ left, top: Math.max(0, y - 10), width: tipW, background: '#020617', borderColor: 'var(--axis)' }}
        >
            <div className="mb-1 truncate" style={{ color: 'var(--muted)' }}>{title}</div>
            {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
                        {row.color && <span className="inline-block w-3 h-0.5 rounded" style={{ background: row.color }} />}
                        {row.label}
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--ink-1)' }}>{row.value}</span>
                </div>
            ))}
        </div>
    );
}

function StatusLabel({ status }: { status?: string }) {
    if (status === 'FAILED') return <span style={{ color: 'var(--status-critical)' }}>✕ Failed</span>;
    if (status === 'REFUSED') return <span style={{ color: 'var(--status-warning)' }}>⚠ Declined</span>;
    return <span style={{ color: 'var(--status-good)' }}>✓ Success</span>;
}

// ============================================================================
// 1. TOKENS PER RUN (stacked columns, oldest → newest)
// ============================================================================

export function TokensPerRunChart({ runs, onSelect }: { runs: TelemetryRecord[]; onSelect?: (run: TelemetryRecord) => void }) {
    const [ref, width] = useWidth<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);

    const height = 220;
    const m = { top: 12, right: 8, bottom: 26, left: 44 };
    const plotW = Math.max(0, width - m.left - m.right);
    const plotH = height - m.top - m.bottom;

    const totals = runs.map((r) => inputTokensOf(r) + outputTokensOf(r));
    const { max, ticks } = niceTicks(Math.max(0, ...totals));
    const y = (v: number) => m.top + plotH - (v / max) * plotH;

    const slot = runs.length ? plotW / runs.length : 0;
    const barW = Math.max(2, Math.min(24, slot * 0.6));
    const gap = 2;

    const hovered = hover !== null ? runs[hover] : null;

    return (
        <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
            {width > 0 && (
                <svg width={width} height={height} role="img" aria-label="Tokens per agent run, input and output">
                    {ticks.map((t) => (
                        <g key={t}>
                            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
                            <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--muted)" className="tabular-nums">
                                {formatCompact(t)}
                            </text>
                        </g>
                    ))}

                    {runs.map((r, i) => {
                        const cx = m.left + slot * i + slot / 2;
                        const x = cx - barW / 2;
                        const input = inputTokensOf(r);
                        const output = outputTokensOf(r);
                        const inputH = (input / max) * plotH;
                        const outputH = (output / max) * plotH;
                        const dim = hover !== null && hover !== i ? 0.45 : 1;
                        const failed = r.status === 'FAILED';

                        return (
                            <g key={r.id} opacity={dim}>
                                {failed ? (
                                    <circle cx={cx} cy={y(0) - 6} r={4} fill="var(--status-critical)" stroke="var(--surface)" strokeWidth={2} />
                                ) : (
                                    <>
                                        {inputH > 0 && (
                                            <path
                                                d={output > 0 ? `M${x},${y(0)} h${barW} v${-inputH} h${-barW} Z` : roundedTopRect(x, y(0) - inputH, barW, inputH)}
                                                fill="var(--series-input)"
                                            />
                                        )}
                                        {outputH > 0 && (
                                            <path
                                                d={roundedTopRect(x, y(0) - inputH - gap - outputH, barW, Math.max(outputH, 1))}
                                                fill="var(--series-output)"
                                            />
                                        )}
                                    </>
                                )}
                                <rect
                                    x={m.left + slot * i}
                                    y={m.top}
                                    width={slot}
                                    height={plotH}
                                    fill="transparent"
                                    tabIndex={0}
                                    style={onSelect ? { cursor: 'pointer' } : undefined}
                                    onClick={() => onSelect?.(r)}
                                    onMouseEnter={() => setHover(i)}
                                    onFocus={() => setHover(i)}
                                    onBlur={() => setHover(null)}
                                />
                            </g>
                        );
                    })}

                    {runs.length > 0 && (
                        <>
                            <text x={m.left} y={height - 8} fontSize={10} fill="var(--muted)">
                                {new Date(runs[0].timestamp).toLocaleTimeString()}
                            </text>
                            <text x={width - m.right} y={height - 8} fontSize={10} fill="var(--muted)" textAnchor="end">
                                {new Date(runs[runs.length - 1].timestamp).toLocaleTimeString()}
                            </text>
                        </>
                    )}
                </svg>
            )}

            {hovered && hover !== null && (
                <Tooltip
                    x={m.left + slot * hover + slot / 2}
                    y={m.top}
                    width={width}
                    title={`${hovered.agentName} · ${new Date(hovered.timestamp).toLocaleTimeString()}`}
                    rows={
                        hovered.status === 'FAILED'
                            ? [{ label: 'Status', value: 'Failed' }]
                            : [
                                  { label: 'Output', value: outputTokensOf(hovered).toLocaleString(), color: 'var(--series-output)' },
                                  { label: 'Input', value: inputTokensOf(hovered).toLocaleString(), color: 'var(--series-input)' },
                                  { label: 'Cost', value: formatUsd(hovered.costUsd) },
                                  { label: 'Latency', value: formatMs(hovered.latencyMs) },
                                  { label: 'Model', value: shortModelName(hovered.model) },
                              ]
                    }
                />
            )}
        </div>
    );
}

// ============================================================================
// 2. CUMULATIVE COST (line with crosshair)
// ============================================================================

export function CumulativeCostChart({ runs }: { runs: TelemetryRecord[] }) {
    const [ref, width] = useWidth<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);

    const height = 220;
    const m = { top: 16, right: 64, bottom: 26, left: 52 };
    const plotW = Math.max(0, width - m.left - m.right);
    const plotH = height - m.top - m.bottom;

    const cumulative: number[] = [];
    runs.reduce((sum, r) => {
        const next = sum + (r.costUsd || 0);
        cumulative.push(next);
        return next;
    }, 0);

    const total = cumulative[cumulative.length - 1] || 0;
    const { max, ticks } = niceTicks(total);
    const x = (i: number) => m.left + (runs.length > 1 ? (i / (runs.length - 1)) * plotW : plotW / 2);
    const y = (v: number) => m.top + plotH - (v / max) * plotH;

    const linePath = cumulative.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
    const areaPath = runs.length ? `${linePath} L${x(runs.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : '';

    const handleMove = (e: React.MouseEvent<SVGRectElement>) => {
        if (!runs.length) return;
        const box = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - box.left) / box.width;
        setHover(Math.max(0, Math.min(runs.length - 1, Math.round(ratio * (runs.length - 1)))));
    };

    const last = runs.length - 1;

    return (
        <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
            {width > 0 && (
                <svg width={width} height={height} role="img" aria-label="Cumulative estimated cost across agent runs">
                    {ticks.map((t) => (
                        <g key={t}>
                            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
                            <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--muted)" className="tabular-nums">
                                {formatUsd(t)}
                            </text>
                        </g>
                    ))}

                    {runs.length > 0 && (
                        <>
                            <path d={areaPath} fill="var(--series-input)" opacity={0.1} />
                            <path d={linePath} fill="none" stroke="var(--series-input)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                            <circle cx={x(last)} cy={y(total)} r={4} fill="var(--series-input)" stroke="var(--surface)" strokeWidth={2} />
                            <text x={x(last) + 8} y={y(total)} dy="0.32em" fontSize={11} fontWeight={600} fill="var(--ink-1)" className="tabular-nums">
                                {formatUsd(total)}
                            </text>
                            <text x={m.left} y={height - 8} fontSize={10} fill="var(--muted)">Run 1</text>
                            <text x={width - m.right} y={height - 8} fontSize={10} fill="var(--muted)" textAnchor="end">
                                Run {runs.length}
                            </text>
                        </>
                    )}

                    {hover !== null && (
                        <>
                            <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={y(0)} stroke="var(--muted)" strokeWidth={1} />
                            <circle cx={x(hover)} cy={y(cumulative[hover])} r={4} fill="var(--series-input)" stroke="var(--surface)" strokeWidth={2} />
                        </>
                    )}

                    <rect x={m.left} y={m.top} width={plotW} height={plotH} fill="transparent" onMouseMove={handleMove} />
                </svg>
            )}

            {hover !== null && runs[hover] && (
                <Tooltip
                    x={x(hover)}
                    y={m.top}
                    width={width}
                    title={`Run ${hover + 1} · ${runs[hover].agentName}`}
                    rows={[
                        { label: 'Total so far', value: formatUsd(cumulative[hover]), color: 'var(--series-input)' },
                        { label: 'This run', value: formatUsd(runs[hover].costUsd) },
                    ]}
                />
            )}
        </div>
    );
}

// ============================================================================
// 3. USAGE BREAKDOWN (horizontal stacked bars, top 8 + Other)
// ============================================================================

export function TokensByAgentChart({ runs, onSelect }: { runs: TelemetryRecord[]; onSelect?: (row: UsageRow) => void }) {
    return <UsageBreakdownChart rows={[...usageByAgent(runs).values()]} label="Tokens used per agent" onSelect={onSelect} />;
}

export function UsageBreakdownChart({
    rows: allRows,
    label,
    onSelect,
}: {
    rows: UsageRow[];
    label: string;
    onSelect?: (row: UsageRow) => void;
}) {
    const [ref, width] = useWidth<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);

    const sorted = [...allRows].sort((a, b) => b.input + b.output - (a.input + a.output));
    const rows = sorted.slice(0, 8);
    const rest = sorted.slice(8);
    if (rest.length) {
        rows.push(
            rest.reduce(
                (acc, r) => ({ ...acc, input: acc.input + r.input, output: acc.output + r.output, cost: acc.cost + r.cost, runs: acc.runs + r.runs }),
                { key: 'other', name: `Other (${rest.length})`, input: 0, output: 0, cost: 0, runs: 0, failed: 0, latencyMs: 0 }
            )
        );
    }

    const rowH = 30;
    const barH = 14;
    const labelW = 104;
    const valueW = 92;
    const height = rows.length * rowH + 4;
    const plotW = Math.max(0, width - labelW - valueW);
    const maxTotal = Math.max(1, ...rows.map((r) => r.input + r.output));
    const scale = (v: number) => (v / maxTotal) * plotW;
    const gap = 2;

    const hovered = hover !== null ? rows[hover] : null;

    return (
        <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
            {width > 0 && (
                <svg width={width} height={height} role="img" aria-label={`${label}, input and output`}>
                    <line x1={labelW} x2={labelW} y1={0} y2={height} stroke="var(--axis)" strokeWidth={1} />
                    {rows.map((r, i) => {
                        const cy = i * rowH + rowH / 2;
                        const inW = scale(r.input);
                        const outW = scale(r.output);
                        const dim = hover !== null && hover !== i ? 0.45 : 1;
                        return (
                            <g key={r.key} opacity={dim}>
                                <text x={labelW - 8} y={cy} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-2)">
                                    {r.name.length > 15 ? `${r.name.slice(0, 14)}…` : r.name}
                                </text>
                                {inW > 0 && (
                                    <path
                                        d={outW > 0 ? `M${labelW},${cy - barH / 2} h${inW} v${barH} h${-inW} Z` : roundedRightRect(labelW, cy - barH / 2, inW, barH)}
                                        fill="var(--series-input)"
                                    />
                                )}
                                {outW > 0 && (
                                    <path d={roundedRightRect(labelW + inW + gap, cy - barH / 2, Math.max(outW, 1), barH)} fill="var(--series-output)" />
                                )}
                                <text x={labelW + inW + gap + outW + 8} y={cy} dy="0.32em" fontSize={11} fill="var(--ink-1)" className="tabular-nums">
                                    {formatCompact(r.input + r.output)}
                                    <tspan fill="var(--muted)"> · {formatUsd(r.cost)}</tspan>
                                </text>
                                <rect
                                    x={0}
                                    y={i * rowH}
                                    width={width}
                                    height={rowH}
                                    fill="transparent"
                                    tabIndex={0}
                                    style={onSelect && r.key !== 'other' ? { cursor: 'pointer' } : undefined}
                                    onClick={() => r.key !== 'other' && onSelect?.(r)}
                                    onMouseEnter={() => setHover(i)}
                                    onFocus={() => setHover(i)}
                                    onBlur={() => setHover(null)}
                                />
                            </g>
                        );
                    })}
                </svg>
            )}

            {hovered && hover !== null && (
                <Tooltip
                    x={labelW + scale(hovered.input + hovered.output) / 2}
                    y={hover * rowH + rowH}
                    width={width}
                    title={`${hovered.name} · ${hovered.runs} run${hovered.runs === 1 ? '' : 's'}`}
                    rows={[
                        { label: 'Output', value: hovered.output.toLocaleString(), color: 'var(--series-output)' },
                        { label: 'Input', value: hovered.input.toLocaleString(), color: 'var(--series-input)' },
                        { label: 'Cost', value: formatUsd(hovered.cost) },
                        ...(hovered.models?.length ? [{ label: 'Model', value: hovered.models.map(shortModelName).join(', ') }] : []),
                    ]}
                />
            )}
        </div>
    );
}

export { StatusLabel };
