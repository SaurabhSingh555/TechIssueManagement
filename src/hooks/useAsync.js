import { useCallback, useEffect, useRef, useState } from 'react'

// Lightweight async data hook with loading / error / reload support
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const fnRef = useRef(fn)
  fnRef.current = fn
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    Promise.resolve(fnRef.current())
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])
  return { ...state, reload }
}
