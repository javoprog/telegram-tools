import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Radio,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  User,
} from 'lucide-react';

import { api, getErrorMessage } from '../api/client';
import type { Rule, TriggerLog } from '../types';

interface LogsPageProps {
  liveLogs: TriggerLog[];
  selectedAccountId: number | null;
  onLogsCleared: () => void;
}

const PAGE_SIZE = 20;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightMatched = (text: string, matchedWords: string[]): ReactNode => {
  const words = Array.from(new Set(matchedWords.filter((word) => word && word !== '*')))
    .sort((left, right) => right.length - left.length);
  if (!text || words.length === 0) return text;

  const expression = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
  const normalizedWords = new Set(words.map((word) => word.toLocaleLowerCase('ru')));
  return text.split(expression).map((part, index) =>
    normalizedWords.has(part.toLocaleLowerCase('ru')) ? (
      <mark key={`${index}-${part}`} className="bg-amber-400/20 text-amber-200 font-semibold px-1 rounded">
        {part}
      </mark>
    ) : (
      part
    ),
  );
};

const matchesSearch = (log: TriggerLog, query: string) => {
  if (!query) return true;
  const haystack = [
    log.message_text,
    log.sender_name,
    log.sender_username,
    log.source_chat_title,
    log.rule_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru');
  return haystack.includes(query.toLocaleLowerCase('ru'));
};

const statusLabel = (status: string) => {
  if (status === 'success') return 'Действие выполнено';
  if (status === 'alert_error') return 'Ошибка отправки отчёта';
  if (status === 'reply_error') return 'Ошибка автоответа';
  if (status === 'webhook_error') return 'Ошибка webhook';
  return 'Выполнено с ошибкой';
};

export const LogsPage = ({
  liveLogs,
  selectedAccountId,
  onLogsCleared,
}: LogsPageProps) => {
  const [dbLogs, setDbLogs] = useState<TriggerLog[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getLogs({
        page,
        page_size: PAGE_SIZE,
        rule_id: selectedRuleId ?? undefined,
        account_id: selectedAccountId ?? undefined,
        query: appliedSearch || undefined,
      });
      setDbLogs(response.logs);
      setTotal(response.total);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Ошибка загрузки журнала'));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, page, selectedAccountId, selectedRuleId]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    let cancelled = false;
    api
      .getRules({ account_id: selectedAccountId ?? undefined })
      .then((items) => {
        if (!cancelled) setRules(items);
      })
      .catch(() => {
        if (!cancelled) setRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId]);

  useEffect(() => {
    setPage(1);
    setSelectedRuleId(null);
  }, [selectedAccountId]);

  const combinedLogs = useMemo(() => {
    if (page !== 1) return dbLogs;
    const matchingLive = liveLogs.filter(
      (log) =>
        (!selectedAccountId || log.account_id === selectedAccountId) &&
        (!selectedRuleId || log.rule_id === selectedRuleId) &&
        matchesSearch(log, appliedSearch),
    );
    const seen = new Set<number>();
    return [...matchingLive, ...dbLogs].filter((log) => {
      if (seen.has(log.id)) return false;
      seen.add(log.id);
      return true;
    });
  }, [appliedSearch, dbLogs, liveLogs, page, selectedAccountId, selectedRuleId]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(searchInput.trim());
  };

  const clearHistory = async () => {
    if (!window.confirm('Удалить всю историю срабатываний для всех аккаунтов?')) return;
    try {
      await api.clearLogs();
      setDbLogs([]);
      setTotal(0);
      onLogsCleared();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Ошибка очистки журнала'));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Radio className="w-6 h-6 text-[#24A1DE]" />
            Живой монитор
          </h1>
          <p className="text-slate-400 text-sm mt-1">Новые срабатывания появляются здесь сразу после обработки сообщения.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void fetchLogs()} disabled={loading} className="flex items-center gap-2 px-3.5 py-2 bg-[#182533] hover:bg-[#242F3D] disabled:opacity-50 text-slate-200 border border-[#242F3D] rounded-xl text-sm font-medium transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
          <button type="button" onClick={() => void clearHistory()} className="flex items-center gap-2 px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded-xl text-sm font-medium transition-colors">
            <Trash2 className="w-4 h-4" />
            Очистить
          </button>
        </div>
      </div>

      {error && <div role="alert" className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-sm">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Текст, автор, username, чат или правило…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="w-full bg-[#17212B] border border-[#242F3D] focus:border-[#24A1DE] rounded-xl pl-10 pr-24 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
          />
          <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#2B5278] hover:bg-[#35658f] rounded-lg text-xs text-white">Найти</button>
        </form>
        <select
          aria-label="Фильтр по правилу"
          value={selectedRuleId ?? ''}
          onChange={(event) => {
            setSelectedRuleId(event.target.value ? Number(event.target.value) : null);
            setPage(1);
          }}
          className="bg-[#17212B] border border-[#242F3D] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#24A1DE]"
        >
          <option value="">Все правила ({rules.length})</option>
          {rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}
        </select>
      </div>

      {loading && combinedLogs.length === 0 ? (
        <div className="text-center py-20 text-slate-500">Загружаем журнал событий…</div>
      ) : combinedLogs.length === 0 ? (
        <div className="bg-[#17212B] border border-[#242F3D] rounded-2xl p-12 text-center text-slate-400">
          <Radio className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h2 className="text-lg font-semibold text-white">Срабатываний пока нет</h2>
          <p className="text-sm mt-1 max-w-md mx-auto">Когда сообщение совпадёт с активным правилом, событие появится здесь без перезагрузки.</p>
        </div>
      ) : (
        <div className="space-y-3" aria-live="polite">
          {combinedLogs.map((log) => {
            const succeeded = log.action_status === 'success';
            return (
              <article key={log.id} className="bg-[#17212B] border border-[#242F3D] hover:border-[#2B5278] rounded-2xl p-4 sm:p-5 transition-colors shadow-sm space-y-3">
                <header className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-[#24A1DE]/15 text-[#4db7e9] font-semibold px-2.5 py-0.5 rounded-full border border-[#24A1DE]/30">{log.rule_name || `Правило #${log.rule_id}`}</span>
                    <span className="text-slate-400 flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                      {log.source_chat_title || log.source_chat_id}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-slate-400">
                    <time dateTime={log.created_at}>{new Date(log.created_at).toLocaleString('ru-RU')}</time>
                    <span className={`flex items-center gap-1 font-medium ${succeeded ? 'text-emerald-400' : 'text-rose-300'}`} title={log.error_message || undefined}>
                      {succeeded ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      {statusLabel(log.action_status)}
                    </span>
                  </div>
                </header>

                <div className="bg-[#182533] border border-[#242F3D] rounded-xl p-3.5 text-sm text-slate-200">
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[#242F3D] text-xs">
                    <User className="w-3.5 h-3.5 text-[#24A1DE]" />
                    <span className="font-semibold text-white">{log.sender_name || 'Неизвестный автор'}</span>
                    {log.sender_username && <span className="text-[#24A1DE]">@{log.sender_username}</span>}
                  </div>
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{highlightMatched(log.message_text || '', log.matched_words)}</p>
                </div>

                <footer className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-slate-400">Совпало:</span>
                    {log.matched_words.map((word) => (
                      <span key={word} className="bg-amber-400/10 text-amber-200 border border-amber-400/20 px-2 py-0.5 rounded text-[11px] font-mono font-medium">{word}</span>
                    ))}
                  </div>
                  {log.message_link && (
                    <a href={log.message_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#24A1DE] hover:underline font-medium">
                      Перейти к сообщению <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </footer>
              </article>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 text-xs text-slate-400">
              <span>Страница {page} из {totalPages} · событий в истории: {total}</span>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Предыдущая страница" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="p-2 bg-[#17212B] border border-[#242F3D] rounded-lg disabled:opacity-40 hover:text-white">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button type="button" aria-label="Следующая страница" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="p-2 bg-[#17212B] border border-[#242F3D] rounded-lg disabled:opacity-40 hover:text-white">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
