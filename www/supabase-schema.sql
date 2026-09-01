-- ============================================================
-- Loveway — poora Supabase schema
-- Chalane ka tareeka: Supabase Dashboard > SQL Editor > New query
-- > ye poori file paste karo > Run.
-- Dobara chalane par bhi safe hai (idempotent).
--
-- PART A (section 1-8)  : auth, profiles, login RPC, contact form
-- PART B (section 9-21) : friends, family, feed, chat, community,
--                         activity board, goals/streak/gifts,
--                         timeline, notifications, realtime
--
-- Postgres 16 par test kiya gaya: 20 tables, 61 RLS policies,
-- 33 functions — do baar chala kar bhi clean.
-- ============================================================

-- ============================================================
-- PART A — auth, profiles, login
-- ============================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  username    text,
  email       text,
  mobile      text,
  address     text,
  city        text,
  bio         text,
  gender      text,
  dob         date,
  avatar_url  text,
  provider    text,
  status      text not null default 'approved',
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- naye columns (agar table pehle se hai to)
alter table public.profiles add column if not exists city       text;
alter table public.profiles add column if not exists bio        text;
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists provider   text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- APPROVAL STEP HATA DIYA GAYA HAI.
-- Naya signup seedha 'approved' banta hai. 'pending' ab exist
-- nahi karta. Sirf 'rejected' bacha hai — matlab admin ne us
-- account ko block kar diya.
-- ============================================================
alter table public.profiles alter column status set default 'approved';
update public.profiles set status = 'approved' where status <> 'rejected';

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('approved', 'rejected'));

do $$ begin
  alter table public.profiles
    add constraint profiles_gender_check
    check (gender is null or gender in ('male', 'female', 'other'));
exception when duplicate_object then null; end $$;

-- username case-insensitive unique, mobile unique
create unique index if not exists profiles_username_key on public.profiles (lower(username));
create unique index if not exists profiles_mobile_key   on public.profiles (mobile);
create index        if not exists profiles_status_idx   on public.profiles (status);

-- ------------------------------------------------------------
-- 2. Helper: kya current user admin hai?
--    (RLS policy ke andar profiles select karne se recursion
--     hota hai, isliye security definer function.)
-- ------------------------------------------------------------
create or replace function public.lw_is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;

revoke all on function public.lw_is_admin(uuid) from public;
grant execute on function public.lw_is_admin(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Row Level Security
--    - user apni row padh/likh sakta hai
--    - admin sab kuch padh/likh sakta hai
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_insert_own   on public.profiles;
drop policy if exists profiles_update_own   on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.lw_is_admin());

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.lw_is_admin()) with check (public.lw_is_admin());

-- ------------------------------------------------------------
-- 4. Guard trigger: normal user khud ko approve ya admin
--    nahi bana sakta (chahe browser se kuch bhi bheje).
-- ------------------------------------------------------------
create or replace function public.lw_protect_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.lw_is_admin(auth.uid()) then
    new.status     := old.status;
    new.is_admin   := old.is_admin;
    new.created_at := old.created_at;
  end if;
  new.id         := old.id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lw_profiles_protect on public.profiles;
create trigger lw_profiles_protect
  before update on public.profiles
  for each row execute function public.lw_protect_profile();

-- ------------------------------------------------------------
-- 5. Naya signup (email/password, Google, Spotify — sab)
--    auth.users me row bante hi profile ban jaati hai.
-- ------------------------------------------------------------
create or replace function public.lw_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := nullif(trim(coalesce(m ->> 'username', '')), '');
  mob   text := nullif(regexp_replace(coalesce(m ->> 'mobile', new.phone, ''), '[^0-9+]', '', 'g'), '');
  dobv  date;
