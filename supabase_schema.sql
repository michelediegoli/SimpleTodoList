-- Supabase schema per Todo List condivisa
-- Eseguire nello SQL editor di Supabase

-- 1) Extensions
create extension if not exists "pgcrypto";

-- 2) Tipi per priorità e stato
do $$
begin
  create type task_priority as enum ('low','medium','high');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type task_status as enum ('completed');
exception
  when duplicate_object then null;
end $$;

-- 3) Tabelle principali
-- profiles: metadata legato a auth.users(id)
create table if not exists profiles (
  id uuid not null primary key references auth.users (id),
  full_name text,
  avatar_url text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- lists: liste condivise (es. "Team ToDo")
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references auth.users (id),
  created_at timestamptz default now()
);

-- list_members: membership per lista
create table if not exists list_members (
  list_id uuid references lists (id) on delete cascade,
  user_id uuid references auth.users (id),
  role text default 'member', -- 'member' | 'editor' | 'owner'
  joined_at timestamptz default now(),
  primary key (list_id, user_id)
);

-- tasks: attività
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references lists (id) on delete cascade,
  title text not null,
  description text,
  assignee text,
  created_by uuid references auth.users (id),
  due_date date,
  priority task_priority default 'medium',
  status task_status default null,
  completed_at timestamptz,
  recurrence_rule text default 'none',
  recurrence_day integer,
  visibility text default 'list',
  visible_to uuid[] default '{}'::uuid[],
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Compatibilita con una tabella tasks gia esistente creata da una versione precedente
alter table tasks add column if not exists list_id uuid references lists (id) on delete cascade;
alter table tasks add column if not exists title text;
alter table tasks add column if not exists description text;
alter table tasks add column if not exists assignee text;

-- L'assegnatario e' il nome scelto nell'app, non l'UUID dell'utente Auth.
alter table tasks drop constraint if exists tasks_assignee_fkey;
alter table tasks alter column assignee type text using assignee::text;
alter table tasks add column if not exists created_by uuid references auth.users (id);
alter table tasks add column if not exists due_date date;
alter table tasks add column if not exists priority task_priority default 'medium';
alter table tasks add column if not exists status task_status default null;
alter table tasks add column if not exists completed_at timestamptz;
alter table tasks add column if not exists recurrence_rule text default 'none';
alter table tasks add column if not exists recurrence_day integer;
alter table tasks add column if not exists visibility text default 'list';
alter table tasks add column if not exists visible_to uuid[] default '{}'::uuid[];
alter table tasks add column if not exists metadata jsonb default '{}'::jsonb;
alter table tasks add column if not exists created_at timestamptz default now();
alter table tasks add column if not exists updated_at timestamptz default now();

-- Migrazione dei task creati con i precedenti stati.
alter table tasks alter column status drop default;
update tasks set status = null where status::text in ('in_progress', 'todo');
update tasks set assignee = null where lower(trim(assignee)) = 'altro';

-- Indici utili
create index if not exists idx_tasks_list_id on tasks(list_id);
create index if not exists idx_tasks_assignee on tasks(assignee);
create index if not exists idx_tasks_due_date on tasks(due_date);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_visible_to on tasks using gin(visible_to);

-- Valori ammessi per ricorrenza e visibilita.
alter table tasks drop constraint if exists tasks_recurrence_rule_check;
alter table tasks add constraint tasks_recurrence_rule_check
  check (recurrence_rule in ('none', 'weekly', 'monthly'));
alter table tasks drop constraint if exists tasks_recurrence_day_check;
alter table tasks add constraint tasks_recurrence_day_check
  check (recurrence_day is null or recurrence_day between 1 and 31);
alter table tasks drop constraint if exists tasks_visibility_check;
alter table tasks add constraint tasks_visibility_check
  check (visibility in ('list', 'selected'));

