import { schema, table, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

// Tables matching lib/module_bindings + /live UI (LiveOrgChart, HumanInbox, DemoControls, …)

const task = table(
  { name: 'task', public: true },
  {
    id: t.string().primaryKey(),
    description: t.string(),
    status: t.string(), // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
    nodeId: t.string(),
  }
);

const orgNode = table(
  { name: 'org_node', public: true },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    type: t.string(), // 'AGENT' | 'HUMAN'
    status: t.string(), // 'IDLE' | 'WORKING' | 'BLOCKED_BY_HUMAN'
    reportsToJson: t.string(),
    subordinatesJson: t.string(),
  }
);

const handoff = table(
  { name: 'handoff', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    taskId: t.string(),
    fromNodeId: t.string(),
    assignedToId: t.string(),
    question: t.string(),
    context: t.string(),
    status: t.string(), // 'OPEN' | 'RESOLVED'
    answer: t.string(),
    createdAt: t.timestamp(),
  }
);

const activity = table(
  { name: 'activity', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    nodeId: t.string(),
    kind: t.string(), // 'REASONING' | 'ACTION' | 'HUMAN' | 'SYSTEM' | 'WEB'
    message: t.string(),
    createdAt: t.timestamp(),
  }
);

const escalationTimer = table(
  { name: 'escalation_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    handoffId: t.u64(),
  }
);

const spacetimedb = schema({ task, orgNode, handoff, activity, escalationTimer });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
const ESCALATE_AFTER_MICROS = 15_000_000n; // 15s

function managerOf(ctx: Ctx, nodeId: string): string {
  const node = ctx.db.orgNode.id.find(nodeId);
  if (!node) return '';
  try {
    const ids = JSON.parse(node.reportsToJson) as string[];
    return ids[0] ?? '';
  } catch {
    return '';
  }
}

function log(ctx: Ctx, nodeId: string, kind: string, message: string) {
  ctx.db.activity.insert({ id: 0n, nodeId, kind, message, createdAt: ctx.timestamp });
}

function setStatus(ctx: Ctx, nodeId: string, status: string) {
  const node = ctx.db.orgNode.id.find(nodeId);
  if (node) ctx.db.orgNode.id.update({ ...node, status });
}

function scheduleEscalation(ctx: Ctx, handoffId: bigint) {
  ctx.db.escalationTimer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + ESCALATE_AFTER_MICROS),
    handoffId,
  });
}

export const addNode = spacetimedb.reducer(
  {
    id: t.string(),
    name: t.string(),
    type: t.string(),
    reportsToJson: t.string(),
  },
  (ctx, { id, name, type, reportsToJson }) => {
    ctx.db.orgNode.insert({
      id,
      name,
      type,
      status: 'IDLE',
      reportsToJson: reportsToJson || '[]',
      subordinatesJson: '[]',
    });
  }
);

export const updateStatus = spacetimedb.reducer(
  { id: t.string(), status: t.string() },
  (ctx, { id, status }) => setStatus(ctx, id, status)
);

export const logActivity = spacetimedb.reducer(
  { nodeId: t.string(), kind: t.string(), message: t.string() },
  (ctx, { nodeId, kind, message }) => log(ctx, nodeId, kind, message)
);

export const assignTask = spacetimedb.reducer(
  { nodeId: t.string(), description: t.string() },
  (ctx, { nodeId, description }) => {
    const id = `task-${ctx.timestamp.microsSinceUnixEpoch}`;
    ctx.db.task.insert({ id, description, status: 'IN_PROGRESS', nodeId });
    setStatus(ctx, nodeId, 'WORKING');
    log(ctx, nodeId, 'SYSTEM', `New task: ${description}`);
  }
);

export const completeTask = spacetimedb.reducer(
  { taskId: t.string() },
  (ctx, { taskId }) => {
    const row = ctx.db.task.id.find(taskId);
    if (!row) return;
    ctx.db.task.id.update({ ...row, status: 'COMPLETED' });
    setStatus(ctx, row.nodeId, 'IDLE');
    log(ctx, row.nodeId, 'ACTION', `Completed: ${row.description}`);
  }
);

export const requestHelp = spacetimedb.reducer(
  { taskId: t.string(), question: t.string(), context: t.string() },
  (ctx, { taskId, question, context }) => {
    const row = ctx.db.task.id.find(taskId);
    if (!row) return;
    const managerId = managerOf(ctx, row.nodeId);
    setStatus(ctx, row.nodeId, 'BLOCKED_BY_HUMAN');
    const created = ctx.db.handoff.insert({
      id: 0n,
      taskId,
      fromNodeId: row.nodeId,
      assignedToId: managerId,
      question,
      context,
      status: 'OPEN',
      answer: '',
      createdAt: ctx.timestamp,
    });
    log(ctx, row.nodeId, 'SYSTEM', `Paused, asking ${managerId}: ${question}`);
    scheduleEscalation(ctx, created.id);
  }
);

export const resolveHandoff = spacetimedb.reducer(
  { handoffId: t.u64(), answer: t.string() },
  (ctx, { handoffId, answer }) => {
    const h = ctx.db.handoff.id.find(handoffId);
    if (!h || h.status !== 'OPEN') return;
    ctx.db.handoff.id.update({ ...h, status: 'RESOLVED', answer });
    setStatus(ctx, h.fromNodeId, 'WORKING');
    log(ctx, h.assignedToId, 'HUMAN', `Answered: ${answer}`);
  }
);

export const escalate = spacetimedb.reducer(
  { onSchedule: escalationTimer },
  { timer: escalationTimer.rowType },
  (ctx, { timer }) => {
    const h = ctx.db.handoff.id.find(timer.handoffId);
    if (!h || h.status !== 'OPEN') return;
    const nextId = managerOf(ctx, h.assignedToId);
    if (!nextId) return;
    ctx.db.handoff.id.update({ ...h, assignedToId: nextId });
    log(ctx, nextId, 'SYSTEM', `Escalated from ${h.assignedToId}: no answer in 15s`);
    scheduleEscalation(ctx, h.id);
  }
);

export const resetDemo = spacetimedb.reducer((ctx) => {
  for (const r of [...ctx.db.activity.iter()]) ctx.db.activity.id.delete(r.id);
  for (const r of [...ctx.db.handoff.iter()]) ctx.db.handoff.id.delete(r.id);
  for (const r of [...ctx.db.task.iter()]) ctx.db.task.id.delete(r.id);
  for (const r of [...ctx.db.orgNode.iter()]) ctx.db.orgNode.id.delete(r.id);

  ctx.db.orgNode.insert({
    id: 'vp',
    name: 'Sam (VP Sales)',
    type: 'HUMAN',
    status: 'IDLE',
    reportsToJson: '[]',
    subordinatesJson: '["mgr"]',
  });
  ctx.db.orgNode.insert({
    id: 'mgr',
    name: 'Alice (Sales Manager)',
    type: 'HUMAN',
    status: 'IDLE',
    reportsToJson: '["vp"]',
    subordinatesJson: '["researcher","analyst"]',
  });
  ctx.db.orgNode.insert({
    id: 'researcher',
    name: 'Researcher Agent',
    type: 'AGENT',
    status: 'IDLE',
    reportsToJson: '["mgr"]',
    subordinatesJson: '[]',
  });
  ctx.db.orgNode.insert({
    id: 'analyst',
    name: 'Analyst Agent',
    type: 'AGENT',
    status: 'IDLE',
    reportsToJson: '["mgr"]',
    subordinatesJson: '[]',
  });
  log(ctx, 'vp', 'SYSTEM', 'Demo reset');
});