begin
  begin
    dobv := nullif(m ->> 'dob', '')::date;
  exception when others then
    dobv := null;
  end;

  begin
    insert into public.profiles
      (id, full_name, username, email, mobile, address, gender, dob, avatar_url, provider)
    values (
      new.id,
      nullif(trim(coalesce(m ->> 'full_name', m ->> 'name', '')), ''),
      uname,
      new.email,
      mob,
      nullif(trim(coalesce(m ->> 'address', '')), ''),
      nullif(trim(coalesce(m ->> 'gender', '')), ''),
      dobv,
      nullif(coalesce(m ->> 'avatar_url', m ->> 'picture'), ''),
      coalesce(new.raw_app_meta_data ->> 'provider', 'email')
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    -- username / mobile pehle se liya hua hai: profile bana do,
    -- user complete-profile.html pe naya chun lega
    insert into public.profiles (id, full_name, email, provider)
    values (
      new.id,
      nullif(trim(coalesce(m ->> 'full_name', m ->> 'name', '')), ''),
      new.email,
      coalesce(new.raw_app_meta_data ->> 'provider', 'email')
    )
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.lw_handle_new_user();

-- email badle to profile me bhi update ho jaaye
create or replace function public.lw_sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email, updated_at = now() where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function public.lw_sync_user_email();

-- ------------------------------------------------------------
-- 6. Login by username / mobile
--    Frontend Supabase Auth ko email chahiye, isliye ye RPC
--    username ya mobile se email nikaal deta hai.
--    NOTE: is RPC se koi username daal ke email pata kar sakta
--    hai. Agar ye chinta ho to niche wali grant hata dein aur
--    sirf email se login rakhein.
-- ------------------------------------------------------------
create or replace function public.lw_login_email(p_login text)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v     text := lower(trim(coalesce(p_login, '')));
  digits text := regexp_replace(coalesce(p_login, ''), '[^0-9]', '', 'g');
  out_email text;
begin
  if v = '' then return null; end if;
  if position('@' in v) > 1 then return v; end if;

  select u.email into out_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = v
  limit 1;

  if out_email is not null then return out_email; end if;

  if length(digits) >= 10 then
    select u.email into out_email
    from public.profiles p
    join auth.users u on u.id = p.id
    where right(regexp_replace(coalesce(p.mobile, ''), '[^0-9]', '', 'g'), 10) = right(digits, 10)
    limit 1;
  end if;

  return out_email;
end;
$$;

revoke all on function public.lw_login_email(text) from public;
grant execute on function public.lw_login_email(text) to anon, authenticated;

-- username available hai ya nahi (signup form ke liye)
create or replace function public.lw_username_available(p_username text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(trim(coalesce(p_username, '')))
  );
$$;

revoke all on function public.lw_username_available(text) from public;
grant execute on function public.lw_username_available(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. Contact form ke messages
--    (contact.html se seedha yahan aate hain)
-- ------------------------------------------------------------
create table if not exists public.contact_messages (
  id         bigint generated by default as identity primary key,
  name       text not null,
  mobile     text,
  email      text,
  subject    text,
  message    text not null,
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

drop policy if exists contact_insert_anyone on public.contact_messages;
drop policy if exists contact_read_admin    on public.contact_messages;
drop policy if exists contact_update_admin  on public.contact_messages;

-- koi bhi message bhej sakta hai...
create policy contact_insert_anyone on public.contact_messages
  for insert to anon, authenticated with check (
    length(coalesce(name, '')) between 1 and 120 and
    length(coalesce(message, '')) between 1 and 4000
  );

-- ...par padh sirf admin sakta hai
create policy contact_read_admin on public.contact_messages
  for select to authenticated using (public.lw_is_admin());

create policy contact_update_admin on public.contact_messages
  for update to authenticated using (public.lw_is_admin()) with check (public.lw_is_admin());

-- ------------------------------------------------------------
-- 8. Pehla admin banayein
--    Neeche wali line me apna username daal kar chalayein
--    (pehle signup karke account bana lein).
-- ------------------------------------------------------------
-- update public.profiles
--    set is_admin = true, status = 'approved', updated_at = now()
--  where lower(username) = lower('ravi');

-- ya email se:
-- update public.profiles
--    set is_admin = true, status = 'approved', updated_at = now()
--  where lower(email) = lower('you@example.com');


-- ============================================================
-- PART B — Loveway app schema (saare features)
-- Part A (upar wala profiles/auth wala hissa) ke baad chalta hai.
-- Dobara chalane par bhi safe hai.
-- ============================================================


-- ------------------------------------------------------------
-- 9. profiles ke naye columns (Phase 1 — Profile)
-- ------------------------------------------------------------
alter table public.profiles add column if not exists profession          text;
alter table public.profiles add column if not exists relationship_status text;
alter table public.profiles add column if not exists partner_id          uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists story               text;
alter table public.profiles add column if not exists favourites          jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists hobbies             text[] not null default '{}';
alter table public.profiles add column if not exists cover_url           text;
alter table public.profiles add column if not exists pincode             text;

do $$ begin
  alter table public.profiles
    add constraint profiles_relationship_check
    check (relationship_status is null or relationship_status in
      ('single', 'in_relationship', 'engaged', 'married', 'complicated', 'private'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_partner_not_self check (partner_id is null or partner_id <> id);
exception when duplicate_object then null; end $$;

create index if not exists profiles_partner_idx on public.profiles (partner_id);
create index if not exists profiles_city_idx    on public.profiles (lower(city));

-- updated_at khud set ho jaaye — har table par lagega
create or replace function public.lw_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ------------------------------------------------------------
-- 10. Public profile view
--     profiles table par RLS tight hai (sirf apni row + admin).
--     Doosron ki profile dekhne ke liye ye view use karein —
--     ismein mobile / address jaise private column nahi hain.
--     Frontend: LW.sb.from('lw_public_profiles')...
-- ------------------------------------------------------------
-- NOTE: pinned_song_* columns (section 28, neeche) is view mein bhi
-- select hote hain, lekin wahan add hote hain — is file ko upar se
-- neeche chalane par yahan par ye columns abhi exist nahi karte, isliye
-- yahan inhe include nahi kiya. View section 28 ke end mein dobara
-- (create or replace se) banti hai jab columns ban chuke hote hain.
create or replace view public.lw_public_profiles
with (security_invoker = false) as
  select
    p.id, p.full_name, p.username, p.avatar_url, p.cover_url,
    p.city, p.bio, p.gender, p.profession, p.story,
    p.relationship_status, p.partner_id, p.hobbies, p.favourites,
    p.dob, p.created_at,
    to_char(p.dob, 'MM-DD') as birthday_md   -- saal chhupa rehta hai
  from public.profiles p
  where p.status <> 'rejected';

revoke all on public.lw_public_profiles from public, anon;
grant select on public.lw_public_profiles to authenticated;


-- ------------------------------------------------------------
-- 11. Phase 0 — Friends
--     Yahan ka 'pending' friend-request ka hai; signup approval
--     se iska koi lena-dena nahi.
-- ------------------------------------------------------------
create table if not exists public.friendships (
  id            bigint generated by default as identity primary key,
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  addressee_id  uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint friendship_not_self check (requester_id <> addressee_id)
);

-- ek hi jodi dono taraf se do baar na bane
create unique index if not exists friendships_pair_key on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

drop trigger if exists lw_friendships_touch on public.friendships;
create trigger lw_friendships_touch before update on public.friendships
  for each row execute function public.lw_touch_updated_at();

-- helper: do log dost hain? (RLS ke andar recursion se bachne ke liye)
create or replace function public.lw_are_friends(a uuid, b uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;
revoke all on function public.lw_are_friends(uuid, uuid) from public;
grant execute on function public.lw_are_friends(uuid, uuid) to authenticated, service_role;

-- helper: kya ye mera partner hai?
create or replace function public.lw_is_partner(a uuid, b uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where (p.id = a and p.partner_id = b) or (p.id = b and p.partner_id = a)
  );
$$;
revoke all on function public.lw_is_partner(uuid, uuid) from public;
grant execute on function public.lw_is_partner(uuid, uuid) to authenticated, service_role;

alter table public.friendships enable row level security;

drop policy if exists friendships_select on public.friendships;
drop policy if exists friendships_insert on public.friendships;
drop policy if exists friendships_update on public.friendships;
drop policy if exists friendships_delete on public.friendships;

create policy friendships_select on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid() or public.lw_is_admin());

-- request sirf apni taraf se bhej sakte ho
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');

-- accept / decline / block — dono mein se koi bhi
create policy friendships_update on public.friendships
  for update to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid())
  with check (requester_id = auth.uid() or addressee_id = auth.uid());

create policy friendships_delete on public.friendships
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid() or public.lw_is_admin());


-- ------------------------------------------------------------
-- 12. Phase 2 — Family & Family Chart
--     Har user apna tree banata hai. Node ya to Loveway member
--     ho sakta hai (profile_id), ya bas ek naam (full_name).
--     parent_id se tree, spouse_id se jodi banti hai.
-- ------------------------------------------------------------
create table if not exists public.family_members (
  id          bigint generated by default as identity primary key,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  profile_id  uuid references public.profiles (id) on delete set null,
  full_name   text,
  relation    text not null default 'other'
              check (relation in ('self', 'father', 'mother', 'brother', 'sister',
                'son', 'daughter', 'spouse', 'grandfather', 'grandmother',
                'grandson', 'granddaughter', 'uncle', 'aunt', 'cousin',
                'nephew', 'niece', 'father_in_law', 'mother_in_law', 'other')),
  gender      text check (gender is null or gender in ('male', 'female', 'other')),
  dob         date,
  photo_url   text,
  notes       text,
  parent_id   bigint references public.family_members (id) on delete set null,
  spouse_id   bigint references public.family_members (id) on delete set null,
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint family_needs_a_name check (profile_id is not null or nullif(trim(coalesce(full_name, '')), '') is not null)
);

create index if not exists family_owner_idx  on public.family_members (owner_id);
create index if not exists family_parent_idx on public.family_members (parent_id);
create index if not exists family_profile_idx on public.family_members (profile_id);

drop trigger if exists lw_family_touch on public.family_members;
create trigger lw_family_touch before update on public.family_members
  for each row execute function public.lw_touch_updated_at();

alter table public.family_members enable row level security;

drop policy if exists family_select on public.family_members;
drop policy if exists family_write  on public.family_members;

-- apna tree hamesha; doosre ka tab jab public ho ya dost ho
create policy family_select on public.family_members
  for select to authenticated
  using (
    owner_id = auth.uid()
    or profile_id = auth.uid()
    or (is_public and public.lw_are_friends(auth.uid(), owner_id))
    or public.lw_is_admin()
  );

create policy family_write on public.family_members
  for all to authenticated
  using (owner_id = auth.uid() or public.lw_is_admin())
  with check (owner_id = auth.uid() or public.lw_is_admin());

-- poora tree ek call mein (recursive) — frontend chart isi se banega
create or replace function public.lw_family_tree(p_owner uuid)
returns table (
  id bigint, parent_id bigint, spouse_id bigint, profile_id uuid,
  name text, relation text, gender text, dob date, photo_url text, depth int
)
language sql security definer stable
set search_path = public as $$
  with recursive roots as (
    select m.* from public.family_members m
    where m.owner_id = p_owner and m.parent_id is null
  ),
  tree as (
    select r.*, 0 as depth from roots r
    union all
    select c.*, t.depth + 1
    from public.family_members c
    join tree t on c.parent_id = t.id
    where t.depth < 12                     -- loop ho jaaye to bhi ruk jaaye
  )
  select t.id, t.parent_id, t.spouse_id, t.profile_id,
         coalesce(t.full_name, p.full_name, p.username) as name,
         t.relation, coalesce(t.gender, p.gender) as gender,
         coalesce(t.dob, p.dob) as dob,
         coalesce(t.photo_url, p.avatar_url) as photo_url,
         t.depth
  from tree t
  left join public.profiles p on p.id = t.profile_id
  where p_owner = auth.uid()
     or public.lw_are_friends(auth.uid(), p_owner)
     or public.lw_is_admin();
$$;
revoke all on function public.lw_family_tree(uuid) from public;
grant execute on function public.lw_family_tree(uuid) to authenticated;


-- ------------------------------------------------------------
-- 13. Phase 5 — Communities (area based)
--     Chat aur activity board dono isse jude hain, isliye
--     communities pehle bana rahe hain.
-- ------------------------------------------------------------
create table if not exists public.communities (
  id          bigint generated by default as identity primary key,
  name        text not null,
  slug        text not null,
  description text,
  city        text,
  pincode     text,
  cover_url   text,
  is_public   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint communities_name_len check (length(name) between 2 and 80)
);

create unique index if not exists communities_slug_key on public.communities (lower(slug));
create index if not exists communities_city_idx on public.communities (lower(city));

drop trigger if exists lw_communities_touch on public.communities;
create trigger lw_communities_touch before update on public.communities
  for each row execute function public.lw_touch_updated_at();

create table if not exists public.community_members (
  community_id bigint not null references public.communities (id) on delete cascade,
  user_id      uuid   not null references public.profiles (id) on delete cascade,
  role         text   not null default 'member' check (role in ('member', 'moderator', 'owner')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index if not exists community_members_user_idx on public.community_members (user_id);

create or replace function public.lw_in_community(p_community bigint, p_user uuid default auth.uid())
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.community_members cm
    where cm.community_id = p_community and cm.user_id = p_user
  );
$$;
revoke all on function public.lw_in_community(bigint, uuid) from public;
grant execute on function public.lw_in_community(bigint, uuid) to authenticated, service_role;

create or replace function public.lw_community_role(p_community bigint, p_user uuid default auth.uid())
returns text language sql security definer stable
set search_path = public as $$
  select cm.role from public.community_members cm
  where cm.community_id = p_community and cm.user_id = p_user;
$$;
revoke all on function public.lw_community_role(bigint, uuid) from public;
grant execute on function public.lw_community_role(bigint, uuid) to authenticated, service_role;

alter table public.communities       enable row level security;
alter table public.community_members enable row level security;

drop policy if exists communities_select on public.communities;
drop policy if exists communities_insert on public.communities;
drop policy if exists communities_update on public.communities;
drop policy if exists cmembers_select    on public.community_members;
drop policy if exists cmembers_join      on public.community_members;
drop policy if exists cmembers_leave     on public.community_members;
drop policy if exists cmembers_manage    on public.community_members;

create policy communities_select on public.communities
  for select to authenticated
  using (is_public or public.lw_in_community(id) or public.lw_is_admin());

create policy communities_insert on public.communities
  for insert to authenticated with check (created_by = auth.uid());

create policy communities_update on public.communities
  for update to authenticated
  using (public.lw_community_role(id) in ('owner', 'moderator') or public.lw_is_admin())
  with check (public.lw_community_role(id) in ('owner', 'moderator') or public.lw_is_admin());

create policy cmembers_select on public.community_members
  for select to authenticated
  using (user_id = auth.uid() or public.lw_in_community(community_id) or public.lw_is_admin());

-- public community mein khud judo
create policy cmembers_join on public.community_members
  for insert to authenticated
  with check (
    user_id = auth.uid() and role = 'member'
    and exists (select 1 from public.communities c where c.id = community_id and c.is_public)
  );

create policy cmembers_leave on public.community_members
  for delete to authenticated
  using (user_id = auth.uid()
      or public.lw_community_role(community_id) in ('owner', 'moderator')
      or public.lw_is_admin());

create policy cmembers_manage on public.community_members
  for update to authenticated
  using (public.lw_community_role(community_id) in ('owner', 'moderator') or public.lw_is_admin())
  with check (public.lw_community_role(community_id) in ('owner', 'moderator') or public.lw_is_admin());

-- community banane wala apne aap owner ban jaaye
create or replace function public.lw_community_owner()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.community_members (community_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists lw_community_owner_trg on public.communities;
create trigger lw_community_owner_trg after insert on public.communities
  for each row execute function public.lw_community_owner();


-- ------------------------------------------------------------
-- 14. Phase 3 — Feed (posts, reactions, comments)
-- ------------------------------------------------------------
create table if not exists public.posts (
  id            bigint generated by default as identity primary key,
  author_id     uuid not null references public.profiles (id) on delete cascade,
  content       text,
  kind          text not null default 'text'
                check (kind in ('text', 'photo', 'song', 'announcement', 'dedication', 'story')),
  media_url     text,
  song_title    text,
  song_artist   text,
  dedicated_to  uuid references public.profiles (id) on delete set null,
  visibility    text not null default 'friends'
                check (visibility in ('public', 'friends', 'partner', 'community', 'private')),
  community_id  bigint references public.communities (id) on delete cascade,
  expires_at    timestamptz,                    -- 'story' ke liye (24 ghante)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint posts_needs_body check (
    nullif(trim(coalesce(content, '')), '') is not null
    or media_url is not null or song_title is not null
  ),
  constraint posts_community_needed check (visibility <> 'community' or community_id is not null)
);

create index if not exists posts_author_idx    on public.posts (author_id, created_at desc);
create index if not exists posts_created_idx   on public.posts (created_at desc);
create index if not exists posts_community_idx on public.posts (community_id, created_at desc);

drop trigger if exists lw_posts_touch on public.posts;
create trigger lw_posts_touch before update on public.posts
  for each row execute function public.lw_touch_updated_at();

-- ek post dikh sakti hai ya nahi — comments/reactions bhi isi se chalte hain
create or replace function public.lw_can_see_post(p_post bigint, p_user uuid default auth.uid())
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post
      and (p.expires_at is null or p.expires_at > now())
      and (
        p.author_id = p_user
        or p.visibility = 'public'
        or (p.visibility = 'friends'   and public.lw_are_friends(p_user, p.author_id))
        or (p.visibility = 'partner'   and public.lw_is_partner(p_user, p.author_id))
        or (p.visibility = 'community' and public.lw_in_community(p.community_id, p_user))
      )
  );
$$;
revoke all on function public.lw_can_see_post(bigint, uuid) from public;
grant execute on function public.lw_can_see_post(bigint, uuid) to authenticated, service_role;

create table if not exists public.post_reactions (
  post_id    bigint not null references public.posts (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  kind       text   not null default 'love' check (kind in ('love', 'like', 'haha', 'wow', 'sad')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_reactions_user_idx on public.post_reactions (user_id);

create table if not exists public.post_comments (
  id         bigint generated by default as identity primary key,
  post_id    bigint not null references public.posts (id) on delete cascade,
  author_id  uuid   not null references public.profiles (id) on delete cascade,
  content    text   not null check (length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.posts          enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments  enable row level security;

drop policy if exists posts_select     on public.posts;
drop policy if exists posts_insert     on public.posts;
drop policy if exists posts_update     on public.posts;
drop policy if exists posts_delete     on public.posts;
drop policy if exists reactions_select on public.post_reactions;
drop policy if exists reactions_write  on public.post_reactions;
drop policy if exists reactions_delete on public.post_reactions;
drop policy if exists comments_select  on public.post_comments;
drop policy if exists comments_insert  on public.post_comments;
drop policy if exists comments_delete  on public.post_comments;

create policy posts_select on public.posts
  for select to authenticated
  using (
    author_id = auth.uid()
    or public.lw_is_admin()
    or ((expires_at is null or expires_at > now()) and (
         visibility = 'public'
      or (visibility = 'friends'   and public.lw_are_friends(auth.uid(), author_id))
      or (visibility = 'partner'   and public.lw_is_partner(auth.uid(), author_id))
      or (visibility = 'community' and public.lw_in_community(community_id))
    ))
  );

create policy posts_insert on public.posts
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (community_id is null or public.lw_in_community(community_id))
  );

create policy posts_update on public.posts
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy posts_delete on public.posts
  for delete to authenticated
  using (author_id = auth.uid() or public.lw_is_admin());

create policy reactions_select on public.post_reactions
  for select to authenticated using (public.lw_can_see_post(post_id));

create policy reactions_write on public.post_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.lw_can_see_post(post_id));

create policy reactions_delete on public.post_reactions
  for delete to authenticated using (user_id = auth.uid());

create policy comments_select on public.post_comments
  for select to authenticated using (public.lw_can_see_post(post_id));

create policy comments_insert on public.post_comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.lw_can_see_post(post_id));

create policy comments_delete on public.post_comments
  for delete to authenticated
  using (author_id = auth.uid()
      or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
      or public.lw_is_admin());


-- ------------------------------------------------------------
-- 15. Phase 4 — Chat (1-on-1, group, boys group, community)
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id           bigint generated by default as identity primary key,
  kind         text not null default 'direct'
               check (kind in ('direct', 'group', 'community')),
  title        text,
  photo_url    text,
  community_id bigint references public.communities (id) on delete cascade,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists conversations_community_idx on public.conversations (community_id);

create table if not exists public.conversation_members (
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  user_id         uuid   not null references public.profiles (id) on delete cascade,
  role            text   not null default 'member' check (role in ('member', 'admin')),
  last_read_at    timestamptz,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conv_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id              bigint generated by default as identity primary key,
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  sender_id       uuid   not null references public.profiles (id) on delete cascade,
  content         text,
  kind            text not null default 'text'
                  check (kind in ('text', 'song', 'image', 'gift', 'system')),
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  constraint messages_needs_body check (
    nullif(trim(coalesce(content, '')), '') is not null or meta <> '{}'::jsonb
  )
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at desc);

create or replace function public.lw_in_conversation(p_conv bigint, p_user uuid default auth.uid())
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conv and cm.user_id = p_user
  );
$$;
revoke all on function public.lw_in_conversation(bigint, uuid) from public;
grant execute on function public.lw_in_conversation(bigint, uuid) to authenticated, service_role;

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

drop policy if exists conv_select  on public.conversations;
drop policy if exists conv_insert  on public.conversations;
drop policy if exists conv_update  on public.conversations;
drop policy if exists convm_select on public.conversation_members;
drop policy if exists convm_insert on public.conversation_members;
drop policy if exists convm_update on public.conversation_members;
drop policy if exists convm_delete on public.conversation_members;
drop policy if exists msg_select   on public.messages;
drop policy if exists msg_insert   on public.messages;
drop policy if exists msg_delete   on public.messages;

create policy conv_select on public.conversations
  for select to authenticated
  using (public.lw_in_conversation(id)
      or (kind = 'community' and public.lw_in_community(community_id))
      or public.lw_is_admin());

create policy conv_insert on public.conversations
  for insert to authenticated with check (created_by = auth.uid());

create policy conv_update on public.conversations
  for update to authenticated
  using (public.lw_in_conversation(id)) with check (public.lw_in_conversation(id));

create policy convm_select on public.conversation_members
  for select to authenticated
  using (user_id = auth.uid() or public.lw_in_conversation(conversation_id) or public.lw_is_admin());

-- khud judo (community chat) ya kisi member ko add karo
create policy convm_insert on public.conversation_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.lw_in_conversation(conversation_id)
    or exists (select 1 from public.conversations c
               where c.id = conversation_id and c.created_by = auth.uid())
  );

create policy convm_update on public.conversation_members
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy convm_delete on public.conversation_members
  for delete to authenticated
  using (user_id = auth.uid() or public.lw_is_admin());

create policy msg_select on public.messages
  for select to authenticated
  using (public.lw_in_conversation(conversation_id) or public.lw_is_admin());

create policy msg_insert on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.lw_in_conversation(conversation_id));

create policy msg_delete on public.messages
  for delete to authenticated
  using (sender_id = auth.uid() or public.lw_is_admin());

-- chat banane wala apne aap member + admin
create or replace function public.lw_conv_creator_member()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.conversation_members (conversation_id, user_id, role)
    values (new.id, new.created_by, 'admin') on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists lw_conv_creator_trg on public.conversations;
create trigger lw_conv_creator_trg after insert on public.conversations
  for each row execute function public.lw_conv_creator_member();

-- do logon ka direct chat — hai to wahi do, warna bana do
create or replace function public.lw_direct_conversation(p_other uuid)
returns bigint language plpgsql security definer
set search_path = public as $$
declare
  me   uuid := auth.uid();
  cid  bigint;
begin
  if me is null or p_other is null or me = p_other then
    raise exception 'invalid conversation request';
  end if;

  select c.id into cid
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.user_id = me
  join public.conversation_members b on b.conversation_id = c.id and b.user_id = p_other
  where c.kind = 'direct'
  limit 1;

  if cid is not null then return cid; end if;

  insert into public.conversations (kind, created_by) values ('direct', me) returning id into cid;
  insert into public.conversation_members (conversation_id, user_id)
  values (cid, me), (cid, p_other) on conflict do nothing;

  return cid;
end;
$$;
revoke all on function public.lw_direct_conversation(uuid) from public;
grant execute on function public.lw_direct_conversation(uuid) to authenticated;


-- ------------------------------------------------------------
-- 16. Phase 6 — Activity Board
-- ------------------------------------------------------------
create table if not exists public.activities (
  id           bigint generated by default as identity primary key,
  host_id      uuid not null references public.profiles (id) on delete cascade,
  community_id bigint references public.communities (id) on delete cascade,
  title        text not null check (length(title) between 3 and 140),
  description  text,
  location     text,
  city         text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  capacity     int check (capacity is null or capacity > 0),
  cover_url    text,
  status       text not null default 'open' check (status in ('open', 'full', 'cancelled', 'done')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists activities_when_idx      on public.activities (starts_at);
create index if not exists activities_community_idx on public.activities (community_id, starts_at);

drop trigger if exists lw_activities_touch on public.activities;
create trigger lw_activities_touch before update on public.activities
  for each row execute function public.lw_touch_updated_at();

create table if not exists public.activity_participants (
  activity_id bigint not null references public.activities (id) on delete cascade,
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  status      text   not null default 'going' check (status in ('going', 'interested', 'cancelled')),
  created_at  timestamptz not null default now(),
  primary key (activity_id, user_id)
);
create index if not exists activity_parts_user_idx on public.activity_participants (user_id);

alter table public.activities            enable row level security;
alter table public.activity_participants enable row level security;

drop policy if exists activities_select on public.activities;
drop policy if exists activities_insert on public.activities;
drop policy if exists activities_write  on public.activities;
drop policy if exists aparts_select     on public.activity_participants;
drop policy if exists aparts_join       on public.activity_participants;
drop policy if exists aparts_update     on public.activity_participants;
drop policy if exists aparts_delete     on public.activity_participants;

create policy activities_select on public.activities
  for select to authenticated
  using (community_id is null or public.lw_in_community(community_id) or public.lw_is_admin());

create policy activities_insert on public.activities
  for insert to authenticated
  with check (host_id = auth.uid() and (community_id is null or public.lw_in_community(community_id)));

create policy activities_write on public.activities
  for all to authenticated
  using (host_id = auth.uid() or public.lw_is_admin())
  with check (host_id = auth.uid() or public.lw_is_admin());

create policy aparts_select on public.activity_participants
  for select to authenticated
  using (user_id = auth.uid()
      or exists (select 1 from public.activities a
                 where a.id = activity_id
                   and (a.host_id = auth.uid()
                     or a.community_id is null
                     or public.lw_in_community(a.community_id))));

create policy aparts_join on public.activity_participants
  for insert to authenticated with check (user_id = auth.uid());

create policy aparts_update on public.activity_participants
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy aparts_delete on public.activity_participants
  for delete to authenticated
  using (user_id = auth.uid()
      or exists (select 1 from public.activities a where a.id = activity_id and a.host_id = auth.uid()));


-- ------------------------------------------------------------
-- 17. Phase 7 — Goals, Chain (streak), Gifts
-- ------------------------------------------------------------
create table if not exists public.goals (
  id          bigint generated by default as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (length(title) between 2 and 140),
  description text,
  kind        text not null default 'daily' check (kind in ('daily', 'weekly', 'once')),
  target_date date,
  is_public   boolean not null default false,
  status      text not null default 'active' check (status in ('active', 'done', 'dropped')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id, status);

drop trigger if exists lw_goals_touch on public.goals;
create trigger lw_goals_touch before update on public.goals
  for each row execute function public.lw_touch_updated_at();

create table if not exists public.goal_checkins (
  id         bigint generated by default as identity primary key,
  goal_id    bigint not null references public.goals (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  day        date   not null default current_date,
  note       text,
  created_at timestamptz not null default now(),
  unique (goal_id, day)
);
create index if not exists goal_checkins_user_idx on public.goal_checkins (user_id, day desc);

-- chain / streak — Snapchat jaisa
create table if not exists public.streaks (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  current_count int not null default 0,
  longest_count int not null default 0,
  last_day      date,
  updated_at    timestamptz not null default now()
);

create or replace function public.lw_touch_streak(p_user uuid)
returns int language plpgsql security definer
set search_path = public as $$
declare
  s public.streaks%rowtype;
  n int;
begin
  select * into s from public.streaks where user_id = p_user for update;

  if not found then
    insert into public.streaks (user_id, current_count, longest_count, last_day)
    values (p_user, 1, 1, current_date);
    return 1;
  end if;

  if s.last_day = current_date then
    return s.current_count;                              -- aaj ka ho chuka
  elsif s.last_day = current_date - 1 then
    n := s.current_count + 1;                            -- chain jaari
  else
    n := 1;                                              -- chain toot gayi
  end if;

  update public.streaks
     set current_count = n,
         longest_count = greatest(longest_count, n),
         last_day      = current_date,
         updated_at    = now()
   where user_id = p_user;

  return n;
end;
$$;
revoke all on function public.lw_touch_streak(uuid) from public;
grant execute on function public.lw_touch_streak(uuid) to authenticated, service_role;

-- post daalte hi chain badh jaaye
create or replace function public.lw_streak_on_post()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  perform public.lw_touch_streak(new.author_id);
  return new;
end;
$$;
drop trigger if exists lw_streak_post_trg on public.posts;
create trigger lw_streak_post_trg after insert on public.posts
  for each row execute function public.lw_streak_on_post();

create or replace function public.lw_streak_on_checkin()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  perform public.lw_touch_streak(new.user_id);
  return new;
end;
$$;
drop trigger if exists lw_streak_checkin_trg on public.goal_checkins;
create trigger lw_streak_checkin_trg after insert on public.goal_checkins
  for each row execute function public.lw_streak_on_checkin();

create table if not exists public.gifts (
  id          bigint generated by default as identity primary key,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  kind        text not null default 'gift' check (kind in ('gift', 'restaurant', 'song', 'flower', 'card')),
  title       text not null,
  message     text,
  media_url   text,
  opened_at   timestamptz,
  created_at  timestamptz not null default now(),
  constraint gift_not_self check (sender_id <> receiver_id)
);
create index if not exists gifts_receiver_idx on public.gifts (receiver_id, created_at desc);

alter table public.goals         enable row level security;
alter table public.goal_checkins enable row level security;
alter table public.streaks       enable row level security;
alter table public.gifts         enable row level security;

drop policy if exists goals_select    on public.goals;
drop policy if exists goals_write     on public.goals;
drop policy if exists checkins_select on public.goal_checkins;
drop policy if exists checkins_write  on public.goal_checkins;
drop policy if exists streaks_select  on public.streaks;
drop policy if exists gifts_select    on public.gifts;
drop policy if exists gifts_insert    on public.gifts;
drop policy if exists gifts_update    on public.gifts;

create policy goals_select on public.goals
  for select to authenticated
  using (user_id = auth.uid()
      or (is_public and public.lw_are_friends(auth.uid(), user_id))
      or public.lw_is_admin());

create policy goals_write on public.goals
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy checkins_select on public.goal_checkins
  for select to authenticated
  using (user_id = auth.uid()
      or exists (select 1 from public.goals g
                 where g.id = goal_id and g.is_public
                   and public.lw_are_friends(auth.uid(), g.user_id)));

create policy checkins_write on public.goal_checkins
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy streaks_select on public.streaks
  for select to authenticated
  using (user_id = auth.uid() or public.lw_are_friends(auth.uid(), user_id) or public.lw_is_admin());

create policy gifts_select on public.gifts
  for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid() or public.lw_is_admin());

create policy gifts_insert on public.gifts
  for insert to authenticated with check (sender_id = auth.uid());

create policy gifts_update on public.gifts
  for update to authenticated
  using (receiver_id = auth.uid()) with check (receiver_id = auth.uid());


-- ------------------------------------------------------------
-- 18. Current Timeline — profile par activity history
--     Triggers khud bharte hain, koi manual insert nahi.
-- ------------------------------------------------------------
create table if not exists public.timeline_events (
  id         bigint generated by default as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  title      text not null,
  ref_table  text,
  ref_id     text,
  is_public  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists timeline_user_idx on public.timeline_events (user_id, created_at desc);

alter table public.timeline_events enable row level security;

drop policy if exists timeline_select on public.timeline_events;
drop policy if exists timeline_delete on public.timeline_events;

create policy timeline_select on public.timeline_events
  for select to authenticated
  using (user_id = auth.uid()
      or (is_public and public.lw_are_friends(auth.uid(), user_id))
      or public.lw_is_admin());

create policy timeline_delete on public.timeline_events
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.lw_timeline_add(
  p_user uuid, p_kind text, p_title text,
  p_table text default null, p_id text default null, p_public boolean default true)
returns void language sql security definer
set search_path = public as $$
  insert into public.timeline_events (user_id, kind, title, ref_table, ref_id, is_public)
  values (p_user, p_kind, p_title, p_table, p_id, p_public);
$$;


-- ------------------------------------------------------------
-- 19. Notifications (daily notification wala point)
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id         bigint generated by default as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notif_select on public.notifications;
drop policy if exists notif_update on public.notifications;
drop policy if exists notif_delete on public.notifications;

create policy notif_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- sirf "padh liya" mark karne ke liye (insert sirf triggers se hota hai)
create policy notif_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notif_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.lw_notify(
  p_user uuid, p_actor uuid, p_kind text, p_title text,
  p_body text default null, p_link text default null)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  insert into public.notifications (user_id, actor_id, kind, title, body, link)
  values (p_user, p_actor, p_kind, p_title, p_body, p_link);
end;
$$;

-- friend request / accept
create or replace function public.lw_notify_friendship()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.lw_notify(new.addressee_id, new.requester_id,
      'friend_request', 'Nayi friend request', null, 'dashboard.html#friends');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    perform public.lw_notify(new.requester_id, new.addressee_id,
      'friend_accepted', 'Friend request accept ho gayi', null, 'dashboard.html#friends');
    perform public.lw_timeline_add(new.requester_id, 'friend', 'Naya dost juda', 'friendships', new.id::text);
    perform public.lw_timeline_add(new.addressee_id, 'friend', 'Naya dost juda', 'friendships', new.id::text);
  end if;
  return new;
end;
$$;
drop trigger if exists lw_notify_friendship_trg on public.friendships;
create trigger lw_notify_friendship_trg after insert or update on public.friendships
  for each row execute function public.lw_notify_friendship();

-- reaction / comment
create or replace function public.lw_notify_reaction()
returns trigger language plpgsql security definer
set search_path = public as $$
declare a uuid;
begin
  select author_id into a from public.posts where id = new.post_id;
  perform public.lw_notify(a, new.user_id, 'post_reaction', 'Tumhari post par reaction aaya');
  return new;
end;
$$;
drop trigger if exists lw_notify_reaction_trg on public.post_reactions;
create trigger lw_notify_reaction_trg after insert on public.post_reactions
  for each row execute function public.lw_notify_reaction();

create or replace function public.lw_notify_comment()
returns trigger language plpgsql security definer
set search_path = public as $$
declare a uuid;
begin
  select author_id into a from public.posts where id = new.post_id;
  perform public.lw_notify(a, new.author_id, 'post_comment', 'Tumhari post par comment aaya',
                           left(new.content, 120));
  return new;
end;
$$;
drop trigger if exists lw_notify_comment_trg on public.post_comments;
create trigger lw_notify_comment_trg after insert on public.post_comments
  for each row execute function public.lw_notify_comment();

-- gift
create or replace function public.lw_notify_gift()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  perform public.lw_notify(new.receiver_id, new.sender_id, 'gift', 'Tumhare liye ek gift aaya 🎁', new.title);
  perform public.lw_timeline_add(new.sender_id, 'gift', 'Gift bheja: ' || new.title, 'gifts', new.id::text, false);
  return new;
end;
$$;
drop trigger if exists lw_notify_gift_trg on public.gifts;
create trigger lw_notify_gift_trg after insert on public.gifts
  for each row execute function public.lw_notify_gift();

-- activity join
create or replace function public.lw_notify_activity_join()
returns trigger language plpgsql security definer
set search_path = public as $$
declare h uuid; ttl text;
begin
  select host_id, title into h, ttl from public.activities where id = new.activity_id;
  perform public.lw_notify(h, new.user_id, 'activity_join', 'Koi tumhari activity mein juda', ttl);
  return new;
end;
$$;
drop trigger if exists lw_notify_activity_join_trg on public.activity_participants;
create trigger lw_notify_activity_join_trg after insert on public.activity_participants
  for each row execute function public.lw_notify_activity_join();

-- naya message — sender ko chhod kar baaki sabko
create or replace function public.lw_notify_message()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, kind, title, body, link)
  select cm.user_id, new.sender_id, 'message', 'Naya message', left(new.content, 120),
         'dashboard.html#chat'
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.user_id <> new.sender_id;

  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists lw_notify_message_trg on public.messages;
create trigger lw_notify_message_trg after insert on public.messages
  for each row execute function public.lw_notify_message();

-- post banne par timeline entry
create or replace function public.lw_timeline_on_post()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  perform public.lw_timeline_add(new.author_id, 'post',
    case new.kind
      when 'song'       then 'Ek gaana dedicate kiya'
      when 'photo'      then 'Nayi photo post ki'
      when 'announcement' then 'Ek announcement ki'
      else 'Nayi post likhi'
    end,
    'posts', new.id::text, new.visibility = 'public');
  return new;
end;
$$;
drop trigger if exists lw_timeline_post_trg on public.posts;
create trigger lw_timeline_post_trg after insert on public.posts
  for each row execute function public.lw_timeline_on_post();


-- ------------------------------------------------------------
-- 20. Kaam ke helper views / functions (frontend ke liye)
-- ------------------------------------------------------------

-- meri friend list
create or replace function public.lw_my_friends()
returns table (id uuid, full_name text, username text, avatar_url text, city text)
language sql security definer stable
set search_path = public as $$
  select p.id, p.full_name, p.username, p.avatar_url, p.city
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and p.status <> 'rejected'
  order by p.full_name nulls last;
$$;
revoke all on function public.lw_my_friends() from public;
grant execute on function public.lw_my_friends() to authenticated;

-- agle 30 din ke birthdays (dost + partner)
create or replace function public.lw_upcoming_birthdays(p_days int default 30)
returns table (id uuid, full_name text, username text, avatar_url text, dob date, days_left int)
language sql security definer stable
set search_path = public as $$
  select f.id, f.full_name, f.username, f.avatar_url, p.dob,
         ((date_trunc('day',
             (make_date(extract(year from current_date)::int,
                        extract(month from p.dob)::int,
                        extract(day   from p.dob)::int)
              + case when make_date(extract(year from current_date)::int,
                                    extract(month from p.dob)::int,
                                    extract(day   from p.dob)::int) < current_date
                     then interval '1 year' else interval '0' end))::date
          - current_date))::int as days_left
  from public.lw_my_friends() f
  join public.profiles p on p.id = f.id
  where p.dob is not null
    and ((date_trunc('day',
            (make_date(extract(year from current_date)::int,
                       extract(month from p.dob)::int,
                       extract(day   from p.dob)::int)
             + case when make_date(extract(year from current_date)::int,
                                   extract(month from p.dob)::int,
                                   extract(day   from p.dob)::int) < current_date
                    then interval '1 year' else interval '0' end))::date
         - current_date))::int <= p_days
  order by days_left;
$$;
revoke all on function public.lw_upcoming_birthdays(int) from public;
grant execute on function public.lw_upcoming_birthdays(int) to authenticated;

-- unread notification count
create or replace function public.lw_unread_count()
returns int language sql security definer stable
set search_path = public as $$
  select count(*)::int from public.notifications
  where user_id = auth.uid() and not is_read;
$$;
revoke all on function public.lw_unread_count() from public;
grant execute on function public.lw_unread_count() to authenticated;

-- expire ho chuki stories saaf karo (pg_cron se roz chalao)
create or replace function public.lw_cleanup_expired()
returns void language sql security definer
set search_path = public as $$
  delete from public.posts where expires_at is not null and expires_at < now() - interval '1 day';
$$;


-- ------------------------------------------------------------
-- 21. Realtime (chat live chale)
--     Supabase Dashboard > Database > Replication se bhi
--     kar sakte hain; ye wahi kaam SQL se karta hai.
-- ------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.posts;
exception when duplicate_object then null; when undefined_object then null; end $$;


-- ------------------------------------------------------------
-- 22. Chat media (image/video/audio/sticker) + avatar upload
--     Spotify dedication song bhi 'song' kind hi use karta hai
--     (meta.dedication = true, meta.note = optional message).
-- ------------------------------------------------------------
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'song', 'image', 'video', 'audio', 'sticker', 'gift', 'system'));

insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
  values ('chat-media', 'chat-media', true)
  on conflict (id) do update set public = true;

drop policy if exists lw_avatars_select   on storage.objects;
drop policy if exists lw_avatars_insert   on storage.objects;
drop policy if exists lw_avatars_update   on storage.objects;
drop policy if exists lw_avatars_delete   on storage.objects;
drop policy if exists lw_chatmedia_select on storage.objects;
drop policy if exists lw_chatmedia_insert on storage.objects;
drop policy if exists lw_chatmedia_delete on storage.objects;

-- avatars/<user_id>/<file>  — public read, owner-only write
create policy lw_avatars_select on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy lw_avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy lw_avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy lw_avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- chat-media/<conversation_id>/<sender_id>/<file> — public read,
-- upload only if you're a member of that conversation, delete only your own file
create policy lw_chatmedia_select on storage.objects
  for select
  using (bucket_id = 'chat-media');

create policy lw_chatmedia_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and public.lw_in_conversation(nullif((storage.foldername(name))[1], '')::bigint)
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy lw_chatmedia_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[2] = auth.uid()::text);


-- ------------------------------------------------------------
-- 24. "Life Chain" — couple's shared Life Journey (dated, located,
--     photo+quote timeline entries) with threaded sub-updates
-- ------------------------------------------------------------

-- journey/<user_id>/<file> — public read, owner-only write
insert into storage.buckets (id, name, public)
  values ('journey', 'journey', true)
  on conflict (id) do update set public = true;

drop policy if exists lw_journey_media_select on storage.objects;
drop policy if exists lw_journey_media_insert on storage.objects;
drop policy if exists lw_journey_media_delete on storage.objects;

create policy lw_journey_media_select on storage.objects
  for select
  using (bucket_id = 'journey');

create policy lw_journey_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'journey' and (storage.foldername(name))[1] = auth.uid()::text);

create policy lw_journey_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'journey' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.journey_entries (
  id            bigint generated by default as identity primary key,
  author_id     uuid not null references public.profiles (id) on delete cascade,
  title         text,
  quote         text,
  image_url     text,
  location_name text,
  entry_date    date not null default current_date,
  is_important  boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint journey_needs_body check (
    nullif(trim(coalesce(quote, '')), '') is not null
    or image_url is not null
    or nullif(trim(coalesce(title, '')), '') is not null
  )
);
create index if not exists journey_author_idx on public.journey_entries (author_id, entry_date desc);

-- entry ka author khud ya uska partner (ya admin) hi dekh sakta hai —
-- ek "shared couple timeline" isi tarah bina extra table ke ban jaata hai
create or replace function public.lw_can_see_journey(p_author uuid, p_viewer uuid default auth.uid())
returns boolean language sql security definer stable
set search_path = public as $$
  select p_author = p_viewer
    or public.lw_is_partner(p_viewer, p_author)
    or public.lw_is_admin(p_viewer);
$$;
revoke all on function public.lw_can_see_journey(uuid, uuid) from public;
grant execute on function public.lw_can_see_journey(uuid, uuid) to authenticated, service_role;

alter table public.journey_entries enable row level security;

drop policy if exists journey_select on public.journey_entries;
drop policy if exists journey_insert on public.journey_entries;
drop policy if exists journey_update on public.journey_entries;
drop policy if exists journey_delete on public.journey_entries;

create policy journey_select on public.journey_entries
  for select to authenticated
  using (public.lw_can_see_journey(author_id));

create policy journey_insert on public.journey_entries
  for insert to authenticated
  with check (author_id = auth.uid());

create policy journey_update on public.journey_entries
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy journey_delete on public.journey_entries
  for delete to authenticated
  using (author_id = auth.uid() or public.lw_is_admin());

-- threaded sub-updates within an entry (e.g. "important" milestone par baad mein
-- aur updates jodna)
create table if not exists public.journey_updates (
  id         bigint generated by default as identity primary key,
  entry_id   bigint not null references public.journey_entries (id) on delete cascade,
  author_id  uuid   not null references public.profiles (id) on delete cascade,
  content    text,
  image_url  text,
  created_at timestamptz not null default now(),
  constraint journey_update_needs_body check (
    nullif(trim(coalesce(content, '')), '') is not null or image_url is not null
  )
);
create index if not exists journey_updates_entry_idx on public.journey_updates (entry_id, created_at);

alter table public.journey_updates enable row level security;

drop policy if exists journey_updates_select on public.journey_updates;
drop policy if exists journey_updates_insert on public.journey_updates;
drop policy if exists journey_updates_delete on public.journey_updates;

create policy journey_updates_select on public.journey_updates
  for select to authenticated
  using (exists (
    select 1 from public.journey_entries e
    where e.id = entry_id and public.lw_can_see_journey(e.author_id)
  ));

create policy journey_updates_insert on public.journey_updates
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.journey_entries e where e.id = entry_id and public.lw_can_see_journey(e.author_id))
  );

