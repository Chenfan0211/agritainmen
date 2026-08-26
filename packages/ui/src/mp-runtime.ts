import { LocalFileMediaStorageAdapter } from '@agritainment/shared'
import type { MediaFileSystem, MediaMimeType, MediaSaveOptions, PlatformRepository } from '@agritainment/shared'
import { DEFAULT_BUSINESS_IMAGE_FALLBACK } from './runtime'
import type { MediaRuntime } from './runtime'
import { UniStoragePlatformRepository } from './uni-storage-repository'

interface MiniProgramFileSystemManager {
  mkdir(options: { dirPath: string; recursive: boolean; success(): void; fail(error: unknown): void }): void
  writeFile(options: { filePath: string; data: ArrayBuffer; success(): void; fail(error: unknown): void }): void
  readFile(options: { filePath: string; success(result: { data: ArrayBuffer }): void; fail(error: unknown): void }): void
  unlink(options: { filePath: string; success(): void; fail(error: unknown): void }): void
}

interface MiniProgramUniApi {
  env: { USER_DATA_PATH: string }
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  getFileSystemManager(): MiniProgramFileSystemManager
  chooseImage(options: { count: number; sizeType: string[]; success(result: { tempFilePaths: string[]; tempFiles?: Array<{ path?: string; size?: number; type?: string }> }): void; fail(error: unknown): void }): void
  getImageInfo(options: { src: string; success(result: { width: number; height: number; type?: string }): void; fail(error: unknown): void }): void
}

const unsupportedImageMessage = '仅支持 jpeg/png/webp 图片'

function supportedImageMime(value?: string): MediaMimeType | null {
  const normalized = value?.trim().toLowerCase().replace(/^\./, '')
  if (normalized === 'jpg' || normalized === 'jpeg' || normalized === 'image/jpg' || normalized === 'image/jpeg') return 'image/jpeg'
  if (normalized === 'png' || normalized === 'image/png') return 'image/png'
  if (normalized === 'webp' || normalized === 'image/webp') return 'image/webp'
  return null
}

function miniProgramImageMime(path: string, infoType?: string, tempFileType?: string): MediaMimeType {
  const metadata = [infoType, tempFileType].filter((value): value is string => Boolean(value?.trim()))
  const candidates: MediaMimeType[] = metadata.map((value) => {
    const mime = supportedImageMime(value)
    if (!mime) throw new Error(unsupportedImageMessage)
    return mime
  })
  const cleanPath = path.split(/[?#]/, 1)[0]
  const extension = cleanPath.match(/\.([^./\\]+)$/)?.[1]
  if (extension) {
    const extensionMime = supportedImageMime(extension)
    if (extensionMime) candidates.push(extensionMime)
    else if (!metadata.length || /^(?:gif|svg|svgz|bmp|heic|heif|avif|tif|tiff)$/i.test(extension)) throw new Error(unsupportedImageMessage)
  }
  if (!candidates.length || new Set(candidates).size > 1) throw new Error(unsupportedImageMessage)
  return candidates[0]
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
] as const

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

async function miniProgramSha256(data: Uint8Array): Promise<string> {
  const paddedLength = Math.ceil((data.byteLength + 9) / 64) * 64
  const message = new Uint8Array(paddedLength)
  message.set(data)
  message[data.byteLength] = 0x80
  const bitLength = data.byteLength * 8
  const view = new DataView(message.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const words = new Uint32Array(64)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15]
      const y = words[index - 2]
      const sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3)
      const sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('')
}

function createMiniProgramFileSystem(manager: MiniProgramFileSystemManager, directory: string): MediaFileSystem {
  let directoryReady: Promise<void> | null = null
  const ensureDirectory = () => {
    directoryReady ||= new Promise((resolve, reject) => manager.mkdir({
      dirPath: directory,
      recursive: true,
      success: resolve,
      fail: (error) => {
        const detail = error instanceof Error ? error.message : String((error as { errMsg?: unknown })?.errMsg ?? error)
        if (/exist|已存在/i.test(detail)) resolve()
        else reject(error)
      }
    }))
    return directoryReady
  }
  return {
    writeFile: async (path, data) => {
      await ensureDirectory()
      const copy = Uint8Array.from(data)
      return new Promise((resolve, reject) => manager.writeFile({ filePath: path, data: copy.buffer, success: resolve, fail: reject }))
    },
    readFile: (path) => new Promise((resolve) => manager.readFile({ filePath: path, success: ({ data }) => resolve(new Uint8Array(data)), fail: () => resolve(null) })),
    removeFile: (path) => new Promise((resolve, reject) => manager.unlink({ filePath: path, success: resolve, fail: reject }))
  }
}

export function createMiniProgramMediaRuntime(options: { repository?: PlatformRepository; uniApi?: MiniProgramUniApi; digest?: MediaSaveOptions['digest'] } = {}): MediaRuntime {
  const uniApi = options.uniApi ?? (globalThis as unknown as { uni: MiniProgramUniApi }).uni
  const manager = uniApi.getFileSystemManager()
  const directory = `${uniApi.env.USER_DATA_PATH}/agritainment-media`
  const fileSystem = createMiniProgramFileSystem(manager, directory)
  const storage = new LocalFileMediaStorageAdapter(
    options.repository ?? new UniStoragePlatformRepository(uniApi),
    fileSystem,
    directory
  )
  return {
    storage,
    fallback: { ...DEFAULT_BUSINESS_IMAGE_FALLBACK },
    digest: options.digest ?? miniProgramSha256,
    chooseImages(input) {
      return new Promise((resolve, reject) => uniApi.chooseImage({
        count: input.count,
        sizeType: ['compressed'],
        fail: reject,
        success: ({ tempFilePaths, tempFiles }) => {
          Promise.all(tempFilePaths.map((path) => Promise.all([
            new Promise<{ width: number; height: number; type?: string }>((done, fail) => uniApi.getImageInfo({ src: path, success: done, fail })),
            fileSystem.readFile(path)
          ]).then(([info, bytes]) => {
            if (!bytes) throw new Error('图片读取失败')
            const fileMetadata = tempFiles?.find((file) => file.path === path) ?? tempFiles?.[tempFilePaths.indexOf(path)]
            const mime = miniProgramImageMime(path, info.type, fileMetadata?.type)
            return { bytes: Uint8Array.from(bytes), mimeType: mime, width: info.width, height: info.height }
          }))).then(resolve, reject)
        }
      }))
    }
  }
}
