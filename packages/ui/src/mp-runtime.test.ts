import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMiniProgramMediaRuntime } from './mp-runtime'
import { savePreparedMediaFile } from './runtime'

function miniProgramHarness(options: { tempPath?: string; imageInfoType?: string; tempFileType?: string } = {}) {
  const selectedPath = options.tempPath ?? '/tmp/selected.jpg'
  const imageInfoType = Object.prototype.hasOwnProperty.call(options, 'imageInfoType') ? options.imageInfoType : 'jpg'
  const storage = new Map<string, unknown>()
  const files = new Map<string, ArrayBuffer>([[selectedPath, Uint8Array.from([1, 2, 3, 4]).buffer]])
  const operations: string[] = []
  let mediaDirectoryExists = false
  const manager = {
    mkdir({ dirPath, recursive, success, fail }: { dirPath: string; recursive: boolean; success(): void; fail(error: unknown): void }) {
      operations.push(`mkdir:${dirPath}:${recursive}`)
      if (mediaDirectoryExists) return fail(new Error('file already exists'))
      mediaDirectoryExists = true
      success()
    },
    writeFile({ filePath, data, success, fail }: { filePath: string; data: ArrayBuffer; success(): void; fail(error: unknown): void }) {
      operations.push(`write:${filePath}`)
      if (!mediaDirectoryExists) return fail(new Error('directory missing'))
      files.set(filePath, data)
      success()
    },
    readFile({ filePath, success, fail }: { filePath: string; success(result: { data: ArrayBuffer }): void; fail(error: unknown): void }) {
      const data = files.get(filePath)
      if (!data) return fail(new Error('file missing'))
      success({ data })
    },
    unlink({ filePath, success }: { filePath: string; success(): void }) {
      files.delete(filePath)
      success()
    }
  }
  const uniApi = {
    env: { USER_DATA_PATH: '/data' },
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => { storage.set(key, value) },
    getFileSystemManager: () => manager,
    chooseImage: ({ success }: { success(result: { tempFilePaths: string[]; tempFiles: Array<{ path: string; size: number; type?: string }> }): void }) => success({
      tempFilePaths: [selectedPath],
      tempFiles: [{ path: selectedPath, size: 4, type: options.tempFileType }]
    }),
    getImageInfo: ({ success }: { success(result: { width: number; height: number; type?: string }): void }) => success({ width: 640, height: 480, type: imageInfoType })
  }
  return {
    uniApi,
    operations,
    setSelectedBytes(bytes: number[]) { files.set(selectedPath, Uint8Array.from(bytes).buffer) }
  }
}

describe('mini program media runtime', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    { label: 'jpg 扩展名', options: { tempPath: '/tmp/selected.jpg', imageInfoType: undefined }, expected: 'image/jpeg' },
    { label: 'jpeg 图片 metadata', options: { tempPath: '/tmp/selected', imageInfoType: 'jpeg' }, expected: 'image/jpeg' },
    { label: 'png 图片 metadata', options: { tempPath: '/tmp/selected.png', imageInfoType: 'png' }, expected: 'image/png' },
    { label: 'webp 临时文件 metadata', options: { tempPath: '/tmp/selected', imageInfoType: undefined, tempFileType: 'image/webp' }, expected: 'image/webp' }
  ])('从 $label 识别受支持的 MIME', async ({ options, expected }) => {
    const runtime = createMiniProgramMediaRuntime({ uniApi: miniProgramHarness(options).uniApi })

    await expect(runtime.chooseImages({ count: 1, profile: 'normal' })).resolves.toMatchObject([{ mimeType: expected }])
  })

  it.each([
    { label: 'GIF', options: { tempPath: '/tmp/selected.gif', imageInfoType: 'gif' } },
    { label: 'SVG', options: { tempPath: '/tmp/selected.svg', imageInfoType: undefined, tempFileType: 'image/svg+xml' } },
    { label: '未知扩展名', options: { tempPath: '/tmp/selected.heic', imageInfoType: undefined } },
    { label: '未知 metadata', options: { tempPath: '/tmp/selected', imageInfoType: 'bmp' } }
  ])('拒绝 $label，不能默认按 JPEG 处理', async ({ options }) => {
    const runtime = createMiniProgramMediaRuntime({ uniApi: miniProgramHarness(options).uniApi })

    await expect(runtime.chooseImages({ count: 1, profile: 'normal' })).rejects.toThrow('仅支持 jpeg/png/webp 图片')
  })

  it('不依赖全局 Blob 保存字节，重建 runtime 后仍能解析同一 asset', async () => {
    const harness = miniProgramHarness()
    vi.stubGlobal('Blob', undefined)
    const digest = async () => 'a'.repeat(64)
    const first = createMiniProgramMediaRuntime({ uniApi: harness.uniApi, digest })
    const [file] = await first.chooseImages({ count: 1, profile: 'normal' })
    const reference = await savePreparedMediaFile(first, file, 'farm-cover')

    const restarted = createMiniProgramMediaRuntime({ uniApi: harness.uniApi, digest })
    await expect(restarted.storage.resolve(reference)).resolves.toBe('/data/agritainment-media/media-' + 'a'.repeat(64))
  })

  it('首次写文件前递归创建持久媒体目录', async () => {
    const harness = miniProgramHarness()
    const runtime = createMiniProgramMediaRuntime({ uniApi: harness.uniApi, digest: async () => 'b'.repeat(64) })
    const [file] = await runtime.chooseImages({ count: 1, profile: 'normal' })
    await savePreparedMediaFile(runtime, file, 'product-cover')

    expect(harness.operations.slice(0, 2)).toEqual([
      'mkdir:/data/agritainment-media:true',
      'write:/data/agritainment-media/media-' + 'b'.repeat(64)
    ])
  })

  it('无 Web Crypto 时使用内置 SHA-256 保存资源', async () => {
    const harness = miniProgramHarness()
    vi.stubGlobal('crypto', undefined)
    vi.stubGlobal('Blob', undefined)
    const runtime = createMiniProgramMediaRuntime({ uniApi: harness.uniApi })
    const [file] = await runtime.chooseImages({ count: 1, profile: 'normal' })

    await expect(savePreparedMediaFile(runtime, file, 'farm-cover')).resolves.toEqual({
      source: 'asset',
      assetId: 'media-9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a'
    })
  })

  it('重建 runtime 后目录已存在仍能保存新资源', async () => {
    const harness = miniProgramHarness()
    const first = createMiniProgramMediaRuntime({ uniApi: harness.uniApi })
    const [firstFile] = await first.chooseImages({ count: 1, profile: 'normal' })
    const firstReference = await savePreparedMediaFile(first, firstFile, 'farm-cover')
    harness.setSelectedBytes([5, 6, 7, 8])

    const restarted = createMiniProgramMediaRuntime({ uniApi: harness.uniApi })
    const [nextFile] = await restarted.chooseImages({ count: 1, profile: 'normal' })
    const nextReference = await savePreparedMediaFile(restarted, nextFile, 'farm-cover')
    expect(nextReference).not.toEqual(firstReference)
  })
})
