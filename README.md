# Spacetime Org

**A live org chart for hybrid human + AI teams.** Built at CalHacks 2026.

Companies are starting to staff teams with a mix of people and AI agents. Spacetime Org models that org as one hierarchy. **Leads** manage **Workers**, and Workers manage **Agents**. You can see who reports to whom, hand tasks to agents, run those agents against Claude, and track how they're performing.

## Features

- **Org topology dashboard** (`/`): a pannable, zoomable tree of Leads → Workers → Agents.
  - Add, edit, and search nodes, filter by node type, and see live status colors (Active / Idle / Busy / Offline).
  - Reassigning a node only offers valid superiors, so you can't create a reporting cycle.
  - Create and edit tasks, then run a task through an agent. The agent's status changes to *Busy* while it runs, and the task is checked off when it finishes.
- **Worker portal** (`/worker`): pick a Worker, then see their tasks and the agents assigned to them. You can send an agent a custom prompt and read its output.
- **Meta-analysis** (`/meta-analysis`): telemetry for every agent run, including tokens used, latency, and success count. It refreshes every 3 seconds.
- **Live mode** (`/live`): an org chart, an activity feed, a human inbox, and demo controls, all wired to the SpacetimeDB backend (see below).
- **Agent execution API**: `POST /api/agent/run` sends a prompt to Claude through the Anthropic SDK. It can add a simulated delay first, and it records telemetry for each run.

### SpacetimeDB backend: human-in-the-loop escalation

The `org-backend/spacetimedb` module stores the org in real-time tables: `org_node`, `task`, `handoff`, `activity`, and `escalation_timer`. Its most interesting logic is how it escalates questions:

1. A stuck agent calls `request_help`. The agent is paused (`BLOCKED_BY_HUMAN`), and a handoff opens for its manager.
2. A scheduled timer starts. If nobody answers within **15 seconds**, `escalate` moves the handoff up to the next manager in the chain, repeating until it reaches the top of the org.
3. When a human answers through `resolve_handoff`, the handoff closes and the agent goes back to `WORKING`.

`reset_demo` wipes the tables and loads a small sample org: a VP, a manager, and two agents.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- [SpacetimeDB](https://spacetimedb.com) 2.x (real-time database + server module, hosted on Maincloud)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) for agent runs

## Project structure

```
app/
  page.tsx              # main org topology dashboard
  worker/               # worker portal
  meta-analysis/        # agent telemetry dashboard
  live/                 # SpacetimeDB-backed live view
  edit/                 # simple org editor (local state)
  api/
    agent/run/          # runs a prompt against Claude, records telemetry
    telemetry/          # returns recorded agent runs
components/             # org chart, inbox, providers, demo controls
hooks/useOrgData.ts     # org/task state (SpacetimeDB tables, or a demo dataset)
lib/
  module_bindings/      # generated SpacetimeDB client bindings
  telemetryStore.ts     # in-memory telemetry store
org-backend/
  spacetimedb/src/      # SpacetimeDB server module (tables + reducers)
```

## Getting started

### Prerequisites

- Node.js 20+
- An [Anthropic API key](https://console.anthropic.com/), for running agents
- *(Optional)* The [SpacetimeDB CLI](https://spacetimedb.com/install), needed only to publish or modify the backend module

### 1. Install dependencies

```bash
npm install
```

### 2. Set your API key

Create a `.env.local` file in the project root:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard loads a demo org dataset right away, so no database setup is needed to try it. Agent runs need the API key from step 2.

### Production build

```bash
npm run build
```

```bash
npm start
```

## Working on the SpacetimeDB backend (optional)

The server module lives in `org-backend/spacetimedb`. `org-backend/spacetime.json` points it at the Maincloud server.

```bash
cd org-backend/spacetimedb
```

```bash
npm install
```

```bash
spacetime login
```

```bash
spacetime publish
```

After you change any tables or reducers, regenerate the TypeScript client bindings with `spacetime generate` and output them into `lib/module_bindings/`.

The client connects to the database `org-backend-afa0s` on Maincloud, set in `components/LiveSpacetimeProvider.tsx`. That name matches `org-backend/spacetime.local.json`. If you publish under a different name, update both.

## Notes

- Agent telemetry is stored in memory on the Next.js server, so it resets when the server restarts.
- `/api/agent/run` uses the first model returned by the Anthropic models API for your key.
- `/api/chat` and `/api/reset` are placeholders.
