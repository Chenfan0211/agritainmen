import type { PlatformRepository, PlatformRepositoryTransaction } from './platform-repository'

export const MEDIA_ASSET_COLLECTION = 'media-assets'
export const MAX_MEDIA_ASSET_BYTES = 10 * 1024 * 1024
export const PENDING_MEDIA_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type MediaMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export type MediaReference =
  | { source: 'asset'; assetId: string }
  | { source: 'builtin'; path: string }
  | { source: 'legacy'; url: string }

export interface MediaAsset {
  id: string
  purpose: string
  mimeType: MediaMimeType
  size: number
  width: number
  height: number
  sha256: string
  status: 'pending' | 'bound'
  bindings: string[]
  pendingBindings: string[]
  createdAt: string
  updatedAt: string
}

export interface MediaSaveOptions {
  width: number
  height: number
  now?: string | number | Date
  digest?: (data: Uint8Array) => Promise<string>
  purpose?: string
}

export interface MediaLifecycleOptions {
  now?: string | number | Date
}

export interface MediaReplacementFinalizeInput {
  bindingId: string
  nextReference: MediaReference | null
  protectionToken?: string
  updatedAt: string
}

export class MediaReplacementFinalizeError<T = unknown> extends Error {
  readonly cause: unknown

  constructor(cause: unknown, readonly retry: () => Promise<T>) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`Media replacement finalize failed: ${detail}`)
    this.name = 'MediaReplacementFinalizeError'
    this.cause = cause
  }
}

export interface MediaObjectUrlFactory {
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

export interface MediaStorageAdapter {
  save(file: Blob, purpose: string, options: MediaSaveOptions): Promise<Extract<MediaReference, { source: 'asset' }>>
  saveBytes?(data: Uint8Array, mimeType: MediaMimeType, purpose: string, options: MediaSaveOptions): Promise<Extract<MediaReference, { source: 'asset' }>>
  resolve(reference: MediaReference | string): Promise<string>
  remove(assetId: string): Promise<void>
  release(resolvedUrl: string): void
}

export interface MediaFileSystem {
  writeFile(path: string, data: Uint8Array): Promise<void>
  readFile(path: string): Promise<Uint8Array | null>
  removeFile(path: string): Promise<void>
}

interface StoredMediaAsset extends MediaAsset {
  blob?: Blob
  filePath?: string
}

export interface MediaAssetTransaction {
  get(assetId: string): Promise<StoredMediaAsset | null>
  list(): Promise<StoredMediaAsset[]>
  put(asset: StoredMediaAsset): Promise<void>
  remove(assetId: string): Promise<void>
}

export interface MediaAssetRepository extends MediaStorageAdapter {
  runAssetTransaction<T>(execute: (transaction: MediaAssetTransaction) => Promise<T> | T): Promise<T>
}

export interface MediaRandomSource {
  randomUUID?: () => string
  getRandomValues?: <T extends ArrayBufferView>(target: T) => T
}

interface AdapterOptions {
  objectUrls?: MediaObjectUrlFactory
  operationIdFactory?: () => string
}

class SerialExecutor {
  private tail: Promise<void> = Promise.resolve()

