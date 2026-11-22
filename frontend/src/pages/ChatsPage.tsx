import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Bot, MessageCircle, Radio, RefreshCw, Search, UserRound, UsersRound } from 'lucide-react';

import { api, getErrorMessage } from '../api/client';
import type { Account, ChatDialog, ChatType } from '../types';

interface ChatsPageProps {
  account: Account | null;
}

type Category = 'all' | 'groups' | 'channels' | 'users';

const categories: { id: Category; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'groups', label: 'Группы и супергруппы' },
  { id: 'channels', label: 'Каналы' },
  { id: 'users', label: 'Личные чаты' },
];

const typeLabels: Record<ChatType, string> = {
  channel: 'Канал',
  supergroup: 'Супергруппа',
  group: 'Группа',
  user: 'Личный чат',
  bot: 'Бот',
};

const iconByType: Record<ChatType, ComponentType<{ className?: string }>> = {
  channel: Radio,
  supergroup: UsersRound,
  group: UsersRound,
  user: UserRound,
  bot: Bot,
};

const inCategory = (chat: ChatDialog, category: Category) => {
  if (category === 'groups') return chat.type === 'group' || chat.type === 'supergroup';
  if (category === 'channels') return chat.type === 'channel';
  if (category === 'users') return chat.type === 'user' || chat.type === 'bot';
  return true;
};

export const ChatsPage = ({ account }: ChatsPageProps) => {
  const [dialogs, setDialogs] = useState<ChatDialog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');

  const fetchChats = useCallback(async (refresh = false) => {
    if (!account) {
      setDialogs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDialogs({ refresh });
      setDialogs(result.chats);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось загрузить чаты Telegram'));
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    void fetchChats();
  }, [fetchChats]);

  const filteredDialogs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return dialogs.filter((chat) => {
      if (!inCategory(chat, category)) return false;
      if (!normalized) return true;
      return `${chat.title} ${chat.username || ''}`.toLocaleLowerCase('ru').includes(normalized);
    });
  }, [category, dialogs, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900"><MessageCircle className="h-6 w-6 text-[#2481CC]" /> Мои чаты</h1>
          <p className="mt-1 text-sm text-zinc-500">Все группы, каналы и личные диалоги вашего Telegram.</p>
        </div>
        <button type="button" onClick={() => void fetchChats(true)} disabled={loading || !account} className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-45"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Обновить</button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      {!account ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-center shadow-sm"><MessageCircle className="mx-auto h-12 w-12 text-zinc-300" /><h2 className="mt-3 text-lg font-bold text-zinc-900">Telegram ещё не подключён</h2><p className="mt-1 text-sm text-zinc-500">Войдите по номеру телефона, и ваши диалоги появятся здесь.</p></div>
      ) : (
        <>
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти чат или @username" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-4 text-sm placeholder-zinc-400 focus:border-[#2481CC] focus:bg-white" /></div>
            <div className="mt-3 flex gap-1 overflow-x-auto">{categories.map((item) => <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold ${category === item.id ? 'bg-[#2481CC] text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>{item.label}</button>)}</div>
          </div>

          {loading && dialogs.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-500"><RefreshCw className="mx-auto mb-3 h-7 w-7 animate-spin text-[#2481CC]" />Получаем диалоги из Telegram…</div>
          ) : filteredDialogs.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">По вашему запросу ничего не найдено.</div>
          ) : (
            <div>
              <p className="mb-3 text-xs font-medium text-zinc-500">Показано чатов: {filteredDialogs.length}</p>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredDialogs.map((chat) => {
                  const Icon = iconByType[chat.type];
                  return (
                    <article key={chat.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E7F3FC] text-[#2481CC]"><Icon className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-sm font-bold text-zinc-900">{chat.title}</h2>{chat.unread_count > 0 && <span className="rounded-full bg-[#2481CC] px-1.5 py-0.5 text-[10px] font-bold text-white">{chat.unread_count}</span>}</div><div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500"><span>{typeLabels[chat.type]}</span>{chat.username && <span className="text-[#2481CC]">@{chat.username}</span>}{chat.is_creator && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">Владелец</span>}{chat.is_admin && !chat.is_creator && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">Админ</span>}</div></div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
