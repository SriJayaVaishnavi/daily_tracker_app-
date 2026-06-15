import { NextRequest, NextResponse } from 'next/server';

const KOKORO_URL = process.env.KOKORO_URL || 'http://127.0.0.1:8880';
const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const GCP_TTS_VOICE = process.env.GCP_TTS_VOICE || 'en-US-Neural2-F';

/** Synthesize speech via Google Cloud Text-to-Speech (returns mp3 bytes). */
async function speakGoogle(text: string): Promise<NextResponse> {
  const key = process.env.GCP_TTS_API_KEY;
  if (!key) return NextResponse.json({ error: 'tts not configured' }, { status: 503 });

  try {
    const res = await fetch(`${GOOGLE_TTS_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: GCP_TTS_VOICE.slice(0, 5), name: GCP_TTS_VOICE },
        audioConfig: { audioEncoding: 'MP3' },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return NextResponse.json({ error: 'tts failed' }, { status: 502 });
    const data = await res.json();
    if (typeof data.audioContent !== 'string') {
      return NextResponse.json({ error: 'tts failed' }, { status: 502 });
    }
    const audio = Buffer.from(data.audioContent, 'base64');
    return new NextResponse(audio, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'tts offline' }, { status: 503 });
  }
}

/** Synthesize speech via the local Kokoro server (streams mp3). */
async function speakKokoro(text: string, voice?: string): Promise<NextResponse> {
  try {
    const res = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice: voice || 'af_heart',
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok || !res.body) {
      return NextResponse.json({ error: 'tts failed' }, { status: 502 });
    }
    return new NextResponse(res.body, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'kokoro offline' }, { status: 503 });
  }
}

/** Text → speech. Provider is local Kokoro by default; TTS_PROVIDER=google in cloud. */
export async function POST(req: NextRequest) {
  let body: { text?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'expected json' }, { status: 400 });
  }
  const text = (body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'missing text' }, { status: 400 });

  return process.env.TTS_PROVIDER === 'google'
    ? speakGoogle(text)
    : speakKokoro(text, body.voice);
}
