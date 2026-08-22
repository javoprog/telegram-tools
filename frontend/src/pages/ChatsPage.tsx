import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Bot,
  Check,
  Copy,
  Hash,
  MessageSquare,
  RefreshCw,
  Search,
  User,
  Users,
  Volume2,
} from 'lucide-react';

import { api, getErrorMessage } from '../api/client';
import type { Account, ChatDialog, ChatType, ChatTypeFilter } from '../types';

interface ChatsPageProps {
  accounts: Account[];
  selectedAccountId: number | null;
}

type DialogFilter = 'all' | ChatTypeFilter;

const FILTERS: { id: DialogFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'channel', label: 'Каналы' },
  { id: 'supergroup', label: 'Супергруппы' },
  { id: 'group', label: 'Группы' },
  { id: 'user', label: 'Личные' },
];

const chatIcon = (type: ChatType): ReactNode => {
  if (type === 'channel') return <Volume2 className="w-5 h-5 text-[#24A1DE]" />;
  if (type === 'supergroup' || type === 'group') return <Users className="w-5 h-5 text-indigo-400" />;
  if (type === 'bot') return <Bot className="w-5 h-5 text-violet-400" />;
  return <User className="w-5 h-5 text-emerald-400" />;
};

const TYPE_LABELS: Record<ChatType, string> = {
  channel: 'Канал',
  supergroup: 'Супергруппа',
  group: 'Группа',
  user: 'Личный чат',
  bot: 'Бот',
};

export const ChatsPage = ({ accounts, selectedAccountId }: ChatsPageProps) => {
  const [dialogs, setDialogs] = useState<ChatDialog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DialogFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchChats = useCallback(async () => {
    if (!selectedAccountId) {
      setDialogs([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.getDialogs({
        account_id: selectedAccountId,
        query: appliedSearch || undefined,
        chat_type: typeFilter === 'all' ? undefined : typeFilter,
      });
      setDialogs(response.chats);
      setTotal(response.total);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось загрузить диалоги Telegram'));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, selectedAccountId, typeFilter]);

  useEffect(() => {
    void fetchChats();
  }, [fetchChats]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
  };

  const copyChatId = async (chatId: string) => {
    try {
      await navigator.clipboard.writeText(chatId);
      setCopiedId(chatId);
      window.setTimeout(() => setCopiedId((current) => (current === chatId ? null : current)), 2_000);
    } catch {
      setError('Браузер не разрешил доступ к буферу обмена. Скопируйте ID вручную.');
    }
  };

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-[#24A1DE]" />
            Диалоги и чаты
          </h1>
          <p className="text-slate-400 text-sm mt-1">Каналы, группы и личные чаты выбранного MTProto‑аккаунта.</p>
          {selectedAccount && <p className="text-xs text-[#24A1DE] mt-2">Аккаунт: {selectedAccount.first_name || selectedAccount.phone_number}</p>}
        </div>
        <button type="button" onClick={() => void fetchChats()} disabled={loading || !selectedAccountId} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#182533] hover:bg-[#242F3D] disabled:opacity-40 text-slate-200 border border-[#242F3D] rounded-xl text-sm font-medium transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить список
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input type="search" placeholder="Название или @username…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} disabled={!selectedAccountId} className="w-full bg-[#17212B] border border-[#242F3D] focus:border-[#24A1DE] disabled:opacity-50 rounded-xl pl-10 pr-24 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors" />
          <button type="submit" disabled={!selectedAccountId} className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#2B5278] hover:bg-[#35658f] disabled:opacity-40 rounded-lg text-xs text-white">Найти</button>
        </form>
        <div className="flex items-center gap-1 bg-[#17212B] border border-[#242F3D] p-1 rounded-xl overflow-x-auto">
          {FILTERS.map((filter) => (
            <button key={filter.id} type="button" onClick={() => setTypeFilter(filter.id)} disabled={!selectedAccountId} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-40 ${typeFilter === filter.id ? 'bg-[#24A1DE] text-white' : 'text-slate-400 hover:text-white hover:bg-[#182533]'}`}>
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-sm">{error}</div>}

      {!selectedAccountId ? (
        <div className="bg-[#17212B] border border-[#242F3D] rounded-2xl p-12 text-center text-slate-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h2 className="text-base font-semibold text-white">Telegram‑аккаунт не подключён</h2>
          <p className="text-sm mt-1">Подключите аккаунт, чтобы получить его диалоги.</p>
        </div>
      ) : loading && dialogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin mb-3 text-[#24A1DE]" />
          <p className="text-sm">Получаем диалоги из Telegram…</p>
        </div>
      ) : dialogs.length === 0 ? (
        <div className="bg-[#17212B] border border-[#242F3D] rounded-2xl p-12 text-center text-slate-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h2 className="text-base font-semibold text-white">Чаты не найдены</h2>
          <p className="text-sm mt-1">Измените поисковый запрос или фильтр типа.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">Найдено диалогов: {total}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dialogs.map((chat) => (
              <article key={chat.id} className="bg-[#17212B] border border-[#242F3D] hover:border-[#2B5278] rounded-xl p-4 transition-colors flex flex-col justify-between shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#182533] border border-[#242F3D] flex items-center justify-center shrink-0 mt-0.5">{chatIcon(chat.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="text-sm font-semibold text-white truncate" title={chat.title}>{chat.title}</h2>
                      {chat.is_creator && <span className="text-[10px] bg-amber-500/20 text-amber-200 px-1.5 py-0.5 rounded font-medium">Владелец</span>}
                      {chat.is_admin && !chat.is_creator && <span className="text-[10px] bg-sky-500/20 text-sky-200 px-1.5 py-0.5 rounded font-medium">Админ</span>}
                      {chat.unread_count > 0 && <span className="text-[10px] bg-[#24A1DE] text-white px-1.5 py-0.5 rounded-full font-semibold">{chat.unread_count}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span className="bg-[#182533] px-2 py-0.5 rounded text-[11px] text-slate-300 border border-[#242F3D]">{TYPE_LABELS[chat.type]}</span>
                      {chat.username && <span className="text-[#24A1DE] truncate">@{chat.username}</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-[#242F3D] flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1 text-slate-300 font-mono min-w-0">
                    <Hash className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate" title={chat.id}>{chat.id}</span>
                  </div>
                  <button type="button" onClick={() => void copyChatId(chat.id)} className="flex items-center gap-1 px-2.5 py-1 bg-[#182533] hover:bg-[#24A1DE] hover:text-white text-slate-300 border border-[#242F3D] rounded-lg transition-colors shrink-0" title="Скопировать ID чата">
                    {copiedId === chat.id ? <><Check className="w-3 h-3 text-emerald-400" /> Скопировано</> : <><Copy className="w-3 h-3" /> Копировать ID</>}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
