export type GoalType = 'habit' | 'project';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';
export type RecurrenceType = 'daily' | 'weekly_days' | 'weekly_count';
export type LogStatus = 'done' | 'skipped' | 'partial';

export interface Goal {
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

export interface Task {
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

export interface TaskLog {
  id: string;
  user_id: string;
  task_id: string;
  log_date: string;
  status: LogStatus;
  value: number | null;
  note: string | null;
  created_at: string;
}

export interface ProgressLog {
  id: string;
  user_id: string;
  goal_id: string;
  log_date: string;
  value_added: number;
  note: string | null;
  created_at: string;
}

export interface MoodLog {
  id: string;
  user_id: string;
  log_date: string;
  mood: number;
  energy: number | null;
  gratitude: string | null;
  note: string | null;
  created_at: string;
}

export interface StoicQuote {
  id: number;
  body: string;
  author: string;
  source_work: string | null;
  tags: string[] | null;
}

export interface DailyBrief {
  id: string;
  user_id: string;
  brief_date: string;
  motivation_text: string;
  stoic_quote_id: number | null;
  generated_by: string;
  generated_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  notif_prefs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Minimal Database shape consumed by the typed Supabase client.
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
      };
      goals: {
        Row: Goal;
        Insert: Omit<Goal, 'id' | 'created_at' | 'updated_at' | 'current_value'> & {
          current_value?: number;
        };
        Update: Partial<Goal>;
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task>;
        Update: Partial<Task>;
      };
      task_logs: {
        Row: TaskLog;
        Insert: Omit<TaskLog, 'id' | 'created_at'>;
        Update: Partial<TaskLog>;
      };
      progress_logs: {
        Row: ProgressLog;
        Insert: Omit<ProgressLog, 'id' | 'created_at'>;
        Update: Partial<Pick<ProgressLog, 'note'>>;
      };
      mood_logs: {
        Row: MoodLog;
        Insert: Omit<MoodLog, 'id' | 'created_at'>;
        Update: Partial<MoodLog>;
      };
      stoic_quotes: {
        Row: StoicQuote;
        Insert: Omit<StoicQuote, 'id'>;
        Update: Partial<StoicQuote>;
      };
      daily_briefs: {
        Row: DailyBrief;
        Insert: Omit<DailyBrief, 'id' | 'generated_at'>;
        Update: Partial<DailyBrief>;
      };
    };
  };
}
