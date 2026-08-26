import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  MAX_MEDIA_ASSET_BYTES,
  MEDIA_ASSET_COLLECTION,
  PENDING_MEDIA_MAX_AGE_MS,
  LocalFileMediaStorageAdapter,
  MemoryMediaStorageAdapter,
  MemoryPlatformRepository,
  RepositoryMediaStorageAdapter,
  MediaReplacementFinalizeError,
  bindMediaReference,
  cleanupPendingMediaAssets,
  createMediaUniqueId,
  normalizeMediaReference, migrateLegacyMediaReference,
  readMediaAsset,
  replaceMediaReference
} from './index'
import type { MediaAsset, MediaAssetTransaction, MediaFileSystem, MediaObjectUrlFactory, MediaReference, MediaStorageAdapter } from './index'

const PNG_BYTES = new Uint8Array([137, 80, 78, 71])
const image = (bytes = PNG_BYTES, type = 'image/png') => new Blob([bytes], { type })
const dimensions = { width: 640, height: 480 }

function objectUrlFactory(): MediaObjectUrlFactory & {
  createObjectURL: ReturnType<typeof vi.fn>
  revokeObjectURL: ReturnType<typeof vi.fn>
} {
  let sequence = 0
  return {
    createObjectURL: vi.fn(() => `blob:test/${++sequence}`),
    revokeObjectURL: vi.fn()
  }
}

