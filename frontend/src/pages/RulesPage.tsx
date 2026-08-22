import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Sliders, Plus, Play, Pause, Trash2, Edit3, Tag, MessageSquare,
  ArrowRight, ShieldAlert, Globe
} from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import type { Account, ActionType, MatchMode, Rule, RuleCreate } from '../types';
import { Modal } from '../components/Modal';

interface RulesPageProps {
  accounts: Account[];
  selectedAccountId: number | null;
}

const ACTION_OPTIONS: { id: ActionType; label: string }[] = [
  { id: 'forward_alert', label: 'Переслать отчёт' },
  { id: 'auto_reply', label: 'Автоответ' },
  { id: 'both', label: 'Отчёт + ответ' },
  { id: 'webhook', label: 'Webhook POST' },
];

const ACTION_LABELS: Record<ActionType, string> = {
  forward_alert: 'Отчёт',
  auto_reply: 'Автоответ',
  both: 'Отчёт + ответ',
  webhook: 'Webhook',
};

export const RulesPage = ({ accounts, selectedAccountId }: RulesPageProps) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceChats, setSourceChats] = useState<string>('*');
  const [targetChatId, setTargetChatId] = useState('');

  const [triggerInput, setTriggerInput] = useState('');
  const [triggerWords, setTriggerWords] = useState<string[]>([]);

  const [excludeInput, setExcludeInput] = useState('');
  const [excludeWords, setExcludeWords] = useState<string[]>([]);

  const [matchMode, setMatchMode] = useState<MatchMode>('any');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [actionType, setActionType] = useState<ActionType>('forward_alert');
  const [alertTemplate, setAlertTemplate] = useState('');
  const [replyTemplate, setReplyTemplate] = useState('');
  const [replyDelaySeconds, setReplyDelaySeconds] = useState(2);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const fetchRules = useCallback(async () => {
    if (!selectedAccountId) {
      setRules([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getRules({ account_id: selectedAccountId });
      setRules(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось загрузить правила'));
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  const openCreateModal = () => {
    if (!selectedAccountId) return;
    setEditingRuleId(null);
    setName('');
    setDescription('');
    setSourceChats('*');
    setTargetChatId('');
    setTriggerWords([]);
    setTriggerInput('');
    setExcludeWords([]);
    setExcludeInput('');
    setMatchMode('any');
    setCaseSensitive(false);
    setActionType('forward_alert');
    setAlertTemplate('');
    setReplyTemplate('');
    setReplyDelaySeconds(2);
    setWebhookUrl('');
    setCooldownSeconds(0);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (rule: Rule) => {
    setEditingRuleId(rule.id);
    setName(rule.name);
    setDescription(rule.description || '');
    setSourceChats(rule.source_chat_ids.join(', ') || '*');
    setTargetChatId(rule.target_chat_id || '');
    setTriggerWords(rule.trigger_words || []);
    setTriggerInput('');
    setExcludeWords(rule.exclude_words || []);
    setExcludeInput('');
    setMatchMode(rule.match_mode);
    setCaseSensitive(rule.case_sensitive);
    setActionType(rule.action_type);
    setAlertTemplate(rule.alert_template || '');
    setReplyTemplate(rule.reply_template || '');
    setReplyDelaySeconds(rule.reply_delay_seconds ?? 2);
    setWebhookUrl(rule.webhook_url || '');
    setCooldownSeconds(rule.cooldown_seconds || 0);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleAddTrigger = () => {
    if (triggerInput.trim()) {
      const words = triggerInput.split(',').map((w) => w.trim()).filter(Boolean);
      setTriggerWords((prev) => Array.from(new Set([...prev, ...words])));
      setTriggerInput('');
    }
  };

  const handleRemoveTrigger = (word: string) => {
    setTriggerWords((prev) => prev.filter((w) => w !== word));
  };

  const handleAddExclude = () => {
    if (excludeInput.trim()) {
      const words = excludeInput.split(',').map((w) => w.trim()).filter(Boolean);
      setExcludeWords((prev) => Array.from(new Set([...prev, ...words])));
      setExcludeInput('');
    }
  };

  const handleRemoveExclude = (word: string) => {
    setExcludeWords((prev) => prev.filter((w) => w !== word));
  };

  const handleSaveRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedAccountId) {
      setFormError('Сначала подключите и выберите Telegram‑аккаунт.');
      return;
    }

    const pendingTriggers = triggerInput.split(',').map((word) => word.trim()).filter(Boolean);
    const allTriggerWords = Array.from(new Set([...triggerWords, ...pendingTriggers]));
    const pendingExcludes = excludeInput.split(',').map((word) => word.trim()).filter(Boolean);
    const allExcludeWords = Array.from(new Set([...excludeWords, ...pendingExcludes]));
    if (allTriggerWords.length === 0) {
      setFormError('Добавьте хотя бы одно триггер‑слово или регулярное выражение.');
      return;
    }
    if ((actionType === 'forward_alert' || actionType === 'both') && !targetChatId.trim()) {
      setFormError('Для отправки отчёта укажите ID целевого чата.');
      return;
    }
    if ((actionType === 'auto_reply' || actionType === 'both') && !replyTemplate.trim()) {
      setFormError('Для автоответа укажите текст ответа.');
      return;
    }
    if (actionType === 'webhook' && !webhookUrl.trim()) {
      setFormError('Для Webhook POST укажите URL.');
      return;
    }

    // Parse source chats
    const parsedSources = sourceChats
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const sharedPayload: Omit<RuleCreate, 'account_id'> = {
      name: name.trim(),
      description: description.trim() || null,
      source_chat_ids: parsedSources.length > 0 ? parsedSources : ['*'],
      target_chat_id: targetChatId.trim() || null,
      trigger_words: allTriggerWords,
      exclude_words: allExcludeWords,
      match_mode: matchMode,
      case_sensitive: caseSensitive,
      action_type: actionType,
      alert_template: alertTemplate.trim() || null,
      reply_template: replyTemplate.trim() || null,
      reply_delay_seconds: replyDelaySeconds,
      webhook_url: webhookUrl.trim() || null,
      cooldown_seconds: cooldownSeconds,
      is_active: editingRuleId
        ? rules.find((rule) => rule.id === editingRuleId)?.is_active ?? true
        : true,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editingRuleId) {
        await api.updateRule(editingRuleId, sharedPayload);
      } else {
        await api.createRule({ ...sharedPayload, account_id: selectedAccountId });
      }
      setIsModalOpen(false);
      await fetchRules();
    } catch (requestError) {
      setFormError(getErrorMessage(requestError, 'Ошибка сохранения правила'));
    } finally {
      setSaving(false);
    }
  };

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);

  const handleToggle = async (ruleId: number) => {
    try {
      await api.toggleRule(ruleId);
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, is_active: !r.is_active } : r))
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Ошибка переключения правила'));
    }
  };

  const handleDelete = async (ruleId: number) => {
    if (!window.confirm('Удалить это правило мониторинга?')) return;
    try {
      await api.deleteRule(ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Ошибка удаления'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sliders className="w-6 h-6 text-[#24A1DE]" />
            Правила мониторинга и триггеры
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Настройте ключевые слова, фильтры и действия для пересылки сообщений или автоответов.
          </p>
          {selectedAccount && (
            <p className="text-xs text-[#24A1DE] mt-2">
              Аккаунт: {selectedAccount.first_name || selectedAccount.phone_number}
            </p>
          )}
        </div>

        <button
          onClick={openCreateModal}
          disabled={!selectedAccountId}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#24A1DE] hover:bg-[#2090c7] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm transition-all shadow-lg shadow-[#24A1DE]/20"
        >
          <Plus className="w-4 h-4" />
          Создать правило
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {!selectedAccountId ? (
        <div className="bg-[#17212B] border border-[#242F3D] rounded-2xl p-12 text-center text-slate-400">
          <Sliders className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h3 className="text-lg font-semibold text-white">Telegram‑аккаунт не подключён</h3>
          <p className="text-sm mt-1">Подключите аккаунт во вкладке «Telegram аккаунт», затем создайте правило.</p>
        </div>
      ) : loading && rules.length === 0 ? (
        <div className="text-center py-16 text-slate-500">Загрузка правил...</div>
      ) : rules.length === 0 ? (
        <div className="bg-[#17212B] border border-[#242F3D] rounded-2xl p-12 text-center text-slate-400">
          <Sliders className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h3 className="text-lg font-semibold text-white">Правил пока нет</h3>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Создайте первое правило, чтобы бот начал слушать сообщения в группах и уведомлять вас при совпадении ключевых слов.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-[#24A1DE] text-white rounded-xl text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Добавить первое правило
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`bg-[#17212B] border transition-all rounded-2xl p-5 shadow-sm ${
                rule.is_active ? 'border-[#242F3D] hover:border-[#2B5278]' : 'border-[#242F3D]/50 opacity-60'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Rule title & tags */}
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggle(rule.id)}
                      className={`p-2 rounded-xl transition-colors ${
                        rule.is_active
                          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                      title={rule.is_active ? 'Приостановить правило' : 'Запустить правило'}
                    >
                      {rule.is_active ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-white">{rule.name}</h3>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            rule.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-700/30 text-slate-400 border-slate-700'
                          }`}
                        >
                          {rule.is_active ? 'Активно' : 'На паузе'}
                        </span>
                        <span className="text-[11px] bg-[#182533] text-[#24A1DE] px-2 py-0.5 rounded-md border border-[#242F3D]">
                          Режим: {rule.match_mode.toUpperCase()}
                        </span>
                        <span className="text-[11px] bg-[#182533] text-indigo-300 px-2 py-0.5 rounded-md border border-[#242F3D]">
                          {ACTION_LABELS[rule.action_type]}
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-slate-400 mt-0.5">{rule.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Keyword Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
                      <Tag className="w-3.5 h-3.5 text-[#24A1DE]" />
                      Ключевые слова ({rule.trigger_words.length}):
                    </span>
                    {rule.trigger_words.map((word) => (
                        <span
                          key={word}
                          className="text-xs bg-[#182533] text-slate-200 px-2.5 py-0.5 rounded-md border border-[#242F3D]"
                        >
                          {word}
                        </span>
                    ))}

                    {rule.exclude_words.length > 0 && (
                      <>
                        <span className="text-xs text-rose-400 flex items-center gap-1 ml-3 mr-1">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Минус-слова:
                        </span>
                        {rule.exclude_words.map((word) => (
                          <span
                            key={word}
                            className="text-xs bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded-md border border-rose-500/20"
                          >
                            -{word}
                          </span>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Target & Source */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                      <span>Источники:</span>
                      <span className="text-slate-200 font-mono">
                        {rule.source_chat_ids.includes('*') ? 'Все чаты (*)' : `${rule.source_chat_ids.length} чат(ов)`}
                      </span>
                    </div>

                    {rule.target_chat_id && (
                      <div className="flex items-center gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Куда слать:</span>
                        <span className="text-emerald-300 font-mono">{rule.target_chat_id}</span>
                      </div>
                    )}

                    {rule.webhook_url && (
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-sky-400" />
                        <span>Webhook:</span>
                        <span className="text-sky-300 truncate max-w-[200px]">{rule.webhook_url}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions button */}
                <div className="flex items-center gap-2 self-end lg:self-center">
                  <button
                    onClick={() => openEditModal(rule)}
                    className="p-2 bg-[#182533] hover:bg-[#242F3D] text-slate-300 hover:text-white rounded-xl transition-colors"
                    title="Редактировать правило"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-2 bg-[#182533] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl transition-colors"
                    title="Удалить правило"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Rule Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRuleId ? 'Редактирование правила' : 'Новое правило мониторинга'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSaveRule} className="space-y-5 text-sm">
          {formError && (
            <div role="alert" className="p-3.5 bg-rose-500/10 border border-rose-500/25 text-rose-300 rounded-xl text-sm">
              {formError}
            </div>
          )}

          {/* Rule Name & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Название правила *
              </label>
              <input
                type="text"
                required
                placeholder="Например: Заказы на разработку сайтов"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#182533] border border-[#242F3D] rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-[#24A1DE]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Краткое описание (опционально)
              </label>
              <input
                type="text"
                placeholder="Заметки для себя"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#182533] border border-[#242F3D] rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-[#24A1DE]"
              />
            </div>
          </div>

          {/* Trigger Words Tag Input */}
          <div className="p-4 bg-[#182533] border border-[#242F3D] rounded-xl space-y-3">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              🎯 Триггер-слова (Ключевые слова)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Введите слово или фразу и нажмите Enter (или через запятую)"
                value={triggerInput}
                onChange={(e) => setTriggerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTrigger();
                  }
                }}
                className="flex-1 bg-[#17212B] border border-[#242F3D] rounded-xl px-3.5 py-2 text-white outline-none focus:border-[#24A1DE]"
              />
              <button
                type="button"
                onClick={handleAddTrigger}
                className="px-4 py-2 bg-[#24A1DE] text-white rounded-xl font-medium text-xs hover:bg-[#2090c7]"
              >
                Добавить
              </button>
            </div>

            {/* Render Tags */}
            <div className="flex flex-wrap gap-2 pt-1">
              {triggerWords.length === 0 ? (
                <span className="text-xs text-amber-300 italic">
                  Добавьте хотя бы одно слово, фразу или регулярное выражение.
                </span>
              ) : (
                triggerWords.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1.5 bg-[#17212B] border border-[#242F3D] text-slate-200 text-xs px-3 py-1 rounded-lg"
                  >
                    {word}
                    <button
                      type="button"
                      onClick={() => handleRemoveTrigger(word)}
                      className="text-slate-400 hover:text-rose-400"
                    >
                      &times;
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Exclude Words (Minus Words) */}
          <div className="p-4 bg-[#182533] border border-[#242F3D] rounded-xl space-y-3">
            <label className="block text-xs font-semibold text-rose-400 uppercase tracking-wider">
              🚫 Минус-слова (Исключения)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Слова, при наличии которых сообщение будет игнорироваться"
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddExclude();
                  }
                }}
                className="flex-1 bg-[#17212B] border border-[#242F3D] rounded-xl px-3.5 py-2 text-white outline-none focus:border-rose-500"
              />
              <button
                type="button"
                onClick={handleAddExclude}
                className="px-4 py-2 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl font-medium text-xs hover:bg-rose-500/30"
              >
                Исключить
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {excludeWords.map((word) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs px-3 py-1 rounded-lg"
                >
                  -{word}
                  <button
                    type="button"
                    onClick={() => handleRemoveExclude(word)}
                    className="text-rose-400 hover:text-white"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Matching Engine Mode & Case Sensitivity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Логика соответствия
              </label>
              <select
                value={matchMode}
                onChange={(event) => setMatchMode(event.target.value as MatchMode)}
                className="w-full bg-[#182533] border border-[#242F3D] rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-[#24A1DE]"
              >
                <option value="any">Любое из слов (ANY)</option>
                <option value="all">Все слова одновременно (ALL)</option>
                <option value="regex">Регулярное выражение (Regex)</option>
                <option value="exact">Точное совпадение слова (Word boundary)</option>
              </select>
            </div>

            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="w-4 h-4 rounded text-[#24A1DE] focus:ring-0 bg-[#182533] border-[#242F3D]"
                />
                <span className="text-xs">Учитывать регистр (Case-sensitive)</span>
              </label>
            </div>
          </div>

          {/* Source & Target Chats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                ID исходных чатов (прослушка)
              </label>
              <input
                type="text"
                required
                placeholder="* для всех, либо ID через запятую"
                value={sourceChats}
                onChange={(e) => setSourceChats(e.target.value)}
                className="w-full bg-[#182533] border border-[#242F3D] rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-[#24A1DE]"
              />
              <p className="text-[11px] text-slate-500 mt-1">ID можно узнать во вкладке «Диалоги и чаты»</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                ID целевого чата (куда слать отчет)
              </label>
              <input
                type="text"
                required={actionType === 'forward_alert' || actionType === 'both'}
                placeholder="Например: -100192837465 или @my_alerts_channel"
                value={targetChatId}
                onChange={(e) => setTargetChatId(e.target.value)}
                className="w-full bg-[#182533] border border-[#242F3D] rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-[#24A1DE]"
              />
              <p className="text-[11px] text-slate-500 mt-1">Куда бот отправит форматированное уведомление</p>
            </div>
          </div>

          {/* Action Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Тип действия
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ACTION_OPTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => setActionType(action.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
                    actionType === action.id
                      ? 'bg-[#24A1DE] text-white border-[#24A1DE]'
                      : 'bg-[#182533] text-slate-300 border-[#242F3D] hover:border-slate-500'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-reply options if active */}
          {(actionType === 'auto_reply' || actionType === 'both') && (
            <div className="p-4 bg-[#182533] border border-[#242F3D] rounded-xl space-y-3">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                🤖 Текст автоответа
              </label>
              <textarea
                required
                rows={2}
                placeholder="Здравствуйте, {sender_name}! Мы готовы помочь вам с решением задачи..."
                value={replyTemplate}
                onChange={(e) => setReplyTemplate(e.target.value)}
                className="w-full bg-[#17212B] border border-[#242F3D] rounded-xl p-3 text-white outline-none focus:border-[#24A1DE]"
              />
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-400">Задержка ответа (сек):</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={replyDelaySeconds}
                  onChange={(e) => setReplyDelaySeconds(parseInt(e.target.value) || 0)}
                  className="w-20 bg-[#17212B] border border-[#242F3D] rounded-lg px-2 py-1 text-white text-xs"
                />
              </div>
            </div>
          )}

          {(actionType === 'forward_alert' || actionType === 'both') && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Шаблон отчёта (опционально)
              </label>
              <textarea
                rows={3}
                placeholder="{rule_name}: {message_text} — {message_link}"
                value={alertTemplate}
                onChange={(event) => setAlertTemplate(event.target.value)}
                className="w-full bg-[#182533] border border-[#242F3D] rounded-xl p-3 text-white outline-none focus:border-[#24A1DE]"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Доступны: {'{rule_name}'}, {'{chat_title}'}, {'{sender_name}'}, {'{message_text}'}, {'{message_link}'}.
              </p>
            </div>
          )}

          {/* Webhook URL if active */}
          {actionType === 'webhook' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Webhook URL (HTTP POST)
              </label>
              <input
                type="url"
                required
                placeholder="https://my-service.com/api/telegram-webhook"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full bg-[#182533] border border-[#242F3D] rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-[#24A1DE]"
              />
            </div>
          )}

          {/* Anti-spam cooldown */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Анти-спам кулдаун от одного автора (секунды)
            </label>
            <input
              type="number"
              min="0"
              placeholder="0 (без кулдауна)"
              value={cooldownSeconds}
              onChange={(e) => setCooldownSeconds(parseInt(e.target.value) || 0)}
              className="w-full bg-[#182533] border border-[#242F3D] rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-[#24A1DE]"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#242F3D]">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-2.5 bg-[#182533] hover:bg-[#242F3D] text-slate-300 rounded-xl font-medium transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-[#24A1DE] hover:bg-[#2090c7] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors shadow-lg shadow-[#24A1DE]/20"
            >
              {saving ? 'Сохраняем…' : editingRuleId ? 'Сохранить изменения' : 'Создать правило'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
