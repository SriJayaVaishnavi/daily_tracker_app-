'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  Send,
  Mic,
  Square,
  Wind,
  NotebookPen,
  Volume2,
  VolumeX,
  Loader2,
  Paperclip,
  FileText,
} from 'lucide-react';
import type {
  TherapyMessage,
  TherapyPersona,
  TherapyMode,
  TherapyAction,
  TherapyAttachment,
} from '@/lib/database.types';
import { sendMessage, endSession, signAttachment } from '@/lib/actions/therapy';
import Modal from '@/components/Modal';
import BoxBreathing from '@/components/therapy/BoxBreathing';
import ThoughtRecord from '@/components/therapy/ThoughtRecord';

interface Props {
  sessionId: string;
  persona: TherapyPersona;
  initialMode: TherapyMode;
  initialRoleplayPersona: string | null;
  initialMessages: TherapyMessage[];
}

type ToolKind = 'breathing' | 'thought_record';

export default function TherapyChat({
  sessionId,
  persona,
  initialMode,
  initialRoleplayPersona,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState<TherapyMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<TherapyMode>(initialMode);
  const [roleplayPersona, setRoleplayPersona] = useState<string | null>(initialRoleplayPersona);
  const [pending, startTransition] = useTransition();
  const [activeTool, setActiveTool] = useState<ToolKind | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [uploadingJournal, setUploadingJournal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  function applyReplies(replies: TherapyMessage[]) {
    setMessages((prev) => [...prev, ...replies]);
    for (const r of replies) {
      const action = r.action as TherapyAction | null;
      if (action?.type === 'roleplay_start') {
        setMode('roleplay');
        setRoleplayPersona(action.persona);
      } else if (action?.type === 'roleplay_end') {
        setMode('chat');
        setRoleplayPersona(null);
      }
    }
    if (voiceMode) {
      const spoken = replies.find((r) => r.role === 'assistant' || r.role === 'coach');
      if (spoken) void playSpeech(spoken.content);
    }
  }

  function dispatchText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setInput('');
    startTransition(async () => {
      const res = await sendMessage(sessionId, trimmed);
      setMessages((prev) => [...prev, res.userMessage]);
      applyReplies(res.replies);
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatchText(input);
  }

  async function handleJournalFile(file: File) {
    if (pending || uploadingJournal || transcribing) return;
    setUploadError(null);
    setUploadingJournal(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('sessionId', sessionId);
      const res = await fetch('/api/therapy/journal', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Could not read that file.');
        return;
      }
      startTransition(async () => {
        const r = await sendMessage(
          sessionId,
          data.text as string,
          data.attachment as TherapyAttachment,
        );
        setMessages((prev) => [...prev, r.userMessage]);
        applyReplies(r.replies);
      });
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploadingJournal(false);
    }
  }

  function endRoleplay() {
    if (pending) return;
    startTransition(async () => {
      const res = await sendMessage(sessionId, '[[end roleplay]]');
      setMessages((prev) => [...prev, res.userMessage]);
      applyReplies(res.replies);
    });
  }

  async function playSpeech(text: string) {
    try {
      const res = await fetch('/api/therapy/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      void audioRef.current.play();
    } catch {
      /* audio is best-effort */
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const form = new FormData();
          form.append('file', blob, 'audio.webm');
          const res = await fetch('/api/therapy/transcribe', { method: 'POST', body: form });
          const data = await res.json();
          if (data.text) setInput((prev) => (prev ? prev + ' ' : '') + data.text);
        } catch {
          /* ignore */
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      alert('Could not access the microphone.');
    }
  }

  function onToolComplete(summary: string) {
    setActiveTool(null);
    dispatchText(summary);
  }

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col">
      {/* Header + disclaimer */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-2xl font-semibold text-foreground">Talk</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVoiceMode((v) => !v)}
              aria-pressed={voiceMode}
              title={voiceMode ? 'Voice replies on' : 'Voice replies off'}
              className="transition-calm flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-fg hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {voiceMode ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              type="button"
              onClick={() => startTransition(async () => { await endSession(sessionId); window.location.reload(); })}
              className="transition-calm rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-fg hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              End &amp; save
            </button>
          </div>
        </div>
        <p className="mt-1 rounded-lg bg-background px-3 py-2 text-xs text-muted-fg">
          I&rsquo;m a supportive companion, not a substitute for professional care. Persona: {persona}.
        </p>
      </div>

      {/* Role-play banner */}
      {mode === 'roleplay' && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          <span className="font-medium text-accent">
            Role-play: {roleplayPersona ?? 'in scene'}
          </span>
          <button
            type="button"
            onClick={endRoleplay}
            className="transition-calm rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            End &amp; get feedback
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-fg">
            How are you feeling right now? Type or tap the mic to begin.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onLaunchTool={(t) => setActiveTool(t)} />
        ))}
        {uploadingJournal && (
          <div className="flex items-center gap-2 text-sm text-muted-fg">
            <Loader2 size={16} className="animate-spin" /> reading your journal…
          </div>
        )}
        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted-fg">
            <Loader2 size={16} className="animate-spin" /> thinking…
          </div>
        )}
      </div>

      {uploadError && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {uploadError}
        </p>
      )}

      {/* Input */}
      <form onSubmit={onSubmit} className="mt-2 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleJournalFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingJournal || transcribing || pending}
          aria-label="Upload a journal (image or PDF)"
          title="Upload a journal (image or PDF)"
          className="transition-calm flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-fg hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {uploadingJournal ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
        </button>
        <button
          type="button"
          onClick={toggleRecording}
          disabled={transcribing || pending || uploadingJournal}
          aria-label={recording ? 'Stop recording' : 'Record voice'}
          className={`transition-calm flex h-11 w-11 shrink-0 items-center justify-center rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
            recording ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border text-muted-fg hover:text-foreground'
          }`}
        >
          {transcribing ? <Loader2 size={18} className="animate-spin" /> : recording ? <Square size={18} /> : <Mic size={18} />}
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
          rows={1}
          placeholder={recording ? 'Listening…' : 'Share what’s on your mind…'}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          aria-label="Send"
          className="transition-calm flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </form>

      {/* Tool modals */}
      <Modal open={activeTool === 'breathing'} onClose={() => setActiveTool(null)} title="Box breathing">
        <BoxBreathing />
      </Modal>
      <Modal open={activeTool === 'thought_record'} onClose={() => setActiveTool(null)} title="Thought record">
        <ThoughtRecord onComplete={onToolComplete} />
      </Modal>
    </div>
  );
}

