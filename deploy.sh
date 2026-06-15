#!/usr/bin/env bash
# One-shot Cloud Run deploy for daily_tracker_app.
# Usage (in Cloud Shell, after uploading your .env.local):  bash deploy.sh
set -euo pipefail

PROJECT_ID=dailytracker-499506
REGION=asia-south1
SECRETS="SUPABASE_SERVICE_ROLE_KEY GROQ_API_KEY GEMINI_API_KEY VAPID_PRIVATE_KEY CRON_INVOKE_TOKEN"

# --- locate the uploaded .env.local (current dir, home, or arg $1) ---
ENV_FILE=""
for c in "./.env.local" "$HOME/.env.local" "${1:-}"; do
  if [ -n "$c" ] && [ -f "$c" ]; then ENV_FILE="$c"; break; fi
done
if [ -z "$ENV_FILE" ]; then
  echo "ERROR: .env.local not found."
  echo "Upload it first: Cloud Shell  ⋮  ->  Upload  ->  pick your local .env.local"
  exit 1
fi
echo "==> Using secrets from: $ENV_FILE"

gcloud config set project "$PROJECT_ID"

echo "==> Enabling APIs (idempotent)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

# --- public build-time vars (browser-safe) ---
echo "==> Writing .env.production..."
{
  echo 'NEXT_PUBLIC_SUPABASE_URL=https://zazflexdavvsffwqqroc.supabase.co'
  echo 'NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_-tr2G4jiHhS9TBHrT8oqLg_68ETYdWR'
  echo 'NEXT_PUBLIC_VAPID_PUBLIC_KEY=BH12F-hWGy_OuQTSX6H65TKNJHWBVNflocmmkrIVnGqo7wsaM4RycOZNJ5O1fcFHWCRCzv_rmwXVqyd5j0BUcO8'
  echo 'NEXT_PUBLIC_SITE_URL=https://daily-tracker-960687543731.asia-south1.run.app'
} > .env.production

# --- runtime secrets -> Secret Manager (read from the uploaded .env.local) ---
getval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "\r"; }
echo "==> Pushing secrets to Secret Manager..."
for S in $SECRETS; do
  VAL="$(getval "$S")"
  if [ -z "$VAL" ]; then echo "   WARN: $S is empty in $ENV_FILE — skipping"; continue; fi
  if printf '%s' "$VAL" | gcloud secrets create "$S" --data-file=- 2>/dev/null; then
    echo "   created $S"
  else
    printf '%s' "$VAL" | gcloud secrets versions add "$S" --data-file=- >/dev/null
    echo "   updated $S"
  fi
done

echo "==> Granting the Cloud Run runtime SA access to the secrets..."
PNUM="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA="${PNUM}-compute@developer.gserviceaccount.com"
for S in $SECRETS; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:${SA}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
done

echo "==> Deploying to Cloud Run (this builds the image, ~3-6 min)..."
gcloud run deploy daily-tracker \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars THERAPIST_PROVIDER=groq,STT_PROVIDER=groq,GROQ_MODEL=llama-3.3-70b-versatile,GROQ_STT_MODEL=whisper-large-v3,GEMINI_MODEL=gemini-2.5-flash,VAPID_SUBJECT=mailto:mail@gmail.com \
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,GROQ_API_KEY=GROQ_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,VAPID_PRIVATE_KEY=VAPID_PRIVATE_KEY:latest,CRON_INVOKE_TOKEN=CRON_INVOKE_TOKEN:latest

echo ""
echo "==> DONE. The Service URL is printed above (https://daily-tracker-....run.app)."
echo "    Next: add that URL to Supabase -> Authentication -> URL Configuration."