describe('media public contract', () => {
  it('使用 source 公开 asset、builtin、legacy 三种判别引用', () => {
    const references = [
      { source: 'asset', assetId: 'media-1' },
      { source: 'builtin', path: '/static/images/farm.png' },
      { source: 'legacy', url: 'https://example.com/farm.png' }
    ] satisfies MediaReference[]

    expectTypeOf(references).toMatchTypeOf<MediaReference[]>()
    expect(normalizeMediaReference('/static/images/farm.png')).toEqual(references[1])
    expect(normalizeMediaReference('static/images/farm.png')).toEqual({ source: 'builtin', path: 'static/images/farm.png' })
    expect(normalizeMediaReference('http://example.com/farm.png')).toEqual({ source: 'legacy', url: 'http://example.com/farm.png' })
    expect(normalizeMediaReference('data:image/png;base64,AAAA')).toEqual({ source: 'legacy', url: 'data:image/png;base64,AAAA' })
    expect(normalizeMediaReference('blob:https://example.com/id')).toEqual({ source: 'legacy', url: 'blob:https://example.com/id' })
    expect(normalizeMediaReference(references[0])).toEqual(references[0])
    expect(normalizeMediaReference('')).toBeNull()
  })

  it('MediaStorageAdapter 公开 save、resolve、remove 和 object URL 释放契约', async () => {
    const repository = new MemoryPlatformRepository()
    const objectUrls = objectUrlFactory()
    const storage: MediaStorageAdapter = new RepositoryMediaStorageAdapter(repository, { objectUrls })
    const file = image()

    const reference = await storage.save(file, 'product-cover', dimensions)
    const resolved = await storage.resolve(reference)

    expect(reference).toEqual({ source: 'asset', assetId: expect.stringMatching(/^media-[a-f0-9]{64}$/) })
    expect(resolved).toBe('blob:test/1')
    expect(objectUrls.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    storage.release(resolved)
    expect(objectUrls.revokeObjectURL).toHaveBeenCalledWith('blob:test/1')

    await storage.remove(reference.assetId)
    expect(await repository.get(MEDIA_ASSET_COLLECTION, reference.assetId)).toBeNull()
  })

  it('跨模块上下文使用高熵 operationId，不会碰撞重放另一上下文的事务', async () => {
    const repository = new MemoryPlatformRepository()
    const operationIds: string[] = []
    const runTransaction = vi.spyOn(repository, 'runTransaction').mockImplementation(async function (this: MemoryPlatformRepository, operationId, ...args) {
      operationIds.push(operationId)
      return MemoryPlatformRepository.prototype.runTransaction.call(this, operationId, ...args)
    })
    vi.spyOn(Date, 'now').mockReturnValue(123456)
    vi.resetModules()
    const FirstContextAdapter = (await import('./media')).RepositoryMediaStorageAdapter
    const first = new FirstContextAdapter(repository, { objectUrls: objectUrlFactory() })
    vi.resetModules()
    const SecondContextAdapter = (await import('./media')).RepositoryMediaStorageAdapter
    const second = new SecondContextAdapter(repository, { objectUrls: objectUrlFactory() })

    const firstReference = await first.save(image(new Uint8Array([1])), 'cover', dimensions)
    const secondReference = await second.save(image(new Uint8Array([2])), 'cover', dimensions)

    expect(firstReference.assetId).not.toBe(secondReference.assetId)
    expect(new Set(operationIds).size).toBe(2)
    expect(runTransaction).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })

  it('randomUUID 不可用时使用 getRandomValues 生成高熵唯一 id', () => {
    let seed = 0
    const random = {
      getRandomValues<T extends ArrayBufferView>(target: T): T {
        const bytes = new Uint8Array(target.buffer, target.byteOffset, target.byteLength)
        bytes.forEach((_value, index) => { bytes[index] = ++seed + index })
        return target
      }
    }

    const first = createMediaUniqueId('operation', random)
    const second = createMediaUniqueId('operation', random)

    expect(first).toMatch(/^operation-[a-f0-9]{32}$/)
    expect(second).not.toBe(first)
  })
})

describe('media save and adapters', () => {
  it('校验 MIME、10MB、width/height，以 pending 保存并按 SHA-256 去重', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const first = await storage.save(image(), 'product-cover', { ...dimensions, now: '2026-08-25T00:00:00.000Z' })
    const duplicate = await storage.save(image(PNG_BYTES.slice()), 'detail-image', { ...dimensions, now: '2026-08-26T00:00:00.000Z' })
    const asset = await readMediaAsset(storage, first.assetId)

    expectTypeOf(asset!).toMatchTypeOf<MediaAsset>()
    expect(asset).toMatchObject({
      id: first.assetId,
      purpose: 'product-cover',
      mimeType: 'image/png',
      size: 4,
      width: 640,
      height: 480,
      status: 'pending',
      bindings: [],
      createdAt: '2026-08-25T00:00:00.000Z'
    })
    expect(duplicate).toEqual(first)

    await expect(storage.save(image(PNG_BYTES, 'image/gif'), 'cover', dimensions)).rejects.toThrow('Unsupported media MIME type')
    await expect(storage.save(image(new Uint8Array(MAX_MEDIA_ASSET_BYTES + 1), 'image/webp'), 'cover', dimensions)).rejects.toThrow('10MB')
    await expect(storage.save(image(), 'cover', { width: 0, height: 480 })).rejects.toThrow('positive integers')
    await expect(storage.save(image(), 'cover', { width: 640, height: 1.5 })).rejects.toThrow('positive integers')
  })

  it('Repository 适配器将 Blob 保存在 media-assets collection', async () => {
    const repository = new MemoryPlatformRepository()
    const storage = new RepositoryMediaStorageAdapter(repository, { objectUrls: objectUrlFactory() })
    const reference = await storage.save(image(), 'product-cover', dimensions)
    const stored = await repository.get<MediaAsset & { blob: Blob }>(MEDIA_ASSET_COLLECTION, reference.assetId)

    expect(stored?.blob).toBeInstanceOf(Blob)
    expect(Array.from(new Uint8Array(await stored!.blob.arrayBuffer()))).toEqual(Array.from(PNG_BYTES))
  })

  it('小程序适配器 resolve 返回持久 filePath 而不是字节', async () => {
    const files = new Map<string, Uint8Array>()
    const fileSystem: MediaFileSystem = {
      writeFile: vi.fn(async (path, data) => { files.set(path, data.slice()) }),
      readFile: vi.fn(async (path) => files.get(path)?.slice() ?? null),
      removeFile: vi.fn(async (path) => { files.delete(path) })
    }
    const repository = new MemoryPlatformRepository()
    const storage: MediaStorageAdapter = new LocalFileMediaStorageAdapter(repository, fileSystem, 'wxfile://media')

    const reference = await storage.save(image(), 'product-cover', dimensions)
    expect(await storage.resolve(reference)).toBe(`wxfile://media/${reference.assetId}`)
    expect(files.get(`wxfile://media/${reference.assetId}`)).toEqual(PNG_BYTES)
  })

  it('本地文件元数据写失败时补偿删除已写文件', async () => {
    const files = new Map<string, Uint8Array>()
    const fileSystem: MediaFileSystem = {
      writeFile: vi.fn(async (path, data) => { files.set(path, data.slice()) }),
      readFile: vi.fn(async (path) => files.get(path)?.slice() ?? null),
      removeFile: vi.fn(async (path) => { files.delete(path) })
    }
    const repository = new MemoryPlatformRepository()
    vi.spyOn(repository, 'put').mockRejectedValueOnce(new Error('metadata failed'))
    const storage = new LocalFileMediaStorageAdapter(repository, fileSystem, 'wxfile://media')

    await expect(storage.save(image(), 'product-cover', dimensions)).rejects.toThrow('metadata failed')
    expect(files.size).toBe(0)
    expect(fileSystem.removeFile).toHaveBeenCalledOnce()
  })

  it('本地文件删除失败时保留元数据以便重试', async () => {
    const files = new Map<string, Uint8Array>()
    let failRemoval = false
    const fileSystem: MediaFileSystem = {
      writeFile: vi.fn(async (path, data) => { files.set(path, data.slice()) }),
      readFile: vi.fn(async (path) => files.get(path)?.slice() ?? null),
      removeFile: vi.fn(async (path) => {
        if (failRemoval) throw new Error('unlink failed')
        files.delete(path)
      })
    }
    const repository = new MemoryPlatformRepository()
    const storage = new LocalFileMediaStorageAdapter(repository, fileSystem, 'wxfile://media')
    const reference = await storage.save(image(), 'product-cover', dimensions)
    failRemoval = true

    await expect(storage.remove(reference.assetId)).rejects.toThrow('unlink failed')
    expect(await repository.get(MEDIA_ASSET_COLLECTION, reference.assetId)).not.toBeNull()
    expect(files.has(`wxfile://media/${reference.assetId}`)).toBe(true)
  })

  it('Repository 删除元数据失败时恢复本地文件，引用仍可解析且可重试', async () => {
    const files = new Map<string, Uint8Array>()
    const fileSystem: MediaFileSystem = {
      writeFile: vi.fn(async (path, data) => { files.set(path, data.slice()) }),
      readFile: vi.fn(async (path) => files.get(path)?.slice() ?? null),
      removeFile: vi.fn(async (path) => { files.delete(path) })
    }
    const repository = new MemoryPlatformRepository()
    const storage = new LocalFileMediaStorageAdapter(repository, fileSystem, 'wxfile://media')
    const reference = await storage.save(image(), 'product-cover', dimensions)
    vi.spyOn(repository, 'delete').mockRejectedValueOnce(new Error('repository delete failed'))

    await expect(storage.remove(reference.assetId)).rejects.toThrow('repository delete failed')
    expect(files.get(`wxfile://media/${reference.assetId}`)).toEqual(PNG_BYTES)
    await expect(storage.resolve(reference)).resolves.toBe(`wxfile://media/${reference.assetId}`)

    await expect(storage.remove(reference.assetId)).resolves.toBeUndefined()
    expect(files.has(`wxfile://media/${reference.assetId}`)).toBe(false)
    expect(await repository.get(MEDIA_ASSET_COLLECTION, reference.assetId)).toBeNull()
  })
})

