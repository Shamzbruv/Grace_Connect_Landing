-- Grace Connect legal acceptance records
-- Adds an auditable record of Terms, Privacy Policy, 18+ confirmation,
-- and related legal-document acceptance captured during Supabase sign-up.

create table if not exists public.user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  uid text generated always as (user_id::text) stored,
  email text,
  age_confirmed boolean not null default false,
  legal_accepted boolean not null default false,
  authorized_representative boolean not null default false,
  terms_version text,
  privacy_policy_version text,
  accepted_legal_documents text[] not null default array[]::text[],
  signup_source text,
  accepted_at timestamptz,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_policy_version, signup_source)
);

alter table public.user_legal_acceptances enable row level security;

-- Users may view their own legal acceptance record.
drop policy if exists "Users view own legal acceptance records" on public.user_legal_acceptances;
create policy "Users view own legal acceptance records"
  on public.user_legal_acceptances
  for select
  using (auth.uid() = user_id);

-- Legal acceptance records should be written by the auth trigger/service role only.
drop policy if exists "Users cannot insert legal acceptance records directly" on public.user_legal_acceptances;
create policy "Users cannot insert legal acceptance records directly"
  on public.user_legal_acceptances
  for insert
  with check (false);

drop policy if exists "Users cannot update legal acceptance records directly" on public.user_legal_acceptances;
create policy "Users cannot update legal acceptance records directly"
  on public.user_legal_acceptances
  for update
  using (false)
  with check (false);

create index if not exists idx_user_legal_acceptances_user_id
  on public.user_legal_acceptances(user_id);

create index if not exists idx_user_legal_acceptances_accepted_at
  on public.user_legal_acceptances(accepted_at desc);

create or replace function public.record_legal_acceptance_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  accepted_docs text[] := array[]::text[];
begin
  if jsonb_typeof(meta->'acceptedLegalDocuments') = 'array' then
    select coalesce(array_agg(value::text), array[]::text[])
      into accepted_docs
    from jsonb_array_elements_text(meta->'acceptedLegalDocuments') as value;
  end if;

  if coalesce((meta->>'legalAccepted')::boolean, false) = true
     or nullif(meta->>'termsVersion', '') is not null
     or nullif(meta->>'privacyPolicyVersion', '') is not null then
    insert into public.user_legal_acceptances (
      user_id,
      email,
      age_confirmed,
      legal_accepted,
      authorized_representative,
      terms_version,
      privacy_policy_version,
      accepted_legal_documents,
      signup_source,
      accepted_at,
      raw_metadata,
      updated_at
    ) values (
      new.id,
      new.email,
      coalesce((meta->>'ageConfirmed')::boolean, false),
      coalesce((meta->>'legalAccepted')::boolean, false),
      coalesce((meta->>'authorizedRepresentative')::boolean, false),
      nullif(meta->>'termsVersion', ''),
      nullif(meta->>'privacyPolicyVersion', ''),
      accepted_docs,
      nullif(meta->>'signupSource', ''),
      coalesce(nullif(meta->>'legalAcceptedAt', '')::timestamptz, now()),
      meta,
      now()
    )
    on conflict (user_id, terms_version, privacy_policy_version, signup_source)
    do update set
      email = excluded.email,
      age_confirmed = excluded.age_confirmed,
      legal_accepted = excluded.legal_accepted,
      authorized_representative = excluded.authorized_representative,
      accepted_legal_documents = excluded.accepted_legal_documents,
      accepted_at = excluded.accepted_at,
      raw_metadata = excluded.raw_metadata,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists zz_record_legal_acceptance_from_auth on auth.users;
create trigger zz_record_legal_acceptance_from_auth
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.record_legal_acceptance_from_auth();

-- Optional convenience columns for public.users, if that table exists.
do $$
begin
  if to_regclass('public.users') is not null then
    alter table public.users add column if not exists "ageConfirmed" boolean default false;
    alter table public.users add column if not exists "legalAccepted" boolean default false;
    alter table public.users add column if not exists "legalAcceptedAt" timestamptz;
    alter table public.users add column if not exists "termsVersion" text;
    alter table public.users add column if not exists "privacyPolicyVersion" text;
    alter table public.users add column if not exists "signupSource" text;
    alter table public.users add column if not exists "authorizedRepresentative" boolean default false;
  end if;
end $$;