create policy journey_updates_delete on public.journey_updates
  for delete to authenticated
  using (author_id = auth.uid() or public.lw_is_admin());

-- playable link for song posts/story-music (was only title+artist text before)
alter table public.posts add column if not exists song_url text;

-- area-wise "people near you" (haversine distance) + a curated Office Community
create or replace function public.lw_nearby_people(p_lat double precision, p_lng double precision, p_limit int default 20)
returns table (
  id uuid, full_name text, username text, avatar_url text, city text,
  profession text, distance_km double precision
)
language sql stable security definer
set search_path = public as $$
  select p.id, p.full_name, p.username, p.avatar_url, p.city, p.profession,
    (6371 * acos(least(1, greatest(-1,
      cos(radians(p_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(p.latitude))
    )))) as distance_km
  from public.profiles p
  where p.id <> auth.uid()
    and p.latitude is not null and p.longitude is not null
    and p.status = 'approved'
  order by distance_km asc
  limit p_limit;
$$;
revoke all on function public.lw_nearby_people(double precision, double precision, int) from public;
grant execute on function public.lw_nearby_people(double precision, double precision, int) to authenticated, service_role;

insert into public.communities (name, slug, description, is_public, category, icon, created_by)
values (
  'Office Community', 'office-community',
  'Professional life ke liye — career, kaam-kaaj, networking aur office wali baatein yahan karo.',
  true, 'professional', '💼', null
)
on conflict (lower(slug)) do nothing;

-- user-uploaded custom background photo (Settings > Appearance) — path <user_id>/<file>
insert into storage.buckets (id, name, public)
  values ('backgrounds', 'backgrounds', true)
  on conflict (id) do update set public = true;

drop policy if exists lw_bg_select on storage.objects;
drop policy if exists lw_bg_insert on storage.objects;
drop policy if exists lw_bg_delete on storage.objects;

create policy lw_bg_select on storage.objects
  for select
  using (bucket_id = 'backgrounds');

create policy lw_bg_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);

