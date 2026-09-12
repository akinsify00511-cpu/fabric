const STORAGE_KEY = 'avenize-sidebar-taskbar'

type Dock = 'left' | 'right'
type State = { collapsed: boolean; dock: Dock }

const DEFAULT_STATE: State = { collapsed: false, dock: 'left' }

const readState = (): State => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<State>
    return {
      collapsed: parsed.collapsed === true,
      dock: parsed.dock === 'right' ? 'right' : 'left',
    }
  } catch {
    return DEFAULT_STATE
  }
}

const saveState = (state: State) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Best effort persistence only.
  }
}

const applyState = (state: State) => {
  const root = document.documentElement
  root.dataset.avenizeSidebar = state.collapsed ? 'collapsed' : 'expanded'
  root.dataset.avenizeSidebarDock = state.dock
  saveState(state)
}

const icon = (path: string, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`

export const initSidebarTaskbar = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (document.getElementById('avenize-sidebar-taskbar')) return

  applyState(readState())

  const mount = () => {
    if (document.getElementById('avenize-sidebar-taskbar')) return

    const taskbar = document.createElement('div')
    taskbar.id = 'avenize-sidebar-taskbar'
    taskbar.setAttribute('role', 'toolbar')
    taskbar.setAttribute('aria-label', 'Sidebar controls')
    taskbar.innerHTML = `
      <button type="button" class="avenize-sidebar-drag" data-sidebar-action="drag" aria-label="Drag to move sidebar" title="Drag to move sidebar">
        ${icon('<circle cx="9" cy="7" r="1"></circle><circle cx="15" cy="7" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="9" cy="17" r="1"></circle><circle cx="15" cy="17" r="1"></circle>', 15)}
      </button>
      <span class="avenize-sidebar-taskbar-divider" aria-hidden="true"></span>
      <button type="button" data-sidebar-action="collapse" aria-label="Collapse sidebar" title="Collapse sidebar">
        ${icon('<polyline points="15 18 9 12 15 6"></polyline>')}
      </button>
      <button type="button" data-sidebar-action="move" aria-label="Move sidebar to right" title="Move sidebar to right">
        ${icon('<path d="M5 7l5 5-5 5"></path><path d="M19 7l-5 5 5 5"></path>')}
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
        moveButton.innerHTML = current.dock === 'left'
          ? icon('<path d="M5 7l5 5-5 5"></path><path d="M19 7l-5 5-5-5"></path>')
          : icon('<path d="M19 7l-5 5 5 5"></path><path d="M5 7l5 5 5-5"></path>')
        moveButton.title = current.dock === 'left' ? 'Move sidebar to right' : 'Move sidebar to left'
        moveButton.setAttribute('aria-label', moveButton.title)
      }
    }

    const setDockFromPointer = (clientX: number) => {
      const current = readState()
      const nextDock: Dock = clientX < window.innerWidth / 2 ? 'left' : 'right'
      if (current.dock !== nextDock) {
        current.dock = nextDock
        applyState(current)
        updateControls()
      }
    }

    let dragging = false

    taskbar.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-sidebar-action="drag"]')) return
      dragging = true
      taskbar.classList.add('is-dragging')
      ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
      setDockFromPointer(event.clientX)
    })

    taskbar.addEventListener('pointermove', (event) => {
      if (!dragging) return
      setDockFromPointer(event.clientX)
    })

    taskbar.addEventListener('pointerup', () => {
      dragging = false
      taskbar.classList.remove('is-dragging')
    })

    taskbar.addEventListener('pointercancel', () => {
      dragging = false
      taskbar.classList.remove('is-dragging')
    })

    taskbar.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      const button = target.closest<HTMLButtonElement>('[data-sidebar-action]')
      const action = button?.dataset.sidebarAction
      if (!action || action === 'drag') return

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
