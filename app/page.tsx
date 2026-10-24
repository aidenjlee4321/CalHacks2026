'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from 'react';

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
  type: string; // 'Worker' | 'Agent'
  status?: string;
  superior?: string;
  reportsToJson?: string;
  subordinatesJson?: string;
}

export interface ExtendedNode extends OrgNode {
  childrenNodes: ExtendedNode[];
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
// 2. FALLBACK CONTEXT & INITIAL DEMO DATA
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

const INITIAL_NODES: OrgNode[] = [
  { id: 'root-1', name: 'Sarah Connor', type: 'Worker', status: 'Active' },
  { id: 'tech-lead', name: 'Alex Rivera', type: 'Worker', status: 'Active', superior: 'root-1' },
  { id: 'ops-lead', name: 'Marcus Vance', type: 'Worker', status: 'Idle', superior: 'root-1' },
  { id: 'dev-1', name: 'Agent 1 (GPT)', type: 'Agent', status: 'Idle', superior: 'tech-lead' },
  { id: 'dev-2', name: 'Agent 2 (Claude)', type: 'Agent', status: 'Working', superior: 'tech-lead' },
];

const INITIAL_TASKS: TaskItem[] = [
  { id: 't-1', assignedNodeId: 'root-1', title: 'Review Q3 Org Budget & Allocations', completed: false },
  { id: 't-2', assignedNodeId: 'tech-lead', title: 'Approve SpacetimeDB Migration Plan', completed: true },
  { id: 't-3', assignedNodeId: 'tech-lead', title: 'Conduct Q3 Engineering 1-on-1s', completed: false },
  { id: 't-4', assignedNodeId: 'dev-1', title: 'Implement WebSocket reconnect guard', completed: true },
  { id: 't-5', assignedNodeId: 'dev-2', title: 'Optimize canvas pan & zoom performance', completed: false },
  { id: 't-6', assignedNodeId: 'ops-lead', title: 'Audit workspace infrastructure access', completed: false },
];
// ============================================================================
// 3. UTILITY HELPERS
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

export function calculateTreeLayout(filteredNodes: OrgNode[]) {
  if (filteredNodes.length === 0) return { rootNodes: [], lines: [] };

  const nodeMap = new Map<string, ExtendedNode>();
  filteredNodes.forEach((n) => {
    nodeMap.set(n.id, {
      ...n,
      childrenNodes: [],
      level: 0,
      x: 0,
      y: 0,
    });
  });

  const rootNodes: ExtendedNode[] = [];

  nodeMap.forEach((node) => {
    const supId = parseSuperior(node);
    if (supId && nodeMap.has(supId) && supId !== node.id) {
      nodeMap.get(supId)!.childrenNodes.push(node);
    } else {
      rootNodes.push(node);
    }
  });

  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 100;
  const LEVEL_HEIGHT = 160;
  const HORIZONTAL_GAP = 50;

  let currentX = 50;

  const calculateSubtree = (node: ExtendedNode, level: number): number => {
    node.level = level;
    node.y = level * LEVEL_HEIGHT + 60;

    if (node.childrenNodes.length === 0) {
      node.x = currentX;
      currentX += NODE_WIDTH + HORIZONTAL_GAP;
      return node.x;
    }

    const childrenX: number[] = [];
    node.childrenNodes.forEach((child) => {
      childrenX.push(calculateSubtree(child, level + 1));
    });

    node.x = (childrenX[0] + childrenX[childrenX.length - 1]) / 2;
    return node.x;
  };

  rootNodes.forEach((root) => calculateSubtree(root, 0));

  const visited = new Set<string>();
  const markVisited = (node: ExtendedNode) => {
    visited.add(node.id);
    node.childrenNodes.forEach(markVisited);
  };
  rootNodes.forEach(markVisited);

  nodeMap.forEach((node) => {
    if (!visited.has(node.id)) {
      rootNodes.push(node);
      calculateSubtree(node, 0);
    }
  });

  const flattenedNodes: ExtendedNode[] = [];
  const lines: TreeLine[] = [];

  const traverse = (node: ExtendedNode) => {
    flattenedNodes.push(node);
    node.childrenNodes.forEach((child) => {
      lines.push({
        id: `${node.id}-${child.id}`,
        x1: node.x + NODE_WIDTH / 2,
        y1: node.y + NODE_HEIGHT,
        x2: child.x + NODE_WIDTH / 2,
        y2: child.y,
      });
      traverse(child);
    });
  };

  rootNodes.forEach(traverse);

  return { rootNodes: flattenedNodes, lines };
}

// ============================================================================
// 4. CUSTOM HOOKS
// ============================================================================

/**
 * Custom hook to handle Canvas Pan and Zoom interactions
 */
function useCanvasPanZoom(onDeselect: () => void) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 100, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dragDistance = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.tree-node-card')) return;
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
    setPan({ x: 100, y: 50 });
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

/**
 * Custom hook managing Live SpacetimeDB data synchronization & CRUD actions
 */
function useOrgData() {
  const spacetime = useSpacetimeHook();
  const [demoNodes, setDemoNodes] = useState<OrgNode[]>(INITIAL_NODES);
  const [nodes, setNodes] = useState<OrgNode[]>(INITIAL_NODES);
  const [demoTasks, setDemoTasks] = useState<TaskItem[]>(INITIAL_TASKS);
  const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);

  const isConnected = spacetime.connected || true;
  const identity = spacetime.identity || 'demo_identity_0x8f2a9c';

  // Real-time synchronization loop
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

  // Node CRUD operations
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

