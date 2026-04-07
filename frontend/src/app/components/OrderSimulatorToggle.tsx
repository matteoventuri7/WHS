'use client';

import { useEffect, useState } from 'react';

export default function OrderSimulatorToggle() {
    const [isSimulating, setIsSimulating] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3007/order-simulator/status')
            .then((res) => res.json())
            .then((data) => {
                setIsSimulating(data.isSimulating);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Failed to get order simulator status:', err);
                setLoading(false);
            });
    }, []);

    const toggleSimulation = async () => {
        if (loading) {
            return;
        }

        setLoading(true);

        try {
            const endpoint = isSimulating ? 'stop' : 'start';
            const res = await fetch(`http://localhost:3007/order-simulator/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            setIsSimulating(data.isSimulating);
        } catch (err) {
            console.error(`Failed to toggle order simulator to ${!isSimulating}:`, err);
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
                <span className="text-sm font-medium text-slate-300">Order Simulator</span>
                <span className="text-xs text-slate-400">Every 15s</span>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={toggleSimulation}
                    disabled={loading}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${isSimulating ? 'bg-amber-500' : 'bg-slate-700'} ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isSimulating ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                </button>
                {isSimulating && (
                    <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                )}
            </div>
        </div>
    );
}
