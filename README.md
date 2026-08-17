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
