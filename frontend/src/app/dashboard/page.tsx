"use client";

import { useEffect, useState, useRef } from 'react';
import { Activity, Box, Truck, CheckCircle, AlertTriangle, Package, Calendar } from 'lucide-react';

interface SystemEvent {
  id: string;
  topic: string;
  payload: any;
  timestamp: Date;
}

const getTopicColor = (topic: string) => {
  if (topic.includes('Order')) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
  if (topic.includes('Inventory') || topic.includes('Stock') || topic.includes('Stored') || topic.includes('Arriving')) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
  if (topic.includes('Picking')) return 'text-green-400 bg-green-400/10 border-green-400/20';
  if (topic.includes('Shipment') || topic.includes('Vehicle')) return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
  return 'text-slate-300 bg-slate-700/30 border-slate-600/30';
};

const getTopicIcon = (topic: string) => {
  if (topic.includes('Order')) return <Calendar className="w-5 h-5" />;
  if (topic.includes('Picking')) return <CheckCircle className="w-5 h-5" />;
  if (topic.includes('Vehicle') || topic.includes('Shipment')) return <Truck className="w-5 h-5" />;
  if (topic.includes('Inventory') || topic.includes('Stock') || topic.includes('Stored')) return <Package className="w-5 h-5" />;
  return <Activity className="w-5 h-5" />;
};

export default function DashboardPage() {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/events');

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setEvents((prev) => {
          const newEvent = {
            id: crypto.randomUUID(),
            topic: data.topic,
            payload: data.payload,
            timestamp: new Date()
          };
          // Keep only the last 100 events to prevent memory bloat
          return [newEvent, ...prev].slice(0, 100);
        });
      } catch (error) {
        console.error("Failed to parse event", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("EventSource failed:", error);
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-500 flex items-center gap-3">
            <Activity className="text-rose-400 w-8 h-8" />
            Live Event Dashboard
          </h1>
          <p className="text-slate-400 mt-2">Real-time Kafka message stream from simulators and microservices.</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${isConnected ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-sm font-medium">{isConnected ? 'Connected to Kafka' : 'Disconnected'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 p-5 rounded-2xl">
            <h2 className="text-lg font-semibold text-white mb-4">Event Stats</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Events (Session)</span>
                <span className="text-2xl font-bold text-white">{events.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden flex flex-col h-[600px]">
            <div className="px-6 py-4 border-b border-white/10 bg-slate-950/50 flex justify-between items-center">
              <h3 className="text-sm font-medium text-slate-300">Event Stream</h3>
              <div className="text-xs text-slate-500">Showing last 100 events</div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {events.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
                  <Activity className="w-12 h-12 animate-pulse text-slate-700" />
                  <p>Waiting for events...</p>
                </div>
              ) : (
                events.map((evt) => {
                  const style = getTopicColor(evt.topic);
                  return (
                    <div key={evt.id} className="group relative bg-slate-950/50 hover:bg-slate-800/50 transition-colors border border-white/5 hover:border-white/10 rounded-xl p-4 flex gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className={`mt-1 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${style}`}>
                        {getTopicIcon(evt.topic)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full border ${style}`}>
                            {evt.topic}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            {evt.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <pre className="mt-3 text-xs text-slate-400 font-mono bg-slate-950/80 p-3 rounded-lg overflow-x-auto border border-white/5">
                          {JSON.stringify(evt.payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={eventsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
