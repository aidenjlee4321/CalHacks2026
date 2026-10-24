import { OrgNode } from '../lib/store';

interface Props {
    nodes: Record<string, OrgNode>;
    rootId: string;
}

export default function TopologyMap({ nodes, rootId }: Props) {
    const node = nodes[rootId];
    if (!node) return null;

    const isAgent = node.type === 'AGENT';

    // Dynamic styling based on status
    const statusColors = {
        IDLE: 'bg-gray-100 text-gray-500 border-gray-300',
        WORKING: 'bg-blue-50 text-blue-700 border-blue-400 animate-pulse',
        BLOCKED_BY_HUMAN: 'bg-red-50 text-red-700 border-red-500',
    };

    return (
        <div className="flex flex-col items-center">
            {/* The Node Card */}
            <div className={`w-48 p-3 border-2 rounded-lg text-center shadow-sm ${statusColors[node.status]}`}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1">
                    {isAgent ? '🤖 Agent' : '👤 Human'}
                </div>
                <div className="font-semibold text-gray-900 truncate">{node.name}</div>
                <div className="text-xs mt-2 font-mono">
                    Tasks: {node.tasks.length}
                </div>
            </div>

            {/* Render Subordinates Recursively */}
            {node.subordinates.length > 0 && (
                <>
                    <div className="w-px h-6 bg-gray-300"></div>
                    <div className="flex space-x-6 border-t border-gray-300 pt-4 relative">
                        {/* Invisible line to cover the top borders nicely */}
                        <div className="absolute top-0 left-1/2 w-px h-4 bg-gray-300 -translate-x-1/2 -translate-y-full"></div>

                        {node.subordinates.map(subId => (
                            <div key={subId} className="relative">
                                <TopologyMap nodes={nodes} rootId={subId} />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}