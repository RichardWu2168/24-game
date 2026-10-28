import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { gameApi } from '../api/gameApi'
import type { GameHistoryItem } from '../game.types'

export function useGameHistory() {
  const [games, setGames] = useState<GameHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(false)
  const version = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++version.current
    await Promise.resolve()
    if (!mounted.current || request !== version.current) return
    setIsLoading(true)
    setError('')
    try {
      const data = await gameApi.loadHistory()
      if (mounted.current && request === version.current) setGames(data.games)
    } catch (cause) {
      if (!mounted.current || request !== version.current) return
      console.error('Failed to load game history:', cause)
      setError('Unable to load game history. Please try again.')
    } finally {
      if (mounted.current && request === version.current) setIsLoading(false)
    }
  }, [])

  const invalidate = useCallback(() => { mounted.current = false; version.current++ }, [])
  const initialize = useEffectEvent(() => { void refresh() })
  useEffect(() => {
    mounted.current = true
    let active = true
    void Promise.resolve().then(() => { if (active) initialize() })
    return () => { active = false; invalidate() }
  }, [invalidate])

  return { games, isLoading, error, refresh }
}
