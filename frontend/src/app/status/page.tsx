"use client";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Server, RefreshCw, CheckCircle2, XCircle, AlertCircle, Database, Network, Box } from 'lucide-react';

type ServiceStatus = {
    name: string;
    status: 'online' | 'offline' | 'loading';
};

export default function StatusPage() {
    const [services, setServices] = useState<ServiceStatus[]>([]);
    const [infraServices, setInfraServices] = useState<ServiceStatus[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);

    const checkAllServices = async () => {
        setIsRefreshing(true);
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            setServices(data.services);
            setInfraServices(data.infrastructure);
            setLastChecked(new Date());
        } catch (e) {
            console.error('Failed to fetch status', e);
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        checkAllServices();
        const interval = setInterval(() => {
            checkAllServices();
        }, 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const allServicesList = [...services, ...infraServices];
    const allOnline = allServicesList.every(s => s.status === 'online');
    const someOffline = allServicesList.some(s => s.status === 'offline');

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800/60 pb-6">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center gap-3">
                        <Activity className="w-8 h-8 text-cyan-400" />
                        System Status
                    </h1>
                    <p className="text-slate-400 mt-2">Real-time health check of all NexusWMS microservices.</p>
                </div>

                <div className="flex items-center gap-4 bg-slate-900/40 p-3 rounded-2xl border border-slate-800/80">
                    <div className="text-sm">
                        <p className="text-slate-500">System State</p>
                        {allOnline ? (
                            <p className="text-green-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> All Systems Operational</p>
                        ) : someOffline ? (
                            <p className="text-red-400 font-semibold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Degraded Performance</p>
                        ) : (
                            <p className="text-blue-400 font-semibold flex items-center gap-1"><RefreshCw className="w-4 h-4 animate-spin" /> Checking...</p>
                        )}
                    </div>
                    <div className="w-px h-10 bg-slate-800 hidden sm:block"></div>
                    <button
                        onClick={checkAllServices}
                        disabled={isRefreshing}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all border border-slate-700 hover:border-cyan-500/50 flex items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                        <RefreshCw className={`w-4 h-4 text-slate-300 group-hover:text-cyan-400 transition-colors ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {lastChecked && (
                <p className="text-xs text-slate-500 text-right font-mono">
                    Last checked: {lastChecked.toLocaleTimeString()}
                </p>
            )}

            {/* Microservices Section */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800/60 pb-3">
                    <Box className="w-5 h-5 text-cyan-400" />
                    Microservices
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {services.map((service, idx) => (
                        <motion.div
                            key={service.name}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`p-6 rounded-2xl border backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:shadow-lg ${service.status === 'online'
                                ? 'bg-slate-900/30 border-green-500/20 hover:border-green-500/40 hover:bg-slate-900/50'
                                : service.status === 'offline'
                                    ? 'bg-red-950/20 border-red-500/30 hover:border-red-500/50'
                                    : 'bg-slate-900/30 border-slate-800 hover:border-slate-700'
                                }`}
                        >
                            <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-500 ${service.status === 'online' ? 'bg-green-500' : service.status === 'offline' ? 'bg-red-500' : 'bg-slate-500'
                                }`} />

                            <div className="flex justify-between items-start mb-6">
                                <div className={`p-3 rounded-xl inline-flex drop-shadow-sm ${service.status === 'online' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                    service.status === 'offline' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                                        'bg-slate-800 text-slate-400 border border-slate-700'
                                    }`}>
                                    <Server className="w-6 h-6" />
                                </div>

                                <div className="flex items-center gap-2">
                                    {service.status === 'online' && (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                                            Online
                                        </span>
                                    )}
                                    {service.status === 'offline' && (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
                                            <XCircle className="w-3.5 h-3.5" />
                                            Offline
                                        </span>
                                    )}
                                    {service.status === 'loading' && (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            Checking
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <h2 className="text-xl font-bold text-slate-200 mb-1">{service.name}</h2>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Infrastructure Section */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800/60 pb-3">
                    <Network className="w-5 h-5 text-purple-400" />
                    Infrastructure
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {infraServices.map((service, idx) => (
                        <motion.div
                            key={service.name}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`p-6 rounded-2xl border backdrop-blur-md relative overflow-hidden transition-all duration-300 hover:shadow-lg ${service.status === 'online'
                                ? 'bg-slate-900/30 border-green-500/20 hover:border-green-500/40 hover:bg-slate-900/50'
                                : service.status === 'offline'
                                    ? 'bg-red-950/20 border-red-500/30 hover:border-red-500/50'
                                    : 'bg-slate-900/30 border-slate-800 hover:border-slate-700'
                                }`}
                        >
                            <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-500 ${service.status === 'online' ? 'bg-green-500' : service.status === 'offline' ? 'bg-red-500' : 'bg-slate-500'
                                }`} />

                            <div className="flex justify-between items-start mb-6">
                                <div className={`p-3 rounded-xl inline-flex drop-shadow-sm ${service.status === 'online' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                    service.status === 'offline' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                                        'bg-slate-800 text-slate-400 border border-slate-700'
                                    }`}>
                                    <Network className="w-6 h-6" />
                                </div>

                                <div className="flex items-center gap-2">
                                    {service.status === 'online' && (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                                            Online
                                        </span>
                                    )}
                                    {service.status === 'offline' && (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
                                            <XCircle className="w-3.5 h-3.5" />
                                            Offline
                                        </span>
                                    )}
                                    {service.status === 'loading' && (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            Checking
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <h2 className="text-xl font-bold text-slate-200 mb-1">{service.name}</h2>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}
