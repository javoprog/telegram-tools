import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Phone,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';

import { api, getErrorMessage } from '../api/client';
import type { Account } from '../types';

interface AuthPageProps {
  account: Account | null;
  onAccountChanged: () => Promise<void> | void;
}

type AuthStep = 'phone' | 'code' | '2fa';

export const AuthPage = ({ account, onAccountChanged }: AuthPageProps) => {
  const [step, setStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [password2FA, setPassword2FA] = useState('');
  const [chatCount, setChatCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!account) {
      setChatCount(null);
      return;
    }
    let cancelled = false;
    api.getDialogs().then((result) => {
      if (!cancelled) setChatCount(result.total);
    }).catch(() => {
      if (!cancelled) setChatCount(null);
    });
    return () => { cancelled = true; };
  }, [account]);

  const requestCode = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.requestCode(phoneNumber.trim());
      setStep('code');
      setSuccess(result.message || 'Код отправлен в Telegram.');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось отправить код'));
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.verifyCode(phoneNumber.trim(), code.trim());
      if (result.status === 'awaiting_password') {
        setStep('2fa');
        setSuccess('На аккаунте включён облачный пароль. Введите его на следующем шаге.');
      } else {
        setSuccess('Готово! Telegram подключён.');
        await onAccountChanged();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Код не подошёл. Проверьте и попробуйте снова.'));
    } finally {
      setLoading(false);
    }
  };

  const verify2FA = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.verify2FA(phoneNumber.trim(), password2FA);
      setSuccess('Готово! Telegram подключён.');
      await onAccountChanged();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Неверный облачный пароль'));
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    if (!account || !window.confirm('Выйти из этого Telegram-аккаунта и подключить другой номер?')) return;
    setLoading(true);
    setError(null);
    try {
      await api.disconnectAccount(account.id);
      setStep('phone');
      setPhoneNumber('');
      setCode('');
      setPassword2FA('');
      setSuccess('Аккаунт отключён. Теперь можно войти с другим номером.');
      await onAccountChanged();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Не удалось отключить аккаунт'));
    } finally {
      setLoading(false);
    }
  };

  const fullName = account
    ? [account.first_name, account.last_name].filter(Boolean).join(' ') || account.phone_number
    : '';
  const stepNumber = step === 'phone' ? 1 : step === 'code' ? 2 : 3;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900"><Phone className="h-6 w-6 text-[#2481CC]" /> Аккаунт Telegram</h1>
        <p className="mt-1 text-sm text-zinc-500">Один номер — все ваши чаты, правила и уведомления в одном месте.</p>
      </div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      {success && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5 shrink-0" />{success}</div>}

      {account ? (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="h-24 bg-gradient-to-r from-[#2481CC] to-[#55A7E1]" />
          <div className="px-5 pb-6 sm:px-8">
            <div className="-mt-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div className="flex items-end gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border-4 border-white bg-[#E7F3FC] text-2xl font-bold text-[#2481CC] shadow-sm">{(account.first_name || account.phone_number).charAt(0).toUpperCase()}</div>
                <div className="pb-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-zinc-900">{fullName}</h2><span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />В сети</span></div>{account.username && <p className="mt-0.5 text-sm font-medium text-[#2481CC]">@{account.username}</p>}</div>
              </div>
              <button type="button" onClick={() => void disconnect()} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><LogOut className="h-4 w-4" /> Выйти / Сменить номер</button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-zinc-50 p-4"><p className="text-xs text-zinc-500">Номер телефона</p><p className="mt-1 text-sm font-bold text-zinc-900">{account.phone_number}</p></div>
              <div className="rounded-xl bg-zinc-50 p-4"><p className="text-xs text-zinc-500">Telegram ID</p><p className="mt-1 text-sm font-bold text-zinc-900">{account.telegram_user_id ?? '—'}</p></div>
              <div className="rounded-xl bg-zinc-50 p-4"><p className="flex items-center gap-1 text-xs text-zinc-500"><MessageCircle className="h-3.5 w-3.5" /> Доступно чатов</p><p className="mt-1 text-sm font-bold text-zinc-900">{chatCount ?? 'Считаем…'}</p></div>
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-xl bg-[#F4FAFE] p-4 text-sm text-zinc-600"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#2481CC]" /><p>Сессия Telegram хранится в зашифрованном виде. Пароль панели не нужен: после подключения можно сразу пользоваться приложением.</p></div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-7 flex items-center justify-center gap-2" aria-label={`Шаг ${stepNumber} из 3`}>
            {[1, 2, 3].map((number) => <div key={number} className="flex items-center"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${number <= stepNumber ? 'bg-[#2481CC] text-white' : 'bg-zinc-100 text-zinc-400'}`}>{number < stepNumber ? <CheckCircle2 className="h-4 w-4" /> : number}</span>{number < 3 && <span className={`h-0.5 w-12 sm:w-20 ${number < stepNumber ? 'bg-[#2481CC]' : 'bg-zinc-200'}`} />}</div>)}</div>

          {step === 'phone' && <form onSubmit={requestCode} className="mx-auto max-w-md space-y-5"><div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E7F3FC] text-[#2481CC]"><Send className="h-7 w-7" /></div><h2 className="mt-4 text-xl font-bold text-zinc-900">Войдите в Telegram</h2><p className="mt-1 text-sm text-zinc-500">Введите номер в международном формате. Код придёт в приложение Telegram или по SMS.</p></div><label className="block text-sm font-semibold text-zinc-700">Номер телефона<div className="relative mt-2"><Phone className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" /><input type="tel" required autoFocus autoComplete="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+998 90 123 45 67" className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-zinc-900 placeholder-zinc-400 focus:border-[#2481CC]" /></div></label><button type="submit" disabled={loading || !phoneNumber.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2481CC] py-3 text-sm font-semibold text-white hover:bg-[#1C72B8] disabled:opacity-50">{loading && <RefreshCw className="h-4 w-4 animate-spin" />} Получить код</button></form>}

          {step === 'code' && <form onSubmit={verifyCode} className="mx-auto max-w-md space-y-5"><div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E7F3FC] text-[#2481CC]"><KeyRound className="h-7 w-7" /></div><h2 className="mt-4 text-xl font-bold text-zinc-900">Введите код</h2><p className="mt-1 text-sm text-zinc-500">Мы отправили его для номера <span className="font-semibold text-zinc-800">{phoneNumber}</span>.</p></div><input type="text" required autoFocus autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} placeholder="12345" className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center text-xl tracking-[0.35em] text-zinc-900 placeholder-zinc-300 focus:border-[#2481CC]" /><div className="flex gap-3"><button type="button" onClick={() => setStep('phone')} className="w-1/3 rounded-xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">Назад</button><button type="submit" disabled={loading || !code.trim()} className="flex w-2/3 items-center justify-center gap-2 rounded-xl bg-[#2481CC] py-3 text-sm font-semibold text-white hover:bg-[#1C72B8] disabled:opacity-50">{loading && <RefreshCw className="h-4 w-4 animate-spin" />} Подтвердить</button></div></form>}

          {step === '2fa' && <form onSubmit={verify2FA} className="mx-auto max-w-md space-y-5"><div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E7F3FC] text-[#2481CC]"><LockKeyhole className="h-7 w-7" /></div><h2 className="mt-4 text-xl font-bold text-zinc-900">Облачный пароль</h2><p className="mt-1 text-sm text-zinc-500">Для этого аккаунта включена двухфакторная защита Telegram.</p></div><input type="password" required autoFocus autoComplete="current-password" value={password2FA} onChange={(event) => setPassword2FA(event.target.value)} placeholder="Введите пароль 2FA" className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-[#2481CC]" /><div className="flex gap-3"><button type="button" onClick={() => setStep('code')} className="w-1/3 rounded-xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">Назад</button><button type="submit" disabled={loading || !password2FA} className="flex w-2/3 items-center justify-center gap-2 rounded-xl bg-[#2481CC] py-3 text-sm font-semibold text-white hover:bg-[#1C72B8] disabled:opacity-50">{loading && <RefreshCw className="h-4 w-4 animate-spin" />} Войти</button></div></form>}
        </section>
      )}
    </div>
  );
};
