import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function signUp() {
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) setMessage(error.message)
    else setMessage('Registrazione inviata. Verifica la tua email.')
  }

  async function signIn() {
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setMessage(error.message)
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider: 'google' })
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded shadow p-6">
        <h1 className="text-xl font-semibold mb-4">Accedi a Simple Todo</h1>

        <label className="block text-sm">Email</label>
        <input className="w-full border rounded px-3 py-2 mb-3" value={email} onChange={e => setEmail(e.target.value)} />

        <label className="block text-sm">Password</label>
        <input type="password" className="w-full border rounded px-3 py-2 mb-3" value={password} onChange={e => setPassword(e.target.value)} />

        <div className="flex gap-2">
          <button onClick={signIn} className="px-4 py-2 bg-blue-600 text-white rounded" disabled={loading}>
            Accedi
          </button>
          <button onClick={signUp} className="px-4 py-2 bg-gray-200 rounded" disabled={loading}>
            Registrati
          </button>
        </div>

        <div className="my-3 text-center">oppure</div>

        <button onClick={signInWithGoogle} className="w-full px-4 py-2 bg-red-600 text-white rounded">
          Accedi con Google
        </button>

        {message && <div className="mt-3 text-sm text-red-600">{message}</div>}
      </div>
    </div>
  )
}
