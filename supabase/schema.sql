-- ============================================================
-- Promptory Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Prompts table
create table public.prompts (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text not null,
  goal        text not null,
  model_used  text not null,
  scene       text not null,
  goal_clusters text[] not null default '{}',
  images      text[] not null default '{}',
  current_ver integer not null default 1,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

-- 2. Prompt versions table
create table public.prompt_versions (
  id            uuid default gen_random_uuid() primary key,
  prompt_id     uuid references public.prompts(id) on delete cascade not null,
  ver           integer not null,
  content       text not null,
  change_note   text not null default '',
  is_starred    boolean not null default false,
  effect_score  integer check (effect_score is null or (effect_score >= 1 and effect_score <= 5)),
  effect_output text,
  effect_notes  text,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  unique(prompt_id, ver)
);

-- 3. API configs table (for Insight AI provider keys)
create table public.api_configs (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null unique,
  provider    text not null,
  api_key     text not null,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

-- ============================================================
-- Indexes
-- ============================================================

create index prompts_user_id_idx on public.prompts(user_id);
create index prompts_scene_idx on public.prompts(scene);
create index prompts_updated_at_idx on public.prompts(updated_at desc);
create index prompt_versions_prompt_id_idx on public.prompt_versions(prompt_id);
create index prompts_goal_clusters_idx on public.prompts using gin(goal_clusters);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

alter table public.prompts enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.api_configs enable row level security;

-- Prompts: users can only access their own records
create policy "Users can view own prompts"
  on public.prompts for select
  using (auth.uid() = user_id);

create policy "Users can create own prompts"
  on public.prompts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own prompts"
  on public.prompts for update
  using (auth.uid() = user_id);

create policy "Users can delete own prompts"
  on public.prompts for delete
  using (auth.uid() = user_id);

-- Prompt versions: access controlled via prompt ownership
create policy "Users can view own versions"
  on public.prompt_versions for select
  using (prompt_id in (select id from public.prompts where user_id = auth.uid()));

create policy "Users can create own versions"
  on public.prompt_versions for insert
  with check (prompt_id in (select id from public.prompts where user_id = auth.uid()));

create policy "Users can update own versions"
  on public.prompt_versions for update
  using (prompt_id in (select id from public.prompts where user_id = auth.uid()));

create policy "Users can delete own versions"
  on public.prompt_versions for delete
  using (prompt_id in (select id from public.prompts where user_id = auth.uid()));

-- API configs: users can only access their own config
create policy "Users can view own api config"
  on public.api_configs for select
  using (auth.uid() = user_id);

create policy "Users can upsert own api config"
  on public.api_configs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own api config"
  on public.api_configs for update
  using (auth.uid() = user_id);

-- ============================================================
-- Helper: auto-update updated_at on row change
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger prompts_updated_at
  before update on public.prompts
  for each row execute function public.handle_updated_at();

create trigger prompt_versions_updated_at
  before update on public.prompt_versions
  for each row execute function public.handle_updated_at();

create trigger api_configs_updated_at
  before update on public.api_configs
  for each row execute function public.handle_updated_at();

-- ============================================================
-- Storage bucket for prompt reference images
-- ============================================================

insert into storage.buckets (id, name, public)
  values ('prompt-images', 'prompt-images', true)
  on conflict (id) do nothing;

create policy "Authenticated users can upload prompt images"
  on storage.objects for insert
  with check (bucket_id = 'prompt-images' and auth.uid() is not null);

create policy "Anyone can view prompt images"
  on storage.objects for select
  using (bucket_id = 'prompt-images');

create policy "Users can delete own prompt images"
  on storage.objects for delete
  using (bucket_id = 'prompt-images' and auth.uid() is not null);

-- ============================================================
-- Migration: run this if your database already exists
-- ============================================================
-- ALTER TABLE public.prompts ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';
