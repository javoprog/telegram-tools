import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Key,
  LoaderCircle,
  Lock,
  Server,
  Settings as SettingsIcon,
} from 'lucide-react';

import { api, getErrorMessage } from '../api/client';
import type { AppSettings } from '../types';

interface SettingsPageProps {
  onPasswordChanged: () => void;
}

export const SettingsPage = ({ onPasswordChanged }: SettingsPageProps) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((response) => {
        if (!cancelled) setSettings(response);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(getErrorMessage(requestError, 'Ошибка загрузки настроек'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword.length < 8) {
      setError('Новый пароль должен содержать не менее 8 символов.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Подтверждение нового пароля не совпадает.');
      return;
    }

    setSaving(true);
    try {
      await api.changeAdminPassword(currentPassword, newPassword, confirmPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Мастер‑пароль изменён. Сейчас откроется экран входа.');
      window.setTimeout(onPasswordChanged, 1_500);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось изменить мастер‑пароль'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-[#24A1DE]" />
          Системные настройки
        </h1>
        <p className="text-slate-400 text-sm mt-1">Безопасность панели и состояние серверной конфигурации.</p>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div role="status" className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <section className="bg-[#17212B] border border-[#242F3D] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#242F3D]">
          <Lock className="w-5 h-5 text-amber-400" />
          <h2 className="font-semibold text-white">Смена мастер‑пароля</h2>
        </div>
        <p className="text-sm text-slate-400">Новый пароль сохраняется в базе только как bcrypt‑хэш. После смены потребуется войти заново.</p>
        <form onSubmit={changePassword} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="sm:col-span-2 text-xs font-semibold text-slate-300">
            Текущий пароль
            <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 w-full bg-[#182533] border border-[#242F3D] focus:border-[#24A1DE] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none" />
          </label>
          <label className="text-xs font-semibold text-slate-300">
            Новый пароль
            <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 w-full bg-[#182533] border border-[#242F3D] focus:border-[#24A1DE] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none" />
          </label>
          <label className="text-xs font-semibold text-slate-300">
            Повторите новый пароль
            <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 w-full bg-[#182533] border border-[#242F3D] focus:border-[#24A1DE] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none" />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#24A1DE] hover:bg-[#2090c7] disabled:opacity-50 rounded-xl text-sm font-medium text-white shadow-lg shadow-[#24A1DE]/20">
              {saving && <LoaderCircle className="w-4 h-4 animate-spin" />}
              {saving ? 'Сохраняем…' : 'Изменить пароль'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-[#17212B] border border-[#242F3D] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#242F3D]">
          <Key className="w-5 h-5 text-[#24A1DE]" />
          <h2 className="font-semibold text-white">Telegram API</h2>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-[#182533] border border-[#242F3D] p-4">
          {settings?.telegram_api_configured ? <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-rose-400 mt-0.5" />}
          <div>
            <p className="text-sm font-medium text-white">{settings?.telegram_api_configured ? 'TG_API_ID и TG_API_HASH настроены' : 'Telegram API не настроен'}</p>
            <p className="text-xs text-slate-400 mt-1">Ключи приложения читаются только из окружения сервера и никогда не показываются в панели.</p>
          </div>
        </div>
      </section>

      <section className="bg-[#17212B] border border-[#242F3D] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-[#242F3D]">
          <Server className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-white">Сервер</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <InfoCard label="Версия" value={`v${settings?.app_version || '—'}`} />
          <InfoCard label="Хранилище" value={settings?.data_dir || '/app/data'} icon={<Database className="w-4 h-4" />} />
          <InfoCard label="База данных" value={settings ? `${settings.database_engine} · ${settings.journal_mode}` : 'Загрузка…'} />
          <InfoCard label="MTProto" value="Telethon Async" accent />
        </div>
        <p className="text-xs text-slate-500">APP_SECRET_KEY меняется только в окружении. Его замена делает ранее зашифрованные Telegram‑сессии недоступными.</p>
      </section>
    </div>
  );
};

interface InfoCardProps {
  label: string;
  value: string;
  accent?: boolean;
  icon?: ReactNode;
}

const InfoCard = ({ label, value, accent = false, icon }: InfoCardProps) => (
  <div className="bg-[#182533] p-3 rounded-xl border border-[#242F3D] min-w-0">
    <span className="text-slate-500 flex items-center gap-1.5 mb-1">{icon}{label}</span>
    <span className={`font-semibold break-words ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</span>
  </div>
);
