import { NextRequest, NextResponse } from 'next/server';

const WHISPER_URL = process.env.WHISPER_URL || 'http://127.0.0.1:9000';
const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3';

/** Transcribe via Groq's hosted Whisper (cloud). */
async function transcribeGroq(file: Blob): Promise<NextResponse> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: 'stt not configured', text: '' }, { status: 503 });

  const out = new FormData();
  out.append('file', file, 'audio.webm');
  out.append('model', GROQ_STT_MODEL);
  try {
    const res = await fetch(GROQ_STT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: out,
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return NextResponse.json({ error: 'transcription failed' }, { status: 502 });
    const data = await res.json();
    return NextResponse.json({ text: data.text ?? '' });
  } catch {
    return NextResponse.json({ error: 'stt offline', text: '' }, { status: 503 });
  }
}

/** Transcribe via the local Whisper server. */
async function transcribeWhisper(file: Blob): Promise<NextResponse> {
  const out = new FormData();
  out.append('file', file, 'audio.webm');
  try {
    const res = await fetch(`${WHISPER_URL}/v1/audio/transcriptions`, {
      method: 'POST',
      body: out,
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return NextResponse.json({ error: 'transcription failed' }, { status: 502 });
    const data = await res.json();
    return NextResponse.json({ text: data.text ?? '' });
  } catch {
    return NextResponse.json({ error: 'whisper offline', text: '' }, { status: 503 });
  }
}

/** Recorded audio → text. Provider is local Whisper by default; STT_PROVIDER=groq in cloud. */
export async function POST(req: NextRequest) {
  let inForm: FormData;
  try {
    inForm = await req.formData();
  } catch {
    return NextResponse.json({ error: 'expected multipart form' }, { status: 400 });
  }
  const file = inForm.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 });
  }

  return process.env.STT_PROVIDER === 'groq'
    ? transcribeGroq(file)
    : transcribeWhisper(file);
}
