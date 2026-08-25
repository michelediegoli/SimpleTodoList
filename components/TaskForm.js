import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatPersonName, getAssigneeNames, isSelectableProfile } from '../lib/assignees'

const LIST_ID = process.env.NEXT_PUBLIC_SUPABASE_LIST_ID
const isListConfigured = Boolean(LIST_ID) && LIST_ID !== 'the-list-uuid-to-use'

export default function TaskForm({ user, profiles, onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState(getAssigneeNames()[0])
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')
  const [recurrenceRule, setRecurrenceRule] = useState('none')
  const [visibility, setVisibility] = useState('list')
  const [visibleTo, setVisibleTo] = useState(() => user?.id ? [user.id] : [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const assigneeNames = getAssigneeNames(profiles)

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
        assignee,
        due_date: dueDate || null,
        priority,
        status: null,
        created_by: user.id,
        recurrence_rule: recurrenceRule,
        recurrence_day: null,
        visibility,
        visible_to: visibility === 'selected' ? Array.from(new Set([user.id, ...visibleTo])) : []
      }])

    setSaving(false)
    if (insertError) {
      console.error(insertError)
      setError(insertError.message)
      return
    }

    setTitle(''); setDescription(''); setAssignee(getAssigneeNames()[0]); setDueDate(''); setPriority('medium')
    setRecurrenceRule('none'); setVisibility('list'); setVisibleTo([user.id])
    onCreated && onCreated()
  }

  return (
    <form onSubmit={handleCreate} className="bg-white p-4 rounded shadow border-2 border-green-500">
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

      <div className="flex flex-wrap gap-2 mt-2">
        <select value={assignee} onChange={e => setAssignee(e.target.value)} className="border rounded px-3 py-2 flex-1 min-w-0">
          {assigneeNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="border rounded px-3 py-2 flex-1 min-w-0 md:flex-none" />
        <select value={recurrenceRule} onChange={e => setRecurrenceRule(e.target.value)} className="border rounded px-3 py-2 flex-1 min-w-0" aria-label="Ricorrenza">
          <option value="none">Nessuna ricorrenza</option>
          <option value="weekly">Ogni settimana</option>
          <option value="monthly">Ogni mese</option>
        </select>
        <select value={visibility} onChange={e => setVisibility(e.target.value)} className="border rounded px-3 py-2 flex-1 min-w-0" aria-label="Visibilità">
          <option value="list">Visibile a tutta la lista</option>
          <option value="selected">Solo utenti scelti</option>
        </select>
        <button type="submit" className="basis-full px-4 py-2 bg-green-600 text-white rounded disabled:opacity-60 md:basis-auto" disabled={saving || !isListConfigured}>
          {saving ? 'Creazione...' : 'Crea'}
        </button>
      </div>

      {visibility === 'selected' && (
        <fieldset className="mt-3 border rounded p-3">
          <legend className="px-1 text-sm font-medium">Utenti autorizzati</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {profiles.filter(isSelectableProfile).map(profile => (
              <label key={profile.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={profile.id === user.id || visibleTo.includes(profile.id)}
                  disabled={profile.id === user.id}
                  onChange={event => setVisibleTo(current => event.target.checked
                    ? [...new Set([...current, profile.id])]
                    : current.filter(id => id !== profile.id))}
                />
                {profile.full_name ? formatPersonName(profile.full_name) : profile.email}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </form>
  )
}
