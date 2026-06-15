export type GoalType = 'habit' | 'project';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';
export type RecurrenceType = 'daily' | 'weekly_days' | 'weekly_count';
export type LogStatus = 'done' | 'skipped' | 'partial';

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  goal_type: GoalType;
  period_month: string;
  status: GoalStatus;
  recurrence_type: RecurrenceType | null;
  weekdays: number[] | null;
  target_count: number | null;
  scheduled_time: string | null;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export type Task = {
  id: string;
  user_id: string;
  goal_id: string;
  title: string;
  recurrence_type: RecurrenceType;
  weekdays: number[] | null;
  target_count: number | null;
  scheduled_time: string | null;
  target_value: number | null;
  unit: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TaskLog = {
  id: string;
  user_id: string;
  task_id: string;
  log_date: string;
  status: LogStatus;
  value: number | null;
  note: string | null;
  created_at: string;
}

export type ProgressLog = {
  id: string;
  user_id: string;
  goal_id: string;
  log_date: string;
  value_added: number;
  note: string | null;
  created_at: string;
}

export type MoodLog = {
  id: string;
  user_id: string;
  log_date: string;
  mood: number;
  energy: number | null;
  gratitude: string | null;
  note: string | null;
  created_at: string;
}

export type TherapyPersona = 'warm' | 'stoic';
export type TherapyRisk = 'none' | 'concern' | 'crisis';
export type TherapyMode = 'chat' | 'roleplay';
export type TherapyRole = 'user' | 'assistant' | 'coach';

export type TherapyAction =
  | { type: 'launch_tool'; tool: 'breathing' | 'thought_record' }
  | { type: 'roleplay_start'; persona: string }
  | { type: 'roleplay_end' };

/** A journal file the user uploaded into a Talk session (stored in the `journals` bucket). */
export type TherapyAttachment = {
  path: string;
  kind: 'image' | 'pdf';
  name: string;
};

export type TherapySession = {
  id: string;
  user_id: string;
  persona: TherapyPersona;
  risk_flag: TherapyRisk;
  mode: TherapyMode;
  roleplay_persona: string | null;
  summary: string | null;
  started_at: string;
  ended_at: string | null;
}

export type TherapyMessage = {
  id: string;
  session_id: string;
  user_id: string;
  role: TherapyRole;
  content: string;
  action: TherapyAction | null;
  attachment: TherapyAttachment | null;
  created_at: string;
}

export type StoicQuote = {
  id: number;
  body: string;
  author: string;
  source_work: string | null;
  tags: string[] | null;
}

export type DailyBrief = {
  id: string;
  user_id: string;
  brief_date: string;
  motivation_text: string;
  stoic_quote_id: number | null;
  generated_by: string;
  generated_at: string;
}

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  notif_prefs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type PushSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
}

export type ReminderKind = 'task' | 'daily_brief' | 'mood_checkin';

export type Reminder = {
  id: string;
  user_id: string;
  task_id: string | null;
  kind: ReminderKind;
  title_template: string | null;
  scheduled_time: string;           // 'HH:MM:SS', user-local
  recurrence_type: RecurrenceType;
  weekdays: number[] | null;
  next_fire_at: string;             // ISO UTC
  is_enabled: boolean;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// Minimal Database shape consumed by the typed Supabase client.
// Each table carries an empty `Relationships` and the schema carries empty
// `Views`/`Functions`/`Enums`/`CompositeTypes` so supabase-js's generics
// resolve query results correctly (otherwise projections degrade to `never`).
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      goals: {
        Row: Goal;
        Insert: Omit<Goal, 'id' | 'created_at' | 'updated_at' | 'current_value'> & {
          current_value?: number;
        };
        Update: Partial<Goal>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task>;
        Update: Partial<Task>;
        Relationships: [];
      };
      task_logs: {
        Row: TaskLog;
        Insert: Omit<TaskLog, 'id' | 'created_at'>;
        Update: Partial<TaskLog>;
        Relationships: [];
      };
      progress_logs: {
        Row: ProgressLog;
        Insert: Omit<ProgressLog, 'id' | 'created_at'>;
        Update: Partial<Pick<ProgressLog, 'note'>>;
        Relationships: [];
      };
      mood_logs: {
        Row: MoodLog;
        Insert: Omit<MoodLog, 'id' | 'created_at'>;
        Update: Partial<MoodLog>;
        Relationships: [];
      };
      stoic_quotes: {
        Row: StoicQuote;
        Insert: Omit<StoicQuote, 'id'>;
        Update: Partial<StoicQuote>;
        Relationships: [];
      };
      therapy_sessions: {
        Row: TherapySession;
        Insert: Omit<TherapySession, 'id' | 'started_at'> & {
          id?: string;
          started_at?: string;
        };
        Update: Partial<TherapySession>;
        Relationships: [];
      };
      therapy_messages: {
        Row: TherapyMessage;
        Insert: Omit<TherapyMessage, 'id' | 'created_at' | 'attachment'> & {
          id?: string;
          attachment?: TherapyAttachment | null;
        };
        Update: Partial<TherapyMessage>;
        Relationships: [];
      };
      daily_briefs: {
        Row: DailyBrief;
        Insert: Omit<DailyBrief, 'id' | 'generated_at'>;
        Update: Partial<DailyBrief>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscription;
        Insert: Omit<PushSubscription, 'id' | 'created_at' | 'last_seen_at'> & {
          last_seen_at?: string;
        };
        Update: Partial<PushSubscription>;
        Relationships: [];
      };
      reminders: {
        Row: Reminder;
        Insert: Omit<
          Reminder,
          'id' | 'created_at' | 'updated_at' | 'last_sent_at' | 'is_enabled'
        > & { last_sent_at?: string | null; is_enabled?: boolean };
        Update: Partial<Reminder>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      goal_type: GoalType;
      goal_status: GoalStatus;
      recurrence_type: RecurrenceType;
      log_status: LogStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
