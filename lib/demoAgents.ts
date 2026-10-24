// The 4 agents that carry usage data in the demo, spread across owners:
// Agent #037 → Engineering Lead, Agent #038 → Sales Lead,
// Agents #046 and #076 → Worker #006 (who reports to the Engineering Lead).
// IDs and names match the agents generated in hooks/useOrgData.ts.
export interface DemoAgentTask {
    agentId: string;
    agentName: string;
    prompt: string;
}

// Real tasks for the "Run demo agents" button on /meta-analysis
export const DEMO_AGENT_TASKS: DemoAgentTask[] = [
    {
        agentId: 'node-37',
        agentName: 'Agent #037',
        prompt: 'Our /api/orders endpoint logs "ConnectionPool timeout after 30s" whenever traffic doubles. Give the most likely root cause and two fixes, in under 120 words.',
    },
    {
        agentId: 'node-38',
        agentName: 'Agent #038',
        prompt: 'Draft a 3-sentence follow-up email to a prospect who went quiet after a pricing call last week.',
    },
    {
        agentId: 'node-46',
        agentName: 'Agent #046',
        prompt: 'Write a 5-bullet weekly status summary for the leadership team from these notes: revenue up 4% week over week, 2 engineering hires closed, churn flat, one P1 incident resolved in 3 hours.',
    },
    {
        agentId: 'node-76',
        agentName: 'Agent #076',
        prompt: 'There are 14 open support tickets: 9 billing, 3 login, 2 shipping. Propose a triage order and which team should own each category.',
    },
];
