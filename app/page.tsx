'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useOrgData, OrgNode, TaskItem } from '@/hooks/useOrgData';

// ============================================================================
// 1. TYPES & LAYOUT MODELS
// ============================================================================

export interface WorkerWithAgents extends OrgNode {
  assignedAgents: OrgNode[];
}

export interface ExtendedLeadNode extends OrgNode {
  childrenNodes: ExtendedLeadNode[];
  teamWorkers: WorkerWithAgents[];
  assignedAgents: OrgNode[];
  level: number;
  x: number;
  y: number;
}

export interface TreeLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ============================================================================
// 2. UTILITY HELPERS & LAYOUT ENGINE
// ============================================================================

export function parseSuperior(node: OrgNode): string | null {
  if (node.superior) return node.superior;
  if (node.reportsToJson) {
    try {
      return JSON.parse(node.reportsToJson);
    } catch {
      return node.reportsToJson;
    }
  }
  return null;
}

export function getDescendants(startId: string, nodes: OrgNode[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    nodes.forEach((n) => {
      const sup = parseSuperior(n);
      if (sup === currentId && !descendants.has(n.id)) {
        descendants.add(n.id);
        queue.push(n.id);
      }
    });
  }
  return descendants;
}

export function calculateLeadTreeLayout(filteredNodes: OrgNode[]) {
  if (filteredNodes.length === 0) return { rootNodes: [], lines: [] };

  const nodeMap = new Map<string, OrgNode>();
  filteredNodes.forEach((n) => nodeMap.set(n.id, n));

  const agentMap = new Map<string, OrgNode[]>();
  const workerMap = new Map<string, OrgNode[]>();
  const leadChildrenMap = new Map<string, OrgNode[]>();

  filteredNodes.forEach((n) => {
    const supId = parseSuperior(n);
    if (!supId) return;

    if (n.type === 'Agent') {
      if (!agentMap.has(supId)) agentMap.set(supId, []);
      agentMap.get(supId)!.push(n);
    } else if (n.type === 'Worker') {
      if (!workerMap.has(supId)) workerMap.set(supId, []);
      workerMap.get(supId)!.push(n);
    } else if (n.type === 'Lead') {
      if (!leadChildrenMap.has(supId)) leadChildrenMap.set(supId, []);
      leadChildrenMap.get(supId)!.push(n);
    }
  });

  const rootLeads: OrgNode[] = [];
  filteredNodes.forEach((n) => {
    if (n.type === 'Lead') {
      const supId = parseSuperior(n);
      if (!supId || !nodeMap.has(supId) || nodeMap.get(supId)?.type !== 'Lead') {
        rootLeads.push(n);
      }
    }
  });

  const buildExtendedLead = (leadNode: OrgNode, level: number): ExtendedLeadNode => {
    const childLeadsRaw = leadChildrenMap.get(leadNode.id) || [];
    const childrenNodes = childLeadsRaw.map((child) => buildExtendedLead(child, level + 1));

    const rawWorkers = workerMap.get(leadNode.id) || [];
    const teamWorkers: WorkerWithAgents[] = rawWorkers.map((w) => ({
      ...w,
      assignedAgents: agentMap.get(w.id) || [],
    }));

    const assignedAgents = agentMap.get(leadNode.id) || [];

    return {
      ...leadNode,
      childrenNodes,
      teamWorkers,
      assignedAgents,
      level,
      x: 0,
      y: 0,
    };
  };

  const extendedRoots = rootLeads.map((r) => buildExtendedLead(r, 0));

  const NODE_WIDTH = 360;
  const LEVEL_HEIGHT = 520;
  const HORIZONTAL_GAP = 80;

  let currentX = 80;

  const calculatePositions = (node: ExtendedLeadNode, level: number): number => {
    node.level = level;
    node.y = level * LEVEL_HEIGHT + 80;

    if (node.childrenNodes.length === 0) {
      node.x = currentX;
      currentX += NODE_WIDTH + HORIZONTAL_GAP;
      return node.x;
    }

    const childrenX: number[] = [];
    node.childrenNodes.forEach((child) => {
      childrenX.push(calculatePositions(child, level + 1));
    });

    node.x = (childrenX[0] + childrenX[childrenX.length - 1]) / 2;
    return node.x;
  };

  extendedRoots.forEach((root) => calculatePositions(root, 0));

  const flattenedLeads: ExtendedLeadNode[] = [];
  const lines: TreeLine[] = [];

  const traverse = (node: ExtendedLeadNode) => {
    flattenedLeads.push(node);
    node.childrenNodes.forEach((child) => {
      lines.push({
        id: `${node.id}-${child.id}`,
        x1: node.x + NODE_WIDTH / 2,
        y1: node.y + 140,
        x2: child.x + NODE_WIDTH / 2,
        y2: child.y,
      });
      traverse(child);
    });
  };

  extendedRoots.forEach(traverse);

  return { rootNodes: flattenedLeads, lines };
}