create policy lw_bg_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);

-- optional lat/lng captured by the map-based location picker (profile city, journey location)
alter table public.profiles add column if not exists latitude double precision;
alter table public.profiles add column if not exists longitude double precision;
alter table public.journey_entries add column if not exists latitude double precision;
alter table public.journey_entries add column if not exists longitude double precision;


-- ------------------------------------------------------------
-- 25. Curated communities (Couples / Singles / Spiritual / Heartbreak /
--     Healing / Student / Heart Talk) — join is gated by relationship_status
--     for couples/singles; posts already require membership to view (existing
--     posts_select rule), so that naturally keeps singles out of Couples
--     content and vice versa.
-- ------------------------------------------------------------
alter table public.communities add column if not exists category text;
alter table public.communities add column if not exists icon text;

create or replace function public.lw_can_join_community(p_community bigint, p_user uuid default auth.uid())
returns boolean language plpgsql security definer stable
set search_path = public as $$
declare
  v_category text;
  v_status   text;
begin
  select category into v_category from public.communities where id = p_community;
  if v_category is null or v_category not in ('couples', 'singles') then
    return true;
  end if;

  select relationship_status into v_status from public.profiles where id = p_user;

  if v_category = 'couples' then
    return v_status in ('in_relationship', 'engaged', 'married');
  end if;

  if v_category = 'singles' then
    return v_status is null or v_status in ('single', '');
  end if;

  return true;
