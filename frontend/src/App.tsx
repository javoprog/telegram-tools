import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Lock, LogIn, Radio } from 'lucide-react';

import { api, AUTH_TOKEN_KEY, getErrorMessage } from './api/client';
import { Navbar } from './components/Navbar';
import { AuthPage } from './pages/AuthPage';
import { ChatsPage } from './pages/ChatsPage';
import { LogsPage } from './pages/LogsPage';
import { RulesPage } from './pages/RulesPage';
import { SettingsPage } from './pages/SettingsPage';
import type { Account, DashboardTab, TriggerLog, WebSocketTriggerEvent } from './types';

const isTriggerEvent = (value: unknown): value is WebSocketTriggerEvent => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; data?: { id?: unknown; account_id?: unknown } };
  return (
    candidate.type === 'new_trigger_log' &&
    typeof candidate.data?.id === 'number' &&
    typeof candidate.data.account_id === 'number'
  );
};

export const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(
    Boolean(localStorage.getItem(AUTH_TOKEN_KEY)),
  );
  const [currentTab, setCurrentTab] = useState<DashboardTab>('rules');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [liveLogs, setLiveLogs] = useState<TriggerLog[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) return;
    try {
      const data = await api.getAccounts();
      setAccounts(data);
      const connected = data.filter(
        (account) => account.status === 'connected' && account.is_active,
      );
      setSelectedAccountId((current) =>
        connected.some((account) => account.id === current) ? current : connected[0]?.id ?? null,
      );
    } catch (error) {
      setLoginError(getErrorMessage(error, 'Не удалось проверить авторизацию'));
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setIsAuthenticated(false);
    setAccounts([]);
    setSelectedAccountId(null);
    setLiveLogs([]);
    setWsConnected(false);
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    if (isAuthenticated) void fetchAccounts();
  }, [fetchAccounts, isAuthenticated]);

  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener('tg-auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('tg-auth-unauthorized', handleUnauthorized);
  }, [logout]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectAttempt = 0;
    let disposed = false;

    const connect = () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token || disposed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/ws/events`,
        ['bearer', token],
      );
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectAttempt = 0;
        setWsConnected(true);
        heartbeatTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send('ping');
        }, 25_000);
      };

      socket.onmessage = (event) => {
        if (event.data === 'pong' || typeof event.data !== 'string') return;
        try {
          const payload: unknown = JSON.parse(event.data);
          if (isTriggerEvent(payload)) {
            setLiveLogs((previous) => {
              const withoutDuplicate = previous.filter((log) => log.id !== payload.data.id);
              return [payload.data, ...withoutDuplicate].slice(0, 100);
            });
          }
        } catch {
          // Ignore malformed application frames; the socket remains usable.
        }
      };

      socket.onclose = (event) => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        setWsConnected(false);
        if (event.code === 4401) {
          logout();
          return;
        }
        if (!disposed) {
          const delay = Math.min(2_000 * 2 ** reconnectAttempt, 30_000);
          reconnectAttempt += 1;
          reconnectTimer = setTimeout(connect, delay);
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
      wsRef.current = null;
    };
  }, [isAuthenticated, logout]);

  const handleAdminLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const response = await api.login(loginPassword);
      localStorage.setItem(AUTH_TOKEN_KEY, response.access_token);
      setLoginPassword('');
      setIsAuthenticated(true);
    } catch (error) {
      setLoginError(getErrorMessage(error, 'Неверный пароль администратора'));
    } finally {
      setLoginLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0E1621] flex items-center justify-center p-4">
        <div className="relative overflow-hidden bg-[#17212B] border border-[#242F3D] rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 text-center">
          <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[#24A1DE]/10 blur-3xl" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#24A1DE] to-[#2B5278] mx-auto flex items-center justify-center shadow-xl shadow-[#24A1DE]/20">
            <Radio className="w-8 h-8 text-white" />
          </div>
          <div className="relative">
            <h1 className="text-xl font-bold text-white">Telegram Tools</h1>
            <p className="text-sm text-slate-400 mt-1">Защищённая панель MTProto‑мониторинга</p>
          </div>
          {loginError && (
            <div role="alert" className="relative p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm rounded-xl">
              {loginError}
            </div>
          )}
          <form onSubmit={handleAdminLogin} className="relative space-y-4 text-left">
            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Мастер‑пароль
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-password"
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  placeholder="Введите пароль администратора"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  className="w-full bg-[#182533] border border-[#242F3D] focus:border-[#24A1DE] rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 outline-none transition-colors"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loginLoading || !loginPassword}
              className="w-full bg-[#24A1DE] hover:bg-[#2090c7] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#24A1DE]/20"
            >
              <LogIn className="w-5 h-5" />
              {loginLoading ? 'Проверяем…' : 'Войти в панель'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E1621] text-slate-100 flex flex-col">
      <Navbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onAccountChange={setSelectedAccountId}
        wsConnected={wsConnected}
        onLogout={logout}
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7">
        {currentTab === 'rules' && (
          <RulesPage accounts={accounts} selectedAccountId={selectedAccountId} />
        )}
        {currentTab === 'logs' && (
          <LogsPage
            liveLogs={liveLogs}
            selectedAccountId={selectedAccountId}
            onLogsCleared={() => setLiveLogs([])}
          />
        )}
        {currentTab === 'chats' && (
          <ChatsPage accounts={accounts} selectedAccountId={selectedAccountId} />
        )}
        {currentTab === 'auth' && (
          <AuthPage accounts={accounts} onRefreshAccounts={fetchAccounts} />
        )}
        {currentTab === 'settings' && <SettingsPage onPasswordChanged={logout} />}
      </main>
    </div>
  );
};
