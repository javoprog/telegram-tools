import type { ComponentType } from 'react';
import { MessageCircle, Send, Smartphone, Target, Zap } from 'lucide-react';

import type { Account, DashboardTab } from '../types';

interface NavbarProps {
  currentTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  account: Account | null;
  wsConnected: boolean;
}

interface NavItem {
  id: DashboardTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: 'rules', label: 'Мои правила', icon: Target },
  { id: 'logs', label: 'Живой монитор', icon: Zap },
  { id: 'chats', label: 'Мои чаты', icon: MessageCircle },
  { id: 'auth', label: 'Аккаунт Telegram', icon: Smartphone },
];

const accountName = (account: Account) =>
  [account.first_name, account.last_name].filter(Boolean).join(' ') || account.phone_number;

export const Navbar = ({ currentTab, onTabChange, account, wsConnected }: NavbarProps) => {
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
          className={`flex items-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors ${
            mobile ? 'px-3 py-2 text-xs' : 'px-3.5 py-2 text-sm'
          } ${
            isActive
              ? 'bg-[#E7F3FC] text-[#2481CC]'
              : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
          }`}
        >
          <Icon className={mobile ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />
          {item.label}
        </button>
      );
    });

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/90 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onTabChange('rules')}
            className="flex shrink-0 items-center gap-3 text-left"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#2481CC] shadow-sm shadow-blue-200">
              <Send className="h-5 w-5 -translate-x-px translate-y-px text-white" />
            </span>
            <span className="hidden sm:block">
              <span className="block text-base font-bold tracking-tight text-zinc-900">Telegram Tools</span>
              <span className="block text-[11px] text-zinc-500">умный мониторинг сообщений</span>
            </span>
          </button>

          <nav aria-label="Основная навигация" className="hidden items-center gap-1 lg:flex">
            {navigation()}
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:flex ${
                wsConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
              title={wsConnected ? 'События поступают в реальном времени' : 'Соединение восстанавливается'}
            >
              <span className="relative flex h-2 w-2">
                {wsConnected && (
                  <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                )}
                <span className={`relative h-2 w-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              </span>
              {wsConnected ? 'Live' : 'Offline'}
            </span>

            {account ? (
              <button
                type="button"
                onClick={() => onTabChange('auth')}
                className="flex min-w-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-left hover:bg-zinc-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D9EEFC] text-sm font-bold text-[#2481CC]">
                  {(account.first_name || account.phone_number).charAt(0).toUpperCase()}
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className="block max-w-32 truncate text-xs font-semibold text-zinc-900">
                    {accountName(account)}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> В сети
                  </span>
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onTabChange('auth')}
                className="rounded-xl bg-[#2481CC] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#1C72B8]"
              >
                Войти в Telegram
              </button>
            )}
          </div>
        </div>

        <nav aria-label="Мобильная навигация" className="flex gap-1 overflow-x-auto border-t border-zinc-100 py-2 lg:hidden">
          {navigation(true)}
        </nav>
      </div>
    </header>
  );
};