end;
$$;
revoke all on function public.lw_can_join_community(bigint, uuid) from public;
grant execute on function public.lw_can_join_community(bigint, uuid) to authenticated, service_role;

drop policy if exists cmembers_join on public.community_members;
create policy cmembers_join on public.community_members
  for insert to authenticated
  with check (
    user_id = auth.uid() and role = 'member'
    and exists (select 1 from public.communities c where c.id = community_id and c.is_public)
    and public.lw_can_join_community(community_id, auth.uid())
  );

insert into public.communities (name, slug, description, is_public, category, icon, created_by)
values
  ('Couples Community', 'couples-community',
   'Sirf couples ke liye — restaurant, dates, places suggest karo aur dekho doosre couples ne kya share kiya.',
   true, 'couples', '💑', null),
  ('Singles Community', 'singles-community',
   'Sirf singles ke liye — khulke baat karo un logon ke saath jo waqai samajhte hain.',
   true, 'singles', '🧑', null),
  ('Spiritual Community', 'spiritual-community',
   'Dhyaan, bhakti aur spiritual growth ke baare mein baat karo.',
   true, 'spiritual', '🕉️', null),
  ('Heartbreak Community', 'heartbreak-community',
   'Breakup se guzar rahe ho? Yahan akela nahi ho.',
   true, 'heartbreak', '💔', null),
  ('Healing Community', 'healing-community',
   'Khud ko theek karne aur aage badhne ki journey share karo.',
   true, 'healing', '🌱', null),
  ('Student Community', 'student-community',
   'Padhai, career, campus life — student wali baatein yahan karo.',
   true, 'student', '🎓', null),
  ('Heart Talk Community', 'heart-talk-community',
   'Dil ki baatein khulke share karo — bina judge kiye.',
   true, 'heart_talk', '💬', null)
