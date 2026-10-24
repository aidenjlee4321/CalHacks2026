import { schema, table, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

// 1. Task Table
const task = table(
  { name: 'task', public: true },
  {
    id: t.string().primaryKey(),
    description: t.string(),
    status: t.string(), // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
    nodeId: t.string(),
  }
);

// 2. OrgNode Table
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

// 3. Handoff Table (agent asking a human for help)
const handoff = table(
  { name: 'handoff', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    taskId: t.string(),
    fromNodeId: t.string(),     // the stuck agent
    assignedToId: t.string(),   // the human who must answer
    question: t.string(),
    context: t.string(),
    status: t.string(),         // 'OPEN' | 'RESOLVED'
    answer: t.string(),
    createdAt: t.timestamp(),
  }
);

// 4. Activity Table (unified feed)
const activity = table(
  { name: 'activity', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    nodeId: t.string(),
    kind: t.string(),           // 'REASONING' | 'ACTION' | 'HUMAN' | 'SYSTEM'
    message: t.string(),
    createdAt: t.timestamp(),
  }
);

// 5. Escalation timer (fires if nobody answers)
const escalationTimer = table(
  { name: 'escalation_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    handoffId: t.u64(),
  }
);

// Register schema
const spacetimedb = schema({ task, orgNode, handoff, activity, escalationTimer });

// ---------- helpers (not exported) ----------
type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
const ESCALATE_AFTER_MICROS = 15_000_000n; // 60 seconds

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

// ---------- reducers ----------
export const add_node = spacetimedb.reducer(
  { name: 'add_node' },
  { id: t.string(), name: t.string(), type: t.string() },
  (ctx, { id, name, type }) => {
    ctx.db.orgNode.insert({
      id, name, type, status: 'IDLE', reportsToJson: '[]', subordinatesJson: '[]',
    });
  }
);

export const update_status = spacetimedb.reducer(
  { name: 'update_status' },
  { id: t.string(), status: t.string() },
  (ctx, { id, status }) => setStatus(ctx, id, status)
);

export const log_activity = spacetimedb.reducer(
  { name: 'log_activity' },
  { nodeId: t.string(), kind: t.string(), message: t.string() },
  (ctx, { nodeId, kind, message }) => log(ctx, nodeId, kind, message)
);

export const assign_task = spacetimedb.reducer(
  { name: 'assign_task' },
  { nodeId: t.string(), description: t.string() },
  (ctx, { nodeId, description }) => {
    const id = `task-${ctx.timestamp.microsSinceUnixEpoch}`;
    ctx.db.task.insert({ id, description, status: 'IN_PROGRESS', nodeId });
    setStatus(ctx, nodeId, 'WORKING');
    log(ctx, nodeId, 'SYSTEM', `New task: ${description}`);
  }
);

export const complete_task = spacetimedb.reducer(
  { name: 'complete_task' },
  { taskId: t.string() },
  (ctx, { taskId }) => {
    const row = ctx.db.task.id.find(taskId);
    if (!row) return;
    ctx.db.task.id.update({ ...row, status: 'COMPLETED' });
    setStatus(ctx, row.nodeId, 'IDLE');
    log(ctx, row.nodeId, 'ACTION', `Completed: ${row.description}`);
  }
);

// Agent is stuck → pause it, ask its manager, start the 60s timer (one transaction)
export const request_help = spacetimedb.reducer(
  { name: 'request_help' },
  { taskId: t.string(), question: t.string(), context: t.string() },
  (ctx, { taskId, question, context }) => {
    const row = ctx.db.task.id.find(taskId);
    if (!row) return;
    const managerId = managerOf(ctx, row.nodeId);
    setStatus(ctx, row.nodeId, 'BLOCKED_BY_HUMAN');
    const created = ctx.db.handoff.insert({
      id: 0n, taskId, fromNodeId: row.nodeId, assignedToId: managerId,
      question, context, status: 'OPEN', answer: '', createdAt: ctx.timestamp,
    });
    log(ctx, row.nodeId, 'SYSTEM', `Paused, asking ${managerId}: ${question}`);
    scheduleEscalation(ctx, created.id);
  }
);

// Human answers → close handoff, wake the agent
export const resolve_handoff = spacetimedb.reducer(
  { name: 'resolve_handoff' },
  { handoffId: t.u64(), answer: t.string() },
  (ctx, { handoffId, answer }) => {
    const h = ctx.db.handoff.id.find(handoffId);
    if (!h || h.status !== 'OPEN') return;
    ctx.db.handoff.id.update({ ...h, status: 'RESOLVED', answer });
    setStatus(ctx, h.fromNodeId, 'WORKING');
    log(ctx, h.assignedToId, 'HUMAN', `Answered: ${answer}`);
  }
);

// Runs automatically 60s later; if still unanswered, move it up the org chart
export const escalate = spacetimedb.reducer(
  { onSchedule: escalationTimer },
  { timer: escalationTimer.rowType },
  (ctx, { timer }) => {
    const h = ctx.db.handoff.id.find(timer.handoffId);
    if (!h || h.status !== 'OPEN') return;
    const nextId = managerOf(ctx, h.assignedToId);
    if (!nextId) return; // already at the top
    ctx.db.handoff.id.update({ ...h, assignedToId: nextId });
    log(ctx, nextId, 'SYSTEM', `Escalated from ${h.assignedToId}: no answer in 15s`);
    scheduleEscalation(ctx, h.id);
  }
);

// Wipe everything and load the demo org
export const reset_demo = spacetimedb.reducer(
  { name: 'reset_demo' },
  (ctx) => {
    for (const r of [...ctx.db.activity.iter()]) ctx.db.activity.id.delete(r.id);
    for (const r of [...ctx.db.handoff.iter()]) ctx.db.handoff.id.delete(r.id);
    for (const r of [...ctx.db.task.iter()]) ctx.db.task.id.delete(r.id);
    for (const r of [...ctx.db.orgNode.iter()]) ctx.db.orgNode.id.delete(r.id);

    ctx.db.orgNode.insert({ id: 'vp', name: 'Sam (VP Sales)', type: 'HUMAN', status: 'IDLE',
      reportsToJson: '[]', subordinatesJson: '["mgr"]' });
    ctx.db.orgNode.insert({ id: 'mgr', name: 'Alice (Sales Manager)', type: 'HUMAN', status: 'IDLE',
      reportsToJson: '["vp"]', subordinatesJson: '["researcher","analyst"]' });
    ctx.db.orgNode.insert({ id: 'researcher', name: 'Researcher Agent', type: 'AGENT', status: 'IDLE',
      reportsToJson: '["mgr"]', subordinatesJson: '[]' });
    ctx.db.orgNode.insert({ id: 'analyst', name: 'Analyst Agent', type: 'AGENT', status: 'IDLE',
      reportsToJson: '["mgr"]', subordinatesJson: '[]' });
    log(ctx, 'vp', 'SYSTEM', 'Demo reset');
  }
);

export default spacetimedb;