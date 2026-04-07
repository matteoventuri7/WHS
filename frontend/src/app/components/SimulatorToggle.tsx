'use client';

import { useState, useEffect } from 'react';

export default function SimulatorToggle() {
    const [isSimulating, setIsSimulating] = useState(false);
    const [loading, setLoading] = useState(true);
    const [intervalMs, setIntervalMs] = useState(15000);

    useEffect(() => {
        fetch('http://localhost:3005/inbound/status')
            .then(res => res.json())
            .then(data => {
                setIsSimulating(data.isSimulating);
                if (data.intervalMs) {
                    setIntervalMs(data.intervalMs);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to get simulator status:', err);
                setLoading(false);
            });
    }, []);

    const toggleSimulation = async () => {
        if (loading) return;
        setLoading(true);

        try {
            const endpoint = isSimulating ? 'stop' : 'start';
            const body = !isSimulating ? JSON.stringify({ intervalMs }) : undefined;

            const res = await fetch(`http://localhost:3005/inbound/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
            const data = await res.json();
            setIsSimulating(data.isSimulating);
            if (data.intervalMs) {
                setIntervalMs(data.intervalMs);
            }
        } catch (err) {
            console.error(`Failed to toggle simulator to ${!isSimulating}:`, err);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !isSimulating) {
        return <div className="h-6 w-12 bg-slate-800 rounded-full animate-pulse"></div>;
    }

    return (
        <div className="flex items-center gap-4 bg-slate-900/50 px-4 py-2 rounded-xl border border-white/5">
            <div className="flex flex-col items-end">
                <span className="text-sm font-medium text-slate-300">
                    Inbound Simulator
                </span>
                <select
                    value={intervalMs}
                    onChange={(e) => setIntervalMs(Number(e.target.value))}
                    disabled={loading || isSimulating}
                    className="text-xs bg-transparent text-slate-400 focus:outline-none focus:ring-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                >
                    <option value={5000}>Every 5s</option>
                    <option value={10000}>Every 10s</option>
                    <option value={15000}>Every 15s</option>
                    <option value={30000}>Every 30s</option>
                    <option value={60000}>Every 1m</option>
                </select>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={toggleSimulation}
                    disabled={loading}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${isSimulating ? 'bg-indigo-500' : 'bg-slate-700'
                        } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isSimulating ? 'translate-x-6' : 'translate-x-1'
                            }`}
                    />
                </button>
                {isSimulating && (
                    <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                )}
            </div>
        </div>
    );
}