on conflict (lower(slug)) do nothing;


-- ------------------------------------------------------------
-- 23. Real feed photo upload, message reactions, per-friend streaks
-- ------------------------------------------------------------

-- posts/<user_id>/<file> — public read, owner-only write
insert into storage.buckets (id, name, public)
  values ('posts', 'posts', true)
  on conflict (id) do update set public = true;

drop policy if exists lw_posts_media_select on storage.objects;
drop policy if exists lw_posts_media_insert on storage.objects;
drop policy if exists lw_posts_media_delete on storage.objects;

create policy lw_posts_media_select on storage.objects
  for select
  using (bucket_id = 'posts');

create policy lw_posts_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy lw_posts_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);

-- message reactions (WhatsApp/iMessage jaisa — ek user, ek message, ek emoji)
create table if not exists public.message_reactions (
  message_id bigint not null references public.messages (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  emoji      text   not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_msg_idx on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

drop policy if exists msgreact_select on public.message_reactions;
drop policy if exists msgreact_upsert on public.message_reactions;
drop policy if exists msgreact_update on public.message_reactions;
drop policy if exists msgreact_delete on public.message_reactions;

create policy msgreact_select on public.message_reactions
  for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = message_id and public.lw_in_conversation(m.conversation_id)
  ));

create policy msgreact_upsert on public.message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.messages m where m.id = message_id and public.lw_in_conversation(m.conversation_id))
  );

