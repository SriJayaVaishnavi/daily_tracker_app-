'use server';

import { createClient } from '@/lib/supabase/server';
import type {
  TherapyMessage,
  TherapyPersona,
  TherapyRole,
  TherapyAction,
  TherapyAttachment,
} from '@/lib/database.types';
import { classifyRisk, CRISIS_RESPONSE } from '@/lib/therapist/safety';
import { loadContext } from '@/lib/therapist/memory';
import { buildSystemPrompt, SUMMARY_PROMPT } from '@/lib/therapist/prompt';
import {
  callChatModel,
  parseModelOutput,
  OllamaOfflineError,
  type ChatMessage,
} from '@/lib/therapist/orchestrate';

const HISTORY_LIMIT = 20;
const ROLEPLAY_END_SENTINEL = '[[end roleplay]]';

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  return { supabase, userId: user.id };
}

/** Start a fresh session and return its id. */
export async function startSession(persona: TherapyPersona = 'warm'): Promise<string> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from('therapy_sessions')
    .insert({ user_id: userId, persona, risk_flag: 'none', mode: 'chat', roleplay_persona: null, summary: null, ended_at: null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function insertMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
  role: TherapyRole,
  content: string,
  action: TherapyAction | null = null,
  attachment: TherapyAttachment | null = null,
): Promise<TherapyMessage> {
  const { data, error } = await supabase
    .from('therapy_messages')
    .insert({
      session_id: sessionId,
      user_id: userId,
      role,
      content,
      action,
      // Only reference the `attachment` column when there is one, so plain chat
      // keeps working even before the 0003 migration adds the column.
      ...(attachment ? { attachment } : {}),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as TherapyMessage;
}

/**
 * Create a short-lived signed URL for a stored journal attachment so the client
 * can display it. Returns null if it can't be signed.
 */
export async function signAttachment(path: string): Promise<string | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.storage.from('journals').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export interface SendResult {
  userMessage: TherapyMessage;
  replies: TherapyMessage[];
  offline?: boolean;
}

/**
 * Handle a user message: deterministic safety first, then the local model.
 * Returns the persisted user message plus any assistant/coach replies.
 */
export async function sendMessage(
  sessionId: string,
  text: string,
  attachment: TherapyAttachment | null = null,
): Promise<SendResult> {
  const { supabase, userId } = await requireUser();
  const trimmed = text.trim();
  const isEndRoleplay = trimmed === ROLEPLAY_END_SENTINEL;

  // Load the session.
  const { data: session, error: sErr } = await supabase
    .from('therapy_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (sErr || !session) throw sErr ?? new Error('session not found');

  // Persist the user message (skip storing the internal end-roleplay sentinel).
  const userMessage = isEndRoleplay
    ? await insertMessage(supabase, userId, sessionId, 'user', '(ended role-play)')
    : await insertMessage(supabase, userId, sessionId, 'user', trimmed, null, attachment);

  // 1. Deterministic crisis check — bypass the LLM entirely.
  if (!isEndRoleplay) {
    const risk = classifyRisk(trimmed);
    if (risk.level === 'crisis') {
      await supabase.from('therapy_sessions').update({ risk_flag: 'crisis' }).eq('id', sessionId);
      const reply = await insertMessage(supabase, userId, sessionId, 'assistant', CRISIS_RESPONSE);
      return { userMessage, replies: [reply] };
    }

    // 2. Build the prompt + history and call the local model.
    let contextBlock = '';
    try {
      contextBlock = await loadContext(userId);
    } catch {
      contextBlock = 'No context available.';
    }

    const system = buildSystemPrompt({
      persona: session.persona,
      contextBlock,
      riskLevel: risk.level,
      mode: session.mode,
      roleplayPersona: session.roleplay_persona,
    });

    const history = await loadHistory(supabase, sessionId);
    const messages: ChatMessage[] = [{ role: 'system', content: system }, ...history];

    let parsed;
    try {
      const raw = await callChatModel(messages);
      parsed = parseModelOutput(raw);
    } catch (e) {
      if (e instanceof OllamaOfflineError) {
        const reply = await insertMessage(
          supabase,
          userId,
          sessionId,
          'assistant',
          "I can't reach the local therapist model right now. Please make sure Ollama is running, then try again.",
        );
        return { userMessage, replies: [reply], offline: true };
      }
      throw e;
    }

    // Apply role-play state transitions from the action.
    if (parsed.action?.type === 'roleplay_start') {
      await supabase
        .from('therapy_sessions')
        .update({ mode: 'roleplay', roleplay_persona: parsed.action.persona })
        .eq('id', sessionId);
    }

    const reply = await insertMessage(
      supabase,
      userId,
      sessionId,
      'assistant',
      parsed.reply,
      parsed.action,
    );
    const replies = [reply];

    // If the model chose to end role-play, append coach feedback.
    if (parsed.action?.type === 'roleplay_end') {
      const coach = await produceCoachFeedback(supabase, userId, sessionId, session.roleplay_persona);
      await supabase
        .from('therapy_sessions')
        .update({ mode: 'chat', roleplay_persona: null })
        .eq('id', sessionId);
      if (coach) replies.push(coach);
    }

    if (risk.level === 'concern') {
      await supabase.from('therapy_sessions').update({ risk_flag: 'concern' }).eq('id', sessionId);
    }

    return { userMessage, replies };
  }

  // End-roleplay sentinel path: produce coach feedback and reset to chat.
  const coach = await produceCoachFeedback(supabase, userId, sessionId, session.roleplay_persona);
  await supabase
    .from('therapy_sessions')
    .update({ mode: 'chat', roleplay_persona: null })
    .eq('id', sessionId);
  return { userMessage, replies: coach ? [coach] : [] };
}

/** Fetch recent messages mapped into model chat format (coach → assistant). */
async function loadHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('therapy_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  const rows = (data ?? []).reverse();
  return rows.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));
}

/** Generate supportive, specific coaching feedback after a role-play scene. */
async function produceCoachFeedback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
  roleplayPersona: string | null,
): Promise<TherapyMessage | null> {
  const history = await loadHistory(supabase, sessionId);
  const system: ChatMessage = {
    role: 'system',
    content:
      'The user just finished rehearsing a difficult conversation' +
      (roleplayPersona ? ` with "${roleplayPersona}"` : '') +
      '. As a warm communication coach, give brief, specific, encouraging feedback: ' +
      'one or two things they did well, and one gentle suggestion. ' +
      'Plain text, 2-4 sentences, second person.',
  };
  try {
    const raw = await callChatModel([system, ...history]);
    const text = raw.trim();
    return insertMessage(supabase, userId, sessionId, 'coach', text);
  } catch {
    return null;
  }
}

/** Summarize the session into memory and close it. */
export async function endSession(sessionId: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const history = await loadHistory(supabase, sessionId);
  let summary: string | null = null;
  if (history.length > 0) {
    try {
      const raw = await callChatModel([
        { role: 'system', content: SUMMARY_PROMPT },
        ...history,
      ]);
      summary = raw.trim();
    } catch {
      summary = null;
    }
  }
  await supabase
    .from('therapy_sessions')
    .update({ summary, ended_at: new Date().toISOString() })
    .eq('id', sessionId);
  void userId;
}