export function getStatusColor(status?: string) {
  switch (status?.toLowerCase()) {
    case 'active':
      return {
        dot: 'bg-emerald-400 border-emerald-300 shadow-emerald-400/50',
        text: 'text-emerald-400',
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      };
    case 'busy':
      return {
        dot: 'bg-amber-400 border-amber-300 shadow-amber-400/50',
        text: 'text-amber-400',
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      };
    case 'offline':
      return {
        dot: 'bg-rose-500 border-rose-400 shadow-rose-500/50',
        text: 'text-rose-400',
        badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      };
    case 'idle':
    default:
      return {
        dot: 'bg-slate-400 border-slate-300 shadow-slate-400/50',
        text: 'text-slate-400',
        badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      };
  }
}

// ============================================================================
// 3. UI CANVAS HOOKS
// ============================================================================

function useCanvasPanZoom(onDeselect: () => void) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 80, y: 40 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dragDistance = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.interactive-card')) return;
    setIsDragging(true);
    dragDistance.current = 0;
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    dragDistance.current += Math.abs(e.movementX) + Math.abs(e.movementY);
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    if (isDragging && dragDistance.current < 5) {
      onDeselect();
    }
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.min(Math.max(0.3, prev * zoomFactor), 2.5));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 80, y: 40 });
  };

  return {
    zoom,
    setZoom,
    pan,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    resetView,
  };
}

// ============================================================================
// 4. SUB-COMPONENTS
// ============================================================================

function SidebarHeader({ isConnected, identity }: { isConnected: boolean; identity: string | null }) {
  return (
    <>
      <header className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg text-white tracking-wide">Spacetime Org</h1>
            <p className="text-xs text-slate-400">Lead • Worker • Agent Tree</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-950/50 px-2.5 py-1 rounded-full border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-rose-500'}`}
            />
            <span className="text-[11px] font-semibold tracking-wider text-slate-300">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href="/worker"
            className="flex-1 items-center justify-center text-center text-xs font-medium px-2.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all"
          >
            👷 Worker Workspace
          </Link>
          <Link
            href="/meta-analysis"
            className="flex-1 items-center justify-center text-center text-xs font-medium px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
          >
            📊 Meta Analysis
          </Link>
        </div>
      </header>

      {identity && (
        <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800 text-[10px] font-mono text-slate-400 truncate">
          Session: {identity}
        </div>
      )}
    </>
  );
}

function MetricsBar({ nodes, tasks }: { nodes: OrgNode[]; tasks: TaskItem[] }) {
  const metrics = useMemo(() => {
    const leads = nodes.filter((n) => n.type === 'Lead').length;
    const workers = nodes.filter((n) => n.type === 'Worker').length;
    const agents = nodes.filter((n) => n.type === 'Agent').length;
    const pendingTasks = tasks.filter((t) => !t.completed).length;
    return { leads, workers, agents, pendingTasks };
  }, [nodes, tasks]);

  return (
    <div className="grid grid-cols-4 gap-1 p-3 bg-slate-950/80 border-b border-slate-800 text-center">
      <div>
        <span className="block text-[10px] text-indigo-400 uppercase font-semibold">Leads</span>
        <span className="text-xs font-bold text-indigo-300">{metrics.leads}</span>
      </div>
      <div>
        <span className="block text-[10px] text-slate-400 uppercase font-semibold">Workers</span>
        <span className="text-xs font-bold text-slate-200">{metrics.workers}</span>
      </div>
      <div>
        <span className="block text-[10px] text-purple-400 uppercase font-semibold">Agents</span>
        <span className="text-xs font-bold text-purple-300">{metrics.agents}</span>
      </div>
      <div>
        <span className="block text-[10px] text-amber-400 uppercase font-semibold">Tasks</span>
        <span className="text-xs font-bold text-amber-300">{metrics.pendingTasks}</span>
      </div>
    </div>
  );
}

