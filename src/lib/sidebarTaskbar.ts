const STORAGE_KEY = 'avenize-sidebar-taskbar'

type Dock = 'left' | 'right'
type State = { collapsed: boolean; dock: Dock }

const readState = (): State => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>
      return {
        collapsed: parsed.collapsed === true,
        dock: parsed.dock === 'right' ? 'right' : 'left',
      }
    }
  } catch {
    // Ignore malformed local state.
  }
  return { collapsed: false, dock: 'left' }
}

const saveState = (state: State) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* best effort */ }
}

const applyState = (state: State) => {
  const root = document.documentElement
  root.dataset.avenizeSidebar = state.collapsed ? 'collapsed' : 'expanded'
  root.dataset.avenizeSidebarDock = state.dock
  saveState(state)
}

const icon = (path: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`

export const initSidebarTaskbar = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (document.getElementById('avenize-sidebar-taskbar')) return

  const state = readState()
  applyState(state)

  const mount = () => {
    if (document.getElementById('avenize-sidebar-taskbar')) return
    const taskbar = document.createElement('div')
    taskbar.id = 'avenize-sidebar-taskbar'
    taskbar.setAttribute('aria-label', 'Sidebar controls')
    taskbar.innerHTML = `
      <button type="button" data-sidebar-action="collapse" aria-label="Collapse sidebar" title="Collapse sidebar">
        ${icon('<polyline points="15 18 9 12 15 6"></polyline>')}
      </button>
      <button type="button" data-sidebar-action="move" aria-label="Move sidebar" title="Move sidebar left or right">
        ${icon('<path d="M8 5l-5 7 5 7"></path><path d="M16 5l5 7-5 7"></path><path d="M3 12h18"></path>')}
      </button>
    `
    document.body.appendChild(taskbar)

    const updateControls = () => {
      const current = readState()
      const collapseButton = taskbar.querySelector<HTMLButtonElement>('[data-sidebar-action="collapse"]')
      const moveButton = taskbar.querySelector<HTMLButtonElement>('[data-sidebar-action="move"]')
      if (collapseButton) {
        collapseButton.innerHTML = current.collapsed
          ? icon('<polyline points="9 18 15 12 9 6"></polyline>')
          : icon('<polyline points="15 18 9 12 15 6"></polyline>')
        collapseButton.title = current.collapsed ? 'Expand sidebar' : 'Collapse sidebar'
        collapseButton.setAttribute('aria-label', collapseButton.title)
      }
      if (moveButton) {
        moveButton.title = current.dock === 'left' ? 'Move sidebar to right' : 'Move sidebar to left'
        moveButton.setAttribute('aria-label', moveButton.title)
      }
    }

    taskbar.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      const action = target.closest<HTMLButtonElement>('[data-sidebar-action]')?.dataset.sidebarAction
      if (!action) return

      const current = readState()
      if (action === 'collapse') current.collapsed = !current.collapsed
      if (action === 'move') current.dock = current.dock === 'left' ? 'right' : 'left'
      applyState(current)
      updateControls()
    })

    updateControls()
  }

  if (document.body) mount()
  else window.addEventListener('DOMContentLoaded', mount, { once: true })
}
