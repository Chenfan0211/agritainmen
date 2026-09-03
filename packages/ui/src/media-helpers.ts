import { normalizeMediaReference } from '@agritainment/shared'
import type { MediaReference } from '@agritainment/shared'

export type MediaCompressionKind = 'normal' | 'license'

export function initialResolvedMediaUrl(value: MediaReference | string | null | undefined): string {
  const reference = normalizeMediaReference(value)
  return reference?.source === 'builtin' ? reference.path : reference?.source === 'legacy' ? reference.url : ''
}

export function mediaCompressionProfile(kind: MediaCompressionKind): { maxEdge: number; quality: number } {
  return kind === 'license'
    ? { maxEdge: 2400, quality: 0.9 }
    : { maxEdge: 1600, quality: 0.82 }
}

export function fitMediaDimensions(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (![width, height, maxEdge].every((value) => Number.isFinite(value) && value > 0)) throw new Error('图片尺寸无效')
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

export function normalizeUploaderValue(
  value: MediaReference | string | null | undefined | readonly (MediaReference | string)[]
): MediaReference[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value]
  return values.flatMap((item) => {
    const reference = normalizeMediaReference(item)
    return reference ? [reference] : []
  })
}

export function mergeUploadedMedia(current: readonly MediaReference[], incoming: readonly MediaReference[], multiple: boolean, maxCount: number): MediaReference[] {
  const limit = Math.max(1, Math.floor(maxCount || 1))
  if (!multiple) return incoming.length ? [{ ...incoming[0] }] : current.slice(0, 1).map((item) => ({ ...item }))
  return [...current, ...incoming].slice(0, limit).map((item) => ({ ...item }))
}

export function uploaderCanChoose(currentCount: number, multiple: boolean, maxCount: number): boolean {
  return !multiple || currentCount < Math.max(1, Math.floor(maxCount || 1))
}

export function moveUploadedMedia(values: readonly MediaReference[], from: number, to: number): MediaReference[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= values.length || to >= values.length || from === to) {
    return values.map((item) => ({ ...item }))
  }
  const next = values.map((item) => ({ ...item }))
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

interface ResolvedMediaControllerOptions {
  fallbackUrl: string
  errorFallbackUrl?: string
  resolve: (reference: MediaReference) => Promise<string>
  release: (url: string) => void
  onChange: (url: string) => void
  onError?: (failed: boolean) => void
}

export interface ResolvedMediaController {
  set(reference: MediaReference | string | null | undefined): Promise<void>
  fail(resolvedUrl: string): void
  dispose(): void
}

export function createResolvedMediaController(options: ResolvedMediaControllerOptions): ResolvedMediaController {
  let version = 0
  let currentUrl = ''
  let disposed = false
  const releaseCurrent = () => {
    if (!currentUrl) return
    options.release(currentUrl)
    currentUrl = ''
  }
  return {
    async set(value) {
      const ownVersion = ++version
      releaseCurrent()
      options.onError?.(false)
      if (!disposed) options.onChange(options.fallbackUrl)
      const reference = normalizeMediaReference(value)
      if (!reference) return
      try {
        const url = await options.resolve(reference)
        if (disposed || ownVersion !== version) {
          options.release(url)
          return
        }
        currentUrl = url
        options.onChange(url)
      } catch {
        if (!disposed && ownVersion === version) options.onError?.(true)
      }
    },
    fail(resolvedUrl) {
      if (disposed) return
      const fallbackFailed = resolvedUrl === options.fallbackUrl
      if (resolvedUrl !== currentUrl && !fallbackFailed) return
      if (resolvedUrl === currentUrl) releaseCurrent()
      const nextUrl = fallbackFailed && options.errorFallbackUrl && options.errorFallbackUrl !== resolvedUrl
        ? options.errorFallbackUrl
        : options.fallbackUrl
      if (nextUrl !== resolvedUrl) options.onChange(nextUrl)
      options.onError?.(true)
    },
    dispose() {
      disposed = true
      version += 1
      releaseCurrent()
    }
  }
}