  run<T>(execute: () => Promise<T>): Promise<T> {
    const result = this.tail.then(execute)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}

export function createMediaUniqueId(prefix: string, random: MediaRandomSource = globalThis.crypto): string {
  if (typeof random?.randomUUID === 'function') return `${prefix}-${random.randomUUID()}`
  const bytes = new Uint8Array(16)
  if (typeof random?.getRandomValues === 'function') random.getRandomValues(bytes)
  else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function isoNow(value?: string | number | Date): string {
  const date = value === undefined ? new Date() : value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('now must be a valid date')
  return date.toISOString()
}

function cloneAsset<T extends StoredMediaAsset>(asset: T): T {
  return { ...asset, bindings: [...asset.bindings], pendingBindings: [...asset.pendingBindings] }
}

function defaultObjectUrls(): MediaObjectUrlFactory {
  const url = globalThis.URL
  if (typeof url?.createObjectURL !== 'function' || typeof url?.revokeObjectURL !== 'function') {
    throw new Error('Object URL support is unavailable; provide objectUrls')
  }
  return {
    createObjectURL: (blob) => url.createObjectURL(blob),
    revokeObjectURL: (resolvedUrl) => url.revokeObjectURL(resolvedUrl)
  }
}

function normalizeMimeType(value: string): MediaMimeType {
  const mimeType = value.trim().toLowerCase()
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') {
    throw new Error(`Unsupported media MIME type: ${mimeType || '(empty)'}`)
  }
  return mimeType
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('Media width and height must be positive integers')
  }
}

async function sha256(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('SHA-256 is unavailable; provide a digest implementation')
  const digest = await subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function describeBytes(bytes: Uint8Array, mimeTypeInput: string, purpose: string, options: MediaSaveOptions): Promise<{ asset: MediaAsset; bytes: Uint8Array }> {
  const normalizedPurpose = purpose.trim()
  if (!normalizedPurpose) throw new Error('Media purpose is required')
  const mimeType = normalizeMimeType(mimeTypeInput)
  if (bytes.byteLength > MAX_MEDIA_ASSET_BYTES) throw new Error('Media asset exceeds the 10MB limit')
  validateDimensions(options.width, options.height)
  const hash = await (options.digest ?? sha256)(bytes)
  const now = isoNow(options.now)
  return {
    bytes,
    asset: {
      id: `media-${hash}`,
      purpose: normalizedPurpose,
      mimeType,
      size: bytes.byteLength,
      width: options.width,
      height: options.height,
      sha256: hash,
      status: 'pending',
      bindings: [],
      pendingBindings: [],
      createdAt: now,
      updatedAt: now
    }
  }
}

async function describeFile(file: Blob, purpose: string, options: MediaSaveOptions): Promise<{ asset: MediaAsset; bytes: Uint8Array }> {
  return describeBytes(new Uint8Array(await file.arrayBuffer()), file.type, purpose, options)
}

function assetReference(assetId: string): Extract<MediaReference, { source: 'asset' }> {
  return { source: 'asset', assetId }
}

export function normalizeMediaReference(value: MediaReference | string | null | undefined): MediaReference | null {
  if (typeof value === 'string') {
    const reference = value.trim()
    if (!reference) return null
    if (/^\/?static\//i.test(reference)) return { source: 'builtin', path: reference }
    return { source: 'legacy', url: reference }
  }
  if (!value || typeof value !== 'object') return null
  if (value.source === 'asset' && value.assetId.trim()) return assetReference(value.assetId.trim())
  if (value.source === 'builtin' && value.path.trim()) return { source: 'builtin', path: value.path.trim() }
  if (value.source === 'legacy' && value.url.trim()) return { source: 'legacy', url: value.url.trim() }
  return null
}

export interface MigratedMedia {
  reference: MediaReference
  released?: string
}
function base64ToBytes(base64: string): Uint8Array {
  const clamped = base64.trim()
  if (typeof atob === 'function') {
    const binary = atob(clamped)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  }
  const buffer = Buffer.from(clamped, 'base64')
  return new Uint8Array(buffer)
}
export async function migrateLegacyMediaReference(
  storage: MediaStorageAdapter,
  value: MediaReference | string | null | undefined,
  options: MediaSaveOptions = { width: 1, height: 1, purpose: 'migration' }
): Promise<MigratedMedia> {
  const normalized = normalizeMediaReference(value)
  if (!normalized) return { reference: normalizeMediaReference('')! }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^data:/i.test(trimmed)) {
      const match = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed)
      if (match) {
        const mimeType = normalizeMimeType(match[1])
        const bytes = base64ToBytes(match[2])
        const reference = storage.saveBytes
          ? await storage.saveBytes(bytes, mimeType, options.purpose ?? 'migration', options)
          : await storage.save(new Blob([bytes as unknown as BlobPart], { type: mimeType }), options.purpose ?? 'migration', options)
        return { reference }
      }
      return { reference: { source: 'legacy', url: trimmed } }
    }
    if (/^\/?static\//i.test(trimmed)) return { reference: { source: 'builtin', path: trimmed } }
    return { reference: { source: 'legacy', url: trimmed } }
  }
  return { reference: normalized }
}
function cloneMediaReference(reference: MediaReference | null): MediaReference | null {
  if (!reference) return null
  if (reference.source === 'asset') return { source: 'asset', assetId: reference.assetId }
  if (reference.source === 'builtin') return { source: 'builtin', path: reference.path }
  return { source: 'legacy', url: reference.url }
}

function normalizedBindingId(bindingId: string): string {
  const normalized = bindingId.trim()
  if (!normalized) throw new Error('bindingId is required')
  return normalized
}

function reconcileAssetStatus(asset: StoredMediaAsset): void {
  asset.status = asset.bindings.length > 0 ? 'bound' : 'pending'
}

function assertAssetRemovable(asset: StoredMediaAsset): void {
  if (asset.bindings.length > 0 || asset.pendingBindings.length > 0) {
    throw new Error(`Media asset is still referenced: ${asset.id}`)
  }
}

abstract class BlobMediaStorageAdapter implements MediaAssetRepository {
  private readonly objectUrls: MediaObjectUrlFactory
  private readonly activeUrls = new Set<string>()

