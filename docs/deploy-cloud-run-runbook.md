# Deploy to Cloud Run via Cloud Shell — runbook

A first deployment attempt. Run everything in **GCP Cloud Shell** (browser) —
gcloud + Docker are preinstalled and already authenticated to your account.

Account: `srijayavaishnavi7@gmail.com` · Branch: `deploy/cloud-run`

---

## Part A — Project + billing (GCP Console, one-time)

1. Go to https://console.cloud.google.com → sign in as `srijayavaishnavi7@gmail.com`.
2. Create a project (top bar → project dropdown → **New Project**), e.g. name
   `daily-tracker`. Note the **Project ID** (looks like `daily-tracker-470812`).
3. Enable billing: **Billing** → link a billing account (needs a card; new
   accounts get free trial credit, and Cloud Run has a generous always-free tier).

## Part B — Deploy (Cloud Shell)

Open Cloud Shell (terminal icon, top-right of the console), then:

```bash
# 0. Point gcloud at your project + region
export PROJECT_ID=<your-project-id>
export REGION=asia-south1            # Mumbai; pick what's closest
gcloud config set project "$PROJECT_ID"

# 1. Enable the APIs we need
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

# 2. Get the code
git clone https://github.com/SriJayaVaishnavi/daily_tracker_app-.git
cd daily_tracker_app-
git checkout deploy/cloud-run

# 3. Build-time PUBLIC vars (browser-safe; create the file Next reads at build)
cat > .env.production <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=<your supabase url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your supabase publishable/anon key>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your vapid public key>
EOF
# (copy these three values from your local .env.local — they are public)

# 4. Runtime SECRETS → Secret Manager (paste each value from your .env.local)
for S in SUPABASE_SERVICE_ROLE_KEY GROQ_API_KEY GEMINI_API_KEY VAPID_PRIVATE_KEY CRON_INVOKE_TOKEN; do
  printf 'Enter %s: ' "$S"; read -rs VAL; echo
  printf '%s' "$VAL" | gcloud secrets create "$S" --data-file=- 2>/dev/null \
    || printf '%s' "$VAL" | gcloud secrets versions add "$S" --data-file=-
done

# 5. Deploy (builds the Dockerfile via Cloud Build, then runs on Cloud Run)
gcloud run deploy daily-tracker \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars THERAPIST_PROVIDER=groq,STT_PROVIDER=groq,GROQ_MODEL=llama-3.3-70b-versatile,GROQ_STT_MODEL=whisper-large-v3,GEMINI_MODEL=gemini-2.5-flash,VAPID_SUBJECT=mailto:you@example.com \
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,GROQ_API_KEY=GROQ_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,VAPID_PRIVATE_KEY=VAPID_PRIVATE_KEY:latest,CRON_INVOKE_TOKEN=CRON_INVOKE_TOKEN:latest
```

When it finishes it prints a **Service URL** (https://daily-tracker-….run.app).

## Part C — Wire up + test

1. **Supabase** → Authentication → URL Configuration: set **Site URL** and add a
   **Redirect URL** = your Cloud Run URL (and `<url>/callback`). Otherwise login
   redirects break.
2. Open the Service URL → log in → check mood, goals, daily reflection, Talk
   (Groq reply), journal upload (Gemini).

## Notes / not included in this first attempt

- **Voice TTS** is left off (would need a separate Google TTS API key +
  `TTS_PROVIDER=google,GCP_TTS_API_KEY=…`). STT via Groq is enabled.
- `NEXT_PUBLIC_CRON_INVOKE_TOKEN` is intentionally NOT set in prod.
- If the build fails, the fallback is the clean `feat/foundation-slice` branch —
  we can pivot to Vercel/Firebase from there.
```
