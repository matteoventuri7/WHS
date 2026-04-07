"use client";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ScanBarcode, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useRealtimeData } from '../useRealtimeData';
import PickingSimulatorToggle from '../components/PickingSimulatorToggle';

export default function PickingPage() {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3003/picking/tasks');
            const data = await res.json();
            setTasks(data.sort((a: any, b: any) => parseInt(b.taskId) - parseInt(a.taskId)));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchTasks(); }, []);
    useRealtimeData('http://localhost:3003', fetchTasks);

    const completeTask = async (taskId: string) => {
        await fetch(`http://localhost:3003/picking/tasks/${taskId}/complete`, { method: 'POST' });
        fetchTasks();
    };

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-500 flex items-center gap-3">
                        <ScanBarcode className="w-8 h-8 text-green-400" />
                        Picking Operations
                    </h1>
                    <p className="text-slate-400 mt-2">Execute picking tasks generated from allocated orders.</p>
                </div>
                <div className="flex items-center gap-4">
                    <PickingSimulatorToggle />
                </div>
            </div>

            <div className="grid gap-6">
                {tasks.map((task, idx) => (
                    <motion.div key={task._id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className={`w-full p-6 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden ${task.status !== 'PENDING' ? 'bg-slate-900/20 border-slate-800/40 opacity-70' : 'bg-slate-900/60 border-slate-700/60 shadow-lg hover:border-green-500/30'}`}>

                        <div className="flex items-start gap-5">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${task.status !== 'PENDING' ? 'bg-slate-800/50 border-slate-700 text-slate-500' : 'bg-green-500/10 border-green-500/20 text-green-400 shadow-[0_0_15px_rgba(7ade80,0.15)]'}`}>
                                {task.status === 'COMPLETED' ? <CheckCircle className="w-7 h-7" /> : task.status === 'CANCELLED' ? <AlertCircle className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
                            </div>
                            <div>
                                <h3 className="font-bold text-xl mb-1 text-slate-200">Task #{task.taskId.slice(-6)}</h3>
                                <p className="text-sm text-slate-500 mb-3">Order Ref: #{task.orderId.slice(-6)}</p>
                                <div className="space-y-2">
                                    {task.allocations.map((alloc: any, i: number) => (
                                        <div key={i} className="flex items-center gap-3 bg-slate-950/50 px-3 py-2 rounded border border-slate-800/50 text-sm">
                                            <span className="font-mono text-blue-400 font-semibold">{alloc.location}</span>
                                            <span className="text-slate-600">→</span>
                                            <span className="text-slate-300">Take <span className="font-bold text-white">{alloc.quantity}x</span> {alloc.productId}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {task.status === 'PENDING' ? (
                            <button onClick={() => completeTask(task.taskId)} className="shrink-0 px-8 py-3 bg-green-500 hover:bg-green-400 text-slate-950 font-bold rounded-xl shadow-[0_0_20px_rgba(74,222,128,0.2)] hover:shadow-[0_0_25px_rgba(74,222,128,0.4)] transition-all transform active:scale-95 flex items-center gap-2">
                                <CheckCircle className="w-5 h-5" />
                                Mark Completed
                            </button>
                        ) : task.status === 'CANCELLED' ? (
                            <div className="shrink-0 px-6 py-2 border border-red-900/40 rounded-lg text-red-500 flex items-center gap-2 font-medium bg-slate-900/30 opacity-80">
                                <AlertCircle className="w-4 h-4" /> Canceled
                            </div>
                        ) : (
                            <div className="shrink-0 px-6 py-2 border border-slate-800 rounded-lg text-slate-500 flex items-center gap-2 font-medium bg-slate-900/30">
                                <CheckCircle className="w-4 h-4" /> Picked
                            </div>
                        )}
                    </motion.div>
                ))}

                {tasks.length === 0 && !loading && (
                    <div className="text-center py-20 border border-slate-800 border-dashed rounded-2xl bg-slate-900/10">
                        <ScanBarcode className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400">No picking tasks generated yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