create policy msgreact_update on public.message_reactions
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy msgreact_delete on public.message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- per-friend (per-direct-conversation) streak — dono taraf se usi din activity
-- chahiye, tabhi chain badhti hai (Snapchat jaisa)
create table if not exists public.chat_activity (
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  user_id         uuid   not null references public.profiles (id) on delete cascade,
  day             date   not null default current_date,
  primary key (conversation_id, user_id, day)
);
create index if not exists chat_activity_conv_idx on public.chat_activity (conversation_id, day);

alter table public.chat_activity enable row level security;

drop policy if exists chat_activity_select on public.chat_activity;
create policy chat_activity_select on public.chat_activity
  for select to authenticated
  using (public.lw_in_conversation(conversation_id) or public.lw_is_admin());

create or replace function public.lw_touch_chat_activity()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.kind <> 'system' then
    insert into public.chat_activity (conversation_id, user_id, day)
    values (new.conversation_id, new.sender_id, current_date)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
-- sirf trigger ke andar se chalta hai, kisi ko seedha RPC se call karne ki zaroorat nahi
revoke all on function public.lw_touch_chat_activity() from public, anon, authenticated;

drop trigger if exists lw_chat_activity_trg on public.messages;
create trigger lw_chat_activity_trg after insert on public.messages
  for each row execute function public.lw_touch_chat_activity();