  // Task CRUD operations
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

/**
 * Sidebar Header & Status Banner
 */
function SidebarHeader({ isConnected, identity }: { isConnected: boolean; identity: string | null }) {
  return (
    <>
      <header className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg text-white tracking-wide">Spacetime Org</h1>
          <p className="text-xs text-slate-400">Live Visual Tree Explorer</p>
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

/**
 * Summary Stats Display Bar
 */
function MetricsBar({ nodes, tasks }: { nodes: OrgNode[]; tasks: TaskItem[] }) {
  const metrics = useMemo(() => {
    const total = nodes.filter((n) => n.type !== 'System').length;
    const agents = nodes.filter((n) => n.type === 'Agent').length;
    const workers = nodes.filter((n) => n.type === 'Worker').length;
    const pendingTasks = tasks.filter((t) => !t.completed).length;
    return { total, agents, workers, pendingTasks };
  }, [nodes, tasks]);

  return (
    <div className="grid grid-cols-4 gap-1 p-3 bg-slate-950/80 border-b border-slate-800 text-center">
      <div>
        <span className="block text-[10px] text-slate-500 uppercase">Nodes</span>
        <span className="text-xs font-bold text-slate-200">{metrics.total}</span>
      </div>
      <div>
        <span className="block text-[10px] text-purple-400 uppercase">Agents</span>
        <span className="text-xs font-bold text-purple-300">{metrics.agents}</span>
      </div>
      <div>
        <span className="block text-[10px] text-indigo-400 uppercase">Workers</span>
        <span className="text-xs font-bold text-indigo-300">{metrics.workers}</span>
      </div>
      <div>
        <span className="block text-[10px] text-amber-400 uppercase">Tasks</span>
        <span className="text-xs font-bold text-amber-300">{metrics.pendingTasks}</span>
      </div>
    </div>
  );
}

/**
 * Add Node Form Component
 */
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
  const [nodeType, setNodeType] = useState('Worker');
  const [superiorId, setSuperiorId] = useState('');

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
        Add Organizational Node
      </h2>

      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">Name / Role</label>
        <input
          type="text"
          value={nodeName}
          onChange={(e) => setNodeName(e.target.value)}
          placeholder="e.g. Lead Architect"
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">Node Type</label>
        <select
          value={nodeType}
          onChange={(e) => {
            const newType = e.target.value;
            setNodeType(newType);
            if (superiorId) {
              const sup = nodes.find((n) => n.id === superiorId);
              if (sup && sup.type === 'Agent') {
                setSuperiorId('');
              }
            }
          }}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          <option value="Worker">Worker</option>
          <option value="Agent">Agent</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">Superior Node (Optional)</label>
        <select
          value={superiorId}
          onChange={(e) => setSuperiorId(e.target.value)}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          <option value="" className="bg-slate-900 text-slate-200">
            None (Top-Level Root)
          </option>
          {nodes
            .filter((n) => {
              if (n.type === 'System') return false;
              if (n.type === 'Agent') return false;
              return true;
            })
            .map((n) => (
              <option key={n.id} value={n.id} className="bg-slate-900 text-slate-200">
                {n.name} ({n.type})
              </option>
            ))}
        </select>
        {nodeType === 'Agent' && (
          <p className="text-[10px] text-amber-400/90 mt-1">
            Note: Agent nodes cannot be selected as superior nodes.
          </p>
        )}
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

/**
 * Floating Controls Toolbar for Zooming and Resetting the Canvas
 */
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

/**
 * Task Management List inside Node Inspector
 */
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

/**
 * Edit Node Form Mode inside Node Inspector
 */
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
          onChange={(e) => setEditType(e.target.value)}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
        >
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
            None (Root Node)
          </option>
          {nodes
            .filter((n) => {
              if (n.id === selectedNode.id) return false;
              if (n.type === 'System') return false;
              const descendants = getDescendants(selectedNode.id, nodes);
              if (descendants.has(n.id)) return false;
              if (n.type === 'Agent') return false;
              return true;
            })
            .map((n) => (
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

/**
 * Node Inspector & Tasks Right Panel
 */
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
              <span className="text-xs text-indigo-400 font-semibold uppercase">
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
                  {supId ? (
                    <span className="font-mono text-indigo-400 bg-indigo-950/40 px-2 py-1 rounded border border-indigo-800/40 inline-block">
                      {supId}
                    </span>
                  ) : (
                    <span className="italic text-slate-600">None (Top Level Root)</span>
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
        SpacetimeDB Org Visualizer
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

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('root-1');
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

  // Filter nodes based on Search & Node Type
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (n.type === 'System') return false;
      const matchesSearch =
        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'ALL' || n.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [nodes, searchQuery, filterType]);

  // Compute Layout Position & Connector Lines
  const treeLayout = useMemo(() => {
    return calculateTreeLayout(filteredNodes);
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

            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              {['ALL', 'Worker', 'Agent'].map((type) => (
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
          {/* Connector Curves */}
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

          {/* Rendered Node Cards */}
          {treeLayout.rootNodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            return (
              <div
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                }}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: '220px',
                }}
                className={`tree-node-card absolute pointer-events-auto cursor-pointer rounded-xl p-4 transition-all duration-200 border shadow-xl ${isSelected
                    ? 'bg-slate-900 border-indigo-500 shadow-indigo-500/20 ring-2 ring-indigo-500/50 scale-105 z-10'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-800/90'
                  }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${node.type === 'Agent'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      }`}
                  >
                    {node.type}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {node.status || 'Idle'}
                  </span>
                </div>

                <h3 className="font-bold text-slate-100 text-sm truncate">{node.name}</h3>

                <p className="text-[10px] font-mono text-slate-500 truncate mt-1">
                  ID: {node.id.slice(0, 12)}...
                </p>
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