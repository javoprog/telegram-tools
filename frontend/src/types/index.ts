export type AccountStatus =
  | 'disconnected'
  | 'awaiting_code'
  | 'awaiting_password'
  | 'connected'
  | 'error';

export type ChatType = 'channel' | 'supergroup' | 'group' | 'user' | 'bot';
export type ChatTypeFilter = Exclude<ChatType, 'bot'>;
export type MatchMode = 'any' | 'all' | 'regex' | 'exact';
export type ActionType = 'forward_alert' | 'auto_reply' | 'webhook' | 'both';
export type DashboardTab = 'rules' | 'logs' | 'chats' | 'auth' | 'settings';

export interface Account {
  id: number;
  phone_number: string;
  telegram_user_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  status: AccountStatus;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ChatDialog {
  id: string;
  title: string;
  type: ChatType;
  username?: string | null;
  unread_count: number;
  is_creator: boolean;
  is_admin: boolean;
}

export interface Rule {
  id: number;
  account_id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  source_chat_ids: string[];
  target_chat_id?: string | null;
  trigger_words: string[];
  exclude_words: string[];
  match_mode: MatchMode;
  case_sensitive: boolean;
  action_type: ActionType;
  alert_template?: string | null;
  reply_template?: string | null;
  reply_delay_seconds: number;
  webhook_url?: string | null;
  cooldown_seconds: number;
  created_at?: string;
  updated_at?: string;
}

export type RuleCreate = Omit<Rule, 'id' | 'created_at' | 'updated_at'>;
export type RuleUpdate = Partial<Omit<Rule, 'id' | 'account_id' | 'created_at' | 'updated_at'>>;

export interface TriggerLog {
  id: number;
  rule_id: number;
  account_id: number;
  rule_name?: string | null;
  source_chat_id: string;
  source_chat_title?: string | null;
  sender_id?: number | null;
  sender_name?: string | null;
  sender_username?: string | null;
  message_id: number;
  message_text?: string | null;
  message_link?: string | null;
  matched_words: string[];
  action_status: string;
  error_message?: string | null;
  created_at: string;
}

export interface AppSettings {
  telegram_api_configured: boolean;
  has_admin_password: boolean;
  app_version: string;
  data_dir: string;
  database_engine: string;
  journal_mode: string;
}

export interface TelegramAuthResponse {
  status: AccountStatus;
  phone_number?: string | null;
  message?: string | null;
  account?: Account | null;
}

export interface LogListResponse {
  total: number;
  page: number;
  page_size: number;
  logs: TriggerLog[];
}

export interface WebSocketTriggerEvent {
  type: 'new_trigger_log';
  data: TriggerLog;
}
