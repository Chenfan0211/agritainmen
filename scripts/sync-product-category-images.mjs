import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourceDirectory = join(root, 'assets', 'product-categories', 'master')
const apps = ['admin', 'farmhouse', 'store', 'user', 'supplier']
const files = [
  'agricultural-products.webp', 'prepared-foods.webp', 'ingredients-seasonings.webp',
  'featured-ingredients.webp', 'local-specialties.webp', 'souvenirs.webp',
  'cultural-tourism-gifts.webp', 'homestay-supplies.webp', 'packaging-consumables.webp',
  'package-vouchers.webp', 'fresh-produce.webp', 'seasonal-fruit.webp',
  'organic-vegetables.webp', 'grains-oils-noodles.webp', 'beverages.webp',
  'all.webp', 'fallback.webp'
]

function hash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

for (const file of files) {
  const source = join(sourceDirectory, file)
  if (!existsSync(source)) throw new Error(`缺少商品品类图片母版: ${file}`)
  const expectedHash = hash(source)
  for (const app of apps) {
    const targetDirectory = join(root, 'apps', app, 'src', 'static', 'images', 'categories')
    const target = join(targetDirectory, file)
    mkdirSync(targetDirectory, { recursive: true })
    copyFileSync(source, target)
    if (hash(target) !== expectedHash) throw new Error(`${app} 商品品类图片同步失败: ${file}`)
  }
}

console.log(`已将 ${files.length} 张商品品类图片同步到 ${apps.length} 个应用。`)