  protected constructor(options: AdapterOptions = {}) {
    this.objectUrls = options.objectUrls ?? defaultObjectUrls()
  }

  abstract runAssetTransaction<T>(execute: (transaction: MediaAssetTransaction) => Promise<T> | T): Promise<T>

  async save(file: Blob, purpose: string, options: MediaSaveOptions): Promise<Extract<MediaReference, { source: 'asset' }>> {
    const { asset } = await describeFile(file, purpose, options)
    return this.runAssetTransaction(async (transaction) => {
      const existing = (await transaction.list()).find((candidate) => candidate.sha256 === asset.sha256)
      if (existing) return assetReference(existing.id)
      await transaction.put({ ...asset, blob: file })
      return assetReference(asset.id)
    })
  }

  async resolve(value: MediaReference | string): Promise<string> {
    const reference = normalizeMediaReference(value)
    if (!reference) throw new Error('Media reference is required')
    if (reference.source === 'builtin') return reference.path
    if (reference.source === 'legacy') return reference.url
    const asset = await this.runAssetTransaction((transaction) => transaction.get(reference.assetId))
    if (!asset?.blob) throw new Error(`Media asset not found: ${reference.assetId}`)
    const resolvedUrl = this.objectUrls.createObjectURL(asset.blob)
    this.activeUrls.add(resolvedUrl)
    return resolvedUrl
  }

  remove(assetId: string): Promise<void> {
    return this.runAssetTransaction((transaction) => transaction.remove(assetId))
  }

  release(resolvedUrl: string): void {
    if (!this.activeUrls.delete(resolvedUrl)) return
    this.objectUrls.revokeObjectURL(resolvedUrl)
  }
}

export class MemoryMediaStorageAdapter extends BlobMediaStorageAdapter {
  private readonly assets = new Map<string, StoredMediaAsset>()
  private readonly serial = new SerialExecutor()

  constructor(options: AdapterOptions = {}) {
    super(options)
  }