-- 4) Trigger per updated_at e completed_at
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at := now();

  -- Imposta completed_at quando lo status diventa 'completed'
  if (TG_OP = 'INSERT') then
    if new.status = 'completed' then
      new.completed_at := now();
    end if;
  elsif (TG_OP = 'UPDATE') then
    if (new.status = 'completed' and (old.status is distinct from new.status)) then
      new.completed_at := now();
    elsif (new.status is distinct from 'completed') then
      new.completed_at := null;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on tasks;
create trigger set_timestamp
before insert or update on tasks
for each row execute function public.trigger_set_timestamp();

-- Crea la prossima occorrenza dopo il completamento.
create or replace function public.create_next_recurring_task()
returns trigger
security definer
set search_path = public
language plpgsql as $$
declare
  next_due_date date;
begin
  if new.status = 'completed'
     and old.status is distinct from new.status
     and new.recurrence_rule in ('weekly', 'monthly')
     and new.due_date is not null then
    next_due_date := (new.due_date + case
      when new.recurrence_rule = 'weekly' then interval '7 days'
      else interval '1 month'
    end)::date;

    insert into public.tasks (
      list_id, title, description, assignee, created_by, due_date,
      priority, status, recurrence_rule, recurrence_day, visibility, visible_to
    ) values (
      new.list_id, new.title, new.description, new.assignee, new.created_by, next_due_date,
      new.priority, null, new.recurrence_rule, new.recurrence_day, new.visibility, new.visible_to
    );
  end if;
  return new;
end;
$$;

drop trigger if exists create_next_recurring_task on tasks;
create trigger create_next_recurring_task
after update on tasks
for each row execute function public.create_next_recurring_task();

-- 5) Helper per admin check
create or replace function public.is_admin()
returns boolean
stable
security definer
set search_path = public
language sql as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_list_member(target_list_id uuid, target_user_id uuid default auth.uid())
returns boolean
stable
security definer
set search_path = public
language sql as $$
  select exists (
    select 1 from public.list_members lm
    where lm.list_id = target_list_id
      and lm.user_id = target_user_id
  ) or exists (
    select 1 from public.lists l
    where l.id = target_list_id
      and l.created_by = target_user_id
  );
$$;

create or replace function public.get_assignable_users(target_list_id uuid)
returns table (id uuid, full_name text, email text)
stable
security definer
set search_path = public, auth
language sql as $$
  select
    u.id,
    coalesce(
      nullif(p.full_name, ''),
      nullif(u.raw_user_meta_data->>'full_name', ''),
      nullif(u.raw_user_meta_data->>'name', ''),
      split_part(u.email, '@', 1)
    ) as full_name,
    u.email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where (
    public.is_admin() or
    public.is_list_member(target_list_id, auth.uid())
  )
  and (
    exists (
      select 1
      from public.list_members lm
      where lm.list_id = target_list_id
        and lm.user_id = u.id
    ) or exists (
      select 1
      from public.lists l
      where l.id = target_list_id
        and l.created_by = u.id
    )
  )
  order by coalesce(
    nullif(p.full_name, ''),
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    u.email
  ), u.email;
$$;

grant execute on function public.get_assignable_users(uuid) to authenticated;

-- 6) Abilitazione RLS
alter table profiles enable row level security;
alter table lists enable row level security;
alter table list_members enable row level security;
alter table tasks enable row level security;

-- 7) Policies (drop se esistono e poi create)

-- Profiles policies
drop policy if exists profiles_select_self_or_admin on profiles;
create policy profiles_select_self_or_admin on profiles
  for select using ( auth.uid() = id OR public.is_admin() );

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert with check ( auth.uid() = id );

drop policy if exists profiles_update_self_or_admin on profiles;
create policy profiles_update_self_or_admin on profiles
  for update using ( auth.uid() = id OR public.is_admin() )
  with check ( auth.uid() = id OR public.is_admin() );

-- Lists policies
drop policy if exists lists_select_if_member_or_admin on lists;
create policy lists_select_if_member_or_admin on lists
  for select using (
    public.is_admin() OR
    public.is_list_member(lists.id)
  );

drop policy if exists lists_insert_authenticated on lists;
create policy lists_insert_authenticated on lists
  for insert with check ( auth.uid() IS NOT NULL AND auth.uid() = created_by );

