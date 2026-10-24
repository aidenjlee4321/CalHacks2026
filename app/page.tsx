'use client';

import React, { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';

// ============================================================================
// 1. TYPES & DATA MODELS
// ============================================================================

export interface TaskItem {
  id: string;
  assignedNodeId: string;
  title: string;
  completed: boolean;
}

export interface OrgNode {
  id: string;
  name: string;
  type: 'Lead' | 'Worker' | 'Agent' | string;
  status?: string;
  superior?: string;
  reportsToJson?: string;
  subordinatesJson?: string;
}

export interface WorkerWithAgents extends OrgNode {
  assignedAgents: OrgNode[];
}

export interface ExtendedLeadNode extends OrgNode {
  childrenNodes: ExtendedLeadNode[]; // Child Leads in upper tree
  teamWorkers: WorkerWithAgents[];  // Subordinate Workers in rows
  assignedAgents: OrgNode[];        // Direct Agents assigned to Lead
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

interface SpacetimeContextType {
  conn: any;
  connected: boolean;
  identity: string | null;
}

// ============================================================================
// 2. FALLBACK CONTEXT & INITIAL DEMO DATA (100 NODES)
// ============================================================================

const SpacetimeContext = createContext<SpacetimeContextType>({
  conn: null,
  connected: false,
  identity: null,
});

let externalUseSpacetime: (() => SpacetimeContextType) | null = null;
try {
  // @ts-ignore
  const mod = require('@/components/LiveSpacetimeProvider');
  externalUseSpacetime = mod.useSpacetime || mod.default?.useSpacetime;
} catch {
  // Graceful fallback if module resolution differs
}

function useSpacetimeHook(): SpacetimeContextType {
  if (externalUseSpacetime) {
    try {
      return externalUseSpacetime();
    } catch {
      // Fallback
    }
  }
  return useContext(SpacetimeContext);
}

// Generate 100 Nodes adhering strictly to the Lead/Worker/Agent hierarchy policies
const createBaseDataset = () => {
  const statuses = ['Active', 'Idle', 'Busy', 'Offline'];
  const taskTemplates = [
    'Audit workspace security permissions',
    'Process neural network weight batch',
    'Optimize database index performance',
    'Execute automated regression suite',
    'Review architecture design proposal',
    'Deploy edge microservice cluster',
    'Sync real-time telemetry vector cache',
    'Monitor system memory allocation',
    'Rebalance microservice load',
    'Verify WebSocket connection guards'
  ];

  const nodes: OrgNode[] = [
    { id: 'node-1', name: 'Executive Lead #001', type: 'Lead', status: 'Active' },
    { id: 'node-2', name: 'Engineering Lead #002', type: 'Lead', status: 'Active', superior: 'node-1' },
    { id: 'node-3', name: 'Sales Lead #003', type: 'Lead', status: 'Active', superior: 'node-1' },
    { id: 'node-4', name: 'Operations Lead #004', type: 'Lead', status: 'Busy', superior: 'node-1' },
    { id: 'node-5', name: 'Product Lead #005', type: 'Lead', status: 'Active', superior: 'node-1' },
  ];

  const leadIds = ['node-2', 'node-3', 'node-4', 'node-5'];

  // Generate 30 Human Workers (Nodes 6 to 35) assigned to Team Leads
  for (let i = 6; i <= 35; i++) {
    const assignedLead = leadIds[(i - 6) % leadIds.length];
    nodes.push({
      id: `node-${i}`,
      name: `Worker #${String(i).padStart(3, '0')}`,
      type: 'Worker',
      status: statuses[i % statuses.length],
      superior: assignedLead,
    });
  }

  // Generate 65 Agents (Nodes 36 to 100) assigned to Workers or Leads
  for (let i = 36; i <= 100; i++) {
    // Distribute agents: some to Leads (1..5), most to Workers (6..35)
    const superiorId = i <= 45
      ? `node-${((i - 36) % 5) + 1}`
      : `node-${((i - 46) % 30) + 6}`;

    nodes.push({
      id: `node-${i}`,
      name: `Agent #${String(i).padStart(3, '0')}`,
      type: 'Agent',
      status: statuses[i % statuses.length],
      superior: superiorId,
    });
  }

  // Generate Tasks for all 100 nodes
  const tasks: TaskItem[] = [];
  let taskCounter = 1;

  nodes.forEach((node, idx) => {
    const taskCount = (idx % 2) + 1;
    for (let t = 0; t < taskCount; t++) {
      tasks.push({
        id: `t-${taskCounter}`,
        assignedNodeId: node.id,
        title: `${taskTemplates[taskCounter % taskTemplates.length]} [Job #${taskCounter}]`,
        completed: taskCounter % 3 === 0,
      });
      taskCounter++;
    }
  });

  return { nodes, tasks };
};

const { nodes: INITIAL_NODES, tasks: INITIAL_TASKS } = createBaseDataset();

// ============================================================================
// 3. UTILITY HELPERS & LAYOUT ENGINE
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

  // Map Agents to their superior (Lead or Worker)
  const agentMap = new Map<string, OrgNode[]>();
  // Map Workers to their superior Lead
  const workerMap = new Map<string, OrgNode[]>();
  // Map Lead children to superior Lead
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

  // Identify Root Leads
  const rootLeads: OrgNode[] = [];
  filteredNodes.forEach((n) => {
    if (n.type === 'Lead') {
      const supId = parseSuperior(n);
      if (!supId || !nodeMap.has(supId) || nodeMap.get(supId)?.type !== 'Lead') {
        rootLeads.push(n);
      }
    }
  });

  // Build extended Lead hierarchy
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

// ============================================================================
// 4. CUSTOM HOOKS
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

function useOrgData() {
  const spacetime = useSpacetimeHook();
  const [demoNodes, setDemoNodes] = useState<OrgNode[]>(INITIAL_NODES);
  const [nodes, setNodes] = useState<OrgNode[]>(INITIAL_NODES);
  const [demoTasks, setDemoTasks] = useState<TaskItem[]>(INITIAL_TASKS);
  const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);

  const isConnected = spacetime.connected || true;
  const identity = spacetime.identity || 'demo_identity_0x8f2a9c';

  useEffect(() => {
    if (!spacetime.conn) {
      setNodes(demoNodes);
      setTasks(demoTasks);
      return;
    }

    const updateNodes = () => {
      const table = (spacetime.conn as any).db?.orgNode || (spacetime.conn as any).tables?.orgNode;
      if (table) {
        const rows = Array.from(table.iter()) as OrgNode[];
        setNodes(rows.filter((r) => r.type !== 'System'));
      }
    };

    const updateTasks = () => {
      const table = (spacetime.conn as any).db?.task || (spacetime.conn as any).tables?.task;
      if (table) {
        const rows = Array.from(table.iter()) as TaskItem[];
        setTasks(rows);
      }
    };

    updateNodes();
    updateTasks();

    const nodeTable = (spacetime.conn as any).db?.orgNode || (spacetime.conn as any).tables?.orgNode;
    if (nodeTable?.onInsert) {
      nodeTable.onInsert(updateNodes);
      nodeTable.onDelete(updateNodes);
      nodeTable.onUpdate(updateNodes);
    }

    const taskTable = (spacetime.conn as any).db?.task || (spacetime.conn as any).tables?.task;
    if (taskTable?.onInsert) {
      taskTable.onInsert(updateTasks);
      taskTable.onDelete(updateTasks);
      taskTable.onUpdate(updateTasks);
    }
  }, [spacetime.conn, demoNodes, demoTasks]);

  const addNode = (name: string, type: string, superiorId: string) => {
    const newId = crypto.randomUUID();
    const finalName = name.trim() || 'New Member';

    if (spacetime.conn && spacetime.conn.reducers?.addNode) {
      try {
        spacetime.conn.reducers.addNode({
          id: newId,
          name: finalName,
          type: type,
          superior: superiorId || null,
        });
      } catch (err) {
        console.error('🚨 Error adding node via reducer:', err);
      }
    } else {
      const newNode: OrgNode = {
        id: newId,
        name: finalName,
        type: type,
        status: 'Idle',
        superior: superiorId || undefined,
      };
      setDemoNodes((prev) => [...prev, newNode]);
    }
    return newId;
  };

  const updateNode = (id: string, name: string, type: string, superiorId: string) => {
    const finalName = name.trim() || 'Unnamed Node';

    if (spacetime.conn && spacetime.conn.reducers?.updateNode) {
      try {
        spacetime.conn.reducers.updateNode({
          id,
          name: finalName,
          type,
          superior: superiorId || null,
        });
      } catch (err) {
        console.error('🚨 Error updating node via reducer:', err);
      }
    } else {
      setDemoNodes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, name: finalName, type, superior: superiorId || undefined } : n
        )
      );
    }
  };

  const deleteNode = (id: string) => {
    const targetNode = nodes.find((n) => n.id === id);
    const parentSuperior = targetNode ? parseSuperior(targetNode) : null;

    if (spacetime.conn && spacetime.conn.reducers?.deleteNode) {
      try {
        spacetime.conn.reducers.deleteNode({ id });
      } catch (err) {
        console.error('🚨 Error deleting node via reducer:', err);
      }
    } else {
      setDemoNodes((prev) =>
        prev
          .filter((n) => n.id !== id)
          .map((n) => (parseSuperior(n) === id ? { ...n, superior: parentSuperior || undefined } : n))
      );
    }
  };

  const addTask = (assignedNodeId: string, title: string) => {
    if (!assignedNodeId || !title.trim()) return;
    const newTaskId = crypto.randomUUID();

    if (spacetime.conn && spacetime.conn.reducers?.addTask) {
      try {
        spacetime.conn.reducers.addTask({
          id: newTaskId,
          assignedNodeId,
          title: title.trim(),
        });
      } catch (err) {
        console.error('🚨 Error adding task via reducer:', err);
      }
    } else {
      setDemoTasks((prev) => [
        ...prev,
        { id: newTaskId, assignedNodeId, title: title.trim(), completed: false },
      ]);
    }
  };

  const deleteTask = (taskId: string) => {
    if (spacetime.conn && spacetime.conn.reducers?.deleteTask) {
      try {
        spacetime.conn.reducers.deleteTask({ id: taskId });
      } catch (err) {
        console.error('🚨 Error deleting task via reducer:', err);
      }
    } else {
      setDemoTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
  };

  const toggleTask = (taskId: string) => {
    if (spacetime.conn && spacetime.conn.reducers?.toggleTask) {
      try {
        spacetime.conn.reducers.toggleTask({ id: taskId });
      } catch (err) {
        console.error('🚨 Error toggling task via reducer:', err);
      }
    } else {
      setDemoTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
      );
    }
  };

  return {
    nodes,
    tasks,
    isConnected,
    identity,
    addNode,
    updateNode,
    deleteNode,
    addTask,
    deleteTask,
    toggleTask,
  };
}

