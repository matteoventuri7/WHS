"use client";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Truck, Send, PackageCheck, Clock, Package } from 'lucide-react';
import { useRealtimeSSE } from '../useRealtimeSSE';
import DispatchSimulatorToggle from '../components/DispatchSimulatorToggle';

type VehicleFilter = 'ALL' | 'AVAILABLE' | 'DISPATCHED';

export default function ShippingPage() {
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>('ALL');

    const [pendingShipments, setPendingShipments] = useState<any[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [vehiclesRes, pendingRes] = await Promise.all([
                fetch('/api/shipping/vehicles'),
                fetch('/api/shipping/pending')
            ]);
            const vData = await vehiclesRes.json();
            const pData = await pendingRes.json();
            setVehicles(vData.sort((a: any, b: any) => b.status.localeCompare(a.status))); // AVAILABLE first
            setPendingShipments(pData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);
    useRealtimeSSE(['ShipmentAssigned', 'VehicleDispatched', 'VehicleRegistered'], fetchData);


    const dispatchVehicle = async (id: string) => {
        await fetch(`/api/shipping/vehicles/${id}/dispatch`, { method: 'POST' });
        fetchData();
    };

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-500 flex items-center gap-3">
                        <Truck className="w-8 h-8 text-purple-400" />
                        Shipping & Dispatch
                    </h1>
                    <p className="text-slate-400 mt-2">Manage logistics, vehicles, and final shipment dispatch.</p>
                </div>
                <div className="flex items-center gap-4">
                    <DispatchSimulatorToggle />
                </div>
            </div>

            <div>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold">Dispatch Yard</h2>
                        <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-700/60 rounded-lg p-1">
                            {(['ALL', 'AVAILABLE', 'DISPATCHED'] as VehicleFilter[]).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setVehicleFilter(f)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${vehicleFilter === f ? 'bg-purple-500/20 text-purple-300 shadow' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    {f === 'ALL' ? 'All' : f === 'AVAILABLE' ? 'Loading' : 'On Route'}
                                    <span className="ml-1.5 opacity-60">
                                        {f === 'ALL' ? vehicles.length : vehicles.filter(v => f === 'AVAILABLE' ? v.status === 'AVAILABLE' : v.status !== 'AVAILABLE').length}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4">
                        {vehicles.filter(v => vehicleFilter === 'ALL' ? true : vehicleFilter === 'AVAILABLE' ? v.status === 'AVAILABLE' : v.status !== 'AVAILABLE').map((v, idx) => (
                            <motion.div key={v._id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }} className={`w-full p-5 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 ${v.status === 'AVAILABLE' ? 'bg-slate-900/40 border-slate-700/60 hover:border-purple-500/30' : 'bg-slate-900/10 border-slate-800/40 opacity-60'}`}>

                                <div className="flex items-center gap-5">
                                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${v.status === 'AVAILABLE' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : 'bg-slate-800/30 border-slate-800 text-slate-500'}`}>
                                        <Truck className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg flex items-center gap-2">
                                            {v.vehicleId}
                                            {v.status === 'AVAILABLE' ? (
                                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Loading</span>
                                            ) : (
                                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400">On Route</span>
                                            )}
                                        </h3>
                                        <div className="mt-2 text-sm text-slate-400 flex items-center gap-4">
                                            <div className="flex items-center gap-1"><PackageCheck className="w-4 h-4 text-emerald-400" /> Loaded: <span className="text-slate-200 font-bold">{v.currentLoad} / {v.maxCapacity}</span> items</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="shrink-0 flex items-center gap-4">
                                    <div className="text-right mr-2 hidden sm:block">
                                        <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Assigned Tasks</p>
                                        <p className="font-mono text-slate-300 font-semibold">{v.assignedTaskIds?.length || 0}</p>
                                    </div>
                                    {v.status === 'AVAILABLE' && (
                                        <button onClick={() => dispatchVehicle(v.vehicleId)} className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white rounded-lg shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all font-medium flex items-center gap-2">
                                            <Send className="w-4 h-4" /> Dispatch
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        ))}

                        {vehicles.filter(v => vehicleFilter === 'ALL' ? true : vehicleFilter === 'AVAILABLE' ? v.status === 'AVAILABLE' : v.status !== 'AVAILABLE').length === 0 && !loading && (
                            <div className="text-center py-16 border border-slate-800 border-dashed rounded-2xl bg-slate-900/10">
                                <Truck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                                <p className="text-slate-400">
                                    {vehicles.length === 0 ? 'No vehicles available. Register a truck to begin shipping.' : 'No vehicles match the selected filter.'}
                                </p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Pending Shipments Section */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-8">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-400" /> Pending Shipments
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingShipments.map((ps, idx) => (
                        <motion.div key={ps._id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }} className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-sm flex flex-col gap-3 relative overflow-hidden group hover:border-orange-500/30 transition-colors">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-xs text-orange-400/80 font-mono mb-1">TASK: {ps.taskId}</div>
                                    <div className="font-semibold text-slate-200">Order: {ps.orderId}</div>
                                </div>
                                <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400">
                                    <Package className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="mt-2 text-sm text-slate-400">
                                Total Items: <span className="font-bold text-slate-200">{ps.totalItems}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                Queued at: {new Date(ps.createdAt).toLocaleString()}
                            </div>
                        </motion.div>
                    ))}
                    {pendingShipments.length === 0 && !loading && (
                        <div className="col-span-full text-center py-12 border border-slate-800 border-dashed rounded-2xl bg-slate-900/10">
                            <PackageCheck className="w-10 h-10 text-emerald-500/50 mx-auto mb-3" />
                            <p className="text-slate-400">No pending shipments. All tasks have been assigned!</p>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
