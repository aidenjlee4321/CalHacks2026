import { OrgNode } from '../lib/store';

interface Props {
    nodes: Record<string, OrgNode>;
    rootId: string;
    highlightIds?: string[]; // humans who must answer a request right now
}

// How each status looks
const STATUS = {
    IDLE: {
        card: 'border-gray-200 bg-white',
        dot: 'bg-gray-400',
        label: 'Idle',
    },
    WORKING: {
        card: 'border-blue-300 bg-blue-50',
        dot: 'bg-blue-500 animate-pulse',
        label: 'Working',
    },
    BLOCKED_BY_HUMAN: {
        card: 'border-red-400 bg-red-50 ring-4 ring-red-200 shadow-lg shadow-red-100',
        dot: 'bg-red-500 animate-pulse',
        label: 'Needs human',
    },
    OFFLINE: {
        card: 'border-gray-300 bg-gray-100 opacity-60',
        dot: 'bg-gray-300',
        label: 'Offline',
    },
};

export default function TopologyMap({ nodes, rootId, highlightIds = [] }: Props) {
    const node = nodes[rootId];
    if (!node) return null;

    const isAgent = node.type === 'AGENT';
    const style = STATUS[node.status as keyof typeof STATUS] || STATUS.OFFLINE;
    const currentTask = node.tasks.find((t) => t.status !== 'COMPLETED');
    const mustDecide = highlightIds.includes(node.id);

    return (
        <div className="flex flex-col items-center">
            {/* The Node Card */}
            <div
                className={`w-56 rounded-xl border-2 p-3 text-left transition-all duration-500 ${mustDecide ? 'border-amber-400 bg-amber-50 ring-4 ring-amber-300 shadow-lg scale-105' : style.card
                    }`}
            >
                {/* Top row: type + status */}
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        {isAgent ? '🤖 Agent' : '👤 Human'}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-700">
                        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                        {style.label}
                    </span>
                </div>

                {/* Name */}
                <div className="mt-1 truncate font-semibold text-gray-900">{node.name}</div>

                {/* Current task */}
                <div className="mt-2 min-h-[2rem] text-xs text-gray-600 line-clamp-2">
                    {currentTask ? currentTask.description : 'No active task'}
                </div>

                {/* Agent is paused */}
                {node.status === 'BLOCKED_BY_HUMAN' && (
                    <div className="mt-2 rounded-md bg-red-600 px-2 py-1 text-center text-[11px] font-semibold text-white">
                        ⏸ Paused — waiting for a human
                    </div>
                )}

                {/* Human must answer */}
                {mustDecide && (
                    <div className="mt-2 animate-pulse rounded-md bg-amber-500 px-2 py-1 text-center text-[11px] font-semibold text-white">
                        📥 Your decision is needed
                    </div>
                )}

                {/* Task count */}
                <div className="mt-2 font-mono text-[11px] text-gray-400">
                    Tasks: {node.tasks.length}
                </div>
            </div>

            {/* Draw the people/agents under this one */}
            {node.subordinates.length > 0 && (
                <>
                    <div className="h-6 w-px bg-gray-300"></div>
                    <div className="relative flex gap-6 border-t border-gray-300 pt-4">
                        {node.subordinates.map((subId) => (
                            <div key={subId} className="relative">
                                <TopologyMap nodes={nodes} rootId={subId} highlightIds={highlightIds} />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}