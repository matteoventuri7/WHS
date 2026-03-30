"use client";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Plus, RefreshCw, AlertCircle, CheckCircle2, Clock, Truck } from 'lucide-react';
import { useRealtimeData } from '../useRealtimeData';

export default function OrdersPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [cancelingId, setCancelingId] = useState<string | null>(null);

    const [productId, setProductId] = useState('');
    const [quantity, setQuantity] = useState('');

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3002/orders');
            const data = await res.json();
            setOrders(data.sort((a: any, b: any) => parseInt(b.orderId) - parseInt(a.orderId)));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrders(); }, []);
    useRealtimeData('http://localhost:3002', fetchOrders);

    const handlePlaceOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        await fetch('http://localhost:3002/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [{ productId, quantity: Number(quantity) }] })
        });
        setProductId(''); setQuantity('');
        fetchOrders();
    };

    const handleCancelOrder = async (orderId: string) => {
        try {
            const res = await fetch(`http://localhost:3002/orders/${orderId}/cancel`, {
                method: 'PATCH'
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                alert(`Impossibile annullare l'ordine:\n${errorData.message || 'Errore sconosciuto'}`);
            }
            fetchOrders();
        } catch (e) {
            console.error('Failed to cancel order', e);
            alert(`Errore di rete durante l'annullamento dell'ordine`);
        }
    };

    const handleResumeOrder = async (orderId: string) => {
        try {
            const res = await fetch(`http://localhost:3002/orders/${orderId}/resume`, {
                method: 'PATCH'
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                alert(`Impossibile riprendere l'ordine:\n${errorData.message || 'Errore sconosciuto'}`);
            }
            fetchOrders();
        } catch (e) {
            console.error('Failed to resume order', e);
            alert(`Errore di rete durante il ripristino dell'ordine`);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'PENDING': return <Clock className="w-5 h-5 text-blue-400" />;
            case 'SUSPENDED': return <AlertCircle className="w-5 h-5 text-red-400" />;
            case 'ALLOCATED': return <CheckCircle2 className="w-5 h-5 text-amber-400" />;
            case 'PICKING_COMPLETED': return <CheckCircle2 className="w-5 h-5 text-cyan-400" />;
            case 'SHIPPED': return <Truck className="w-5 h-5 text-emerald-400" />;
            case 'CANCELLED': return <AlertCircle className="w-5 h-5 text-red-600" />;
            default: return <Clock className="w-5 h-5 text-slate-400" />;
        }
    };

    const filteredOrders = orders.filter(o => statusFilter === 'ALL' || o.status === statusFilter);

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-400 flex items-center gap-3">
                        <ShoppingCart className="w-8 h-8 text-amber-400" />
                        Order Management
                    </h1>
                    <p className="text-slate-400 mt-2">Place outbound orders and track their lifecycle.</p>
                </div>
                <button onClick={fetchOrders} className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-full transition-colors border border-slate-700/50 hover:border-amber-500/50 group">
                    <RefreshCw className={`w-5 h-5 text-slate-400 group-hover:text-amber-400 transition-colors ${loading ? 'animate-spin text-amber-400' : ''}`} />
                </button>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="md:col-span-1">
                    <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 backdrop-blur-sm relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2"><Plus className="w-5 h-5 text-amber-400" /> New Outbound Order</h2>
                        <form onSubmit={handlePlaceOrder} className="space-y-4 relative z-10">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Product ID</label>
                                <input required value={productId} onChange={e => setProductId(e.target.value)} type="text" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all" placeholder="e.g. WATER-24" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Request Quantity</label>
                                <input required value={quantity} onChange={e => setQuantity(e.target.value)} type="number" min="1" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all" placeholder="Amount needed" />
                            </div>
                            <button type="submit" className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-lg font-medium shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-all transform active:scale-[0.98]">
                                Submit Order
                            </button>
                        </form>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="md:col-span-2 space-y-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-semibold">Order Lifecycle</h2>
                        <select 
                            value={statusFilter} 
                            onChange={e => setStatusFilter(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-amber-500 outline-none text-sm text-slate-300"
                        >
                            <option value="ALL">Tutti gli ordini</option>
                            <option value="PENDING">Pending</option>
                            <option value="ALLOCATED">Allocated</option>
                            <option value="PICKING_COMPLETED">Picking Completed</option>
                            <option value="SUSPENDED">Suspended</option>
                            <option value="SHIPPED">Shipped</option>
                            <option value="CANCELLED">Cancelled</option>
                        </select>
                    </div>

                    <div className="grid gap-4">
                        {filteredOrders.map((order, idx) => (
                            <motion.div key={order._id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }} className="w-full p-5 rounded-xl bg-slate-900/30 border border-slate-800/60 hover:border-slate-700/80 transition-all group">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 group-hover:scale-110 transition-transform">
                                            {getStatusIcon(order.status)}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                                Order #{order.orderId.slice(-6)}
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider ${order.status === 'PENDING' ? 'bg-blue-500/20 text-blue-400' :
                                                        order.status === 'SUSPENDED' ? 'bg-red-500/20 text-red-400' :
                                                            order.status === 'ALLOCATED' ? 'bg-amber-500/20 text-amber-400' :
                                                                order.status === 'PICKING_COMPLETED' ? 'bg-cyan-500/20 text-cyan-300' :
                                                                order.status === 'CANCELLED' ? 'bg-red-900/40 text-red-500 line-through opacity-80' :
                                                                'bg-emerald-500/20 text-emerald-400'
                                                    }`}>
                                                    {order.status}
                                                </span>
                                            </h3>
                                            <p className="text-sm text-slate-500">
                                                Requested: <span className="text-slate-300 font-mono">{order.items[0].quantity}x {order.items[0].productId}</span>
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3">
                                        {order.status === 'SUSPENDED' && (
                                            <button 
                                                onClick={() => handleResumeOrder(order.orderId)}
                                                className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50 transition-colors flex items-center gap-1"
                                                title="Riprendi Ordine"
                                            >
                                                Riprendi
                                            </button>
                                        )}
                                        {order.status !== 'SHIPPED' && order.status !== 'CANCELLED' && order.status !== 'PICKING_COMPLETED' && (
                                            cancelingId === order.orderId ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-400">Sicuro?</span>
                                                    <button onClick={() => setCancelingId(null)} className="text-xs px-2 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-800 transition-colors">No</button>
                                                    <button onClick={() => { setCancelingId(null); handleCancelOrder(order.orderId); }} className="text-xs px-2 py-1.5 rounded-lg border border-red-500/50 text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors">Sì, annulla</button>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => setCancelingId(order.orderId)}
                                                    className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-colors flex items-center gap-1"
                                                    title="Annulla Ordine"
                                                >
                                                    Annulla
                                                </button>
                                            )
                                        )}
                                    </div>

                                    {order.allocations && order.allocations.length > 0 && (
                                        <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                                            <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Allocations:</p>
                                            {order.allocations.map((a: any, i: number) => (
                                                <div key={i} className="text-sm flex justify-between gap-4">
                                                    <span className="text-slate-400">{a.location}</span>
                                                    <span className="text-amber-400 font-bold">{a.quantity}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}

                        {filteredOrders.length === 0 && !loading && (
                            <div className="text-center py-16 border border-slate-800 border-dashed rounded-2xl bg-slate-900/10">
                                <ShoppingCart className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                                <p className="text-slate-400">Nessun ordine trovato per lo stato selezionato.</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
