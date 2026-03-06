-- Chatbot schema for per-brand public chatbot + PDF knowledge retrieval
-- Safe to run multiple times.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Brand settings
-- ---------------------------------------------------------------------------

alter table public.brands
  add column if not exists chatbot_enabled boolean not null default false;

alter table public.brands
  add column if not exists chatbot_slug text;

alter table public.brands
  add column if not exists chatbot_welcome_message text;

create unique index if not exists idx_brands_chatbot_slug_unique
  on public.brands (chatbot_slug)
  where chatbot_slug is not null and chatbot_slug <> '';

-- ---------------------------------------------------------------------------
-- Knowledge chunks (RAG)
-- ---------------------------------------------------------------------------

create table if not exists public.brand_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_file text not null,
  source_type text not null default 'pdf',
  chunk_text text not null,
  chunk_index integer not null default 0,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_brand_knowledge_chunks_brand_created
  on public.brand_knowledge_chunks (brand_id, created_at desc);

create index if not exists idx_brand_knowledge_chunks_brand_source
  on public.brand_knowledge_chunks (brand_id, source_type, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_brand_knowledge_chunks_embedding'
  ) then
    create index idx_brand_knowledge_chunks_embedding
      on public.brand_knowledge_chunks
      using ivfflat (embedding vector_cosine_ops)
      with (lists = 100);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Public chatbot sessions
-- ---------------------------------------------------------------------------

create table if not exists public.chatbot_sessions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  session_token text not null,
  visitor_metadata jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chatbot_sessions_token_len_ck check (char_length(session_token) >= 8)
);

create unique index if not exists idx_chatbot_sessions_token
  on public.chatbot_sessions (session_token);

create index if not exists idx_chatbot_sessions_brand_created
  on public.chatbot_sessions (brand_id, created_at desc);

create or replace function public.chatbot_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chatbot_sessions_updated_at on public.chatbot_sessions;
create trigger trg_chatbot_sessions_updated_at
before update on public.chatbot_sessions
for each row
execute function public.chatbot_set_updated_at();

-- ---------------------------------------------------------------------------
-- Similarity search RPC used by /api/chatbot/chat
-- ---------------------------------------------------------------------------

create or replace function public.match_brand_knowledge(
  query_embedding vector(1536),
  match_brand_id uuid,
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  chunk_text text,
  similarity float,
  source_file text,
  source_type text,
  metadata jsonb
)
language sql
stable
as $$
  select
    bkc.id,
    bkc.chunk_text,
    1 - (bkc.embedding <=> query_embedding) as similarity,
    bkc.source_file,
    bkc.source_type,
    bkc.metadata
  from public.brand_knowledge_chunks bkc
  where
    bkc.brand_id = match_brand_id
    and (1 - (bkc.embedding <=> query_embedding)) >= greatest(least(match_threshold, 1), -1)
  order by bkc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.brand_knowledge_chunks enable row level security;
alter table public.chatbot_sessions enable row level security;

drop policy if exists brand_knowledge_chunks_owner_all on public.brand_knowledge_chunks;
create policy brand_knowledge_chunks_owner_all
  on public.brand_knowledge_chunks
  for all
  using (
    exists (
      select 1
      from public.brands b
      where b.id = brand_knowledge_chunks.brand_id
        and b.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.brands b
      where b.id = brand_knowledge_chunks.brand_id
        and b.owner_user_id = auth.uid()
    )
  );

drop policy if exists chatbot_sessions_owner_all on public.chatbot_sessions;
create policy chatbot_sessions_owner_all
  on public.chatbot_sessions
  for all
  using (
    exists (
      select 1
      from public.brands b
      where b.id = chatbot_sessions.brand_id
        and b.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.brands b
      where b.id = chatbot_sessions.brand_id
        and b.owner_user_id = auth.uid()
    )
  );
