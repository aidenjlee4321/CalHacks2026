import { schema, table, t } from 'spacetimedb/server';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const VALID_NODE_TYPES = ['LEAD', 'WORKER', 'AGENT'];

// ============================================================================
// 1. TABLE DEFINITIONS (Do NOT export tables directly)
// ============================================================================

const orgNode = table(
  { name: 'org_node', public: true },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    type: t.string(),
    status: t.string(),
  }
);

const reportsTo = table(
  { name: 'reports_to', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    parentId: t.string(),
    childId: t.string(),
    rank: t.i32(),
  }
);

const task = table(
  { name: 'task', public: true },
  {
    id: t.string().primaryKey(),
    nodeId: t.string(),
    assignedById: t.string(),
    description: t.string(),
    status: t.string(),
  }
);

// Instantiate schema instance
const spacetimedb = schema({ orgNode, reportsTo, task });

// Export schema as the default export ONLY
export default spacetimedb;

// ============================================================================
// 2. BACKEND REDUCERS (ONLY reducers should be named exports)
// ============================================================================

export const add_node = spacetimedb.reducer(
  { id: t.string(), name: t.string(), type: t.string(), parentId: t.string() },
  (ctx, { id, name, type, parentId }) => {
    const cleanType = (type || 'WORKER').toUpperCase().trim();
    const cleanParentId = (parentId || '').trim();

    check(
      VALID_NODE_TYPES.includes(cleanType),
      `Invalid type: ${cleanType}. Must be one of: ${VALID_NODE_TYPES.join(', ')}`
    );
    check(!ctx.db.orgNode.id.find(id), `Node already exists: ${id}`);

    ctx.db.orgNode.insert({
      id,
      name: name.trim() || 'New Member',
      type: cleanType,
      status: 'IDLE',
    });

    if (cleanParentId.length > 0 && ctx.db.orgNode.id.find(cleanParentId)) {
      ctx.db.reportsTo.insert({
        id: 0n,
        parentId: cleanParentId,
        childId: id,
        rank: 0,
      });
    }
  }
);

export const update_node = spacetimedb.reducer(
  {
    id: t.string(),
    name: t.string(),
    type: t.string(),
    parentId: t.string(),
    changeParent: t.bool(),
  },
  (ctx, { id, name, type, parentId, changeParent }) => {
    const existing = ctx.db.orgNode.id.find(id);
    if (!existing) {
      throw new Error(`Node not found: ${id}`);
    }

    const cleanType = (type || existing.type).toUpperCase().trim();
    check(
      VALID_NODE_TYPES.includes(cleanType),
      `Invalid type: ${cleanType}. Must be one of: ${VALID_NODE_TYPES.join(', ')}`
    );

    ctx.db.orgNode.id.update({
      id: existing.id,
      name: name.trim() || existing.name,
      type: cleanType,
      status: existing.status,
    });

    if (changeParent) {
      for (const rel of ctx.db.reportsTo.iter()) {
        if (rel.childId === id) {
          ctx.db.reportsTo.id.delete(rel.id);
        }
      }

      const cleanParentId = (parentId || '').trim();
      if (cleanParentId.length > 0 && ctx.db.orgNode.id.find(cleanParentId)) {
        ctx.db.reportsTo.insert({
          id: 0n,
          parentId: cleanParentId,
          childId: id,
          rank: 0,
        });
      }
    }
  }
);

export const update_status = spacetimedb.reducer(
  { id: t.string(), status: t.string() },
  (ctx, { id, status }) => {
    const existing = ctx.db.orgNode.id.find(id);
    if (!existing) {
      throw new Error(`Node not found: ${id}`);
    }

    ctx.db.orgNode.id.update({
      id: existing.id,
      name: existing.name,
      type: existing.type,
      status: (status || 'IDLE').toUpperCase().trim(),
    });
  }
);

export const delete_node = spacetimedb.reducer(
  { id: t.string() },
  (ctx, { id }) => {
    const existing = ctx.db.orgNode.id.find(id);
    if (!existing) return;

    ctx.db.orgNode.id.delete(id);

    for (const rel of ctx.db.reportsTo.iter()) {
      if (rel.childId === id || rel.parentId === id) {
        ctx.db.reportsTo.id.delete(rel.id);
      }
    }

    for (const tRow of ctx.db.task.iter()) {
      if (tRow.nodeId === id) {
        ctx.db.task.id.delete(tRow.id);
      }
    }
  }
);

export const assign_task = spacetimedb.reducer(
  { nodeId: t.string(), description: t.string() },
  (ctx, { nodeId, description }) => {
    const cleanDesc = description.trim();
    check(cleanDesc.length > 0, 'Task description cannot be empty');

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const senderHex = ctx.sender ? String(ctx.sender) : '';

    ctx.db.task.insert({
      id: taskId,
      nodeId,
      assignedById: senderHex,
      description: cleanDesc,
      status: 'PENDING',
    });
  }
);

export const delete_task = spacetimedb.reducer(
  { taskId: t.string() },
  (ctx, { taskId }) => {
    const existing = ctx.db.task.id.find(taskId);
    if (existing) {
      ctx.db.task.id.delete(taskId);
    }
  }
);

export const toggle_task = spacetimedb.reducer(
  { taskId: t.string() },
  (ctx, { taskId }) => {
    const existing = ctx.db.task.id.find(taskId);
    if (!existing) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const newStatus = existing.status.toUpperCase() === 'COMPLETED' ? 'PENDING' : 'COMPLETED';

    ctx.db.task.id.update({
      id: existing.id,
      nodeId: existing.nodeId,
      assignedById: existing.assignedById,
      description: existing.description,
      status: newStatus,
    });
  }
);

export const reset_demo = spacetimedb.reducer(
  { keepLessons: t.bool() },
  (ctx) => {
    for (const n of ctx.db.orgNode.iter()) {
      ctx.db.orgNode.id.delete(n.id);
    }
    for (const r of ctx.db.reportsTo.iter()) {
      ctx.db.reportsTo.id.delete(r.id);
    }
    for (const tRow of ctx.db.task.iter()) {
      ctx.db.task.id.delete(tRow.id);
    }

    ctx.db.orgNode.insert({
      id: 'node-1',
      name: 'Executive Lead #001',
      type: 'LEAD',
      status: 'ACTIVE',
    });

    const deptLeads = [
      { id: 'node-2', name: 'Engineering Lead #002' },
      { id: 'node-3', name: 'Sales Lead #003' },
      { id: 'node-4', name: 'Operations Lead #004' },
      { id: 'node-5', name: 'Product Lead #005' },
    ];

    for (const lead of deptLeads) {
      ctx.db.orgNode.insert({
        id: lead.id,
        name: lead.name,
        type: 'LEAD',
        status: 'ACTIVE',
      });
      ctx.db.reportsTo.insert({
        id: 0n,
        parentId: 'node-1',
        childId: lead.id,
        rank: 0,
      });
    }

    for (let i = 6; i <= 10; i++) {
      const workerId = `node-${i}`;
      const parentLeadId = deptLeads[(i - 6) % deptLeads.length].id;
      ctx.db.orgNode.insert({
        id: workerId,
        name: `Worker #${i.toString().padStart(3, '0')}`,
        type: 'WORKER',
        status: 'IDLE',
      });
      ctx.db.reportsTo.insert({
        id: 0n,
        parentId: parentLeadId,
        childId: workerId,
        rank: 0,
      });
    }
  }
);