describe('media lifecycle', () => {
  it('用 Repository 事务并发绑定时不丢失任何业务引用', async () => {
    const repository = new MemoryPlatformRepository()
    const transaction = vi.spyOn(repository, 'runTransaction')
    const storage = new RepositoryMediaStorageAdapter(repository, { objectUrls: objectUrlFactory() })
    const reference = await storage.save(image(), 'product-cover', { ...dimensions, now: '2026-08-24T00:00:00.000Z' })
    transaction.mockClear()

    await Promise.all([
      bindMediaReference(storage, reference, 'product:P001'),
      bindMediaReference(storage, reference, 'product:P002')
    ])

    expect((await readMediaAsset(storage, reference.assetId))?.bindings.sort()).toEqual(['product:P001', 'product:P002'])
    expect(transaction).toHaveBeenCalled()
  })

  it('并发 bind 与 cleanup 时不会删除已绑定资源', async () => {
    const repository = new MemoryPlatformRepository()
    const storage = new RepositoryMediaStorageAdapter(repository, { objectUrls: objectUrlFactory() })
    const reference = await storage.save(image(), 'product-cover', { ...dimensions, now: '2026-08-24T00:00:00.000Z' })

    const binding = bindMediaReference(storage, reference, 'product:P001')
    const cleanup = cleanupPendingMediaAssets(storage, { now: '2026-08-26T00:00:00.000Z' })
    await expect(Promise.all([binding, cleanup])).resolves.toEqual([reference, 0])
    expect(await readMediaAsset(storage, reference.assetId)).toMatchObject({ status: 'bound', bindings: ['product:P001'] })
  })

  it('公开 remove 拒绝删除 bound 或存在 replacement protection 的资源', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const bound = await storage.save(image(new Uint8Array([7])), 'cover', dimensions)
    const protectedReference = await storage.save(image(new Uint8Array([8])), 'cover', dimensions)
    await bindMediaReference(storage, bound, 'product:P001')
    await storage.runAssetTransaction(async (transaction) => {
      const asset = await transaction.get(protectedReference.assetId)
      asset!.pendingBindings.push('protection-token')
      await transaction.put(asset!)
    })

    await expect(storage.remove(bound.assetId)).rejects.toThrow('still referenced')
    await expect(storage.remove(protectedReference.assetId)).rejects.toThrow('still referenced')
    expect(await readMediaAsset(storage, bound.assetId)).not.toBeNull()
    expect(await readMediaAsset(storage, protectedReference.assetId)).not.toBeNull()
  })

  it('业务保存失败时不解绑或删除旧资源', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const oldReference = await storage.save(image(new Uint8Array([1]), 'image/jpeg'), 'cover', dimensions)
    const nextReference = await storage.save(image(new Uint8Array([2]), 'image/webp'), 'cover', dimensions)
    await bindMediaReference(storage, oldReference, 'product:P001')

    await expect(replaceMediaReference(
      storage,
      'product:P001',
      oldReference,
      nextReference,
      async () => { throw new Error('business save failed') }
    )).rejects.toThrow('business save failed')

    expect(await readMediaAsset(storage, oldReference.assetId)).toMatchObject({ bindings: ['product:P001'] })
    expect(await readMediaAsset(storage, nextReference.assetId)).toBeNull()
  })

  it('业务保存回调合法修改收到的 asset 引用时 finalize 仍使用调用前快照', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const oldReference = await storage.save(image(new Uint8Array([71]), 'image/jpeg'), 'cover', dimensions)
    const nextReference = await storage.save(image(new Uint8Array([72]), 'image/webp'), 'cover', dimensions)
    const originalNextAssetId = nextReference.assetId
    await bindMediaReference(storage, oldReference, 'product:P001')
    let callbackReference: MediaReference | null = null

    await expect(replaceMediaReference(storage, 'product:P001', oldReference, nextReference, async (reference) => {
      callbackReference = reference
      if (!reference || reference.source !== 'asset') throw new Error('expected asset reference')
      reference.assetId = oldReference.assetId
      return 'saved'
    })).resolves.toBe('saved')

    expect(callbackReference).not.toBe(nextReference)
    expect(nextReference).toEqual({ source: 'asset', assetId: originalNextAssetId })
    expect(await readMediaAsset(storage, oldReference.assetId)).toBeNull()
    expect(await readMediaAsset(storage, nextReference.assetId)).toMatchObject({
      status: 'bound',
      bindings: ['product:P001'],
      pendingBindings: []
    })
  })

  it('业务保存回调恶意改写收到的判别引用时 rollback 仍清理调用前快照', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const oldReference = await storage.save(image(new Uint8Array([73]), 'image/jpeg'), 'cover', dimensions)
    const nextReference = await storage.save(image(new Uint8Array([74]), 'image/webp'), 'cover', dimensions)
    const originalNextAssetId = nextReference.assetId
    await bindMediaReference(storage, oldReference, 'product:P001')
    let callbackReference: MediaReference | null = null

    await expect(replaceMediaReference(storage, 'product:P001', oldReference, nextReference, async (reference) => {
      callbackReference = reference
      const mutableReference = reference as unknown as Record<string, unknown>
      delete mutableReference.assetId
      Object.assign(mutableReference, { source: 'legacy', url: 'https://attacker.invalid/replaced.png' })
      throw new Error('business save failed')
    })).rejects.toThrow('business save failed')

    expect(callbackReference).not.toBe(nextReference)
    expect(nextReference).toEqual({ source: 'asset', assetId: originalNextAssetId })
    expect(await readMediaAsset(storage, oldReference.assetId)).toMatchObject({ bindings: ['product:P001'] })
    expect(await readMediaAsset(storage, nextReference.assetId)).toBeNull()
  })

  it('同一 binding 并发替换使用独立 protection token，一成一败仍保留成功资源', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const oldReference = await storage.save(image(new Uint8Array([11]), 'image/jpeg'), 'cover', dimensions)
    const nextReference = await storage.save(image(new Uint8Array([12]), 'image/webp'), 'cover', { ...dimensions, now: '2026-08-24T00:00:00.000Z' })
    await bindMediaReference(storage, oldReference, 'product:P001')
    let resolveSuccess!: (value: MediaReference) => void
    let rejectFailure!: (reason: Error) => void
    let callbacksStarted = 0
    const bothStartedState = {} as { success: Promise<MediaReference>; failure: Promise<MediaReference> }
    const bothStarted = new Promise<void>((resolve) => {
      const markStarted = () => { callbacksStarted += 1; if (callbacksStarted === 2) resolve() }
      const success = replaceMediaReference(storage, 'product:P001', oldReference, nextReference, () => new Promise<MediaReference>((done) => {
        resolveSuccess = done
        markStarted()
      }))
      const failure = replaceMediaReference(storage, 'product:P001', oldReference, nextReference, () => new Promise<MediaReference>((_done, reject) => {
        rejectFailure = reject
        markStarted()
      }))
      Object.assign(bothStartedState, { success, failure })
    })

    await bothStarted
    rejectFailure(new Error('business save failed'))
    await expect(bothStartedState.failure).rejects.toThrow('business save failed')
    await expect(cleanupPendingMediaAssets(storage, { now: '2026-08-26T00:00:00.000Z' })).resolves.toBe(0)
    resolveSuccess(nextReference)
    await expect(bothStartedState.success).resolves.toEqual(nextReference)
    expect(await readMediaAsset(storage, nextReference.assetId)).toMatchObject({ status: 'bound', bindings: ['product:P001'], pendingBindings: [] })
  })

  it('同一 binding 并发替换到不同资源双成功时仅最后业务值保留 binding', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const oldReference = await storage.save(image(new Uint8Array([31]), 'image/jpeg'), 'cover', dimensions)
    const firstNext = await storage.save(image(new Uint8Array([32]), 'image/webp'), 'cover', dimensions)
    const finalNext = await storage.save(image(new Uint8Array([33]), 'image/png'), 'cover', dimensions)
    await bindMediaReference(storage, oldReference, 'product:P001')
    let businessReference: MediaReference = oldReference
    let finishFirst!: () => void
    let finishFinal!: () => void
    const firstReplacement = replaceMediaReference(storage, 'product:P001', oldReference, firstNext, () => new Promise<MediaReference>((resolve) => {
      finishFirst = () => { businessReference = firstNext; resolve(firstNext) }
    }))
    const finalReplacement = replaceMediaReference(storage, 'product:P001', oldReference, finalNext, () => new Promise<MediaReference>((resolve) => {
      finishFinal = () => { businessReference = finalNext; resolve(finalNext) }
    }))
    await vi.waitFor(() => {
      expect(finishFirst).toBeTypeOf('function')
      expect(finishFinal).toBeTypeOf('function')
    })

    finishFirst()
    await expect(firstReplacement).resolves.toEqual(firstNext)
    finishFinal()
    await expect(finalReplacement).resolves.toEqual(finalNext)

    expect(businessReference).toEqual(finalNext)
    expect(await readMediaAsset(storage, oldReference.assetId)).toBeNull()
    expect(await readMediaAsset(storage, firstNext.assetId)).toBeNull()
    expect(await readMediaAsset(storage, finalNext.assetId)).toMatchObject({ bindings: ['product:P001'], pendingBindings: [], status: 'bound' })
  })

  it('非法 now 在业务保存前失败且不留下 replacement protection', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const oldReference = await storage.save(image(new Uint8Array([51]), 'image/jpeg'), 'cover', dimensions)
    const nextReference = await storage.save(image(new Uint8Array([52]), 'image/webp'), 'cover', dimensions)
    await bindMediaReference(storage, oldReference, 'product:P001')
    const persist = vi.fn(async (reference: MediaReference | null) => reference)

    await expect(replaceMediaReference(
      storage,
      'product:P001',
      oldReference,
      nextReference,
      persist,
      { now: 'invalid-date' }
    )).rejects.toThrow('now must be a valid date')

    expect(persist).not.toHaveBeenCalled()
    expect(await readMediaAsset(storage, oldReference.assetId)).toMatchObject({ bindings: ['product:P001'] })
    expect(await readMediaAsset(storage, nextReference.assetId)).toMatchObject({ bindings: [], pendingBindings: [], status: 'pending' })
  })

  it('业务已保存但 finalize 失败时返回可重试错误，retry 不重复业务保存', async () => {
    class FailOnceFinalizeStorage extends MemoryMediaStorageAdapter {
      failNextTransaction = false

      override runAssetTransaction<T>(execute: (transaction: MediaAssetTransaction) => Promise<T> | T): Promise<T> {
        if (this.failNextTransaction) {
          this.failNextTransaction = false
          return Promise.reject(new Error('finalize transaction failed'))
        }
        return super.runAssetTransaction(execute)
      }
    }
    const storage = new FailOnceFinalizeStorage({ objectUrls: objectUrlFactory() })
    const oldReference = await storage.save(image(new Uint8Array([41]), 'image/jpeg'), 'cover', dimensions)
    const nextReference = await storage.save(image(new Uint8Array([42]), 'image/webp'), 'cover', dimensions)
    await bindMediaReference(storage, oldReference, 'product:P001')
    const persist = vi.fn(async (reference: MediaReference | null) => {
      storage.failNextTransaction = true
      return reference
    })
    let failure: unknown

    try {
      await replaceMediaReference(storage, 'product:P001', oldReference, nextReference, persist)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(MediaReplacementFinalizeError)
    expect((failure as Error).message).toContain('finalize transaction failed')
    expect(persist).toHaveBeenCalledOnce()
    expect(await readMediaAsset(storage, nextReference.assetId)).toMatchObject({ bindings: [], pendingBindings: [expect.stringMatching(/^media-protection-/)] })

    await expect((failure as MediaReplacementFinalizeError<MediaReference | null>).retry()).resolves.toEqual(nextReference)
    expect(persist).toHaveBeenCalledOnce()
    expect(await readMediaAsset(storage, oldReference.assetId)).toBeNull()
    expect(await readMediaAsset(storage, nextReference.assetId)).toMatchObject({ bindings: ['product:P001'], pendingBindings: [], status: 'bound' })
  })

  it('业务保存成功后原子绑定新资源，并仅删除无引用旧资源', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const oldReference = await storage.save(image(new Uint8Array([1]), 'image/jpeg'), 'cover', dimensions)
    const nextReference = await storage.save(image(new Uint8Array([2]), 'image/webp'), 'cover', dimensions)
    await bindMediaReference(storage, oldReference, 'product:P001')
    const persist = vi.fn(async (reference: MediaReference | null) => reference)

    await expect(replaceMediaReference(storage, 'product:P001', oldReference, nextReference, persist)).resolves.toEqual(nextReference)
    expect(persist).toHaveBeenCalledWith(nextReference)
    expect(await readMediaAsset(storage, oldReference.assetId)).toBeNull()
    expect(await readMediaAsset(storage, nextReference.assetId)).toMatchObject({ status: 'bound', bindings: ['product:P001'] })
  })

  it('finalize 后旧文件删除失败不影响业务替换且可由 cleanup 重试', async () => {
    const files = new Map<string, Uint8Array>()
    let failRemoval = false
    const fileSystem: MediaFileSystem = {
      writeFile: vi.fn(async (path, data) => { files.set(path, data.slice()) }),
      readFile: vi.fn(async (path) => files.get(path)?.slice() ?? null),
      removeFile: vi.fn(async (path) => {
        if (failRemoval) throw new Error('unlink failed')
        files.delete(path)
      })
    }
    const repository = new MemoryPlatformRepository()
    const storage = new LocalFileMediaStorageAdapter(repository, fileSystem, 'wxfile://media')
    const oldReference = await storage.save(image(new Uint8Array([61]), 'image/jpeg'), 'cover', {
      ...dimensions,
      now: '2026-08-24T00:00:00.000Z'
    })
    const nextReference = await storage.save(image(new Uint8Array([62]), 'image/webp'), 'cover', {
      ...dimensions,
      now: '2026-08-24T00:00:00.000Z'
    })
    await bindMediaReference(storage, oldReference, 'product:P001')
    const persist = vi.fn(async (reference: MediaReference | null) => reference)
    failRemoval = true

    await expect(replaceMediaReference(storage, 'product:P001', oldReference, nextReference, persist, {
      now: '2026-08-26T00:00:00.000Z'
    })).resolves.toEqual(nextReference)

    expect(persist).toHaveBeenCalledOnce()
    expect(await readMediaAsset(storage, oldReference.assetId)).toMatchObject({ status: 'pending', bindings: [], pendingBindings: [] })
    expect(await readMediaAsset(storage, nextReference.assetId)).toMatchObject({ status: 'bound', bindings: ['product:P001'], pendingBindings: [] })
    expect(fileSystem.removeFile).toHaveBeenCalledWith(`wxfile://media/${oldReference.assetId}`)
    expect(files.has(`wxfile://media/${oldReference.assetId}`)).toBe(true)

    failRemoval = false
    await expect(cleanupPendingMediaAssets(storage, { now: '2026-08-26T00:00:00.001Z' })).resolves.toBe(1)
    expect(await readMediaAsset(storage, oldReference.assetId)).toBeNull()
    expect(files.has(`wxfile://media/${oldReference.assetId}`)).toBe(false)
  })

  it('清理严格超过 24 小时的 pending，保留边界与已绑定资源', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const expired = await storage.save(image(new Uint8Array([1]), 'image/jpeg'), 'cover', { ...dimensions, now: '2026-08-24T23:59:59.999Z' })
    const boundary = await storage.save(image(new Uint8Array([2]), 'image/jpeg'), 'cover', { ...dimensions, now: '2026-08-25T00:00:00.000Z' })
    const bound = await storage.save(image(new Uint8Array([3]), 'image/jpeg'), 'cover', { ...dimensions, now: '2026-08-24T00:00:00.000Z' })
    await bindMediaReference(storage, bound, 'product:P003')

    await expect(cleanupPendingMediaAssets(storage, { now: '2026-08-26T00:00:00.000Z' })).resolves.toBe(1)
    expect(await readMediaAsset(storage, expired.assetId)).toBeNull()
    expect(await readMediaAsset(storage, boundary.assetId)).not.toBeNull()
    expect(await readMediaAsset(storage, bound.assetId)).not.toBeNull()
    expect(PENDING_MEDIA_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('cleanup 根据实际引用协调 stale status，不留下永久 bound 孤儿', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const orphan = await storage.save(image(new Uint8Array([21]), 'image/jpeg'), 'cover', { ...dimensions, now: '2026-08-24T00:00:00.000Z' })
    const protectedReference = await storage.save(image(new Uint8Array([22]), 'image/jpeg'), 'cover', { ...dimensions, now: '2026-08-24T00:00:00.000Z' })
    await storage.runAssetTransaction(async (transaction) => {
      const staleOrphan = await transaction.get(orphan.assetId)
      staleOrphan!.status = 'bound'
      await transaction.put(staleOrphan!)
      const staleProtected = await transaction.get(protectedReference.assetId)
      staleProtected!.status = 'bound'
      staleProtected!.pendingBindings.push('replacement-token')
      await transaction.put(staleProtected!)
    })

    await expect(cleanupPendingMediaAssets(storage, { now: '2026-08-26T00:00:00.000Z' })).resolves.toBe(1)
    expect(await readMediaAsset(storage, orphan.assetId)).toBeNull()
    expect(await readMediaAsset(storage, protectedReference.assetId)).toMatchObject({ status: 'pending', pendingBindings: ['replacement-token'] })
  })
})
  describe('legacy media migration', () => {
    it('migrates base64 data url into a deduped asset reference', async () => {
      const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
      const result = await migrateLegacyMediaReference(storage, 'data:image/png;base64,iVBORw0KGgo=')
      expect(result.reference.source).toBe('asset')
      const first = await migrateLegacyMediaReference(storage, 'data:image/png;base64,iVBORw0KGgo=')
      expect(first.reference).toEqual(result.reference)
      expect(first.released).toBeUndefined()
    })
    it('keeps static paths as builtin and http/blob urls as legacy readonly', async () => {
      const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
      expect((await migrateLegacyMediaReference(storage, '/static/images/farm.png')).reference).toEqual({ source: 'builtin', path: '/static/images/farm.png' })
      expect((await migrateLegacyMediaReference(storage, 'http://example.com/farm.png')).reference).toEqual({ source: 'legacy', url: 'http://example.com/farm.png' })
      expect((await migrateLegacyMediaReference(storage, 'blob:https://example.com/id')).reference).toEqual({ source: 'legacy', url: 'blob:https://example.com/id' })
    })
    it('passes through asset and builtin references unchanged', async () => {
      const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
      const already = { source: 'asset' as const, assetId: 'A1' }
      expect((await migrateLegacyMediaReference(storage, already)).reference).toEqual(already)
      expect((await migrateLegacyMediaReference(storage, { source: 'builtin' as const, path: '/static/x.png' })).reference).toEqual({ source: 'builtin', path: '/static/x.png' })
    })
  })