  runAssetTransaction<T>(execute: (transaction: MediaAssetTransaction) => Promise<T> | T): Promise<T> {
    return this.serial.run(async () => execute({
      get: async (assetId) => {
        const asset = this.assets.get(assetId)
        return asset ? cloneAsset(asset) : null
      },
      list: async () => [...this.assets.values()].map(cloneAsset),
      put: async (asset) => { this.assets.set(asset.id, cloneAsset(asset)) },
      remove: async (assetId) => {
        const asset = this.assets.get(assetId)
        if (!asset) return
        assertAssetRemovable(asset)
        this.assets.delete(assetId)
      }
    }))
  }
}

function repositoryTransaction(transaction: PlatformRepositoryTransaction): MediaAssetTransaction {
  return {
    get: (assetId) => transaction.get<StoredMediaAsset>(MEDIA_ASSET_COLLECTION, assetId),
    list: async () => (await transaction.list<StoredMediaAsset>(MEDIA_ASSET_COLLECTION)).map(({ value }) => value),
    put: (asset) => transaction.put(MEDIA_ASSET_COLLECTION, asset.id, asset),
    remove: async (assetId) => {
      const asset = await transaction.get<StoredMediaAsset>(MEDIA_ASSET_COLLECTION, assetId)
      if (!asset) return
      assertAssetRemovable(asset)
      await transaction.delete(MEDIA_ASSET_COLLECTION, assetId)
    }
  }
}

export class RepositoryMediaStorageAdapter extends BlobMediaStorageAdapter {
  private readonly operationIdFactory: () => string

  constructor(private readonly repository: PlatformRepository, options: AdapterOptions = {}) {
    super(options)
    this.operationIdFactory = options.operationIdFactory ?? (() => createMediaUniqueId('media-operation'))
  }

  async runAssetTransaction<T>(execute: (transaction: MediaAssetTransaction) => Promise<T> | T): Promise<T> {
    const operationId = this.operationIdFactory()
    const result = await this.repository.runTransaction(operationId, operationId, [MEDIA_ASSET_COLLECTION], (transaction) => (
      execute(repositoryTransaction(transaction))
    ))
    return result.value as T
  }
}

export class LocalFileMediaStorageAdapter implements MediaAssetRepository {
  private readonly serial = new SerialExecutor()

  constructor(
    private readonly repository: PlatformRepository,
    private readonly fileSystem: MediaFileSystem,
    private readonly directory: string
  ) {}

  async save(file: Blob, purpose: string, options: MediaSaveOptions): Promise<Extract<MediaReference, { source: 'asset' }>> {
    return this.saveDescribed(await describeFile(file, purpose, options))
  }

  async saveBytes(data: Uint8Array, mimeType: MediaMimeType, purpose: string, options: MediaSaveOptions): Promise<Extract<MediaReference, { source: 'asset' }>> {
    return this.saveDescribed(await describeBytes(Uint8Array.from(data), mimeType, purpose, options))
  }

  private saveDescribed({ asset, bytes }: { asset: MediaAsset; bytes: Uint8Array }): Promise<Extract<MediaReference, { source: 'asset' }>> {
    return this.serial.run(async () => {
      const existing = (await this.repository.list<StoredMediaAsset>(MEDIA_ASSET_COLLECTION))
        .find(({ value }) => value.sha256 === asset.sha256)?.value
      if (existing) return assetReference(existing.id)

      const filePath = this.pathFor(asset.id)
      await this.fileSystem.writeFile(filePath, bytes)
      try {
        await this.repository.put<StoredMediaAsset>(MEDIA_ASSET_COLLECTION, asset.id, { ...asset, filePath })
      } catch (error) {
        try {
          await this.fileSystem.removeFile(filePath)
        } catch (cleanupError) {
          const failure = new Error('Media metadata save and file cleanup failed') as Error & { cause: unknown }
          failure.cause = { metadataError: error, cleanupError }
          throw failure
        }
        throw error
      }
      return assetReference(asset.id)
    })
  }

  async resolve(value: MediaReference | string): Promise<string> {
    const reference = normalizeMediaReference(value)
    if (!reference) throw new Error('Media reference is required')
    if (reference.source === 'builtin') return reference.path
    if (reference.source === 'legacy') return reference.url
    return this.serial.run(async () => {
      const asset = await this.repository.get<StoredMediaAsset>(MEDIA_ASSET_COLLECTION, reference.assetId)
      if (!asset?.filePath) throw new Error(`Media asset not found: ${reference.assetId}`)
      return asset.filePath
    })
  }

