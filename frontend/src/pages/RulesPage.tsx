import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  BellRing,
  Check,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Clock3,
  Pencil,
  Plus,
  SearchCheck,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

import { api, getErrorMessage } from '../api/client';
import { ChatPickerModal } from '../components/ChatPickerModal';
import { Modal } from '../components/Modal';
import type { Account, ChatDialog, MatchMode, Rule, RuleCreate } from '../types';

interface RulesPageProps {
  account: Account | null;
}

interface RuleForm {
  name: string;
  description: string;
  sourceMode: 'all' | 'selected';
  sourceIds: string[];
  triggerWords: string[];
  excludeWords: string[];
  matchMode: MatchMode;
  caseSensitive: boolean;
  targetId: string;
  autoReply: boolean;
  replyTemplate: string;
  replyDelaySeconds: number;
  cooldownSeconds: number;
}

const emptyForm = (): RuleForm => ({
  name: '',
  description: '',
  sourceMode: 'all',
  sourceIds: [],
  triggerWords: [],
  excludeWords: [],
  matchMode: 'any',
  caseSensitive: false,
  targetId: '',
  autoReply: false,
  replyTemplate: 'Здравствуйте, {sender_name}! Спасибо за сообщение.',
  replyDelaySeconds: 2,
  cooldownSeconds: 60,
});

const formFromRule = (rule: Rule): RuleForm => ({
  name: rule.name,
  description: rule.description || '',
  sourceMode: rule.source_chat_ids.includes('*') ? 'all' : 'selected',
  sourceIds: rule.source_chat_ids.includes('*') ? [] : rule.source_chat_ids,
  triggerWords: rule.trigger_words,
  excludeWords: rule.exclude_words,
  matchMode: rule.match_mode,
  caseSensitive: rule.case_sensitive,
  targetId: rule.target_chat_id || '',
  autoReply: rule.action_type === 'auto_reply' || rule.action_type === 'both',
  replyTemplate: rule.reply_template || 'Здравствуйте, {sender_name}! Спасибо за сообщение.',
  replyDelaySeconds: rule.reply_delay_seconds,
  cooldownSeconds: rule.cooldown_seconds,
});

interface TagsInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  tone?: 'blue' | 'red';
}

