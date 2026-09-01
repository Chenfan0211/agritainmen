export function createSharedRefreshRunner(
  refresh: () => Promise<unknown>,
  onError: (error: unknown) => void
): () => void {
  let scheduled = false
  let running = false
  let dirty = false

  return () => {
    if (running) {
      dirty = true
      return
    }
    if (scheduled) return
    scheduled = true
    queueMicrotask(async () => {
      scheduled = false
      running = true
      do {
        dirty = false
        try {
          await refresh()
        } catch (error) {
          onError(error)
        }
      } while (dirty)
      running = false
    })
  }
}
