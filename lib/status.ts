import type { NodeStatus } from './orgTypes';

export const STATUS_LABELS: Record<NodeStatus, string> = {
    IDLE: 'Idle',
    WORKING: 'Working',
    BLOCKED_BY_HUMAN: 'Needs human',
    OFFLINE: 'Offline',
};

export function statusLabel(status?: string) {
    return STATUS_LABELS[status as NodeStatus] ?? 'Idle';
}

// Moved out of app/page.tsx so other routes can import it (page files may only export the page).
export function getStatusColor(status?: string) {
    switch (status) {
        case 'WORKING':
            return {
                dot: 'bg-amber-400 border-amber-300 shadow-amber-400/50',
                text: 'text-amber-400',
                badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
            };
        case 'BLOCKED_BY_HUMAN':
            return {
                dot: 'bg-orange-500 border-orange-400 shadow-orange-500/50',
                text: 'text-orange-400',
                badge: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
            };
        case 'OFFLINE':
            return {
                dot: 'bg-rose-500 border-rose-400 shadow-rose-500/50',
                text: 'text-rose-400',
                badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
            };
        case 'IDLE':
        default:
            return {
                dot: 'bg-slate-400 border-slate-300 shadow-slate-400/50',
                text: 'text-slate-400',
                badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
            };
    }
}
