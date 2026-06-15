import { NextRequest, NextResponse } from 'next/server';

const KOKORO_URL = process.env.KOKORO_URL || 'http://127.0.0.1:8880';

/** Synthesize the assistant reply to speech via the local Kokoro TTS server. */
export async function POST(req: NextRequest) {
  let body: { text?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'expected json' }, { status: 400 });
  }
  const text = (body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'missing text' }, { status: 400 });

  try {
    const res = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice: body.voice || 'af_heart',
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