  remove(assetId: string): Promise<void> {
    return this.runAssetTransaction((transaction) => transaction.remove(assetId))
  }

  release(_resolvedUrl: string): void {}

  runAssetTransaction<T>(execute: (transaction: MediaAssetTransaction) => Promise<T> | T): Promise<T> {
    return this.serial.run(async () => execute({
      get: (assetId) => this.repository.get<StoredMediaAsset>(MEDIA_ASSET_COLLECTION, assetId),
      list: async () => (await this.repository.list<StoredMediaAsset>(MEDIA_ASSET_COLLECTION)).map(({ value }) => value),
      put: (asset) => this.repository.put(MEDIA_ASSET_COLLECTION, asset.id, asset),
      remove: async (assetId) => {
        const asset = await this.repository.get<StoredMediaAsset>(MEDIA_ASSET_COLLECTION, assetId)
        if (!asset) return
        assertAssetRemovable(asset)
        if (!asset.filePath) {
          await this.repository.delete(MEDIA_ASSET_COLLECTION, assetId)
          return
        }
        const data = await this.fileSystem.readFile(asset.filePath)
        if (!data) throw new Error(`Media file not found: ${asset.filePath}`)
        await this.fileSystem.removeFile(asset.filePath)
        try {
          await this.repository.delete(MEDIA_ASSET_COLLECTION, assetId)
        } catch (error) {
          try {
            await this.fileSystem.writeFile(asset.filePath, data)
          } catch (restoreError) {
            const failure = new Error('Media metadata delete and file restore failed') as Error & { cause: unknown }
            failure.cause = { metadataError: error, restoreError }
            throw failure
          }
          throw error
        }
      }
    }))
  }

