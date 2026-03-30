"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
  .replace("http://", "ws://")
  .replace("https://", "wss://");

interface WsMessage {
  type: string;
  payload: Record<string, unknown>;
  from?: string;
}

export function useWebSocket(userId: string = "demo-user") {
  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [connectedClients, setConnectedClients] = useState<
    Array<{ clientId: string; type: string }>
  >([]);
  const [lastNotification, setLastNotification] = useState<{
    type: string;
    title: string;
    message: string;
    timestamp: string;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<(payload: Record<string, unknown>) => void>>>(
    new Map(),
  );
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/ws?userId=${userId}&type=web`);

    ws.onopen = () => {
      setConnected(true);
      console.log("[WS] Connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "connected":
            setClientId((msg.payload as { clientId: string }).clientId);
            setConnectedClients(
              (msg.payload as { connectedClients: Array<{ clientId: string; type: string }> })
                .connectedClients,
            );
            break;
          case "client_joined":
          case "client_left":
          case "client_list":
            if (msg.payload && "clients" in msg.payload) {
              setConnectedClients(msg.payload.clients as Array<{ clientId: string; type: string }>);
            }
            break;
          case "notification":
            setLastNotification(
              msg.payload as { type: string; title: string; message: string; timestamp: string },
            );
            break;
          default:
            break;
        }

        // Dispatch to registered listeners
        const listeners = listenersRef.current.get(msg.type);
        if (listeners) {
          for (const listener of listeners) {
            listener(msg.payload as Record<string, unknown>);
          }
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("[WS] Disconnected, reconnecting in 3s...");
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [userId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const on = useCallback((type: string, listener: (payload: Record<string, unknown>) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)?.add(listener);

    return () => {
      listenersRef.current.get(type)?.delete(listener);
    };
  }, []);

  return {
    connected,
    clientId,
    connectedClients,
    lastNotification,
    send,
    on,
  };
}
