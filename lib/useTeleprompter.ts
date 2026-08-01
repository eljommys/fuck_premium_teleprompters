"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_STATE,
  type Role,
  type ServerMessage,
  type TeleprompterState,
} from "./state";

export type Connection = "connecting" | "online" | "offline";

const EMPTY_CLIENTS: Record<Role, number> = { editor: 0, prompter: 0, remote: 0, home: 0 };

/**
 * Conecta con el servidor, mantiene el estado compartido sincronizado y
 * reconecta solo si se cae la red. `update` aplica el cambio en local al
 * instante y lo difunde al resto de dispositivos.
 */
export function useTeleprompter(role: Role) {
  const [state, setState] = useState<TeleprompterState>(DEFAULT_STATE);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [clients, setClients] = useState<Record<Role, number>>(EMPTY_CLIENTS);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        attempt = 0;
        setConnection("online");
        socket.send(JSON.stringify({ type: "hello", role }));
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data as string) as ServerMessage;
        if (message.type === "state") {
          setState(message.state);
          setClients(message.clients);
        } else if (message.type === "patch") {
          setState((current) => ({ ...current, ...message.patch }));
        } else if (message.type === "clients") {
          setClients(message.clients);
        }
      });

      socket.addEventListener("close", () => {
        if (closed) return;
        socketRef.current = null;
        setConnection("offline");
        attempt += 1;
        retry = setTimeout(connect, Math.min(500 * 2 ** (attempt - 1), 5000));
      });

      // El evento `error` siempre va seguido de `close`, que ya reintenta.
      socket.addEventListener("error", () => socket.close());
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [role]);

  const update = useCallback((patch: Partial<TeleprompterState>) => {
    setState((current) => ({ ...current, ...patch }));
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "update", patch }));
    }
  }, []);

  return { state, update, connection, clients };
}
