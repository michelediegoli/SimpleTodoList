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
    <tr className="border-t border-gray-200 align-top">
      <td className="px-3 py-3 font-medium">
        {task.title}
        {task.priority === 'high' && <span className="ml-2 text-red-600 text-xs">Alta</span>}
      </td>
      <td className="px-3 py-3 text-sm text-gray-700">{task.description || '—'}</td>
      <td className="px-3 py-3 text-sm">{assignee ? assignee.full_name || assignee.id : 'Non assegnata'}</td>
      <td className="px-3 py-3 text-sm">{task.due_date ? dayjs(task.due_date).format('DD/MM/YYYY') : '—'}</td>
      <td className="px-3 py-3 text-sm capitalize">{task.priority}</td>
      <td className="px-3 py-3 text-sm capitalize">{task.status}</td>
      <td className="px-3 py-3">
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
      </td>
    </tr>
  )
}
