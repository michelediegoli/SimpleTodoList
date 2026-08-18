import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const LIST_ID = process.env.NEXT_PUBLIC_SUPABASE_LIST_ID
const isListConfigured = Boolean(LIST_ID) && LIST_ID !== 'the-list-uuid-to-use'

export default function TaskForm({ user, profiles, onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Inserisci un titolo per la task.')
      return
    }
    if (!user?.id) {
      setError('Devi essere autenticato per creare una task.')
      return
    }
    if (!isListConfigured) {
      setError('Configura NEXT_PUBLIC_SUPABASE_LIST_ID con un UUID valido del tuo progetto Supabase.')
      return
    }

    setSaving(true)
    setError('')

    const { error: insertError } = await supabase
      .from('tasks')
      .insert([{
        list_id: LIST_ID,
        title: title.trim(),
        description: description.trim() || null,
        assignee: assignee || null,
        due_date: dueDate || null,
        priority,
        status: 'todo',
        created_by: user.id
      }])

    setSaving(false)
    if (insertError) {
      console.error(insertError)
      setError(insertError.message)
      return
    }

    setTitle(''); setDescription(''); setAssignee(''); setDueDate(''); setPriority('medium')
    onCreated && onCreated()
  }

  return (
    <form onSubmit={handleCreate} className="bg-white p-4 rounded shadow">
      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo attività" className="flex-1 border rounded px-3 py-2" />
        <select value={priority} onChange={e => setPriority(e.target.value)} className="border rounded px-3 py-2 w-40">
          <option value="low">Bassa</option>
          <option value="medium">Media</option>
          <option value="high">Alta</option>
        </select>
      </div>

      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrizione (opzionale)" className="w-full border rounded px-3 py-2 mt-2" />

      <div className="flex gap-2 mt-2">
        <select value={assignee} onChange={e => setAssignee(e.target.value)} className="border rounded px-3 py-2 flex-1">
          <option value="">Assegna a (nessuno)</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.id}</option>)}
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="border rounded px-3 py-2" />
        <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-60" disabled={saving || !isListConfigured}>
          {saving ? 'Creazione...' : 'Crea'}
        </button>
      </div>
    </form>
  )
}
