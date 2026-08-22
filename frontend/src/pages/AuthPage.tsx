import { useState, type FormEvent } from 'react';
import { Shield, Phone, KeyRound, Lock, CheckCircle2, AlertCircle, RefreshCw, LogOut } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import type { Account } from '../types';

interface AuthPageProps {
  accounts: Account[];
  onRefreshAccounts: () => Promise<void> | void;
}

export const AuthPage = ({ accounts, onRefreshAccounts }: AuthPageProps) => {
  const [step, setStep] = useState<'phone' | 'code' | '2fa'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [password2FA, setPassword2FA] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activeAccounts = accounts.filter(
    (account) => account.status === 'connected' && account.is_active,
  );
  const pendingAccounts = accounts.filter(
    (account) => account.status === 'awaiting_code' || account.status === 'awaiting_password',
  );

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await api.requestCode(phoneNumber.trim());
      setStep('code');
      setSuccessMsg(res.message || 'Код подтверждения отправлен в ваш Telegram!');
      await onRefreshAccounts();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Ошибка отправки кода'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await api.verifyCode(phoneNumber.trim(), code.trim());

      if (res.status === 'awaiting_password') {
        setStep('2fa');
        setSuccessMsg('Требуется облачный пароль двухфакторной аутентификации (2FA).');
      } else {
        setSuccessMsg('Telegram аккаунт успешно подключен!');
        setStep('phone');
        setCode('');
        setPhoneNumber('');
        await onRefreshAccounts();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Неверный код подтверждения'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: FormEvent) => {
    e.preventDefault();
    if (!password2FA.trim()) return;
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      await api.verify2FA(phoneNumber.trim(), password2FA);
      setSuccessMsg('Авторизация 2FA успешно завершена!');
      setStep('phone');
      setPassword2FA('');
      setCode('');
      setPhoneNumber('');
      await onRefreshAccounts();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Неверный 2FA пароль'));
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (accountId: number) => {
    if (!window.confirm('Вы действительно хотите отключить этот Telegram‑аккаунт?')) return;
    setLoading(true);
    try {
      await api.disconnectAccount(accountId);
      await onRefreshAccounts();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Ошибка отключения аккаунта'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-[#24A1DE]" />
          Авторизация Telegram (MTProto Userbot)
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          Авторизуйте свой аккаунт через официальный Telegram MTProto API для доступа ко всем чатам и группам, где запрещены обычные боты.
        </p>
      </div>

      {/* Active Account Status */}
      {activeAccounts.map((activeAccount) => (
        <div key={activeAccount.id} className="bg-[#182533] border border-emerald-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#24A1DE] to-emerald-500 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                {(activeAccount.first_name || activeAccount.phone_number).charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">
                    {[activeAccount.first_name, activeAccount.last_name].filter(Boolean).join(' ') || activeAccount.phone_number}
                  </h3>
                  <span className="flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Активен
                  </span>
                </div>
                <div className="text-sm text-slate-400 mt-0.5 space-x-3">
                  <span>{activeAccount.phone_number}</span>
                  {activeAccount.username && (
                    <span className="text-[#24A1DE]">@{activeAccount.username}</span>
                  )}
                  {activeAccount.telegram_user_id != null && (
                    <span className="text-slate-500">ID: {activeAccount.telegram_user_id}</span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => handleDisconnect(activeAccount.id)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Отключить
            </button>
          </div>
        </div>
      ))}

      {pendingAccounts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-medium text-amber-200">Есть незавершённая авторизация</p>
          <div className="flex flex-wrap gap-2">
            {pendingAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => {
                  setPhoneNumber(account.phone_number);
                  setStep(account.status === 'awaiting_password' ? '2fa' : 'code');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#182533] border border-amber-500/20 text-xs text-amber-100 hover:border-amber-400"
              >
                Продолжить {account.phone_number}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Login Form Wizard */}
      <div className="bg-[#17212B] border border-[#242F3D] rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="grid grid-cols-3 gap-2 mb-7" aria-label="Этапы авторизации">
          {[
            { id: 'phone', number: 1, label: 'Телефон' },
            { id: 'code', number: 2, label: 'Код' },
            { id: '2fa', number: 3, label: '2FA' },
          ].map((item) => {
            const order = { phone: 1, code: 2, '2fa': 3 } as const;
            const active = order[step] >= item.number;
            return (
              <div key={item.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${active ? 'border-[#24A1DE]/40 bg-[#24A1DE]/10 text-white' : 'border-[#242F3D] text-slate-500'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${active ? 'bg-[#24A1DE] text-white' : 'bg-[#242F3D]'}`}>{item.number}</span>
                <span className="text-xs font-medium">{item.label}</span>
              </div>
            );
          })}
        </div>
        {step === 'phone' && (
          <form onSubmit={handleRequestCode} className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Вход по номеру телефона</h2>
              <p className="text-sm text-slate-400 mt-1">
                Введите номер телефона в международном формате (например, +79991234567).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Номер телефона
              </label>
              <div className="relative">
                <Phone className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="+7 999 123-45-67"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full bg-[#182533] border border-[#242F3D] focus:border-[#24A1DE] rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !phoneNumber.trim()}
              className="w-full bg-[#24A1DE] hover:bg-[#2090c7] disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#24A1DE]/20"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Подключение к Telegram...
                </>
              ) : (
                'Получить код подтверждения'
              )}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleVerifyCode} className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Введите код из Telegram</h2>
              <p className="text-sm text-slate-400 mt-1">
                Код отправлен в официальное приложение Telegram для номера{' '}
                <span className="text-white font-medium">{phoneNumber}</span>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Код подтверждения
              </label>
              <div className="relative">
                <KeyRound className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="12345"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full bg-[#182533] border border-[#242F3D] focus:border-[#24A1DE] rounded-xl pl-11 pr-4 py-3 text-white text-lg tracking-widest placeholder-slate-500 outline-none transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="w-1/3 bg-[#182533] hover:bg-[#242F3D] text-slate-300 font-medium py-3 rounded-xl transition-colors text-sm"
              >
                Назад
              </button>
              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-2/3 bg-[#24A1DE] hover:bg-[#2090c7] disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#24A1DE]/20"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Подтвердить код'}
              </button>
            </div>
          </form>
        )}

        {step === '2fa' && (
          <form onSubmit={handleVerify2FA} className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Облачный пароль 2FA</h2>
              <p className="text-sm text-slate-400 mt-1">
                На вашем аккаунте включена двухфакторная аутентификация. Введите пароль.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                2FA Пароль
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password2FA}
                  onChange={(e) => setPassword2FA(e.target.value)}
                  className="w-full bg-[#182533] border border-[#242F3D] focus:border-[#24A1DE] rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 outline-none transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('code')}
                className="w-1/3 bg-[#182533] hover:bg-[#242F3D] text-slate-300 font-medium py-3 rounded-xl transition-colors text-sm"
              >
                Назад
              </button>
              <button
                type="submit"
                disabled={loading || password2FA.length === 0}
                className="w-2/3 bg-[#24A1DE] hover:bg-[#2090c7] disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#24A1DE]/20"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Войти'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
