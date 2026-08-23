import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';

import { api, getErrorMessage } from '../api/client';
import type { Rule, TriggerLog } from '../types';

interface LogsPageProps {
  liveLogs: TriggerLog[];
  onLogsCleared: () => void;
}

const PAGE_SIZE = 20;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightMatched = (text: string, matchedWords: string[]): ReactNode => {
  const words = Array.from(new Set(matchedWords.filter((word) => word && word !== '*')))
    .sort((left, right) => right.length - left.length);
  if (!text || words.length === 0) return text;
  const expression = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
  const normalized = new Set(words.map((word) => word.toLocaleLowerCase('ru')));
  return text.split(expression).map((part, index) =>
    normalized.has(part.toLocaleLowerCase('ru')) ? (
      <mark key={`${index}-${part}`} className="rounded-md bg-amber-200 px-1 py-0.5 font-semibold text-amber-950">{part}</mark>
    ) : part,
  );
};

const matchesSearch = (log: TriggerLog, query: string) => {
  if (!query) return true;
  return [log.message_text, log.sender_name, log.sender_username, log.source_chat_title, log.rule_name]
    .filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'));
};

const statusLabel = (value: string) => {
  if (value === 'success') return 'Уведомление отправлено';
  if (value === 'alert_error') return 'Ошибка уведомления';
  if (value === 'reply_error') return 'Ошибка автоответа';
  if (value === 'webhook_error') return 'Ошибка webhook';
  return 'Действие завершилось с ошибкой';
};

export const LogsPage = ({ liveLogs, onLogsCleared }: LogsPageProps) => {
  const [dbLogs, setDbLogs] = useState<TriggerLog[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [ruleId, setRuleId] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getLogs({ page, page_size: PAGE_SIZE, rule_id: ruleId ?? undefined, query: query || undefined });
      setDbLogs(result.logs);
      setTotal(result.total);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось загрузить историю'));
    } finally {
      setLoading(false);
    }
  }, [page, query, ruleId]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  useEffect(() => {
    let cancelled = false;
    api.getRules().then((items) => { if (!cancelled) setRules(items); }).catch(() => { if (!cancelled) setRules([]); });
    return () => { cancelled = true; };
  }, []);

  const visibleLogs = useMemo(() => {
    if (page !== 1) return dbLogs;
    const incoming = liveLogs.filter((log) => (!ruleId || log.rule_id === ruleId) && matchesSearch(log, query));
    const seen = new Set<number>();
    return [...incoming, ...dbLogs].filter((log) => {
      if (seen.has(log.id)) return false;
      seen.add(log.id);
      return true;
    });
  }, [dbLogs, liveLogs, page, query, ruleId]);

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  };

  const clearLogs = async () => {
    if (!window.confirm('Очистить всю историю срабатываний?')) return;
    try {
      await api.clearLogs();
      setDbLogs([]);
      setTotal(0);
      onLogsCleared();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось очистить историю'));
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900"><Zap className="h-6 w-6 text-[#2481CC]" /> Живой монитор</h1><p className="mt-1 text-sm text-zinc-500">Новые найденные сообщения появляются здесь мгновенно.</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => void fetchLogs()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Обновить</button><button type="button" onClick={() => void clearLogs()} className="flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /> Очистить</button></div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:flex-row sm:p-4">
        <form onSubmit={applySearch} className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><input type="search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Текст, автор или название чата" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-20 text-sm placeholder-zinc-400 focus:border-[#2481CC] focus:bg-white" /><button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-[#2481CC] px-3 py-2 text-xs font-semibold text-white">Найти</button></form>
        <select value={ruleId ?? ''} onChange={(event) => { setRuleId(event.target.value ? Number(event.target.value) : null); setPage(1); }} className="rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-700"><option value="">Все правила</option>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}</select>
      </div>

      {loading && visibleLogs.length === 0 ? (
        <div className="py-16 text-center text-sm text-zinc-500">Загружаем события…</div>
      ) : visibleLogs.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-center shadow-sm"><Zap className="mx-auto h-12 w-12 text-zinc-300" /><h2 className="mt-3 text-lg font-bold text-zinc-900">Здесь пока тихо</h2><p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">Когда сообщение совпадёт с активным правилом, оно появится здесь без перезагрузки.</p></div>
      ) : (
        <div className="space-y-3" aria-live="polite">
          {visibleLogs.map((log) => {
            const succeeded = log.action_status === 'success';
            return (
              <article key={log.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#E7F3FC] px-2.5 py-1 font-bold text-[#2481CC]">{log.rule_name || `Правило #${log.rule_id}`}</span><span className="flex items-center gap-1 text-zinc-500"><MessageCircle className="h-3.5 w-3.5" />{log.source_chat_title || 'Telegram-чат'}</span></div>
                  <div className="flex flex-wrap items-center gap-3"><time className="text-zinc-500" dateTime={log.created_at}>{new Date(log.created_at).toLocaleString('ru-RU')}</time><span className={`flex items-center gap-1 font-semibold ${succeeded ? 'text-emerald-600' : 'text-rose-600'}`} title={log.error_message || undefined}>{succeeded ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{statusLabel(log.action_status)}</span></div>
                </header>
                <div className="mt-4 rounded-xl bg-zinc-50 p-4"><div className="mb-2 flex flex-wrap items-center gap-2 text-xs"><UserRound className="h-4 w-4 text-[#2481CC]" /><span className="font-bold text-zinc-900">{log.sender_name || 'Неизвестный автор'}</span>{log.sender_username && <span className="text-[#2481CC]">@{log.sender_username}</span>}</div><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800">{highlightMatched(log.message_text || '', log.matched_words)}</p></div>
                <footer className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500"><Tag className="h-3.5 w-3.5 text-amber-500" />{log.matched_words.map((word) => <span key={word} className="rounded-md bg-amber-100 px-2 py-1 font-semibold text-amber-800">{word}</span>)}</div>{log.message_link && <a href={log.message_link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl bg-[#2481CC] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1C72B8]">Открыть сообщение в Telegram <ExternalLink className="h-3.5 w-3.5" /></a>}</footer>
              </article>
            );
          })}
        </div>
      )}

      {total > PAGE_SIZE && <div className="flex items-center justify-center gap-3"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-600 disabled:opacity-40"><ChevronLeft className="h-5 w-5" /></button><span className="text-sm font-medium text-zinc-600">Страница {page} из {pages}</span><button type="button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages} className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-600 disabled:opacity-40"><ChevronRight className="h-5 w-5" /></button></div>}
    </div>
  );
};
