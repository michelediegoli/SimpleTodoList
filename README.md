# Simple Todo (Next.js + Supabase)

Prerequisiti:
- Node 18+
- Un progetto Supabase con Auth abilitato (email/password e Google provider se vuoi)
- Esegui lo script SQL che abbiamo preparato (supabase_schema.sql) nello SQL editor Supabase
- Crea manualmente una lista condivisa e aggiungi te come owner (vedi snippet nel README sopra), copia il suo id in NEXT_PUBLIC_SUPABASE_LIST_ID

1) Copia .env.local.example in .env.local e imposta:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_LIST_ID=

2) Installa ed esegui:
npm install
npm run dev
Vai su http://localhost:3000

Note su RLS e setup:
- Lo script SQL attiva RLS; assicurati di avere una lista e che il tuo utente sia membro/owner (altrimenti le policy bloccheranno accessi).
- Se vuoi che la app crei automaticamente la lista e il tuo membership, puoi aggiungere una policy temporanea oppure eseguire manualmente gli INSERT nel dashboard SQL.
- Lo script include una migrazione compatibile per aggiungere a `tasks` le colonne mancanti nelle installazioni precedenti.

### Aggiungere un utente invitato alla lista

L'invito Supabase abilita l'accesso all'account, ma non crea automaticamente il membership della lista. Dopo che l'utente ha accettato l'invito, esegui nello SQL editor:

```sql
insert into public.list_members (list_id, user_id, role)
select
	'7898a122-a0da-4142-9a69-f87bea9d6c19'::uuid,
	id,
	'member'
from auth.users
where email = 'utente@example.com'
on conflict (list_id, user_id) do nothing;
```

Sostituisci l'email con quella dell'utente invitato. Da quel momento l'utente potrà leggere e creare task nella lista configurata in `NEXT_PUBLIC_SUPABASE_LIST_ID`.

Se l'utente è già presente in `list_members` ma non vede i task, esegui nello SQL editor questa migrazione RLS (non è necessario rieseguire l'intero schema):

```sql
create or replace function public.is_list_member(target_list_id uuid, target_user_id uuid default auth.uid())
returns boolean
stable security definer set search_path = public language sql as $$
	select exists (
		select 1 from public.list_members lm
		where lm.list_id = target_list_id and lm.user_id = target_user_id
	) or exists (
		select 1 from public.lists l
		where l.id = target_list_id and l.created_by = target_user_id
	);
$$;

create or replace function public.is_admin()
returns boolean
stable security definer set search_path = public language sql as $$
	select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists lists_select_if_member_or_admin on public.lists;
create policy lists_select_if_member_or_admin on public.lists for select using (
	public.is_admin() or public.is_list_member(lists.id)
);

drop policy if exists tasks_select_member_or_admin on public.tasks;
create policy tasks_select_member_or_admin on public.tasks for select using (
	public.is_admin() or public.is_list_member(tasks.list_id)
);

drop policy if exists tasks_insert_member_or_admin on public.tasks;
create policy tasks_insert_member_or_admin on public.tasks for insert with check (
	public.is_admin() or (
		auth.uid() is not null
		and created_by = auth.uid()
		and public.is_list_member(list_id, auth.uid())
	)
);
```

Poi verifica che l'utente corrente sia associato alla lista:

```sql
select
	u.email,
	lm.user_id is not null as is_member,
	l.created_by = lm.user_id as is_owner
from auth.users u
left join public.list_members lm
	on lm.user_id = u.id
	and lm.list_id = '7898a122-a0da-4142-9a69-f87bea9d6c19'::uuid
join public.lists l
	on l.id = '7898a122-a0da-4142-9a69-f87bea9d6c19'::uuid
where u.email = 'email-utente@example.com';
```

`is_member` oppure `is_owner` deve essere `true`. Se entrambi sono `false`, esegui l'`insert into public.list_members` della sezione precedente.

Per controllare il membership dal SQL Editor usa l'email dell'utente. Non usare `auth.uid()` in questa query: nel SQL Editor non c'e' la sessione del browser e restituisce `NULL`.

```sql
select l.id, l.name, lm.user_id, u.email, lm.role
from public.list_members lm
join public.lists l on l.id = lm.list_id
join auth.users u on u.id = lm.user_id
where l.id = '7898a122-a0da-4142-9a69-f87bea9d6c19'::uuid;
```

Se l'email non compare, aggiungi l'utente alla lista:

```sql
insert into public.list_members (list_id, user_id, role)
select
	'7898a122-a0da-4142-9a69-f87bea9d6c19'::uuid,
	id,
	'member'
from auth.users
where email = 'utente@example.com'
on conflict (list_id, user_id) do nothing;
```

La query `select public.is_list_member('...uuid...', auth.uid())` va usata dalla sessione autenticata dell'app, non dal SQL Editor.
