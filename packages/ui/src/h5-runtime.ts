import { RepositoryMediaStorageAdapter, createPlatformRepository } from '@agritainment/shared'
import type { MediaMimeType, PlatformRepository } from '@agritainment/shared'
import { fitMediaDimensions, mediaCompressionProfile } from './media-helpers'
import { DEFAULT_BUSINESS_IMAGE_FALLBACK } from './runtime'
import type { ChooseMediaOptions, MediaRuntime, PreparedMediaFile } from './runtime'

interface H5ChooseImageResult {
  tempFilePaths: string[]
  tempFiles?: Array<{ path?: string; file?: Blob }>
}

interface H5UniApi {
  chooseImage(options: {
    count: number
    sizeType: string[]
    success(result: H5ChooseImageResult): void
    fail(error: unknown): void
  }): void
}

interface H5RuntimeOptions {
  repository?: PlatformRepository
  uniApi?: H5UniApi
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: MediaMimeType, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('图片压缩失败')),
    mimeType,
    quality
  ))
}

async function compressH5Image(blob: Blob, options: ChooseMediaOptions): Promise<PreparedMediaFile> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('仅支持 jpeg/png/webp 图片')
  const image = await loadImage(blob)
  const profile = mediaCompressionProfile(options.profile)
  const dimensions = fitMediaDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height, profile.maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('图片压缩不可用')
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height)
  return {
    blob: await canvasBlob(canvas, blob.type as MediaMimeType, profile.quality),
    ...dimensions
  }
}

function chooseH5Images(uniApi: H5UniApi, options: ChooseMediaOptions): Promise<H5ChooseImageResult> {
  return new Promise((resolve, reject) => uniApi.chooseImage({
    count: options.count,
    sizeType: ['original'],
    success: resolve,
    fail: reject
  }))
}

export function createH5MediaRuntime(options: H5RuntimeOptions = {}): MediaRuntime {
  const uniApi = options.uniApi ?? (globalThis as unknown as { uni: H5UniApi }).uni
  return {
    storage: new RepositoryMediaStorageAdapter(options.repository ?? createPlatformRepository()),
    fallback: { ...DEFAULT_BUSINESS_IMAGE_FALLBACK },
    async chooseImages(input) {
      const selected = await chooseH5Images(uniApi, input)
      return Promise.all(selected.tempFilePaths.map(async (path, index) => {
        const directBlob = selected.tempFiles?.[index]?.file
        const blob = directBlob instanceof Blob ? directBlob : await fetch(path).then((response) => response.blob())
        return compressH5Image(blob, input)
      }))
    }
  }
}
