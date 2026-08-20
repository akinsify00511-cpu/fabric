import { Navigate } from 'react-router-dom'

/**
 * Capture is a meeting capability, not a standalone workspace.
 * Keep the legacy route as a compatibility redirect so old bookmarks and
 * existing navigation cannot expose a second, disconnected capture surface.
 */
export default function AICapture() {
  return <Navigate to="/app/meetings" replace />
}
