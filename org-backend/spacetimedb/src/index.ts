import { schema, table, t } from 'spacetimedb/server';

// 1. Define Task Table
const task = table(
  { name: 'task', public: true },
  {
    id: t.string().primaryKey(),
    description: t.string(),
    status: t.string(), // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
    nodeId: t.string(),
  }
);

// 2. Define OrgNode Table
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

// 3. Register Database Schema
const spacetimedb = schema({ task, orgNode });

// 4. Export Reducers
export const add_node = spacetimedb.reducer(
  { name: 'add_node' },
  { id: t.string(), name: t.string(), type: t.string() },
  (ctx, { id, name, type }) => {
    ctx.db.orgNode.insert({
      id,
      name,
      type,
      status: 'IDLE',
      reportsToJson: '[]',
      subordinatesJson: '[]',
    });
  }
);

export const update_status = spacetimedb.reducer(
  { name: 'update_status' },
  { id: t.string(), status: t.string() },
  (ctx, { id, status }) => {
    const node = ctx.db.orgNode.id.find(id);
    if (node) {
      ctx.db.orgNode.id.update({ ...node, status });
    }
  }
);

export default spacetimedb;