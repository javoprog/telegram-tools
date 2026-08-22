import type { ComponentType } from 'react';
import { MessageSquare, Power, Radio, Settings, Shield, Sliders } from 'lucide-react';

import type { Account, DashboardTab } from '../types';

interface NavbarProps {
  currentTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  accounts: Account[];
  selectedAccountId: number | null;
  onAccountChange: (accountId: number | null) => void;
  wsConnected: boolean;
  onLogout: () => void;
}

interface NavItem {
  id: DashboardTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: 'rules', label: 'Правила и триггеры', icon: Sliders },
  { id: 'logs', label: 'Живой монитор', icon: Radio },
  { id: 'chats', label: 'Диалоги и чаты', icon: MessageSquare },
  { id: 'auth', label: 'Telegram аккаунт', icon: Shield },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

const accountLabel = (account: Account) =>
  [account.first_name, account.last_name].filter(Boolean).join(' ') || account.phone_number;

export const Navbar = ({
  currentTab,
  onTabChange,
  accounts,
  selectedAccountId,
  onAccountChange,
  wsConnected,
  onLogout,
}: NavbarProps) => {
  const connectedAccounts = accounts.filter(
    (account) => account.status === 'connected' && account.is_active,
  );

  const navigation = (mobile = false) =>
    navItems.map((item) => {
      const Icon = item.icon;
      const isActive = currentTab === item.id;
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => onTabChange(item.id)}
          aria-current={isActive ? 'page' : undefined}
          className={`flex items-center whitespace-nowrap font-medium transition-all ${
            mobile ? 'gap-1.5 px-3 py-1.5 rounded-lg text-xs' : 'gap-2 px-3 py-2 rounded-lg text-sm'
          } ${
            isActive
              ? 'bg-[#2B5278] text-white shadow-sm'
              : 'text-slate-300 hover:bg-[#182533] hover:text-white'
          }`}
        >
          <Icon className={`${mobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${isActive ? 'text-[#24A1DE]' : 'text-slate-400'}`} />
          {item.label}
        </button>
      );
    });

  return (
    <header className="bg-[#17212B]/95 backdrop-blur border-b border-[#242F3D] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <button type="button" onClick={() => onTabChange('rules')} className="flex items-center gap-3 text-left shrink-0">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#24A1DE] to-[#2B5278] flex items-center justify-center shadow-lg shadow-[#24A1DE]/20">
              <Radio className="w-5 h-5 text-white" />
            </span>
            <span className="hidden sm:block">
              <span className="font-bold text-lg text-white tracking-tight flex items-center gap-2">
                Telegram Tools
                <span className="hidden xl:inline text-[10px] bg-[#24A1DE]/20 text-[#24A1DE] font-semibold px-2 py-0.5 rounded-full border border-[#24A1DE]/30">
                  Userbot MTProto
                </span>
              </span>
              <span className="hidden xl:block text-xs text-slate-400">Мониторинг сообщений в реальном времени</span>
            </span>
          </button>

          <nav aria-label="Основная навигация" className="hidden lg:flex items-center gap-1">
            {navigation()}
          </nav>

          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                wsConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
              }`}
              title={wsConnected ? 'Поток событий подключён' : 'Поток событий переподключается'}
            >
              <span className="relative flex h-2 w-2">
                {wsConnected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </span>
              <span className="hidden sm:inline">{wsConnected ? 'Live' : 'Offline'}</span>
            </div>

            {connectedAccounts.length > 0 ? (
              <label className="relative min-w-0" title="Активный Telegram‑аккаунт">
                <span className="sr-only">Активный Telegram‑аккаунт</span>
                <select
                  value={selectedAccountId ?? ''}
                  onChange={(event) => onAccountChange(Number(event.target.value) || null)}
                  className="max-w-[150px] sm:max-w-[190px] bg-[#182533] border border-[#242F3D] hover:border-[#2B5278] rounded-lg pl-7 pr-7 py-1.5 text-xs text-slate-100 outline-none focus:border-[#24A1DE]"
                >
                  {connectedAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{accountLabel(account)}</option>
                  ))}
                </select>
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400 pointer-events-none" />
              </label>
            ) : (
              <button type="button" onClick={() => onTabChange('auth')} className="text-xs bg-[#24A1DE] hover:bg-[#2090c7] text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
                Подключить TG
              </button>
            )}

            <button type="button" onClick={onLogout} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-[#182533] rounded-lg transition-colors" aria-label="Выйти из веб‑панели" title="Выйти">
              <Power className="w-4 h-4" />
            </button>
          </div>
        </div>

        <nav aria-label="Мобильная навигация" className="flex lg:hidden border-t border-[#242F3D] py-2 gap-1 overflow-x-auto">
          {navigation(true)}
        </nav>
      </div>
    </header>
  );
};