// ============================================================================
// 5. MODULAR SUB-COMPONENTS
// ============================================================================

function SidebarHeader({ isConnected, identity }: { isConnected: boolean; identity: string | null }) {
  return (
    <>
      <header className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg text-white tracking-wide">Spacetime Org</h1>
          <p className="text-xs text-slate-400">Lead • Worker • Agent Tree</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-950/50 px-2.5 py-1 rounded-full border border-slate-800">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-rose-500'
              }`}
          />
          <span className="text-[11px] font-semibold tracking-wider text-slate-300">
            {isConnected ? 'Live' : 'Offline'}
          </span>
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

  // Valid Superior Options enforcing policy:
  // - Lead: can choose other Leads
  // - Worker: can choose Leads
  // - Agent: can choose Leads or Workers (Agents CANNOT be managers)
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
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
        Add Node
      </h2>

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
            const nextType = e.target.value as 'Lead' | 'Worker' | 'Agent';
            setNodeType(nextType);
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
        <p className="text-[10px] text-slate-500 mt-1">
          {nodeType === 'Worker' && 'Workers must report to a Lead.'}
          {nodeType === 'Agent' && 'Agents can be assigned to a Lead or Worker.'}
          {nodeType === 'Lead' && 'Leads report to higher Leads or serve as Root.'}
        </p>
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

// Hoverable Agent Dot Component
function AgentDot({
  agent,
  onSelectAgent,
}: {
  agent: OrgNode;
  onSelectAgent: (id: string) => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  const statusColor =
    agent.status === 'Active'
      ? 'bg-emerald-400 border-emerald-300 shadow-emerald-400/50'
      : agent.status === 'Busy'
        ? 'bg-amber-400 border-amber-300 shadow-amber-400/50'
        : 'bg-purple-400 border-purple-300 shadow-purple-400/50';

  return (
    <div className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelectAgent(agent.id);
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`w-3.5 h-3.5 rounded-full border ${statusColor} hover:scale-125 transition-transform cursor-pointer shadow-sm`}
        title={agent.name}
      />

      {/* Hover Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 w-36 bg-slate-900 border border-purple-500/40 rounded-lg p-2 shadow-2xl text-left pointer-events-none">
          <div className="flex items-center justify-between text-[9px] font-bold uppercase text-purple-400 mb-0.5">
            <span>Agent</span>
            <span className="font-mono text-slate-400">{agent.status || 'Idle'}</span>
          </div>
          <div className="text-xs font-semibold text-white truncate">{agent.name}</div>
          <div className="text-[9px] font-mono text-slate-400 truncate mt-0.5">
            ID: {agent.id.slice(0, 10)}...
          </div>
        </div>
      )}
    </div>
  );
}

function TaskManagerSection({
  selectedNodeId,
  tasks,
  onAddTask,
  onToggleTask,
  onDeleteTask,
}: {
  selectedNodeId: string;
  tasks: TaskItem[];
  onAddTask: (nodeId: string, title: string) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
}) {
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const selectedNodeTasks = useMemo(() => {
    return tasks.filter((t) => t.assignedNodeId === selectedNodeId);
  }, [tasks, selectedNodeId]);

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    onAddTask(selectedNodeId, newTaskTitle);
    setNewTaskTitle('');
  };

  return (
    <div className="border-t border-slate-800 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Assigned Tasks ({selectedNodeTasks.length})
        </h3>
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
                className="flex items-start gap-2.5 cursor-pointer flex-1"
              >
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => { }}
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span
                  className={`text-xs ${task.completed ? 'line-through text-slate-500' : 'text-slate-200'
                    }`}
                >
                  {task.title}
                </span>
              </div>
              <button
                onClick={() => onDeleteTask(task.id)}
                className="text-slate-500 hover:text-rose-400 text-xs px-1 font-bold"
                title="Delete Task"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EditNodeForm({
  selectedNode,
  nodes,
  onUpdateNode,
  onDeleteNode,
  onCloseEdit,
}: {
  selectedNode: OrgNode;
  nodes: OrgNode[];
  onUpdateNode: (id: string, name: string, type: string, superiorId: string) => void;
  onDeleteNode: (id: string) => void;
  onCloseEdit: () => void;
}) {
  const [editName, setEditName] = useState(selectedNode.name);
  const [editType, setEditType] = useState(selectedNode.type);
  const [editSuperiorId, setEditSuperiorId] = useState(parseSuperior(selectedNode) || '');

  useEffect(() => {
    setEditName(selectedNode.name);
    setEditType(selectedNode.type);
    setEditSuperiorId(parseSuperior(selectedNode) || '');
  }, [selectedNode]);

  const validSuperiors = useMemo(() => {
    const descendants = getDescendants(selectedNode.id, nodes);
    return nodes.filter((n) => {
      if (n.id === selectedNode.id) return false;
      if (descendants.has(n.id)) return false;

      if (editType === 'Lead') return n.type === 'Lead';
      if (editType === 'Worker') return n.type === 'Lead';
      if (editType === 'Agent') return n.type === 'Lead' || n.type === 'Worker';
      return false;
    });
  }, [selectedNode, nodes, editType]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateNode(selectedNode.id, editName, editType, editSuperiorId);
    onCloseEdit();
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">Name / Role</label>
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">Type</label>
        <select
          value={editType}
          onChange={(e) => {
            setEditType(e.target.value);
            setEditSuperiorId('');
          }}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="Lead">Lead</option>
          <option value="Worker">Worker</option>
          <option value="Agent">Agent</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">Superior Node</label>
        <select
          value={editSuperiorId || ''}
          onChange={(e) => setEditSuperiorId(e.target.value)}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="" className="bg-slate-900 text-slate-200">
            {editType === 'Lead' ? 'None (Root Node)' : 'Select Superior...'}
          </option>
          {validSuperiors.map((n) => (
            <option key={n.id} value={n.id} className="bg-slate-900 text-slate-200">
              {n.name} ({n.type})
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg transition-colors shadow-md"
        >
          Save Changes
        </button>
        <button
          type="button"
          onClick={onCloseEdit}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>

      <button
        type="button"
        onClick={() => onDeleteNode(selectedNode.id)}
        className="w-full py-2 mt-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-medium rounded-lg transition-colors"
      >
        Delete Node
      </button>
    </form>
  );
}

function NodeInspector({
  selectedNode,
  nodes,
  tasks,
  onClose,
  onUpdateNode,
  onDeleteNode,
  onAddTask,
  onToggleTask,
  onDeleteTask,
}: {
  selectedNode: OrgNode;
  nodes: OrgNode[];
  tasks: TaskItem[];
  onClose: () => void;
  onUpdateNode: (id: string, name: string, type: string, superiorId: string) => void;
  onDeleteNode: (id: string) => void;
  onAddTask: (nodeId: string, title: string) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setIsEditing(false);
  }, [selectedNode.id]);

  const supId = parseSuperior(selectedNode);
  const superiorNode = supId ? nodes.find((n) => n.id === supId) : null;

  return (
    <aside className="w-80 border-l border-slate-800 bg-slate-900/90 backdrop-blur p-6 z-20 flex flex-col justify-between shadow-2xl overflow-y-auto">
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {isEditing ? 'Edit Node' : 'Node Inspector'}
          </h2>
          <div className="flex items-center gap-1">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-2.5 py-1 text-xs font-medium rounded bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/30 transition-colors"
              >
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-sm font-bold w-6 h-6 rounded flex items-center justify-center hover:bg-slate-800"
            >
              ✕
            </button>
          </div>
        </div>

        {isEditing ? (
          <EditNodeForm
            selectedNode={selectedNode}
            nodes={nodes}
            onUpdateNode={onUpdateNode}
            onDeleteNode={(id) => {
              onDeleteNode(id);
              onClose();
            }}
            onCloseEdit={() => setIsEditing(false)}
          />
        ) : (
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
              <span className="inline-block mt-2 text-xs font-mono px-2 py-0.5 bg-slate-800/80 rounded text-slate-300 border border-slate-700">
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
              selectedNodeId={selectedNode.id}
              tasks={tasks}
              onAddTask={onAddTask}
              onToggleTask={onToggleTask}
              onDeleteTask={onDeleteTask}
            />
          </div>
        )}
      </div>

      <div className="text-center text-[11px] text-slate-500 border-t border-slate-800 pt-4 mt-6">
        SpacetimeDB Org Tree Visualizer
      </div>
    </aside>
  );
}

// ============================================================================
// 6. MAIN PAGE COMPONENT
// ============================================================================

export default function Page() {
  const {
    nodes,
    tasks,
    isConnected,
    identity,
    addNode,
    updateNode,
    deleteNode,
    addTask,
    deleteTask,
    toggleTask,
  } = useOrgData();

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

  // Filter nodes while preserving parent hierarchy context
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

  const treeLayout = useMemo(() => {
    return calculateLeadTreeLayout(filteredNodes);
  }, [filteredNodes]);

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Controls Panel */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900/90 backdrop-blur flex flex-col z-20 shadow-2xl">
        <SidebarHeader isConnected={isConnected} identity={identity} />
        <MetricsBar nodes={nodes} tasks={tasks} />

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Search & Filters */}
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
                  className={`py-1 rounded font-medium transition-all ${filterType === type
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <AddNodeForm
            nodes={nodes}
            onAddNode={addNode}
            onSelectNode={(id) => setSelectedNodeId(id)}
          />
        </div>
      </aside>

      {/* Main Interactive Canvas */}
      <main
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="flex-1 relative cursor-grab active:cursor-grabbing bg-slate-950 overflow-hidden select-none"
      >
        {/* Canvas Background Grid */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#6366f1 1.5px, transparent 1.5px)`,
            backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        <CanvasToolbar zoom={zoom} setZoom={setZoom} resetView={resetView} />

        {/* Tree Container Transformed with Pan & Zoom */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        >
          {/* Upper Tree Lead Connector Curves */}
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

          {/* Rendered Lead Trees & Attached Worker Rows */}
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
                {/* Lead Card Container */}
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
                      <span
                        className={`w-2 h-2 rounded-full ${node.status === 'Active'
                            ? 'bg-emerald-400 shadow-emerald-400/50'
                            : node.status === 'Busy'
                              ? 'bg-amber-400'
                              : 'bg-slate-400'
                          }`}
                      />
                      {node.status || 'Idle'}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-100 text-sm truncate">{node.name}</h3>

                  {/* Direct Agent Dots assigned to this Lead */}
                  {node.assignedAgents && node.assignedAgents.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] text-purple-400 font-semibold uppercase">
                        Lead Agents ({node.assignedAgents.length})
                      </span>
                      <div className="flex items-center gap-1.5 overflow-x-auto max-w-[200px]">
                        {node.assignedAgents.map((agent) => (
                          <AgentDot
                            key={agent.id}
                            agent={agent}
                            onSelectAgent={(id) => setSelectedNodeId(id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Vertical Stem Line Connecting to Subordinate Workers */}
                {node.teamWorkers && node.teamWorkers.length > 0 && (
                  <>
                    <div className="w-0.5 h-4 bg-gradient-to-b from-indigo-500 to-purple-500 opacity-70" />

                    {/* Subordinates Row Box */}
                    <div className="w-full bg-slate-950/90 border border-slate-800/90 rounded-xl p-3 shadow-xl backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800/80 px-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                          Team Workers ({node.teamWorkers.length})
                        </span>
                        <span className="text-[9px] font-mono text-slate-500">Agent Dots</span>
                      </div>

                      {/* Subordinate Worker Rows */}
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
                              {/* Worker Label & Status */}
                              <div className="flex items-center gap-2 truncate pr-2">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${worker.status === 'Active'
                                      ? 'bg-emerald-400'
                                      : worker.status === 'Busy'
                                        ? 'bg-amber-400'
                                        : 'bg-slate-500'
                                    }`}
                                />
                                <span className="truncate text-[11px] font-medium leading-tight">
                                  {worker.name}
                                </span>
                              </div>

                              {/* Hoverable Agent Dots for this Worker */}
                              <div className="flex items-center gap-1 shrink-0">
                                {worker.assignedAgents.length > 0 ? (
                                  worker.assignedAgents.map((agent) => (
                                    <AgentDot
                                      key={agent.id}
                                      agent={agent}
                                      onSelectAgent={(id) => setSelectedNodeId(id)}
                                    />
                                  ))
                                ) : (
                                  <span className="text-[9px] text-slate-600 font-mono italic">
                                    no agents
                                  </span>
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

      {/* Selected Node Details Panel */}
      {selectedNode && (
        <NodeInspector
          selectedNode={selectedNode}
          nodes={nodes}
          tasks={tasks}
          onClose={() => setSelectedNodeId(null)}
          onUpdateNode={updateNode}
          onDeleteNode={deleteNode}
          onAddTask={addTask}
          onToggleTask={toggleTask}
          onDeleteTask={deleteTask}
        />
      )}
    </div>
  );
}