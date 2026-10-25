'use client';

import { useSession } from '@/components/SessionProvider';
import { signOut } from '@/app/login/actions';

// Who is signed in, what they can see, and a sign-out button
export default function UserMenu({ compact = false }: { compact?: boolean }) {
    const user = useSession();
    if (!user) return null;

    const isCeo = user.role === 'ceo';

    return (
        <div className={`flex items-center gap-3 ${compact ? '' : 'p-3 bg-slate-950/60 border border-slate-800 rounded-lg'}`}>
            <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white">
                {user.name.split(' ').map((p) => p[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white truncate">{user.name}</span>
                    <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${isCeo
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                            }`}
                    >
                        {isCeo ? 'CEO' : 'Lead'}
                    </span>
                </div>
                <span className="block text-[10px] text-slate-400 truncate">
                    {isCeo ? 'Full org access' : `${user.title} · your team only`}
                </span>
            </div>
            <form action={signOut}>
                <button
                    type="submit"
                    className="text-[10px] font-medium px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                    Sign out
                </button>
            </form>
        </div>
    );
}