-- lists_modify_owner_or_admin: separate UPDATE e DELETE
drop policy if exists lists_modify_owner_or_admin_update on lists;
drop policy if exists lists_modify_owner_or_admin_delete on lists;

create policy lists_modify_owner_or_admin_update on lists
  for update using (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = lists.id AND lm.user_id = auth.uid() AND lm.role = 'owner')
  )
  with check (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = id AND lm.user_id = auth.uid() AND lm.role = 'owner')
  );

create policy lists_modify_owner_or_admin_delete on lists
  for delete using (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = lists.id AND lm.user_id = auth.uid() AND lm.role = 'owner')
  );

-- list_members policies
-- IMPORTANT: avoid querying list_members itself inside its own policies,
-- otherwise Postgres can recurse infinitely while evaluating RLS.
drop policy if exists list_members_select_member_or_admin on list_members;
create policy list_members_select_member_or_admin on list_members
  for select using (
    public.is_admin() OR auth.uid() = user_id
  );

drop policy if exists list_members_insert_owner_or_admin on list_members;
create policy list_members_insert_owner_or_admin on list_members
  for insert with check (
    public.is_admin() OR (
      auth.uid() = user_id AND
      EXISTS (
        SELECT 1
        FROM lists l
        WHERE l.id = list_id
          AND l.created_by = auth.uid()
      )
    )
  );

-- list_members_update_owner_or_admin: separate UPDATE e DELETE
drop policy if exists list_members_update_owner_or_admin_update on list_members;
drop policy if exists list_members_update_owner_or_admin_delete on list_members;

create policy list_members_update_owner_or_admin_update on list_members
  for update using (
    public.is_admin() OR
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1
      FROM lists l
      WHERE l.id = list_members.list_id
        AND l.created_by = auth.uid()
    )
  )
  with check (
    public.is_admin() OR
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1
      FROM lists l
      WHERE l.id = list_id
        AND l.created_by = auth.uid()
    )
  );

create policy list_members_update_owner_or_admin_delete on list_members
  for delete using (
    public.is_admin() OR
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1
      FROM lists l
      WHERE l.id = list_members.list_id
        AND l.created_by = auth.uid()
    )
  );

-- Tasks policies
drop policy if exists tasks_select_member_or_admin on tasks;
create policy tasks_select_member_or_admin on tasks
  for select using (
    public.is_admin() OR
    (
      public.is_list_member(tasks.list_id) AND
      (tasks.visibility = 'list' OR auth.uid() = tasks.created_by OR auth.uid() = any(tasks.visible_to))
    )
  );

drop policy if exists tasks_insert_member_or_admin on tasks;
create policy tasks_insert_member_or_admin on tasks
  for insert with check (
    public.is_admin() OR
    (
      auth.uid() IS NOT NULL AND
      created_by = auth.uid() AND
      public.is_list_member(list_id, auth.uid()) AND
      (visibility = 'list' OR auth.uid() = any(visible_to) OR visibility = 'selected')
    )
  );

drop policy if exists tasks_update_assignee_creator_or_editor_or_admin on tasks;
drop policy if exists tasks_update_list_member_or_admin on tasks;
create policy tasks_update_list_member_or_admin on tasks
  for update using (
    public.is_admin() OR
    (
      public.is_list_member(tasks.list_id) AND
      (tasks.visibility = 'list' OR auth.uid() = tasks.created_by OR auth.uid() = any(tasks.visible_to))
    )
  )
  with check (
    public.is_admin() OR
    (
      public.is_list_member(list_id) AND
      (visibility = 'list' OR auth.uid() = created_by OR auth.uid() = any(visible_to))
    )
  );

drop policy if exists tasks_delete_owner_or_admin on tasks;
drop policy if exists tasks_delete_creator_owner_or_admin on tasks;
drop policy if exists tasks_delete_list_member_or_admin on tasks;
create policy tasks_delete_list_member_or_admin on tasks
  for delete using (
    public.is_admin() OR
    public.is_list_member(tasks.list_id)
  );

-- Fine script
