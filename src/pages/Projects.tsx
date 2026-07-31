import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Project = {
  id: string
  name: string
  status: 'active' | 'on_hold' | 'done'
  created_at: string
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState('')

  const load = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProjects((data as Project[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  const addProject = async () => {
    if (!name.trim()) return
    await supabase.from('projects').insert({ name, status: 'active' })
    setName('')
    load()
  }

  return (
    <div>
      <h1 className="text-xl font-medium text-[var(--avenize-black)] mb-6">Projects</h1>

      <div className="flex gap-2 mb-6">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name"
          className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
        <button
          onClick={addProject}
          className="rounded-lg avenize-gradient text-white px-4 py-2 text-sm font-medium"
        >
          Add project
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-black/[0.06] divide-y divide-black/[0.06]">
        {projects.map((p) => (
          <div key={p.id} className="px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-[var(--avenize-black)]">{p.name}</span>
            <span className="text-xs text-black/40 capitalize">{p.status.replace('_', ' ')}</span>
          </div>
        ))}
        {projects.length === 0 && <p className="px-4 py-3 text-sm text-black/40">No projects yet.</p>}
      </div>
    </div>
  )
}
