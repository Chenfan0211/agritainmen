export interface PlatformEvent<T = unknown> {
  topic: string
  payload: T
  publishedAt: number
}

export type PlatformEventListener<T = unknown> = (event: PlatformEvent<T>) => void

type BrowserWindow = Pick<Window, 'localStorage' | 'addEventListener' | 'removeEventListener'>
const fallbackBuses = new Map<string, Set<PlatformEventBus>>()

export class PlatformEventBus {
  private readonly storageKey: string
  private readonly channelName: string
  private readonly listeners = new Map<string, Set<PlatformEventListener>>()
  private readonly channel: BroadcastChannel | null
  private readonly browserWindow: BrowserWindow | null
  private disposed = false

  private readonly handleMessage = (event: MessageEvent): void => {
    this.deliver(event.data)
  }

  private readonly handleStorage = (event: StorageEvent): void => {
    if (event.key !== this.storageKey || !event.newValue) return
    try {
      this.deliver(JSON.parse(event.newValue))
    } catch {
      // Ignore malformed events from unrelated or stale clients.
    }
  }

  constructor(channelName = 'agritainment-platform') {
    this.channelName = channelName
    this.storageKey = `agritainment-platform-event:${channelName}`
    const BroadcastChannelConstructor = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel
    this.channel = BroadcastChannelConstructor ? new BroadcastChannelConstructor(channelName) : null
    this.browserWindow = !this.channel && typeof window !== 'undefined' && window.localStorage ? window : null
    if (this.channel) this.channel.onmessage = this.handleMessage
    else {
      this.browserWindow?.addEventListener('storage', this.handleStorage)
      const buses = fallbackBuses.get(channelName) ?? new Set()
      buses.add(this)
      fallbackBuses.set(channelName, buses)
    }
  }

  publish<T>(topic: string, payload: T): void {
    if (this.disposed || !topic) return
    const event: PlatformEvent<T> = { topic, payload, publishedAt: Date.now() }
    this.deliver(event)
    if (this.channel) {
      this.channel.postMessage(event)
      return
    }
    for (const bus of fallbackBuses.get(this.channelName) ?? []) {
      if (bus !== this) bus.deliver(event)
    }
    if (!this.browserWindow) return
    try {
      this.browserWindow.localStorage.setItem(this.storageKey, JSON.stringify(event))
      this.browserWindow.localStorage.removeItem(this.storageKey)
    } catch {
      // Publishing remains local when storage is unavailable or full.
    }
  }

  subscribe<T>(topic: string, listener: PlatformEventListener<T>): () => void {
    if (this.disposed) return () => undefined
    const listeners = this.listeners.get(topic) ?? new Set<PlatformEventListener>()
    listeners.add(listener as PlatformEventListener)
    this.listeners.set(topic, listeners)
    return () => {
      listeners.delete(listener as PlatformEventListener)
      if (!listeners.size) this.listeners.delete(topic)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    if (this.channel) {
      this.channel.onmessage = null
      this.channel.close()
    } else {
      this.browserWindow?.removeEventListener('storage', this.handleStorage)
      const buses = fallbackBuses.get(this.channelName)
      buses?.delete(this)
      if (!buses?.size) fallbackBuses.delete(this.channelName)
    }
  }

  private deliver(value: unknown): void {
    if (this.disposed || !value || typeof value !== 'object') return
    const event = value as Partial<PlatformEvent>
    if (!event.topic || typeof event.topic !== 'string' || typeof event.publishedAt !== 'number') return
    for (const listener of this.listeners.get(event.topic) ?? []) {
      try {
        listener(event as PlatformEvent)
      } catch {
        // A subscriber must not block remaining listeners or remote delivery.
      }
    }
  }
}
