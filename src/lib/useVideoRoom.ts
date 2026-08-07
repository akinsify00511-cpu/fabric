// ============================================
// VIDEO ROOM HOOK - Manages video meeting state
// ============================================

import { useState, useCallback, useRef } from 'react'

interface VideoRoomState {
  isOpen: boolean
  roomName: string | null
  displayName: string
  isHost: boolean
}

interface UseVideoRoomReturn {
  // State
  roomState: VideoRoomState
  
  // Actions
  openRoom: (roomName?: string, displayName?: string, isHost?: boolean) => void
  closeRoom: () => void
  
  // Utilities
  generateRoomName: (prefix?: string) => string
  generateInviteLink: (roomName: string) => string
}

// Generate a unique room name
const generateRoomId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function useVideoRoom(defaultDisplayName: string = 'Guest'): UseVideoRoomReturn {
  const [roomState, setRoomState] = useState<VideoRoomState>({
    isOpen: false,
    roomName: null,
    displayName: defaultDisplayName,
    isHost: false,
  })

  // Open a video room
  const openRoom = useCallback((
    roomName?: string,
    displayName?: string,
    isHost?: boolean
  ) => {
    const finalRoomName = roomName || `avenize-${generateRoomId()}`
    const finalDisplayName = displayName || defaultDisplayName
    const finalIsHost = isHost ?? true

    setRoomState({
      isOpen: true,
      roomName: finalRoomName,
      displayName: finalDisplayName,
      isHost: finalIsHost,
    })
  }, [defaultDisplayName])

  // Close the room
  const closeRoom = useCallback(() => {
    setRoomState(prev => ({
      ...prev,
      isOpen: false,
    }))
    
    // Clear room name after a delay to allow cleanup
    setTimeout(() => {
      setRoomState({
        isOpen: false,
        roomName: null,
        displayName: defaultDisplayName,
        isHost: false,
      })
    }, 500)
  }, [defaultDisplayName])

  // Generate a new room name
  const generateRoomName = useCallback((prefix: string = 'avenize') => {
    return `${prefix}-${generateRoomId()}`
  }, [])

  // Generate an invite link
  const generateInviteLink = useCallback((roomName: string) => {
    return `${window.location.origin}/meet/${encodeURIComponent(roomName)}`
  }, [])

  return {
    roomState,
    openRoom,
    closeRoom,
    generateRoomName,
    generateInviteLink,
  }
}

// Share meeting link to clipboard
export async function shareMeetingLink(roomName: string, displayName: string): Promise<boolean> {
  const link = `${window.location.origin}/meet/${encodeURIComponent(roomName)}?name=${encodeURIComponent(displayName)}`
  
  try {
    await navigator.clipboard.writeText(link)
    return true
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = link
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    return true
  }
}

// Copy text to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
