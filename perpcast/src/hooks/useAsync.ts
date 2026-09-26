import { useEffect, useState } from 'react'
import { useAuth } from '../store/auth'

/** Runs `fn` whenever `deps` change (after the backend is ready); keeps previous data while reloading. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const ready = useAuth((s) => s.hydrated)
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!ready) return
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e: Error) => alive && setState((s) => ({ data: s.data, loading: false, error: e.message || 'Failed to load' })))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, ready])
  return { ...state, reload: () => setTick((t) => t + 1) }
}
