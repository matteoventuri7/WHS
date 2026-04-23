"use client";
import { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * Hook per ricevere aggiornamenti in tempo reale da un servizio backend via WebSocket.
 * Quando il servizio emette 'dataChanged', richiama automaticamente la funzione di fetch.
 */
export function useRealtimeData(serviceUrl: string, fetchFn: () => void) {
  const socketRef = useRef<Socket | null>(null);
  const fetchRef = useRef(fetchFn);

  useEffect(() => {
    fetchRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    const socket = io(serviceUrl, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[WS] Connesso a ${serviceUrl}`);
    });

    socket.on('dataChanged', () => {
      console.log(`[WS] Dati aggiornati da ${serviceUrl}`);
      fetchRef.current();
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Disconnesso da ${serviceUrl}`);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serviceUrl]);
}
