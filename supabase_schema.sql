-- Supabase schema per Todo List condivisa
-- Eseguire nello SQL editor di Supabase

-- 1) Extensions
create extension if not exists "pgcrypto";

-- 2) Tipi per priorità e stato
drop type if exists task_priority cascade;
create type task_priority as enum ('low','medium','high');

drop type if exists task_status cascade;
create type task_status as enum ('todo','in_progress','completed');

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
  assignee uuid references auth.users (id),
  created_by uuid references auth.users (id),
  due_date date,
  priority task_priority default 'medium',
  status task_status default 'todo',
  completed_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indici utili
create index if not exists idx_tasks_list_id on tasks(list_id);
create index if not exists idx_tasks_assignee on tasks(assignee);
create index if not exists idx_tasks_due_date on tasks(due_date);
create index if not exists idx_tasks_status on tasks(status);

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

-- 5) Helper per admin check
create or replace function public.is_admin() returns boolean stable language sql as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

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
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = lists.id AND lm.user_id = auth.uid())
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
drop policy if exists list_members_select_member_or_admin on list_members;
create policy list_members_select_member_or_admin on list_members
  for select using (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm2 WHERE lm2.list_id = list_members.list_id AND lm2.user_id = auth.uid())
  );

drop policy if exists list_members_insert_owner_or_admin on list_members;
create policy list_members_insert_owner_or_admin on list_members
  for insert with check (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = list_id AND lm.user_id = auth.uid() AND lm.role = 'owner')
  );

-- list_members_update_owner_or_admin: separate UPDATE e DELETE
drop policy if exists list_members_update_owner_or_admin_update on list_members;
drop policy if exists list_members_update_owner_or_admin_delete on list_members;

create policy list_members_update_owner_or_admin_update on list_members
  for update using (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = list_members.list_id AND lm.user_id = auth.uid() AND lm.role = 'owner')
  )
  with check (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = list_id AND lm.user_id = auth.uid() AND lm.role = 'owner')
  );

create policy list_members_update_owner_or_admin_delete on list_members
  for delete using (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = list_members.list_id AND lm.user_id = auth.uid() AND lm.role = 'owner')
  );

-- Tasks policies
drop policy if exists tasks_select_member_or_admin on tasks;
create policy tasks_select_member_or_admin on tasks
  for select using (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = tasks.list_id AND lm.user_id = auth.uid())
  );

drop policy if exists tasks_insert_member_or_admin on tasks;
create policy tasks_insert_member_or_admin on tasks
  for insert with check (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = list_id AND lm.user_id = auth.uid())
  );

drop policy if exists tasks_update_assignee_creator_or_editor_or_admin on tasks;
create policy tasks_update_assignee_creator_or_editor_or_admin on tasks
  for update using (
    public.is_admin() OR
    assignee = auth.uid() OR
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = tasks.list_id AND lm.user_id = auth.uid() AND lm.role IN ('owner','editor'))
  )
  with check (
    public.is_admin() OR
    assignee = auth.uid() OR
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = list_id AND lm.user_id = auth.uid() AND lm.role IN ('owner','editor'))
  );

drop policy if exists tasks_delete_owner_or_admin on tasks;
create policy tasks_delete_owner_or_admin on tasks
  for delete using (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM list_members lm WHERE lm.list_id = tasks.list_id AND lm.user_id = auth.uid() AND lm.role = 'owner')
  );

-- Fine script