describe('legacy media migration', () => {
  it('migrates base64 data url into a deduped asset reference', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const result = await migrateLegacyMediaReference(storage, 'data:image/png;base64,iVBORw0KGgo=')
    expect(result.reference.source).toBe('asset')
    const first = await migrateLegacyMediaReference(storage, 'data:image/png;base64,iVBORw0KGgo=')
    expect(first.reference).toEqual(result.reference)
    expect(first.released).toBeUndefined()
  })
  it('keeps static paths as builtin and http/blob urls as legacy readonly', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    expect((await migrateLegacyMediaReference(storage, '/static/images/farm.png')).reference).toEqual({ source: 'builtin', path: '/static/images/farm.png' })
    expect((await migrateLegacyMediaReference(storage, 'http://example.com/farm.png')).reference).toEqual({ source: 'legacy', url: 'http://example.com/farm.png' })
    expect((await migrateLegacyMediaReference(storage, 'blob:https://example.com/id')).reference).toEqual({ source: 'legacy', url: 'blob:https://example.com/id' })
  })
  it('passes through asset and builtin references unchanged', async () => {
    const storage = new MemoryMediaStorageAdapter({ objectUrls: objectUrlFactory() })
    const already = { source: 'asset' as const, assetId: 'A1' }
    expect((await migrateLegacyMediaReference(storage, already)).reference).toEqual(already)
    expect((await migrateLegacyMediaReference(storage, { source: 'builtin' as const, path: '/static/x.png' })).reference).toEqual({ source: 'builtin', path: '/static/x.png' })
  })
})
