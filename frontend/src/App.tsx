import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from './api/client';
import { Navbar } from './components/Navbar';
import { AuthPage } from './pages/AuthPage';
import { ChatsPage } from './pages/ChatsPage';
import { LogsPage } from './pages/LogsPage';
import { RulesPage } from './pages/RulesPage';
import type { Account, DashboardTab, TriggerLog, WebSocketTriggerEvent } from './types';

const isTriggerEvent = (value: unknown): value is WebSocketTriggerEvent => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; data?: { id?: unknown } };
  return candidate.type === 'new_trigger_log' && typeof candidate.data?.id === 'number';
};

export const App = () => {
  const [currentTab, setCurrentTab] = useState<DashboardTab>('rules');
  const [account, setAccount] = useState<Account | null>(null);
  const [liveLogs, setLiveLogs] = useState<TriggerLog[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const refreshAccount = useCallback(async () => {
    try {
      setAccount(await api.getAccount());
    } catch {
      setAccount(null);
    }
  }, []);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectAttempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectAttempt = 0;
        setWsConnected(true);
        heartbeatTimer = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send('ping');
        }, 25_000);
      };
      socket.onmessage = (event) => {
        if (event.data === 'pong' || typeof event.data !== 'string') return;
        try {
          const payload: unknown = JSON.parse(event.data);
          if (isTriggerEvent(payload)) {
            setLiveLogs((current) => [
              payload.data,
              ...current.filter((item) => item.id !== payload.data.id),
            ].slice(0, 100));
          }
        } catch {
          // Ignore malformed frames without interrupting the live connection.
        }
      };
      socket.onclose = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        setWsConnected(false);
        if (!disposed) {
          const delay = Math.min(1_500 * 2 ** reconnectAttempt, 30_000);
          reconnectAttempt += 1;
          reconnectTimer = window.setTimeout(connect, delay);
        }
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      wsRef.current?.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-zinc-900">
      <Navbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        account={account}
        wsConnected={wsConnected}
      />
      <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        {currentTab === 'rules' && <RulesPage account={account} />}
        {currentTab === 'logs' && (
          <LogsPage liveLogs={liveLogs} onLogsCleared={() => setLiveLogs([])} />
        )}
        {currentTab === 'chats' && <ChatsPage account={account} />}
        {currentTab === 'auth' && (
          <AuthPage account={account} onAccountChanged={refreshAccount} />
        )}
      </main>
    </div>
  );
};
