export type SearchableSelectValue = string | number | boolean

export interface SearchableSelectOption {
  label: string
  value: SearchableSelectValue
  disabled?: boolean
  keywords?: string[]
}

let searchableSelectSequence = 0

export function createSearchableSelectId() {
  searchableSelectSequence += 1
  return `searchable-select-${searchableSelectSequence}`
}

function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, '').toLocaleLowerCase('zh-CN')
}

export function filterSelectOptions(options: SearchableSelectOption[], query: string) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return options
  return options.filter((option) => [option.label, ...(option.keywords || [])]
    .some((value) => normalizeSearchText(value).includes(normalizedQuery)))
}

export function findNextEnabledOption(options: SearchableSelectOption[], currentIndex: number, direction: 1 | -1) {
  if (!options.some((option) => !option.disabled)) return -1
  let nextIndex = currentIndex < 0 ? (direction === 1 ? -1 : 0) : currentIndex
  for (let count = 0; count < options.length; count += 1) {
    nextIndex = (nextIndex + direction + options.length) % options.length
    if (!options[nextIndex]?.disabled) return nextIndex
  }
  return -1
}
