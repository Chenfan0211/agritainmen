import type { MediaReference } from './media'

export const PRODUCT_CATEGORY_IMAGE_DIRECTORY = '/static/images/categories'

const productCategoryImageFiles: Readonly<Record<string, string>> = {
  农产品: 'agricultural-products.webp',
  预制菜: 'prepared-foods.webp',
  '腊味/预制菜': 'prepared-foods.webp',
  食材调料: 'ingredients-seasonings.webp',
  特色食材: 'featured-ingredients.webp',
  土特产: 'local-specialties.webp',
  伴手礼: 'souvenirs.webp',
  茶饮伴手礼: 'souvenirs.webp',
  文旅伴手礼: 'cultural-tourism-gifts.webp',
  民宿用品: 'homestay-supplies.webp',
  包装耗材: 'packaging-consumables.webp',
  套餐券: 'package-vouchers.webp',
  生鲜农产: 'fresh-produce.webp',
  生鲜水果: 'seasonal-fruit.webp',
  时令水果: 'seasonal-fruit.webp',
  有机蔬菜: 'organic-vegetables.webp',
  粮油米面: 'grains-oils-noodles.webp',
  酒水饮料: 'beverages.webp'
}

function builtIn(file: string): MediaReference {
  return { source: 'builtin', path: `${PRODUCT_CATEGORY_IMAGE_DIRECTORY}/${file}` }
}

export function defaultProductCategoryImage(category = ''): MediaReference {
  const normalized = category.trim()
  if (normalized === '全部' || normalized === '全品类') return builtIn('all.webp')
  return builtIn(productCategoryImageFiles[normalized] ?? 'fallback.webp')
}
