import { supabase } from '../lib/supabaseClient'
import dayjs from 'dayjs'

export default function TaskItem({ task, profiles, currentUser, onUpdated }) {
  const assignee = profiles.find(p => p.id === task.assignee)
  const isOwnerOrAssignee = task.assignee === currentUser.id || task.created_by === currentUser.id

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

  return (
    <>
      <tr className="hidden border-t border-gray-200 align-top md:table-row">
        <td className="px-3 py-3 font-medium">
          {task.title}
          {task.priority === 'high' && <span className="ml-2 text-red-600 text-xs">Alta</span>}
        </td>
        <td className="px-3 py-3 text-sm text-gray-700 break-words">{task.description || '—'}</td>
        <td className="px-3 py-3 text-sm">{assignee ? assignee.full_name || assignee.id : 'Non assegnata'}</td>
        <td className="px-3 py-3 text-sm whitespace-nowrap">{task.due_date ? dayjs(task.due_date).format('DD/MM/YYYY') : '—'}</td>
        <td className="px-3 py-3 text-sm capitalize">{task.priority}</td>
        <td className="px-3 py-3 text-sm capitalize">{task.status}</td>
        <td className="px-3 py-3">
          <TaskActions task={task} updateStatus={updateStatus} deleteTask={deleteTask} isOwnerOrAssignee={isOwnerOrAssignee} />
        </td>
      </tr>

      <tr className="border-t border-gray-200 md:hidden">
        <td colSpan="7" className="p-3">
          <article className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold break-words">{task.title}</h3>
              {task.priority === 'high' && <span className="shrink-0 text-xs font-medium text-red-600">Alta</span>}
            </div>
            <p className="text-sm text-gray-700 break-words">{task.description || 'Nessuna descrizione'}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Assegnatario</dt>
                <dd className="break-words">{assignee ? assignee.full_name || assignee.id : 'Non assegnata'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Scadenza</dt>
                <dd>{task.due_date ? dayjs(task.due_date).format('DD/MM/YYYY') : '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Priorità</dt>
                <dd className="capitalize">{task.priority}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Stato</dt>
                <dd className="capitalize">{task.status}</dd>
              </div>
            </dl>
            <TaskActions task={task} updateStatus={updateStatus} deleteTask={deleteTask} isOwnerOrAssignee={isOwnerOrAssignee} />
          </article>
        </td>
      </tr>
    </>
  )
}

function TaskActions({ task, updateStatus, deleteTask, isOwnerOrAssignee }) {
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

      {isOwnerOrAssignee && (
        <button onClick={deleteTask} className="px-2 py-1 bg-red-500 text-white rounded text-xs">Elimina</button>
      )}
    </div>
  )
}
