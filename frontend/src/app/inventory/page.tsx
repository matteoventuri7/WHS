"use client";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PackageOpen, Plus, ArchiveRestore, RefreshCw } from 'lucide-react';

export default function InventoryPage() {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Form states
    const [productId, setProductId] = useState('');
    const [location, setLocation] = useState('');
    const [quantity, setQuantity] = useState('');

    const fetchInventory = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/inventory');
            const data = await res.json();
            setItems(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchInventory(); }, []);

    const handleInbound = async (e: React.FormEvent) => {
        e.preventDefault();
        await fetch('http://localhost:3001/inventory/receive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, location, quantity: Number(quantity) })
        });
        setProductId(''); setLocation(''); setQuantity('');
        fetchInventory();
    };

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400 flex items-center gap-3">
                        <ArchiveRestore className="w-8 h-8 text-blue-400" />
                        Inventory & Inbound
                    </h1>
                    <p className="text-slate-400 mt-2">Manage stock levels and receive new materials.</p>
                </div>
                <button onClick={fetchInventory} className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-full transition-colors border border-slate-700/50 hover:border-blue-500/50 group">
                    <RefreshCw className={`w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors ${loading ? 'animate-spin text-blue-400' : ''}`} />
                </button>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="md:col-span-1">
                    <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 backdrop-blur-sm relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2"><Plus className="w-5 h-5 text-blue-400" /> Receive Goods</h2>
                        <form onSubmit={handleInbound} className="space-y-4 relative z-10">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Product ID</label>
                                <input required value={productId} onChange={e => setProductId(e.target.value)} type="text" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" placeholder="e.g. WATER-24" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Location</label>
                                <input required value={location} onChange={e => setLocation(e.target.value)} type="text" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" placeholder="e.g. B-12-33" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Quantity</label>
                                <input required value={quantity} onChange={e => setQuantity(e.target.value)} type="number" min="1" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" placeholder="Enter amount" />
                            </div>
                            <button type="submit" className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 text-white rounded-lg font-medium shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_0_25px_rgba(59,130,246,0.4)] transition-all transform active:scale-[0.98]">
                                Add to Stock
                            </button>
                        </form>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="md:col-span-2 space-y-4">
                    <h2 className="text-xl font-semibold mb-6">Current Stock Levels</h2>

                    <div className="grid gap-4">
                        {items.map((item, idx) => {
                            const available = item.quantity - item.reservedQuantity;
                            return (
                                <motion.div key={item._id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }} className="w-full p-4 rounded-xl bg-slate-900/30 border border-slate-800/60 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between group gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400 group-hover:scale-110 transition-transform">
                                            <PackageOpen className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">{item.productId}</h3>
                                            <p className="text-sm text-slate-500 font-mono">LOC: {item.location}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-6 sm:text-right text-left">
                                        <div>
                                            <p className="text-xs uppercase tracking-wider text-slate-500">Available</p>
                                            <p className="font-bold text-xl text-slate-200">{available}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-wider text-slate-500">Reserved</p>
                                            <p className="font-bold text-xl text-amber-500/90">{item.reservedQuantity}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-wider text-slate-500">Total</p>
                                            <p className="font-bold text-xl text-blue-400">{item.quantity}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}

                        {items.length === 0 && !loading && (
                            <div className="text-center py-16 border border-slate-800 border-dashed rounded-2xl bg-slate-900/10">
                                <PackageOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                                <p className="text-slate-400">Warehouse is empty. Receive some goods first!</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
