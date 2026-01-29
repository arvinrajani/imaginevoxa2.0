# Velvetline

LinkedIn post generator + auto-poster built with Next.js, Supabase, and n8n.

## Requirements
- Node.js 18+
- Supabase project with Google Auth enabled
- LinkedIn Developer App with posting scopes
- n8n workflow for generate + approve webhooks

## Setup
1) Install dependencies:
```bash
npm install
```

2) Create `.env.local`:
```bash
cp .env.example .env.local
```

3) Configure Supabase Auth redirect URLs:
- `http://localhost:3000/app`
- `http://localhost:3000/login`
- `http://localhost:3000/api/linkedin/callback`

4) In Supabase Auth → Providers, enable **LinkedIn (OIDC)** and set the same client
ID/secret you use for LinkedIn.

5) Run the dev server:
```bash
npm run dev
```

## Supabase SQL
- `supabase/schema.sql` defines tables + profile trigger.
- `supabase/rls.sql` enables RLS and per-user policies.

## LinkedIn App Setup
1) Create a LinkedIn Developer App.
2) Add redirect URI: `APP_BASE_URL/api/linkedin/callback`.
3) Request scopes required for posting (ex: `w_member_social`).
4) Set the client ID/secret in `.env.local`.

## n8n Webhooks
- Generate: `POST ${N8N_GENERATE_WEBHOOK_URL}`
- Approve: `POST ${N8N_APPROVE_WEBHOOK_URL}`
- Server sends `x-api-key: ${N8N_X_API_KEY}`

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REDIRECT_URI`
- `LINKEDIN_SCOPES`
- `N8N_GENERATE_WEBHOOK_URL`
- `N8N_APPROVE_WEBHOOK_URL`
- `N8N_X_API_KEY`
- `APP_BASE_URL`

## Scripts
- `npm run dev`
- `npm run build`
- `npm run start`
