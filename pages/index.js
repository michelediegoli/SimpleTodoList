import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Auth, { PasswordSetup } from '../components/Auth'
import TaskForm from '../components/TaskForm'
import TaskItem from '../components/TaskItem'
import { getAssigneeNames } from '../lib/assignees'

const LIST_ID = process.env.NEXT_PUBLIC_SUPABASE_LIST_ID
const isListConfigured = Boolean(LIST_ID) && LIST_ID !== 'the-list-uuid-to-use'
const initialFilters = {
  query: '',
  status: 'all',
  assignee: 'all',
  priority: 'all',
  dueDate: ''
}

export default function Home() {
  const [user, setUser] = useState(null)
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([]) // for assignee select
  const [loading, setLoading] = useState(true)
  const [authReady, setAuthReady] = useState(false)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const assigneeNames = getAssigneeNames(profiles)

  useEffect(() => {
    const getAuthFlowFromUrl = () => {
      const query = new URLSearchParams(window.location.search)
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      return query.get('reset') === '1' ? 'recovery' : query.get('type') || hash.get('type')
    }

    const getAuthErrorFromUrl = () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      if (hash.get('error_code') === 'otp_expired') {
        return 'Il link per reimpostare la password è scaduto o è già stato utilizzato. Richiedi un nuovo link.'
      }
      return hash.get('error_description')?.replace(/\+/g, ' ') || ''
    }

    // auth state
    const getSession = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user ?? null)
      setAuthMessage(getAuthErrorFromUrl())
      if (data.user && ['invite', 'recovery'].includes(getAuthFlowFromUrl())) {
        setNeedsPassword(true)
      }
      setAuthReady(true)
    }
    getSession()
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (session?.user && (event === 'PASSWORD_RECOVERY' || ['invite', 'recovery'].includes(getAuthFlowFromUrl()))) {
        setNeedsPassword(true)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user || needsPassword) return
    fetchProfiles()
    fetchTasks()

    // realtime subscription to tasks for this list
    const channel = supabase.channel('public:tasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `list_id=eq.${LIST_ID}`
        },
        (payload) => {
          // handle payload: INSERT/UPDATE/DELETE
          setTasks(prev => {
            const ev = payload.eventType
            const row = payload.new ?? payload.old
            if (ev === 'INSERT') return [row, ...prev]
            if (ev === 'UPDATE') return prev.map(t => (t.id === row.id ? row : t))
            if (ev === 'DELETE') return prev.filter(t => t.id !== row.id)
            return prev
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, needsPassword])

  async function fetchProfiles() {
    const { data, error } = await supabase
      .rpc('get_assignable_users', { target_list_id: LIST_ID })
    if (error) console.error(error)
    else setProfiles(data || [])
  }

  async function fetchTasks() {
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('list_id', LIST_ID)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    else setTasks(data || [])
    setLoading(false)
  }

  const filteredTasks = tasks.filter(task => {
    const q = filters.query.trim().toLowerCase()
    const matchesQuery = !q || [
      task.title,
      task.description,
      task.status,
      task.priority,
      task.assignee,
      task.due_date
    ].filter(Boolean).join(' ').toLowerCase().includes(q)

    const matchesStatus = filters.status === 'all' || (
      filters.status === 'none' ? !task.status : task.status === filters.status
    )
    const matchesAssignee = filters.assignee === 'all' || task.assignee === filters.assignee
    const matchesPriority = filters.priority === 'all' || task.priority === filters.priority
    const matchesDueDate = !filters.dueDate || task.due_date === filters.dueDate

    return matchesQuery && matchesStatus && matchesAssignee && matchesPriority && matchesDueDate
  })
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize))
  const paginatedTasks = filteredTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [filters, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center">Caricamento...</div>
  }

  if (!user) {
    return <Auth initialMessage={authMessage} />
  }

  if (needsPassword) {
    return (
      <PasswordSetup onComplete={() => {
        window.history.replaceState({}, document.title, window.location.pathname)
        setNeedsPassword(false)
      }} />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <header className="max-w-6xl mx-auto mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Simple Todo — Lista condivisa</h1>
        <div className="mt-3 text-sm text-gray-600">Connesso come <strong>{user.email}</strong></div>
        <div className="mt-2">
          <button
            onClick={async () => { await supabase.auth.signOut(); setUser(null) }}
            className="text-sm text-red-600 hover:underline"
          >
            Esci
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        {!isListConfigured && (
          <div className="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Configura NEXT_PUBLIC_SUPABASE_LIST_ID con l&apos;UUID della tua lista Supabase per poter creare task.
          </div>
        )}

        <section className="mb-6">
          <TaskForm user={user} profiles={profiles} onCreated={() => fetchTasks()} />
        </section>

        <section className="mb-8">
          <div className="bg-white p-4 rounded shadow mb-4 border-2 border-gray-400">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2">
              <input
                value={filters.query}
                onChange={e => setFilters({ ...filters, query: e.target.value })}
                placeholder="Cerca in tutte le colonne"
                className="border rounded px-3 py-2"
              />

              <select
                value={filters.status}
                onChange={e => setFilters({ ...filters, status: e.target.value })}
                className="border rounded px-3 py-2"
              >
                <option value="all">Tutti gli stati</option>
                <option value="none">Nessuno stato</option>
                <option value="completed">Completato</option>
              </select>

              <select
                value={filters.assignee}
                onChange={e => setFilters({ ...filters, assignee: e.target.value })}
                className="border rounded px-3 py-2"
              >
                <option value="all">Tutti gli assegnatari</option>
                {assigneeNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>

              <select
                value={filters.priority}
                onChange={e => setFilters({ ...filters, priority: e.target.value })}
                className="border rounded px-3 py-2"
              >
                <option value="all">Tutte le priorità</option>
                <option value="low">Bassa</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>

              <input
                type="date"
                value={filters.dueDate}
                onChange={e => setFilters({ ...filters, dueDate: e.target.value })}
                className="border rounded px-3 py-2"
              />

              <button
                onClick={() => setFilters({ ...initialFilters })}
                className="border border-gray-300 rounded px-3 py-2 text-gray-700 bg-gray-100"
              >
                Reimposta
              </button>
            </div>
          </div>

          <div className="overflow-hidden bg-white rounded shadow border-2 border-sky-400">
            <table className="w-full table-fixed text-left">
              <thead className="hidden bg-gray-100 md:table-header-group">
                <tr>
                  <th className="px-3 py-3 font-semibold">Titolo</th>
                  <th className="px-3 py-3 font-semibold">Descrizione</th>
                  <th className="px-3 py-3 font-semibold">Assegnatario</th>
                  <th className="px-3 py-3 font-semibold">Scadenza</th>
                  <th className="px-3 py-3 font-semibold">Priorità</th>
                  <th className="px-3 py-3 font-semibold">Stato</th>
                  <th className="px-3 py-3 font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" className="px-3 py-4 text-gray-500">Caricamento...</td></tr>
                ) : filteredTasks.length === 0 ? (
                  <tr><td colSpan="7" className="px-3 py-4 text-gray-500">Nessuna attività trovata.</td></tr>
                ) : (
                  paginatedTasks.map(task => (
                    <TaskItem key={task.id} task={task} profiles={profiles} currentUser={user} onUpdated={() => fetchTasks()} />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredTasks.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <label htmlFor="page-size">Task per pagina</label>
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={event => setPageSize(Number(event.target.value))}
                  className="border rounded px-2 py-1"
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
                <span className="text-gray-500">
                  {filteredTasks.length} task totali
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="border rounded px-3 py-1 disabled:opacity-40"
                >
                  Precedente
                </button>
                <span>Pagina {currentPage} di {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="border rounded px-3 py-1 disabled:opacity-40"
                >
                  Successiva
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
