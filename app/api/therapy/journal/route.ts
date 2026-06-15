import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractJournalText, JournalExtractError } from '@/lib/therapist/journal';
import type { TherapyAttachment } from '@/lib/database.types';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/;

/** Sanitize a filename into a safe storage segment. */
function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return cleaned || 'journal';
}

/**
 * Receive an uploaded journal (image/PDF): store the raw file in the private
 * `journals` bucket, transcribe it to text via Gemini, and return both.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'expected multipart form' }, { status: 400 });
  }

  const file = form.get('file');
  const sessionId = form.get('sessionId');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 });
  }
  if (typeof sessionId !== 'string' || !sessionId) {
    return NextResponse.json({ error: 'missing sessionId' }, { status: 400 });
  }
  if (!ALLOWED.test(file.type)) {
    return NextResponse.json({ error: 'Only images and PDFs are supported.' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 10 MB).' }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind: TherapyAttachment['kind'] = file.type === 'application/pdf' ? 'pdf' : 'image';
  const path = `${user.id}/${sessionId}/${crypto.randomUUID()}-${safeName(file.name)}`;

  // Store the original file (private bucket; RLS confines it to this user's prefix).
  const { error: upErr } = await supabase.storage
    .from('journals')
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: 'Could not save the file.' }, { status: 502 });
  }

  // Transcribe to text via Gemini.
  let text: string;
  try {
    const base64 = Buffer.from(bytes).toString('base64');
    text = await extractJournalText(base64, file.type);
  } catch (e) {
    // Roll back the stored file so we don't keep an unreadable orphan.
    await supabase.storage.from('journals').remove([path]);
    const message = e instanceof JournalExtractError ? e.message : 'Could not read the file.';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const attachment: TherapyAttachment = { path, kind, name: file.name };
  return NextResponse.json({ text, attachment });
}
