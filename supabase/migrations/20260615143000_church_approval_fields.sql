-- Migration: Add church approval fields and NTCOG naming rules

-- 1. Add new columns to public.churches
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS normalized_denomination text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS location_name text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS pastor_or_admin_name text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS pastor_or_admin_email text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS pastor_or_admin_phone text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending';
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS members_count integer DEFAULT 0;

-- 2. Add approvalStatus to public.users if it doesn't exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "approvalStatus" text DEFAULT 'pending';

-- 3. Set existing churches to active
UPDATE public.churches SET approval_status = 'active' WHERE approval_status = 'pending' AND "createdAt" < NOW() - INTERVAL '1 minute';

-- 4. Re-create the trigger function to capture the new metadata during church creation
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  profile_roles text[] := array['Member'];
  profile_place_id text := nullif(coalesce(meta->>'placeId', meta->>'churchId'), '');
  profile_place_name text := nullif(coalesce(meta->>'placeName', meta->>'churchName'), '');
  profile_phone text := nullif(coalesce(meta->>'phone', meta->>'phoneNumber'), '');
  profile_join_date timestamptz := now();
  creates_church boolean := false;
  computed_display_name text;
  req_denom text;
  req_location text;
begin
  if jsonb_typeof(meta->'roles') = 'array' then
    select coalesce(array_agg(value), array['Member'])
      into profile_roles
      from jsonb_array_elements_text(meta->'roles') as roles(value)
      where nullif(trim(value), '') is not null;
  elsif nullif(meta->>'role', '') is not null then
    profile_roles := array[meta->>'role'];
  end if;

  if nullif(meta->>'joinDate', '') is not null then
    begin
      profile_join_date := (meta->>'joinDate')::timestamptz;
    exception when others then
      profile_join_date := now();
    end;
  end if;

  select exists (
    select 1
    from unnest(profile_roles) as role_name
    where lower(role_name) in ('admin', 'church admin', 'pastor')
  )
    into creates_church;

  if profile_place_id is null and creates_church then
    profile_place_id := 'church_' || replace(new.id::text, '-', '');
  end if;

  if profile_place_name is null and creates_church then
    profile_place_name := 'New Church';
  end if;

  if creates_church and profile_place_id is not null then
    req_denom := nullif(meta->>'denomination', '');
    req_location := nullif(meta->>'location_name', '');
    
    -- Handle NTCOG naming
    if req_denom ilike '%New Testament Church of God%' then
      computed_display_name := coalesce(req_location, profile_place_name) || ' NTCOG';
    else
      computed_display_name := profile_place_name;
    end if;

    insert into public.churches (
      id,
      "placeId",
      name,
      display_name,
      address,
      denomination,
      normalized_denomination,
      location_name,
      pastor_or_admin_name,
      pastor_or_admin_email,
      pastor_or_admin_phone,
      "ownerUserId",
      timezone,
      status,
      approval_status,
      "createdAt"
    )
    values (
      profile_place_id,
      profile_place_id,
      computed_display_name, -- use the computed name as the main name so old queries don't break
      computed_display_name,
      nullif(meta->>'address', ''),
      req_denom,
      req_denom,
      req_location,
      nullif(meta->>'pastor_or_admin_name', ''),
      nullif(meta->>'pastor_or_admin_email', coalesce(new.email, '')),
      nullif(meta->>'pastor_or_admin_phone', profile_phone),
      new.id::text,
      coalesce(nullif(meta->>'timezone', ''), 'UTC'),
      'pending', -- status
      'pending', -- approval_status
      now()
    )
    on conflict ("placeId") do update
      set "ownerUserId" = excluded."ownerUserId",
          status = 'pending',
          approval_status = 'pending',
          name = coalesce(nullif(excluded.name, ''), public.churches.name),
          display_name = coalesce(nullif(excluded.display_name, ''), public.churches.display_name),
          address = coalesce(excluded.address, public.churches.address),
          denomination = coalesce(excluded.denomination, public.churches.denomination),
          location_name = coalesce(excluded.location_name, public.churches.location_name),
          pastor_or_admin_name = coalesce(excluded.pastor_or_admin_name, public.churches.pastor_or_admin_name),
          pastor_or_admin_email = coalesce(excluded.pastor_or_admin_email, public.churches.pastor_or_admin_email),
          pastor_or_admin_phone = coalesce(excluded.pastor_or_admin_phone, public.churches.pastor_or_admin_phone);
  end if;

  insert into public.users (
    id,
    uid,
    email,
    "fullName",
    phone,
    "placeId",
    "placeName",
    roles,
    "joinDate",
    "photoUrl",
    bio,
    "isDeveloper",
    "accountState",
    "approvalStatus"
  )
  values (
    new.id,
    new.id::text,
    coalesce(new.email, ''),
    coalesce(
      nullif(meta->>'fullName', ''),
      nullif(meta->>'full_name', ''),
      nullif(meta->>'name', ''),
      split_part(coalesce(new.email, 'Member'), '@', 1)
    ),
    profile_phone,
    profile_place_id,
    profile_place_name,
    profile_roles,
    profile_join_date,
    coalesce(nullif(meta->>'avatar_url', ''), ''),
    coalesce(nullif(meta->>'bio', ''), ''),
    false,
    coalesce(nullif(meta->>'accountState', ''), 'active'),
    'pending'
  )
  on conflict (uid) do update
    set email = excluded.email,
        "fullName" = coalesce(nullif(excluded."fullName", ''), public.users."fullName"),
        phone = coalesce(excluded.phone, public.users.phone),
        "placeId" = coalesce(excluded."placeId", public.users."placeId"),
        "placeName" = coalesce(excluded."placeName", public.users."placeName"),
        roles = case
          when array_length(excluded.roles, 1) is null then public.users.roles
          else excluded.roles
        end,
        "joinDate" = coalesce(public.users."joinDate", excluded."joinDate"),
        "photoUrl" = coalesce(nullif(excluded."photoUrl", ''), public.users."photoUrl"),
        bio = coalesce(nullif(excluded.bio, ''), public.users.bio),
        "accountState" = coalesce(excluded."accountState", public.users."accountState"),
        "approvalStatus" = coalesce(excluded."approvalStatus", public.users."approvalStatus");

  if creates_church and profile_place_id is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name = 'approvalStatus'
    ) then
      execute
        'update public.users
           set "accountState" = ''active'',
               "approvalStatus" = ''pending''
         where "placeId" = $1
           and "accountState" = ''awaiting_church_signup'''
      using profile_place_id;
    else
      update public.users
        set "accountState" = 'active'
        where "placeId" = profile_place_id
          and "accountState" = 'awaiting_church_signup';
    end if;
  end if;

  return new;
end;
$$;
