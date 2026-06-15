import { createClient } from '@/lib/supabase/server';
import type { TherapySession, TherapyMessage } from '@/lib/database.types';
import TherapyChat from '@/components/therapy/TherapyChat';

export const dynamic = 'force-dynamic';

export default async function TalkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-2">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Talk</h1>
        <p className="text-sm text-muted-fg">Please sign in to use the companion.</p>
      </div>
    );
  }

  // Find the latest open session, or create one.
  const { data: open } = await supabase
    .from('therapy_sessions')
    .select('*')
    .eq('user_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let session = open as TherapySession | null;
  if (!session) {
    const { data: created, error: createError } = await supabase
      .from('therapy_sessions')
      .insert({
        user_id: user.id,
        persona: 'warm',
        risk_flag: 'none',
        mode: 'chat',
        roleplay_persona: null,
        summary: null,
        ended_at: null,
      })
      .select('*')
      .single();
    if (createError || !created) {
      return (
        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-semibold text-foreground">Talk</h1>
          <p className="text-sm text-muted-fg">
            We couldn&apos;t start a session right now. Please try again in a moment.
          </p>
        </div>
      );
    }
    session = created as TherapySession;
  }

  if (!session) {
    return (
      <div className="space-y-2">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Talk</h1>
        <p className="text-sm text-muted-fg">
          We couldn&apos;t load your session right now. Please try again in a moment.
        </p>
      </div>
    );
  }

  const { data: msgData } = await supabase
    .from('therapy_messages')
    .select('*')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true });
  const messages = (msgData as TherapyMessage[] | null) ?? [];

  return (
    <TherapyChat
      sessionId={session.id}
      persona={session.persona}
      initialMode={session.mode}
      initialRoleplayPersona={session.roleplay_persona}
      initialMessages={messages}
    />
  );
}
