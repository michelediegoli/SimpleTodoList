import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Auth from '../components/Auth'
import TaskForm from '../components/TaskForm'
import TaskItem from '../components/TaskItem'

const LIST_ID = process.env.NEXT_PUBLIC_SUPABASE_LIST_ID

export default function Home() {
  const [user, setUser] = useState(null)
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([]) // for assignee select
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // auth state
    const getSession = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user ?? null)
    }
    getSession()
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
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
  }, [user])

  async function fetchProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, is_admin')
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

  if (!user) {
    return <Auth />
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <header className="max-w-3xl mx-auto mb-6">
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

      <main className="max-w-3xl mx-auto">
        <section className="mb-6">
          <TaskForm user={user} profiles={profiles} onCreated={() => fetchTasks()} />
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-2">Da fare / In corso</h2>
          {loading ? <div>Caricamento...</div> : (
            tasks.filter(t => t.status !== 'completed').length === 0
              ? <div className="text-gray-500">Nessuna attività.</div>
              : tasks.filter(t => t.status !== 'completed').map(task => (
                <TaskItem key={task.id} task={task} profiles={profiles} currentUser={user} />
              ))
          )}
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Completate</h2>
          {tasks.filter(t => t.status === 'completed').length === 0
            ? <div className="text-gray-500">Nessuna attività completata.</div>
            : tasks.filter(t => t.status === 'completed').map(task => (
              <TaskItem key={task.id} task={task} profiles={profiles} currentUser={user} />
            ))
          }
        </section>
      </main>
    </div>
  )
}