function AddNodeForm({
  nodes,
  onAddNode,
  onSelectNode,
}: {
  nodes: OrgNode[];
  onAddNode: (name: string, type: string, superiorId: string) => string;
  onSelectNode: (id: string) => void;
}) {
  const [nodeName, setNodeName] = useState('');
  const [nodeType, setNodeType] = useState<'Lead' | 'Worker' | 'Agent'>('Worker');
  const [superiorId, setSuperiorId] = useState('');

  const validSuperiorNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (nodeType === 'Lead') return n.type === 'Lead';
      if (nodeType === 'Worker') return n.type === 'Lead';
      if (nodeType === 'Agent') return n.type === 'Lead' || n.type === 'Worker';
      return false;
    });
  }, [nodes, nodeType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = onAddNode(nodeName, nodeType, superiorId);
    onSelectNode(newId);
    setNodeName('');
    setSuperiorId('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-slate-800">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Add Node</h2>
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">Name / Role</label>
        <input
          type="text"
          value={nodeName}
          onChange={(e) => setNodeName(e.target.value)}
          placeholder="e.g. Lead Architect"
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">Node Type</label>
        <select
          value={nodeType}
          onChange={(e) => {
            setNodeType(e.target.value as 'Lead' | 'Worker' | 'Agent');
            setSuperiorId('');
          }}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          <option value="Lead">Lead (Tree Node)</option>
          <option value="Worker">Worker (Row Member)</option>
          <option value="Agent">Agent (Hover Dot)</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">Superior Node</label>
        <select
          value={superiorId}
          onChange={(e) => setSuperiorId(e.target.value)}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          <option value="" className="bg-slate-900 text-slate-200">
            {nodeType === 'Lead' ? 'None (Root Lead)' : 'Select Superior...'}
          </option>
          {validSuperiorNodes.map((n) => (
            <option key={n.id} value={n.id} className="bg-slate-900 text-slate-200">
              {n.name} ({n.type})
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-medium rounded-lg text-sm hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/30"
      >
        Add Node
      </button>
    </form>
  );
}

function CanvasToolbar({
  zoom,
  setZoom,
  resetView,
}: {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  resetView: () => void;
}) {
  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-xl backdrop-blur">
      <button
        onClick={() => setZoom((z) => Math.min(z + 0.15, 2.5))}
        className="w-8 h-8 flex items-center justify-center hover:bg-slate-800 rounded font-bold text-slate-300"
        title="Zoom In"
      >
        +
      </button>
      <span className="text-xs font-mono text-slate-400 w-12 text-center">
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={() => setZoom((z) => Math.max(z - 0.15, 0.3))}
        className="w-8 h-8 flex items-center justify-center hover:bg-slate-800 rounded font-bold text-slate-300"
        title="Zoom Out"
      >
        -
      </button>
      <div className="w-px h-5 bg-slate-800 my-auto" />
      <button
        onClick={resetView}
        className="px-2.5 h-8 hover:bg-slate-800 rounded text-xs font-medium text-slate-300"
      >
        Reset
      </button>
    </div>
  );
}

function AgentDot({
  agent,
  onSelectAgent,
}: {
  agent: OrgNode;
  onSelectAgent: (id: string) => void;
}) {
  const colors = getStatusColor(agent.status);

  return (
    <div className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelectAgent(agent.id);
        }}
        aria-label={agent.name}
        className={`w-3.5 h-3.5 rounded-full border ${colors.dot} cursor-pointer shadow-sm transition-all duration-200 ease-out hover:scale-125 hover:ring-2 hover:ring-indigo-400/80 hover:ring-offset-2 hover:ring-offset-slate-900 hover:shadow-[0_0_12px_rgba(129,140,248,0.7)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
      />
    </div>
  );
}

function TaskManagerSection({
  selectedNode,
  tasks,
  runningTaskId,
  agentResult,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onExecuteTask,
}: {
  selectedNode: OrgNode | null;
  tasks: TaskItem[];
  runningTaskId?: string | null;
  agentResult?: string | null;
  onAddTask: (nodeId: string, title: string) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onExecuteTask: (agentNode: OrgNode, task: TaskItem, delaySeconds: number) => void;
}) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [delaySeconds, setDelaySeconds] = useState<number>(5);

  const selectedNodeTasks = useMemo(() => {
    if (!selectedNode?.id) return [];
    return tasks.filter((t) => t.assignedNodeId === selectedNode.id);
  }, [tasks, selectedNode?.id]);

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !selectedNode?.id) return;
    onAddTask(selectedNode.id, newTaskTitle);
    setNewTaskTitle('');
  };

  if (!selectedNode) return null;

  return (
    <div className="border-t border-slate-800 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Assigned Tasks ({selectedNodeTasks.length})
        </h3>

        {selectedNode?.type?.toLowerCase() === 'agent' && (
          <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800">
            <label htmlFor="delay-sec" className="text-[10px] font-mono text-slate-400 uppercase">
              Delay (s):
            </label>
            <input
              id="delay-sec"
              type="number"
              min="0"
              max="60"
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-10 text-center bg-slate-900 border border-slate-700 rounded text-xs font-mono text-amber-300 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}
      </div>

      <form onSubmit={handleCreateTask} className="flex gap-2">
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-500 transition-colors"
        >
          Add
        </button>
      </form>

      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {selectedNodeTasks.length === 0 ? (
          <p className="text-xs italic text-slate-600 py-2">No active tasks assigned.</p>
        ) : (
          selectedNodeTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-2 p-2 bg-slate-950/60 rounded border border-slate-800/80 hover:border-slate-700 transition-colors"
            >
              <div
                onClick={() => onToggleTask(task.id)}
                className="flex items-start gap-2.5 cursor-pointer flex-1 overflow-hidden"
              >
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => { }}
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0 shrink-0"
                />
                <span
                  className={`text-xs truncate block ${task.completed ? 'line-through text-slate-500' : 'text-slate-200'
                    }`}
                >
                  {task.title}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {selectedNode?.type?.toLowerCase() === 'agent' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExecuteTask(selectedNode, task, delaySeconds);
                    }}
                    disabled={runningTaskId !== null && runningTaskId !== undefined}
                    className="px-2 py-1 text-[10px] font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    {runningTaskId === task.id ? (
                      <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" /> Running...</>
                    ) : task.completed ? (
                      <>🔄 Re-run Agent</>
                    ) : (
                      <>⚡ Run Agent</>
                    )}
                  </button>
                )}
                <button
                  onClick={() => onDeleteTask(task.id)}
                  className="text-slate-500 hover:text-rose-400 text-xs px-1 font-bold"
                  title="Delete Task"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {agentResult && (
        <div className="mt-3 p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-lg space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
            ⚡ Agent Output
          </span>
          <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
            {agentResult}
          </p>
        </div>
      )}
    </div>
  );
}

function NodeInspector({
  selectedNode,
  nodes,
  tasks,
  runningTaskId,
  agentResult,
  onClose,
  onUpdateNode,
  onDeleteNode,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onExecuteTask,
}: {
  selectedNode: OrgNode;
  nodes: OrgNode[];
  tasks: TaskItem[];
  runningTaskId?: string | null;
  agentResult?: string | null;
  onClose: () => void;
  onUpdateNode: (id: string, name: string, type: string, superiorId: string) => void;
  onDeleteNode: (id: string) => void;
  onAddTask: (nodeId: string, title: string) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onExecuteTask: (agentNode: OrgNode, task: TaskItem, delaySeconds: number) => void;
}) {
  const supId = parseSuperior(selectedNode);
  const superiorNode = supId ? nodes.find((n) => n.id === supId) : null;

  return (
    <aside className="w-80 border-l border-slate-800 bg-slate-900/90 backdrop-blur p-6 z-20 flex flex-col justify-between shadow-2xl overflow-y-auto">
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Node Inspector</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm font-bold w-6 h-6 rounded flex items-center justify-center hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
            <span
              className={`text-xs font-bold uppercase px-2 py-0.5 rounded border inline-block mb-1 ${selectedNode.type === 'Lead'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : selectedNode.type === 'Worker'
                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                    : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                }`}
            >
              {selectedNode.type}
            </span>
            <h3 className="text-lg font-bold text-white mt-1">{selectedNode.name}</h3>
            <span className={`inline-block mt-2 text-xs font-mono px-2 py-0.5 rounded border ${getStatusColor(selectedNode.status).badge}`}>
              Status: {selectedNode.status || 'Idle'}
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs text-slate-500 uppercase block">Node ID</span>
              <p className="font-mono text-xs text-slate-300 break-all bg-slate-950 p-2.5 rounded border border-slate-800 mt-1">
                {selectedNode.id}
              </p>
            </div>

            <div>
              <span className="text-xs text-slate-500 uppercase block">Superior Node</span>
              <p className="text-xs text-slate-300 mt-1">
                {superiorNode ? (
                  <span className="font-mono text-indigo-400 bg-indigo-950/40 px-2 py-1 rounded border border-indigo-800/40 inline-block">
                    {superiorNode.name} ({superiorNode.type})
                  </span>
                ) : (
                  <span className="italic text-slate-600">None (Top Level)</span>
                )}
              </p>
            </div>
          </div>

          <TaskManagerSection
            selectedNode={selectedNode}
            tasks={tasks}
            runningTaskId={runningTaskId}
            agentResult={agentResult}
            onAddTask={onAddTask}
            onToggleTask={onToggleTask}
            onDeleteTask={onDeleteTask}
            onExecuteTask={onExecuteTask}
          />
        </div>
      </div>
    </aside>
  );
}

// ============================================================================
// 5. MAIN PAGE COMPONENT
// ============================================================================

export default function Page() {
  const {
    nodes,
    tasks,
    isConnected,
    identity,
    addNode,
    updateNode, // <--- ADD THIS
    updateNodeStatus,
    deleteNode,
    addTask,
    deleteTask,
    toggleTask,
  } = useOrgData();

  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [agentResult, setAgentResult] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-1');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  const {
    zoom,
    setZoom,
    pan,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    resetView,
  } = useCanvasPanZoom(() => setSelectedNodeId(null));

  const containerRef = useRef<HTMLDivElement>(null);

  const handleExecuteTaskWithAgent = async (
    agentNode: OrgNode,
    task: TaskItem,
    delaySeconds: number = 0
  ) => {
    setRunningTaskId(task.id);
    updateNodeStatus(agentNode.id, 'Busy');
    setAgentResult(null);

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agentNode.id,
          agentName: agentNode.name,
          prompt: task.title,
          delaySeconds,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setAgentResult(data.resultText);
        if (!task.completed) {
          toggleTask(task.id);
        }
      } else {
        console.error('Agent Execution Error:', data.error);
      }
    } catch (error) {
      console.error('Network Error:', error);
    } finally {
      setRunningTaskId(null);
      updateNodeStatus(agentNode.id, 'Idle');
    }
  };

  const filteredNodes = useMemo(() => {
    const matchedNodeIds = new Set<string>();

    nodes.forEach((n) => {
      if (n.type === 'System') return;
      const matchesSearch =
        !searchQuery ||
        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'ALL' || n.type === filterType;

      if (matchesSearch && matchesType) {
        matchedNodeIds.add(n.id);
        let sup = parseSuperior(n);
        while (sup) {
          matchedNodeIds.add(sup);
          const parentNode = nodes.find((item) => item.id === sup);
          sup = parentNode ? parseSuperior(parentNode) : null;
        }
      }
    });

    return nodes.filter((n) => matchedNodeIds.has(n.id));
  }, [nodes, searchQuery, filterType]);

  const treeLayout = useMemo(() => calculateLeadTreeLayout(filteredNodes), [filteredNodes]);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <aside className="w-80 border-r border-slate-800 bg-slate-900/90 backdrop-blur flex flex-col z-20 shadow-2xl">
        <SidebarHeader isConnected={isConnected} identity={identity} />
        <MetricsBar nodes={nodes} tasks={tasks} />

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Search & Filter
            </h2>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or ID..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />

            <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              {['ALL', 'Lead', 'Worker', 'Agent'].map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`py-1 rounded font-medium transition-all ${filterType === type ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <AddNodeForm nodes={nodes} onAddNode={addNode} onSelectNode={(id) => setSelectedNodeId(id)} />
        </div>
      </aside>

      <main
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="flex-1 relative cursor-grab active:cursor-grabbing bg-slate-950 overflow-hidden select-none"
      >
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#6366f1 1.5px, transparent 1.5px)`,
            backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        <CanvasToolbar zoom={zoom} setZoom={setZoom} resetView={resetView} />

        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        >
          <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible">
            <defs>
              <linearGradient id="line-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            {treeLayout.lines.map((line) => {
              const midY = (line.y1 + line.y2) / 2;
              const path = `M ${line.x1} ${line.y1} C ${line.x1} ${midY}, ${line.x2} ${midY}, ${line.x2} ${line.y2}`;
              return (
                <path
                  key={line.id}
                  d={path}
                  fill="none"
                  stroke="url(#line-grad)"
                  strokeWidth="2.5"
                  className="transition-all duration-300"
                />
              );
            })}
          </svg>

          {treeLayout.rootNodes.map((node) => {
            const isSelected = selectedNodeId === node.id;

            return (
              <div
                key={node.id}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: '360px',
                }}
                className="absolute pointer-events-auto flex flex-col items-center"
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                  }}
                  className={`interactive-card w-full cursor-pointer rounded-xl p-4 transition-all duration-200 border shadow-xl ${isSelected
                      ? 'bg-slate-900 border-indigo-500 shadow-indigo-500/25 ring-2 ring-indigo-500/50 scale-[1.02] z-10'
                      : 'bg-slate-900/95 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30">
                      {node.level === 0 ? 'Root Lead' : 'Team Lead'}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className={`w-2 h-2 rounded-full ${getStatusColor(node.status).dot}`} />
                      {node.status || 'Idle'}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-100 text-sm truncate">{node.name}</h3>

                  {node.assignedAgents && node.assignedAgents.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] text-purple-400 font-semibold uppercase">
                        Lead Agents ({node.assignedAgents.length})
                      </span>
                      <div className="flex items-center gap-2 overflow-x-auto max-w-[200px] p-1.5 -m-1.5">
                        {node.assignedAgents.map((agent) => (
                          <AgentDot key={agent.id} agent={agent} onSelectAgent={(id) => setSelectedNodeId(id)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {node.teamWorkers && node.teamWorkers.length > 0 && (
                  <>
                    <div className="w-0.5 h-4 bg-gradient-to-b from-indigo-500 to-purple-500 opacity-70" />

                    <div className="w-full bg-slate-950/90 border border-slate-800/90 rounded-xl p-3 shadow-xl backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800/80 px-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                          Team Workers ({node.teamWorkers.length})
                        </span>
                        <span className="text-[9px] font-mono text-slate-500">Agent Dots</span>
                      </div>

                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5 custom-scrollbar">
                        {node.teamWorkers.map((worker) => {
                          const isWorkerSelected = selectedNodeId === worker.id;
                          return (
                            <div
                              key={worker.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedNodeId(worker.id);
                              }}
                              className={`flex items-center justify-between p-2 rounded-lg text-xs transition-all border cursor-pointer ${isWorkerSelected
                                  ? 'bg-indigo-950/80 border-indigo-500 text-indigo-100 font-medium ring-1 ring-indigo-500/40 shadow-md'
                                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                                }`}
                            >
                              <div className="flex items-center gap-2 truncate pr-2">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(worker.status).dot}`} />
                                <span className="truncate text-[11px] font-medium leading-tight">
                                  {worker.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 p-1.5 -my-1.5">
                                {worker.assignedAgents.length > 0 ? (
                                  worker.assignedAgents.map((agent) => (
                                    <AgentDot key={agent.id} agent={agent} onSelectAgent={(id) => setSelectedNodeId(id)} />
                                  ))
                                ) : (
                                  <span className="text-[9px] text-slate-600 font-mono italic">no agents</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {selectedNode && (
        <NodeInspector
          selectedNode={selectedNode}
          nodes={nodes}
          tasks={tasks}
          runningTaskId={runningTaskId}
          agentResult={agentResult}
          onClose={() => setSelectedNodeId(null)}
          onUpdateNode={updateNode}
          onDeleteNode={deleteNode}
          onAddTask={addTask}
          onToggleTask={toggleTask}
          onDeleteTask={deleteTask}
          onExecuteTask={handleExecuteTaskWithAgent}
        />
      )}
    </div>
  );
}