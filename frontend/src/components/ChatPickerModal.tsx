import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Bot, Check, Hash, Radio, Search, UserRound, UsersRound } from 'lucide-react';

import type { ChatDialog, ChatType } from '../types';
import { Modal } from './Modal';

interface ChatPickerModalProps {
  isOpen: boolean;
  chats: ChatDialog[];
  selectedIds: string[];
  onApply: (chatIds: string[]) => void;
  onClose: () => void;
}

type PickerTab = 'all' | 'groups' | 'channels' | 'users';

const tabs: { id: PickerTab; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'groups', label: 'Группы' },
  { id: 'channels', label: 'Каналы' },
  { id: 'users', label: 'Личные' },
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

const belongsToTab = (chat: ChatDialog, tab: PickerTab) => {
  if (tab === 'groups') return chat.type === 'group' || chat.type === 'supergroup';
  if (tab === 'channels') return chat.type === 'channel';
  if (tab === 'users') return chat.type === 'user' || chat.type === 'bot';
  return true;
};

export const ChatPickerModal = ({
  isOpen,
  chats,
  selectedIds,
  onApply,
  onClose,
}: ChatPickerModalProps) => {
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PickerTab>('all');

  useEffect(() => {
    if (isOpen) {
      setDraftIds(selectedIds);
      setQuery('');
      setTab('all');
    }
  }, [isOpen, selectedIds]);

  const visibleChats = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return chats.filter((chat) => {
      if (!belongsToTab(chat, tab)) return false;
      if (!normalized) return true;
      return `${chat.title} ${chat.username || ''}`.toLocaleLowerCase('ru').includes(normalized);
    });
  }, [chats, query, tab]);

  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);
  const allVisibleSelected = visibleChats.length > 0 && visibleChats.every((chat) => draftSet.has(chat.id));

  const toggleChat = (chatId: string) => {
    setDraftIds((current) =>
      current.includes(chatId) ? current.filter((id) => id !== chatId) : [...current, chatId],
    );
  };

  const toggleVisible = () => {
    const visibleIds = new Set(visibleChats.map((chat) => chat.id));
    setDraftIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.has(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Выберите чаты" maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Быстрый поиск по названию или @username"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-[#2481CC] focus:bg-white"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                tab === item.id ? 'bg-white text-[#2481CC] shadow-sm' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">Выбрано: <span className="font-semibold text-zinc-900">{draftIds.length}</span></p>
          <button type="button" onClick={toggleVisible} className="text-sm font-semibold text-[#2481CC] hover:text-[#1C72B8]">
            {allVisibleSelected ? 'Снять выбор' : 'Выбрать все'}
          </button>
        </div>

        <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-zinc-200">
          {visibleChats.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-zinc-500">Подходящих чатов не найдено</div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {visibleChats.map((chat) => {
                const Icon = iconByType[chat.type];
                const selected = draftSet.has(chat.id);
                return (
                  <li key={chat.id}>
                    <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[#F4FAFE] ${selected ? 'bg-[#F4FAFE]' : 'bg-white'}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleChat(chat.id)}
                        className="sr-only"
                      />
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-[#2481CC] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-zinc-900">{chat.title}</span>
                          {chat.unread_count > 0 && (
                            <span className="rounded-full bg-[#2481CC] px-1.5 py-0.5 text-[10px] font-bold text-white">{chat.unread_count}</span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                          <span>{typeLabels[chat.type]}</span>
                          {chat.username ? <span className="text-[#2481CC]">@{chat.username}</span> : <span className="flex items-center gap-0.5"><Hash className="h-3 w-3" /> приватный</span>}
                        </span>
                      </span>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${selected ? 'border-[#2481CC] bg-[#2481CC] text-white' : 'border-zinc-300 bg-white text-transparent'}`}>
                        <Check className="h-4 w-4" />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">Отмена</button>
          <button
            type="button"
            onClick={() => {
              onApply(draftIds);
              onClose();
            }}
            className="rounded-xl bg-[#2481CC] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1C72B8]"
          >
            Применить выбор ({draftIds.length})
          </button>
        </div>
      </div>
    </Modal>
  );
};
