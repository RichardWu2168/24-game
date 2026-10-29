import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { gameApi } from '../api/gameApi'
import type { GameHistoryItem } from '../game.types'

export function useGameHistory() {
  const [games, setGames] = useState<GameHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [page, setPage] = useState<{ nextCursor: string | null; hasMore: boolean }>({ nextCursor: null, hasMore: false })
  const [error, setError] = useState('')
  const [isClearing, setIsClearing] = useState(false)
  const clearing = useRef(false)
  const refreshing = useRef(false)
  const loadingMore = useRef<number | null>(null)
  const mounted = useRef(false)
  const version = useRef(0)

  const refresh = useCallback(async () => {
    if (clearing.current) return
    const request = ++version.current
    refreshing.current = true
    loadingMore.current = null
    await Promise.resolve()
    if (!mounted.current || request !== version.current) return
    setIsLoading(true)
    setIsLoadingMore(false)
    setError('')
    try {
      const data = await gameApi.loadHistory()
      if (mounted.current && request === version.current) {
        setGames(data.games)
        setPage({ nextCursor: data.nextCursor, hasMore: data.hasMore })
      }
    } catch (cause) {
      if (!mounted.current || request !== version.current) return
      console.error('Failed to load game history:', cause)
      setError('Unable to load game history. Please try again.')
    } finally {
      if (mounted.current && request === version.current) {
        refreshing.current = false
        setIsLoading(false)
      }
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!mounted.current || clearing.current || refreshing.current || loadingMore.current !== null || !page.hasMore || !page.nextCursor) return
    const request = ++version.current
    loadingMore.current = request
    setIsLoadingMore(true)
    setError('')
    try {
      const data = await gameApi.loadHistory(page.nextCursor)
      if (!mounted.current || request !== version.current) return
      setGames(current => {
        const ids = new Set(current.map(game => game.id))
        return [...current, ...data.games.filter(game => !ids.has(game.id))]
      })
      setPage({ nextCursor: data.nextCursor, hasMore: data.hasMore })
    } catch (cause) {
      if (!mounted.current || request !== version.current) return
      console.error('Failed to load more history:', cause)
      setError('Unable to load more history. Refresh History and try again.')
    } finally {
      if (mounted.current && request === version.current) {
        loadingMore.current = null
        setIsLoadingMore(false)
      }
    }
  }, [page])

  const clear = useCallback(async (): Promise<boolean> => {
    if (!mounted.current || clearing.current) return false
    clearing.current = true
    refreshing.current = false
    loadingMore.current = null
    const request = ++version.current
    setIsLoading(false)
    setIsLoadingMore(false)
    setIsClearing(true)
    setError('')
    try {
      await gameApi.clearHistory()
      if (!mounted.current || request !== version.current) return false
      setGames(current => current.filter(game => game.status === 'IN_PROGRESS'))
      setPage({ nextCursor: null, hasMore: false })
      return true
    } catch (cause) {
      if (mounted.current && request === version.current) {
        console.error('Failed to clear game history:', cause)
        setError('Unable to clear game history. Please try again.')
      }
      return false
    } finally {
      clearing.current = false
      if (mounted.current && request === version.current) setIsClearing(false)
    }
  }, [])

  const invalidate = useCallback(() => {
    mounted.current = false
    version.current++
    refreshing.current = false
    loadingMore.current = null
  }, [])
  const initialize = useEffectEvent(() => { void refresh() })
  useEffect(() => {
    mounted.current = true
    let active = true
    void Promise.resolve().then(() => { if (active) initialize() })
    return () => { active = false; invalidate() }
  }, [invalidate])

  return { games, isLoading, isLoadingMore, hasMore: page.hasMore, isClearing, error, refresh, loadMore, clear }
}
