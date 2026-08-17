import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import '../styles/organism.css'

export default function GlobalOrganismRuntime() {
  const location = useLocation()

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    root.classList.add('av-organism')
    root.classList.remove('av-route-enter')
    void root.offsetWidth
    root.classList.add('av-route-enter')
    const timer = window.setTimeout(() => root.classList.remove('av-route-enter'), 360)
    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search])

  return null
}
