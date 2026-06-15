import { NextRequest, NextResponse } from 'next/server';

const WHISPER_URL = process.env.WHISPER_URL || 'http://127.0.0.1:9000';

/** Forward recorded audio to the local Whisper STT server, return {text}. */
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

  const out = new FormData();
  out.append('file', file, 'audio.webm');

  try {
    const res = await fetch(`${WHISPER_URL}/v1/audio/transcriptions`, {
      method: 'POST',
      body: out,
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'transcription failed' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({ text: data.text ?? '' });
  } catch {
    return NextResponse.json(
      { error: 'whisper offline', text: '' },
      { status: 503 },
    );
  }
}