const TagsInput = ({ values, onChange, placeholder, tone = 'blue' }: TagsInputProps) => {
  const [draft, setDraft] = useState('');

  const addValues = (raw: string) => {
    const additions = raw.split(',').map((item) => item.trim()).filter(Boolean);
    if (additions.length === 0) return;
    onChange(Array.from(new Set([...values, ...additions])));
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addValues(draft);
    }
    if (event.key === 'Backspace' && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 focus-within:border-[#2481CC] focus-within:ring-2 focus-within:ring-[#2481CC]/10">
      {values.map((value) => (
        <span key={value} className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${tone === 'red' ? 'bg-rose-50 text-rose-700' : 'bg-[#E7F3FC] text-[#2481CC]'}`}>
          {value}
          <button type="button" onClick={() => onChange(values.filter((item) => item !== value))} className="rounded p-0.5 hover:bg-black/5" aria-label={`Удалить ${value}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => {
          const value = event.target.value;
          if (value.includes(',')) addValues(value);
          else setDraft(value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => addValues(draft)}
        placeholder={values.length === 0 ? placeholder : 'Добавить ещё…'}
        className="min-w-[180px] flex-1 border-0 bg-transparent py-1 text-sm text-zinc-900 placeholder-zinc-400 outline-none ring-0"
      />
    </div>
  );
};

export const RulesPage = ({ account }: RulesPageProps) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [dialogs, setDialogs] = useState<ChatDialog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!account) {
      setRules([]);
      setDialogs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ruleItems, dialogResult] = await Promise.all([api.getRules(), api.getDialogs()]);
      setRules(ruleItems);
      setDialogs(dialogResult.chats);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось загрузить данные Telegram'));
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dialogById = useMemo(() => new Map(dialogs.map((chat) => [chat.id, chat])), [dialogs]);

  const openCreate = () => {
    setError(null);
    setEditingRule(null);
    setForm(emptyForm());
    setAdvancedOpen(false);
    setFormOpen(true);
  };

  const openEdit = (rule: Rule) => {
    setError(null);
    setEditingRule(rule);
    setForm(formFromRule(rule));
    setAdvancedOpen(rule.exclude_words.length > 0 || rule.case_sensitive || rule.match_mode !== 'any');
    setFormOpen(true);
  };

  const updateForm = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveRule = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (form.sourceMode === 'selected' && form.sourceIds.length === 0) {
      setError('Выберите хотя бы один чат, где нужно искать сообщения.');
      return;
    }
    if (form.triggerWords.length === 0) {
      setError('Добавьте хотя бы одно ключевое слово.');
      return;
    }
    if (!form.targetId) {
      setError('Выберите чат, куда отправлять уведомления.');
      return;
    }
    if (form.autoReply && !form.replyTemplate.trim()) {
      setError('Введите текст автоответа или выключите автоответчик.');
      return;
    }

    const payload: RuleCreate = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      is_active: editingRule?.is_active ?? true,
      source_chat_ids: form.sourceMode === 'all' ? ['*'] : form.sourceIds,
      target_chat_id: form.targetId,
      trigger_words: form.triggerWords,
      exclude_words: form.excludeWords,
      match_mode: form.matchMode,
      case_sensitive: form.caseSensitive,
      action_type: form.autoReply ? 'both' : 'forward_alert',
      alert_template: null,
      reply_template: form.autoReply ? form.replyTemplate.trim() : null,
      reply_delay_seconds: form.replyDelaySeconds,
      webhook_url: null,
      cooldown_seconds: form.cooldownSeconds,
    };

    setSaving(true);
    try {
      if (editingRule) await api.updateRule(editingRule.id, payload);
      else await api.createRule(payload);
      setFormOpen(false);
      await refresh();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось сохранить правило'));
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: Rule) => {
    try {
      const updated = await api.toggleRule(rule.id);
      setRules((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось изменить статус правила'));
    }
  };

  const deleteRule = async (rule: Rule) => {
    if (!window.confirm(`Удалить правило «${rule.name}»?`)) return;
    try {
      await api.deleteRule(rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось удалить правило'));
    }
  };

  const selectedSourceChats = form.sourceIds.map((id) => dialogById.get(id)).filter((chat): chat is ChatDialog => Boolean(chat));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900">
            <SearchCheck className="h-6 w-6 text-[#2481CC]" /> Мои правила
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Укажите, что искать — Telegram Tools сам заметит сообщение и пришлёт уведомление.</p>
        </div>
        <button type="button" onClick={openCreate} disabled={!account} className="flex items-center justify-center gap-2 rounded-xl bg-[#2481CC] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1C72B8] disabled:cursor-not-allowed disabled:opacity-45">
          <Plus className="h-4 w-4" /> Создать правило
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      {!account ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E7F3FC] text-[#2481CC]"><BellRing className="h-7 w-7" /></div>
          <h2 className="mt-4 text-lg font-bold text-zinc-900">Сначала войдите в Telegram</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">После подключения номера здесь появятся ваши чаты и можно будет создать первое правило.</p>
        </div>
      ) : loading && rules.length === 0 ? (
        <div className="py-16 text-center text-sm text-zinc-500">Загружаем правила и чаты…</div>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E7F3FC] text-[#2481CC]"><Tag className="h-7 w-7" /></div>
          <h2 className="mt-4 text-lg font-bold text-zinc-900">Правил пока нет</h2>
          <p className="mt-1 text-sm text-zinc-500">Создайте правило за несколько простых шагов — без технических настроек.</p>
          <button type="button" onClick={openCreate} className="mt-5 rounded-xl bg-[#2481CC] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1C72B8]">Создать первое правило</button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rules.map((rule) => {
            const sourceNames = rule.source_chat_ids.includes('*')
              ? ['Все мои чаты']
              : rule.source_chat_ids.map((id) => dialogById.get(id)?.title).filter(Boolean) as string[];
            const targetName = rule.target_chat_id ? dialogById.get(rule.target_chat_id)?.title : null;
            return (
              <article key={rule.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-zinc-900">{rule.name}</h2>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${rule.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{rule.is_active ? 'Активно' : 'На паузе'}</span>
                    </div>
                    {rule.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{rule.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => void toggleRule(rule)} className="rounded-xl p-2 text-zinc-500 hover:bg-[#E7F3FC] hover:text-[#2481CC]" title={rule.is_active ? 'Поставить на паузу' : 'Запустить'}>{rule.is_active ? <CirclePause className="h-[18px] w-[18px]" /> : <CirclePlay className="h-[18px] w-[18px]" />}</button>
                    <button type="button" onClick={() => openEdit(rule)} className="rounded-xl p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" title="Редактировать"><Pencil className="h-[18px] w-[18px]" /></button>
                    <button type="button" onClick={() => void deleteRule(rule)} className="rounded-xl p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600" title="Удалить"><Trash2 className="h-[18px] w-[18px]" /></button>
                  </div>
                </div>

                <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4 text-sm">
                  <div className="flex items-start gap-2"><SearchCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#2481CC]" /><div><span className="text-zinc-500">Ищем в: </span><span className="font-medium text-zinc-800">{sourceNames.length > 0 ? sourceNames.slice(0, 2).join(', ') : `${rule.source_chat_ids.length} выбранных чатах`}{sourceNames.length > 2 ? ` и ещё ${sourceNames.length - 2}` : ''}</span></div></div>
                  <div className="flex items-start gap-2"><BellRing className="mt-0.5 h-4 w-4 shrink-0 text-[#2481CC]" /><div><span className="text-zinc-500">Уведомление: </span><span className="font-medium text-zinc-800">{targetName || 'Выбранный чат'}</span></div></div>
                  <div className="flex flex-wrap gap-1.5 pt-1">{rule.trigger_words.slice(0, 6).map((word) => <span key={word} className="rounded-lg bg-[#E7F3FC] px-2 py-1 text-xs font-semibold text-[#2481CC]">{word}</span>)}{rule.trigger_words.length > 6 && <span className="rounded-lg bg-zinc-100 px-2 py-1 text-xs text-zinc-500">+{rule.trigger_words.length - 6}</span>}</div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editingRule ? 'Редактировать правило' : 'Новое правило'} maxWidth="max-w-4xl">
        <form onSubmit={saveRule} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-zinc-700">Название правила
              <input required value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Например: Новые заказы" className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm font-normal text-zinc-900 placeholder-zinc-400 focus:border-[#2481CC]" />
            </label>
            <label className="text-sm font-semibold text-zinc-700">Короткое описание <span className="font-normal text-zinc-400">(необязательно)</span>
              <input value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Для чего нужно это правило" className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm font-normal text-zinc-900 placeholder-zinc-400 focus:border-[#2481CC]" />
            </label>
          </div>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#2481CC] text-sm font-bold text-white">1</span><div><h3 className="font-bold text-zinc-900">Где искать?</h3><p className="text-xs text-zinc-500">Выберите все диалоги или только нужные.</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 ${form.sourceMode === 'all' ? 'border-[#2481CC] ring-2 ring-[#2481CC]/10' : 'border-zinc-200'}`}><input type="radio" name="sourceMode" checked={form.sourceMode === 'all'} onChange={() => updateForm('sourceMode', 'all')} className="mt-0.5 accent-[#2481CC]" /><span><span className="block text-sm font-semibold text-zinc-900">Во всех моих чатах</span><span className="mt-0.5 block text-xs text-zinc-500">Новые диалоги тоже попадут в мониторинг</span></span></label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 ${form.sourceMode === 'selected' ? 'border-[#2481CC] ring-2 ring-[#2481CC]/10' : 'border-zinc-200'}`}><input type="radio" name="sourceMode" checked={form.sourceMode === 'selected'} onChange={() => updateForm('sourceMode', 'selected')} className="mt-0.5 accent-[#2481CC]" /><span><span className="block text-sm font-semibold text-zinc-900">Только в выбранных чатах</span><span className="mt-0.5 block text-xs text-zinc-500">Точный список групп, каналов и людей</span></span></label>
            </div>
            {form.sourceMode === 'selected' && <div className="mt-4"><button type="button" onClick={() => setPickerOpen(true)} className="rounded-xl border border-[#2481CC]/30 bg-[#E7F3FC] px-4 py-2.5 text-sm font-semibold text-[#2481CC] hover:border-[#2481CC]">Выбрать чаты… {form.sourceIds.length > 0 && `(${form.sourceIds.length})`}</button><div className="mt-3 flex flex-wrap gap-2">{selectedSourceChats.map((chat) => <span key={chat.id} className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700">{chat.title}<button type="button" onClick={() => updateForm('sourceIds', form.sourceIds.filter((id) => id !== chat.id))} aria-label={`Убрать ${chat.title}`}><X className="h-3 w-3 text-zinc-400" /></button></span>)}</div></div>}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#2481CC] text-sm font-bold text-white">2</span><div><h3 className="font-bold text-zinc-900">Ключевые слова</h3><p className="text-xs text-zinc-500">Нажмите Enter или поставьте запятую после каждого слова.</p></div></div>
            <TagsInput values={form.triggerWords} onChange={(values) => updateForm('triggerWords', values)} placeholder="заказ, бот, разработка, куплю" />
            <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-zinc-500 hover:text-zinc-900">Дополнительные настройки <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} /></button>
            {advancedOpen && <div className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-white p-4"><div><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Слова-исключения</label><TagsInput values={form.excludeWords} onChange={(values) => updateForm('excludeWords', values)} placeholder="бесплатно, вакансия, спам" tone="red" /></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-zinc-700">Как искать<select value={form.matchMode} onChange={(event) => updateForm('matchMode', event.target.value as MatchMode)} className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-normal"><option value="any">Любое из слов</option><option value="all">Все слова вместе</option><option value="exact">Только целые слова</option><option value="regex">Регулярные выражения</option></select></label><label className="flex items-center gap-3 self-end rounded-xl border border-zinc-200 p-3 text-sm font-medium text-zinc-700"><input type="checkbox" checked={form.caseSensitive} onChange={(event) => updateForm('caseSensitive', event.target.checked)} className="h-4 w-4 accent-[#2481CC]" />Учитывать регистр букв</label></div></div>}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#2481CC] text-sm font-bold text-white">3</span><div><h3 className="font-bold text-zinc-900">Куда отправлять уведомления?</h3><p className="text-xs text-zinc-500">Выберите чат по названию — ID вводить не нужно.</p></div></div>
            <select required value={form.targetId} onChange={(event) => updateForm('targetId', event.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-900 focus:border-[#2481CC]"><option value="">Выберите чат для уведомлений…</option>{dialogs.map((chat) => <option key={chat.id} value={chat.id}>{chat.title}{chat.username ? ` (@${chat.username})` : ''}</option>)}</select>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-200 text-sm font-bold text-zinc-600">4</span><div><h3 className="font-bold text-zinc-900">Автоответчик <span className="text-sm font-normal text-zinc-400">(необязательно)</span></h3><p className="text-xs text-zinc-500">Ответить автору прямо под найденным сообщением.</p></div></div><button type="button" role="switch" aria-checked={form.autoReply} onClick={() => updateForm('autoReply', !form.autoReply)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${form.autoReply ? 'bg-[#2481CC]' : 'bg-zinc-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.autoReply ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>
            {form.autoReply && <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_150px]"><label className="text-sm font-semibold text-zinc-700">Текст ответа<textarea required rows={3} value={form.replyTemplate} onChange={(event) => updateForm('replyTemplate', event.target.value)} className="mt-2 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm font-normal" /><span className="mt-1 block text-xs font-normal text-zinc-400">Можно использовать {'{sender_name}'}</span></label><label className="text-sm font-semibold text-zinc-700">Задержка, сек.<input type="number" min={0} max={86400} value={form.replyDelaySeconds} onChange={(event) => updateForm('replyDelaySeconds', Number(event.target.value))} className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 font-normal" /></label></div>}
            <label className="mt-4 flex max-w-xs items-center gap-2 text-xs font-medium text-zinc-500"><Clock3 className="h-4 w-4" /> Антиспам, секунд<input type="number" min={0} max={2592000} value={form.cooldownSeconds} onChange={(event) => updateForm('cooldownSeconds', Number(event.target.value))} className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-zinc-900" /></label>
          </section>

          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <div className="flex justify-end gap-3 border-t border-zinc-100 pt-5"><button type="button" onClick={() => setFormOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">Отмена</button><button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-[#2481CC] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1C72B8] disabled:opacity-50">{saving ? 'Сохраняем…' : <><Check className="h-4 w-4" /> Сохранить правило</>}</button></div>
        </form>
      </Modal>

      <ChatPickerModal isOpen={pickerOpen} chats={dialogs} selectedIds={form.sourceIds} onApply={(ids) => updateForm('sourceIds', ids)} onClose={() => setPickerOpen(false)} />
    </div>
  );
};