-- current consecutive-day count jahan CONVERSATION ke dono members active the
-- (alive tabhi jab streak ka last day aaj ya kal ho — Snapchat jaisa)
create or replace function public.lw_chat_streak(p_conv bigint)
returns int language plpgsql stable security definer
set search_path = public as $$
declare v_len int;
begin
  with both_days as (
    select day from public.chat_activity
    where conversation_id = p_conv
    group by day having count(distinct user_id) >= 2
  ),
  grouped as (
    select day, day - (row_number() over (order by day))::int * interval '1 day' as grp
    from both_days
  ),
  streaks as (
    select grp, count(*) as len, max(day) as last_day
    from grouped group by grp
  )
  select len into v_len from streaks
  where last_day >= current_date - interval '1 day'
  order by last_day desc limit 1;

  return coalesce(v_len, 0);
end;
$$;
revoke all on function public.lw_chat_streak(bigint) from public;
grant execute on function public.lw_chat_streak(bigint) to authenticated, service_role;

-- realtime — reactions live update, conversation_members for read-receipt ticks
alter table public.message_reactions replica identity full;
alter table public.conversation_members replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null; when undefined_object then null; end $$;


-- ------------------------------------------------------------
-- 26. Life Chain auto-entries (dedication posts) + Goals in
--     Current Timeline — dono jagah "chain" ko khud-ba-khud
--     bharne wale triggers, RLS/visibility mein koi badlaav nahi.
-- ------------------------------------------------------------

-- Song dedicate karo ya kisi post ko "sirf partner" dikhao — dono
-- Life Chain mein apne aap ek memory ki tarah jud jaate hain (author +
-- unke partner ko dikhega, bilkul manual "Memory jodo" jaisa — koi
-- naya privacy rule nahi, journey_entries ka fixed author+partner RLS
-- hi lagta hai).
create or replace function public.lw_journey_on_dedication_post()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_title text;
  v_quote text;
begin
  if new.kind = 'song' or new.visibility = 'partner' then
    v_title := coalesce(nullif(trim(new.song_title), ''), nullif(trim(new.content), ''), 'Special moment');
    v_quote := case when new.content is not null and new.content <> v_title then new.content else null end;

    insert into public.journey_entries (author_id, title, quote, entry_date, is_important)
    values (new.author_id, v_title, v_quote, current_date, true);
  end if;
  return new;
end;
$$;
drop trigger if exists lw_journey_dedication_trg on public.posts;
create trigger lw_journey_dedication_trg after insert on public.posts
  for each row execute function public.lw_journey_on_dedication_post();

-- Goal complete karte hi Current Timeline (profile.html > Timeline tab)
-- mein khud-ba-khud ek entry ban jaaye — gifts jaisa hi (jo pehle se
-- lw_notify_gift trigger se timeline mein aate hain).
create or replace function public.lw_timeline_on_goal_done()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    perform public.lw_timeline_add(new.user_id, 'goal', 'Goal complete kiya: ' || new.title,
                                    'goals', new.id::text, new.is_public);
  end if;
  return new;
end;
$$;
drop trigger if exists lw_timeline_goal_trg on public.goals;
create trigger lw_timeline_goal_trg after update on public.goals
  for each row execute function public.lw_timeline_on_goal_done();


-- ------------------------------------------------------------
-- 27. Settings > Privacy/Notifications/Security toggles — ab tak
--     ye sirf UI thi, kahin save nahi hoti thi. Ek generic jsonb
--     column mein store karte hain (naye toggle jodne par baar-baar
--     migration nahi likhni padegi).
-- ------------------------------------------------------------
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------
-- 28. Song favorites + playlists (right-rail music card upgrade),
--     aur profile par ek pinned song (Instagram jaisa). Har user
--     ke apne favorites/playlists private hain — sirf khud dekh
--     sakte hain, koi friend-sharing abhi nahi hai.
-- ------------------------------------------------------------
create table if not exists public.song_favorites (
  id                bigint generated by default as identity primary key,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  spotify_track_id  text not null,
  song_title        text not null,
  song_artist       text,
  song_url          text,
  created_at        timestamptz not null default now(),
  unique (user_id, spotify_track_id)
);
alter table public.song_favorites enable row level security;
drop policy if exists favs_select on public.song_favorites;
drop policy if exists favs_insert on public.song_favorites;
drop policy if exists favs_delete on public.song_favorites;
create policy favs_select on public.song_favorites for select to authenticated using (user_id = auth.uid());
create policy favs_insert on public.song_favorites for insert to authenticated with check (user_id = auth.uid());
create policy favs_delete on public.song_favorites for delete to authenticated using (user_id = auth.uid());

create table if not exists public.playlists (
  id          bigint generated by default as identity primary key,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.playlists enable row level security;
drop policy if exists pl_select on public.playlists;
drop policy if exists pl_insert on public.playlists;
drop policy if exists pl_update on public.playlists;
drop policy if exists pl_delete on public.playlists;
create policy pl_select on public.playlists for select to authenticated using (owner_id = auth.uid());
create policy pl_insert on public.playlists for insert to authenticated with check (owner_id = auth.uid());
create policy pl_update on public.playlists for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pl_delete on public.playlists for delete to authenticated using (owner_id = auth.uid());

drop trigger if exists trg_playlists_touch on public.playlists;
create trigger trg_playlists_touch before update on public.playlists
  for each row execute function public.lw_touch_updated_at();

create table if not exists public.playlist_tracks (
  id                bigint generated by default as identity primary key,
  playlist_id       bigint not null references public.playlists (id) on delete cascade,
  spotify_track_id  text not null,
  song_title        text not null,
  song_artist       text,
  song_url          text,
  position          int not null default 0,
  added_at          timestamptz not null default now(),
  unique (playlist_id, spotify_track_id)
);
alter table public.playlist_tracks enable row level security;
drop policy if exists plt_select on public.playlist_tracks;
drop policy if exists plt_insert on public.playlist_tracks;
drop policy if exists plt_delete on public.playlist_tracks;
create policy plt_select on public.playlist_tracks for select to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()));
create policy plt_insert on public.playlist_tracks for insert to authenticated
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()));
create policy plt_delete on public.playlist_tracks for delete to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()));

alter table public.profiles add column if not exists pinned_song_title text;
alter table public.profiles add column if not exists pinned_song_artist text;
alter table public.profiles add column if not exists pinned_song_url text;
alter table public.profiles add column if not exists pinned_spotify_track_id text;

-- lw_public_profiles (section 10 upar) in naye pinned_song_* columns ko explicitly
-- select karta hai — is file ka jo bhi hissa chalaya jaaye (poora file dobara, ya
-- sirf ye naya section 28), view hamesha sahi rahe isliye yahan bhi dobara define
-- kar diya (create or replace, dono baar chalana safe hai).
-- NOTE: naye columns yahan sabse AAKHIR mein hain — Postgres ka
-- "create or replace view" existing output columns ka naam/position
-- badalne nahi deta (sirf naye column END mein add kar sakte hain),
-- isliye birthday_md se pehle nahi daal sakte (ussे galat error aaya tha).
create or replace view public.lw_public_profiles
with (security_invoker = false) as
  select
    p.id, p.full_name, p.username, p.avatar_url, p.cover_url,
    p.city, p.bio, p.gender, p.profession, p.story,
    p.relationship_status, p.partner_id, p.hobbies, p.favourites,
    p.dob, p.created_at,
    to_char(p.dob, 'MM-DD') as birthday_md,
    p.pinned_spotify_track_id, p.pinned_song_title, p.pinned_song_artist, p.pinned_song_url
  from public.profiles p
  where p.status <> 'rejected';
revoke all on public.lw_public_profiles from public, anon;
grant select on public.lw_public_profiles to authenticated;