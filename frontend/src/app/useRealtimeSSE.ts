"use client";
import { useEffect, useRef } from 'react';

/**
 * Hook per ricevere aggiornamenti in tempo reale via SSE (Server-Sent Events).
 * Si connette a /api/events (Kafka consumer) e filtra per topic rilevanti,
 * invocando fetchFn quando arriva un evento matching.
 */
export function useRealtimeSSE(topics: string[], fetchFn: () => void) {
  const fetchRef = useRef(fetchFn);
  const topicsRef = useRef(topics);

  useEffect(() => {
    fetchRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    topicsRef.current = topics;
  }, [topics]);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource('/api/events');

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (topicsRef.current.includes(parsed.topic)) {
            fetchRef.current();
          }
        } catch {
          // ignore non-JSON messages (heartbeats, comments)
        }
      };

      es.onerror = () => {
        es?.close();
        // Reconnect after 3 seconds
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);
}
