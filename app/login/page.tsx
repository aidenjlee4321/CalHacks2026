'use client';

import { useActionState, useState } from 'react';
import { signIn } from './actions';

// Demo accounts shown as one-click cards (they just fill the form)
const DEMO_ACCOUNTS = [
    {
        email: 'ceo@spacetime.org',
        password: 'ceo-demo',
        name: 'Avery Chen',
        role: 'CEO',
        blurb: 'Sees the whole org: every lead, worker and agent.',
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    },
    {
        email: 'lead@spacetime.org',
        password: 'lead-demo',
        name: 'Sam Patel',
        role: 'Engineering Lead',
        blurb: 'Sees only their own team of workers and agents.',
        badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    },
];

export default function LoginPage() {
    const [state, formAction, pending] = useActionState(signIn, {});
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center p-6">
            <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(#6366f1 1.5px, transparent 1.5px)', backgroundSize: '32px 32px' }}
            />
            <div className="relative w-full max-w-md space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-white tracking-wide">Spacetime Org</h1>
                    <p className="text-xs text-slate-400 mt-1">Sign in to see your part of the org</p>
                </div>

                <form
                    action={formAction}
                    className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-2xl backdrop-blur space-y-4"
                >
                    <div>
                        <label htmlFor="email" className="block text-xs font-medium text-slate-300 mb-1">Email</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@spacetime.org"
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                            required
                        />
                    </div>

                    {state.error && <p className="text-xs text-rose-400">{state.error}</p>}

                    <button
                        type="submit"
                        disabled={pending}
                        className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-medium rounded-lg text-sm hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/30"
                    >
                        {pending ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>

                <div className="space-y-2">
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">Demo accounts</h2>
                    <div className="grid grid-cols-2 gap-2">
                        {DEMO_ACCOUNTS.map((acct) => (
                            <button
                                key={acct.email}
                                type="button"
                                onClick={() => {
                                    setEmail(acct.email);
                                    setPassword(acct.password);
                                }}
                                className={`text-left p-3 rounded-xl border transition-all ${email === acct.email
                                    ? 'bg-indigo-950/60 border-indigo-500 ring-1 ring-indigo-500/40'
                                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                                    }`}
                            >
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${acct.badge}`}>
                                    {acct.role}
                                </span>
                                <span className="block text-sm font-semibold text-white mt-2">{acct.name}</span>
                                <span className="block text-[10px] text-slate-400 mt-1 leading-snug">{acct.blurb}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