function MessageBubble({
  message,
  onLaunchTool,
}: {
  message: TherapyMessage;
  onLaunchTool: (tool: ToolKind) => void;
}) {
  const isUser = message.role === 'user';
  const isCoach = message.role === 'coach';
  const action = message.action as TherapyAction | null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%]">
        {isCoach && <div className="mb-0.5 text-xs font-semibold text-accent">Coach feedback</div>}
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
            isUser
              ? 'bg-primary text-primary-fg'
              : isCoach
                ? 'border border-accent/40 bg-accent/10 text-foreground'
                : 'border border-border bg-surface text-foreground'
          }`}
        >
          {message.attachment && <AttachmentPreview attachment={message.attachment} />}
          {message.content}
        </div>
        {action?.type === 'launch_tool' && (
          <button
            type="button"
            onClick={() => onLaunchTool(action.tool)}
            className="transition-calm mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {action.tool === 'breathing' ? <Wind size={14} /> : <NotebookPen size={14} />}
            {action.tool === 'breathing' ? 'Start box breathing' : 'Open thought record'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Renders an uploaded journal attachment, fetching a short-lived signed URL. */
function AttachmentPreview({ attachment }: { attachment: TherapyAttachment }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void signAttachment(attachment.path).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [attachment.path]);

  if (attachment.kind === 'image') {
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={attachment.name}
        className="mb-2 max-h-56 w-full rounded-lg border border-black/10 object-cover"
      />
    ) : (
      <div className="mb-2 flex h-24 w-full items-center justify-center rounded-lg border border-black/10">
        <Loader2 size={16} className="animate-spin opacity-70" />
      </div>
    );
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-xs hover:opacity-90"
    >
      <FileText size={14} className="shrink-0" />
      <span className="truncate">{attachment.name}</span>
    </a>
  );
}
