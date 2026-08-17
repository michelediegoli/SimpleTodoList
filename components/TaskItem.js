import { supabase } from '../lib/supabaseClient'
import dayjs from 'dayjs'

export default function TaskItem({ task, profiles, currentUser }) {
  const assignee = profiles.find(p => p.id === task.assignee)
  const isOwnerOrAssignee = task.assignee === currentUser.id || task.created_by === currentUser.id

  async function updateStatus(newStatus) {
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
  }

  async function deleteTask() {
    if (!confirm('Eliminare questa attività?')) return
    await supabase.from('tasks').delete().eq('id', task.id)
  }

  return (
    <div className="bg-white p-3 rounded shadow mb-2 flex flex-col md:flex-row md:items-center md:justify-between">
      <div>
        <div className="font-medium">{task.title} {task.priority === 'high' && <span className="text-red-600">• Alta</span>}</div>
        {task.description && <div className="text-sm text-gray-600">{task.description}</div>}
        <div className="text-xs text-gray-500 mt-1">
          {assignee ? `Assegnata a: ${assignee.full_name}` : 'Non assegnata'}
          {task.due_date && ` • Scadenza: ${dayjs(task.due_date).format('DD/MM/YYYY')}`}
          {task.completed_at && ` • Completata: ${dayjs(task.completed_at).format('DD/MM/YYYY HH:mm')}`}
        </div>
      </div>

      <div className="mt-3 md:mt-0 flex items-center gap-2">
        {task.status !== 'completed' ? (
          <>
            <button onClick={() => updateStatus('in_progress')} className="px-3 py-1 bg-yellow-500 text-white rounded">In corso</button>
            <button onClick={() => updateStatus('completed')} className="px-3 py-1 bg-green-600 text-white rounded">Completa</button>
          </>
        ) : (
          <button onClick={() => updateStatus('todo')} className="px-3 py-1 bg-gray-300 rounded">Riapri</button>
        )}

        {isOwnerOrAssignee && (
          <button onClick={deleteTask} className="px-3 py-1 bg-red-500 text-white rounded">Elimina</button>
        )}
      </div>
    </div>
  )
}
