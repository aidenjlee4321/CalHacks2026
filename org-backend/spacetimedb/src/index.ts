import { table, reducer, Column, Table } from '@clockworklabs/spacetimedb-sdk';

// 1. Define the Task Table
@table({ name: 'task' })
export class Task extends Table {
  @Column({ primary: true })
  id!: string;

  @Column()
  description!: string;

  @Column()
  status!: string; // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'

  @Column()
  nodeId!: string; // Foreign key linking task to an OrgNode
}

// 2. Define the OrgNode Table
@table({ name: 'org_node' })
export class OrgNode extends Table {
  @Column({ primary: true })
  id!: string;

  @Column()
  name!: string;

  @Column()
  type!: string; // 'AGENT' | 'HUMAN'

  @Column()
  status!: string; // 'IDLE' | 'WORKING' | 'BLOCKED_BY_HUMAN'

  // SpacetimeDB handles lists as stringified JSON or relational sub-tables.
  // For the hackathon, storing serialized string arrays keeps reads/writes fast.
  @Column()
  reportsToJson!: string; // e.g. '["node-1"]'

  @Column()
  subordinatesJson!: string; // e.g. '["node-2", "node-3"]'
}

// 3. Define Reducers (Server Actions)
@reducer()
export function addNode(ctx: any, id: string, name: string, type: string) {
  OrgNode.insert({
    id,
    name,
    type,
    status: 'IDLE',
    reportsToJson: '[]',
    subordinatesJson: '[]',
  });
}

@reducer()
export function updateStatus(ctx: any, id: string, status: string) {
  const node = OrgNode.findById(id);
  if (node) {
    OrgNode.update({ ...node, status });
  }
}