  private pathFor(assetId: string): string {
    return `${this.directory.replace(/\/$/, '')}/${assetId}`
  }
}

export async function readMediaAsset(storage: MediaAssetRepository, assetId: string): Promise<MediaAsset | null> {
  const asset = await storage.runAssetTransaction((transaction) => transaction.get(assetId))
  if (!asset) return null
  const { blob: _blob, filePath: _filePath, ...metadata } = asset
  return metadata
}

export async function bindMediaReference(
  storage: MediaAssetRepository,
  value: MediaReference | string | null | undefined,
  bindingId: string,
  options: MediaLifecycleOptions = {}
): Promise<MediaReference | null> {
  const reference = normalizeMediaReference(value)
  if (!reference || reference.source !== 'asset') return reference
  const binding = normalizedBindingId(bindingId)
  const updatedAt = isoNow(options.now)
  await storage.runAssetTransaction(async (transaction) => {
    const asset = await transaction.get(reference.assetId)
    if (!asset) throw new Error(`Media asset not found: ${reference.assetId}`)
    if (!asset.bindings.includes(binding)) asset.bindings.push(binding)
    reconcileAssetStatus(asset)
    asset.updatedAt = updatedAt
    await transaction.put(asset)
  })
  return reference
}

export async function finalizeMediaReplacement(
  storage: MediaAssetRepository,
  input: MediaReplacementFinalizeInput
): Promise<void> {
  const binding = normalizedBindingId(input.bindingId)
  const next = normalizeMediaReference(input.nextReference)
  const removableAssetIds = await storage.runAssetTransaction(async (transaction) => {
    const removable: string[] = []
    const assets = await transaction.list()
    const nextAssetId = next?.source === 'asset' ? next.assetId : null
    const nextAsset = nextAssetId ? assets.find((asset) => asset.id === nextAssetId) : null
    if (nextAssetId && !nextAsset) throw new Error(`Media asset not found: ${nextAssetId}`)

    for (const asset of assets) {
      if (asset.id === nextAssetId || !asset.bindings.includes(binding)) continue
      asset.bindings = asset.bindings.filter((candidate) => candidate !== binding)
      reconcileAssetStatus(asset)
      asset.updatedAt = input.updatedAt
      await transaction.put(asset)
      if (asset.bindings.length === 0 && asset.pendingBindings.length === 0) removable.push(asset.id)
    }

    if (!nextAsset) return removable
    if (!nextAsset.bindings.includes(binding)) nextAsset.bindings.push(binding)
    if (input.protectionToken) {
      nextAsset.pendingBindings = nextAsset.pendingBindings.filter((candidate) => candidate !== input.protectionToken)
    }
    reconcileAssetStatus(nextAsset)
    nextAsset.updatedAt = input.updatedAt
    await transaction.put(nextAsset)
    return removable
  })

  for (const assetId of removableAssetIds) {
    try {
      await storage.remove(assetId)
    } catch {
      // The transaction already left this asset pending for a later cleanup retry.
    }
  }
}

export async function replaceMediaReference<T>(
  storage: MediaAssetRepository,
  bindingId: string,
  previousValue: MediaReference | string | null | undefined,
  nextValue: MediaReference | string | null | undefined,
  persistBusinessReference: (reference: MediaReference | null) => Promise<T>,
  options: MediaLifecycleOptions = {}
): Promise<T> {
  const binding = normalizedBindingId(bindingId)
  const previous = normalizeMediaReference(previousValue)
  const next = cloneMediaReference(normalizeMediaReference(nextValue))
  const changedAsset = next?.source === 'asset' && (previous?.source !== 'asset' || previous.assetId !== next.assetId)
  const protectionToken = createMediaUniqueId('media-protection')
  const finalizeInput: MediaReplacementFinalizeInput = {
    bindingId: binding,
    nextReference: cloneMediaReference(next),
    protectionToken: changedAsset ? protectionToken : undefined,
    updatedAt: isoNow(options.now)
  }

  if (changedAsset) {
    await storage.runAssetTransaction(async (transaction) => {
      const asset = await transaction.get(next.assetId)
      if (!asset) throw new Error(`Media asset not found: ${next.assetId}`)
      asset.pendingBindings.push(protectionToken)
      reconcileAssetStatus(asset)
      await transaction.put(asset)
    })
  }

  let result: T
  try {
    result = await persistBusinessReference(cloneMediaReference(next))
  } catch (error) {
    if (changedAsset) {
      await storage.runAssetTransaction(async (transaction) => {
        const asset = await transaction.get(next.assetId)
        if (!asset) return
        asset.pendingBindings = asset.pendingBindings.filter((candidate) => candidate !== protectionToken)
        reconcileAssetStatus(asset)
        if (asset.bindings.length === 0 && asset.pendingBindings.length === 0) {
          await transaction.put(asset)
          await transaction.remove(asset.id)
        }
        else await transaction.put(asset)
      })
    }
    throw error
  }

  const finalizeAndReturn = async (): Promise<T> => {
    try {
      await finalizeMediaReplacement(storage, finalizeInput)
      return result
    } catch (cause) {
      throw new MediaReplacementFinalizeError(cause, finalizeAndReturn)
    }
  }
  return finalizeAndReturn()
}

export async function cleanupPendingMediaAssets(
  storage: MediaAssetRepository,
  options: MediaLifecycleOptions = {}
): Promise<number> {
  const cutoff = Date.parse(isoNow(options.now)) - PENDING_MEDIA_MAX_AGE_MS
  return storage.runAssetTransaction(async (transaction) => {
    let removed = 0
    for (const asset of await transaction.list()) {
      const previousStatus = asset.status
      reconcileAssetStatus(asset)
      if (asset.bindings.length === 0 && asset.pendingBindings.length === 0 && Date.parse(asset.createdAt) < cutoff) {
        await transaction.remove(asset.id)
        removed += 1
      }
      else if (asset.status !== previousStatus) await transaction.put(asset)
    }
    return removed
  })
}
