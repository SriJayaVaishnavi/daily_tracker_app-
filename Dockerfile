# Multi-stage build for the Next.js standalone server (Cloud Run).

# ---- deps: install node_modules ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the app ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public, browser-safe build-time vars. Setting them as real ENV here guarantees
# `next build` inlines the actual values (process.env always wins over .env files,
# and reaches the middleware bundle). These are NOT secrets — the anon key is a
# publishable key and all NEXT_PUBLIC_* values ship to the browser anyway.
ENV NEXT_PUBLIC_SUPABASE_URL=https://zazflexdavvsffwqqroc.supabase.co \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_-tr2G4jiHhS9TBHrT8oqLg_68ETYdWR \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=BH12F-hWGy_OuQTSX6H65TKNJHWBVNflocmmkrIVnGqo7wsaM4RycOZNJ5O1fcFHWCRCzv_rmwXVqyd5j0BUcO8 \
    NEXT_PUBLIC_SITE_URL=https://daily-tracker-960687543731.asia-south1.run.app \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# Standalone output bundles a minimal server + only the needed node_modules.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
