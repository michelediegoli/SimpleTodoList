import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { assigneeNames } from '../lib/assignees'
import dayjs from 'dayjs'

const statusLabels = {
  todo: 'Da fare',
  in_progress: 'In corso',
  completed: 'Completata'
}

const priorityLabels = {
  low: 'Bassa',
  medium: 'Media',
  high: 'Alta'
}

export default function TaskItem({ task, profiles, currentUser, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const assigneeLabel = task.assignee || 'Altro'
  const isOwnerOrAssignee = task.created_by === currentUser.id

  async function updateStatus(newStatus) {
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', task.id)

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    onUpdated && onUpdated()
  }

  async function deleteTask() {
    if (!confirm('Eliminare questa attività?')) return
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) {
      console.error(error)
      alert(error.message)
      return
    }
    onUpdated && onUpdated()
  }

  if (editing) {
    return <TaskEditor task={task} profiles={profiles} onCancel={() => setEditing(false)} onSaved={() => {
      setEditing(false)
      onUpdated && onUpdated()
    }} />
  }

  const actions = (
    <TaskActions
      task={task}
      updateStatus={updateStatus}
      deleteTask={deleteTask}
      isOwnerOrAssignee={isOwnerOrAssignee}
      onEdit={() => setEditing(true)}
    />
  )

  return (
    <>
      <tr className="hidden border-t border-gray-200 align-top md:table-row">
        <td className="px-3 py-3 font-medium">
          {task.title}
          {task.priority === 'high' && <span className="ml-2 text-red-600 text-xs">Alta</span>}
          {task.recurrence_rule === 'monthly' && <span className="ml-2 text-blue-600 text-xs">Mensile</span>}
        </td>
        <td className="px-3 py-3 text-sm text-gray-700 break-words">{task.description || '—'}</td>
        <td className="px-3 py-3 text-sm">{assigneeLabel}</td>
        <td className="px-3 py-3 text-sm whitespace-nowrap">{task.due_date ? dayjs(task.due_date).format('DD/MM/YYYY') : '—'}</td>
        <td className="px-3 py-3 text-sm">{priorityLabels[task.priority] || task.priority}</td>
        <td className="px-3 py-3 text-sm">{statusLabels[task.status] || task.status}</td>
        <td className="px-3 py-3">
          {actions}
        </td>
      </tr>

      <tr className="border-t border-gray-200 md:hidden">
        <td colSpan="7" className="p-3">
          <article className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold break-words">{task.title}</h3>
              <div className="shrink-0 text-xs font-medium">
                {task.priority === 'high' && <span className="mr-2 text-red-600">Alta</span>}
                {task.recurrence_rule === 'weekly' && <span className="text-blue-600">Settimanale</span>}
                {task.recurrence_rule === 'monthly' && <span className="text-blue-600">Mensile</span>}
              </div>
            </div>
            <p className="text-sm text-gray-700 break-words">{task.description || 'Nessuna descrizione'}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Assegnatario</dt>
                <dd className="break-words">{assigneeLabel}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Scadenza</dt>
                <dd>{task.due_date ? dayjs(task.due_date).format('DD/MM/YYYY') : '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Priorità</dt>
                <dd>{priorityLabels[task.priority] || task.priority}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Stato</dt>
                <dd>{statusLabels[task.status] || task.status}</dd>
              </div>
            </dl>
            {actions}
          </article>
        </td>
      </tr>
    </>
  )
}

function TaskEditor({ task, profiles, onCancel, onSaved }) {
  const [expectedUpdatedAt] = useState(task.updated_at)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const selectedAssignee = assigneeNames.includes(task.assignee) ? task.assignee : 'Altro'
  const [assignee, setAssignee] = useState(selectedAssignee)
  const [dueDate, setDueDate] = useState(task.due_date || '')
  const [priority, setPriority] = useState(task.priority)
  const [recurrenceRule, setRecurrenceRule] = useState(task.recurrence_rule || 'none')
  const [visibility, setVisibility] = useState(task.visibility || 'list')
  const [visibleTo, setVisibleTo] = useState(task.visible_to || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function saveTask(event) {
    event.preventDefault()
    if (!title.trim()) {
      setError('Inserisci un titolo per la task.')
      return
    }

    setSaving(true)
    setError('')
    const { data, error: updateError } = await supabase
      .from('tasks')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        assignee,
        due_date: dueDate || null,
        priority,
        recurrence_rule: recurrenceRule,
        recurrence_day: null,
        visibility,
        visible_to: visibility === 'selected' ? Array.from(new Set([task.created_by, ...visibleTo])) : []
      })
      .eq('id', task.id)
      .eq('updated_at', expectedUpdatedAt)
      .select('id')

    setSaving(false)
    if (updateError) {
      console.error(updateError)
      setError(updateError.message)
      return
    }
    if (!data?.length) {
      setError('Questo task è stato modificato da un altro utente. Annulla e ricarica la lista prima di riprovare.')
      return
    }
    onSaved()
  }

  return (
    <tr className="border-t border-gray-200">
      <td colSpan="7" className="p-3">
        <form onSubmit={saveTask} className="grid grid-cols-1 gap-2 md:grid-cols-6">
          <input value={title} onChange={event => setTitle(event.target.value)} className="border rounded px-3 py-2 md:col-span-2" aria-label="Titolo" />
          <input value={description} onChange={event => setDescription(event.target.value)} placeholder="Descrizione" className="border rounded px-3 py-2 md:col-span-2" aria-label="Descrizione" />
          <select value={assignee} onChange={event => setAssignee(event.target.value)} className="border rounded px-3 py-2" aria-label="Assegnato a">
            {assigneeNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="border rounded px-3 py-2" aria-label="Scadenza" />
          <select value={priority} onChange={event => setPriority(event.target.value)} className="border rounded px-3 py-2" aria-label="Priorità">
            <option value="low">Bassa</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
          <select value={recurrenceRule} onChange={event => setRecurrenceRule(event.target.value)} className="border rounded px-3 py-2" aria-label="Ricorrenza">
            <option value="none">Nessuna ricorrenza</option>
            <option value="weekly">Ogni settimana</option>
            <option value="monthly">Ogni mese</option>
          </select>
          <select value={visibility} onChange={event => setVisibility(event.target.value)} className="border rounded px-3 py-2" aria-label="Visibilità">
            <option value="list">Tutta la lista</option>
            <option value="selected">Solo utenti scelti</option>
          </select>
          {visibility === 'selected' && (
            <fieldset className="border rounded p-2 md:col-span-4">
              <legend className="px-1 text-xs">Utenti autorizzati</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {profiles.map(profile => (
                  <label key={profile.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={profile.id === task.created_by || visibleTo.includes(profile.id)}
                      disabled={profile.id === task.created_by}
                      onChange={event => setVisibleTo(current => event.target.checked
                        ? [...new Set([...current, profile.id])]
                        : current.filter(id => id !== profile.id))}
                    />
                    {profile.full_name || profile.email}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex items-center gap-2 md:col-span-2">
            <button type="submit" disabled={saving} className="px-3 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-60">{saving ? 'Salvataggio...' : 'Salva'}</button>
            <button type="button" onClick={onCancel} className="px-3 py-2 border rounded text-sm">Annulla</button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </form>
      </td>
    </tr>
  )
}

function TaskActions({ task, updateStatus, deleteTask, isOwnerOrAssignee, onEdit }) {
  return (
    <div className="flex flex-wrap gap-2">
      {task.status !== 'completed' ? (
        <>
          <button onClick={() => updateStatus('in_progress')} className="px-2 py-1 bg-yellow-500 text-white rounded text-xs">In corso</button>
          <button onClick={() => updateStatus('completed')} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Completa</button>
        </>
      ) : (
        <button onClick={() => updateStatus('todo')} className="px-2 py-1 bg-gray-300 rounded text-xs">Riapri</button>
      )}

      <button onClick={onEdit} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Modifica</button>

      {isOwnerOrAssignee && (
        <>
          <button onClick={deleteTask} className="px-2 py-1 bg-red-500 text-white rounded text-xs">Elimina</button>
        </>
      )}
    </div>
  )
}
