import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SOURCE_EXTENSIONS = new Set(['.css', '.scss', '.ts', '.vue'])
const DECORATIVE_SELECTOR = /(?:^|[^\w-])(?:[\w-]*icon[\w-]*|glyph|decorative)(?:$|[^\w-])/i
const INTERACTIVE_SELECTOR = /(?:button|\bbtn\b|actions?\b|input|select|textarea|tabbar|tab-item|nav(?:-|\b)|menu-item)/i
const AUXILIARY_SELECTOR = /(?:\bsmall\b|meta|muted|note|hint|helper|\bsub\b|-sub\b|time|spec|footer)/i
const MIN_TEXT_PX = 11

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length
}

function selectorAt(source, index) {
  const blockStart = source.lastIndexOf('{', index)
  if (blockStart < 0) return ''
  const previousBlock = source.lastIndexOf('}', blockStart)
  return source.slice(previousBlock + 1, blockStart).trim()
}

function hasExplicitAllowance(source, index) {
  const lineStart = source.lastIndexOf('\n', index) + 1
  const previousLineStart = source.lastIndexOf('\n', Math.max(0, lineStart - 2)) + 1
  return source.slice(previousLineStart, index).includes('typography-audit: allow')
}

export function auditTypographySource(source, file) {
  const failures = []
  const cssPattern = /font-size\s*:\s*(\d+(?:\.\d+)?)px/gi
  for (const match of source.matchAll(cssPattern)) {
    const value = Number(match[1])
    const selector = selectorAt(source, match.index)
    const minimum = INTERACTIVE_SELECTOR.test(selector) ? 13 : AUXILIARY_SELECTOR.test(selector) ? 12 : MIN_TEXT_PX
    if (value >= minimum) continue
    if (DECORATIVE_SELECTOR.test(selector) || hasExplicitAllowance(source, match.index)) continue
    failures.push({ file, line: lineAt(source, match.index), value, minimum, kind: 'css', selector })
  }

  const chartPattern = /\bfontSize\s*:\s*(\d+(?:\.\d+)?)/g
  for (const match of source.matchAll(chartPattern)) {
    const value = Number(match[1])
    if (value >= MIN_TEXT_PX || hasExplicitAllowance(source, match.index)) continue
    failures.push({ file, line: lineAt(source, match.index), value, minimum: MIN_TEXT_PX, kind: 'chart', selector: '' })
  }
  return failures
}

function collectSourceFiles(root) {
  const entries = readdirSync(root, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(path)
    if (!SOURCE_EXTENSIONS.has(extname(entry.name)) || /\.test\.[^.]+$/i.test(entry.name)) return []
    return [path]
  })
}

export function auditTypography(root = ROOT) {
  const appSourceRoots = readdirSync(resolve(root, 'apps'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join('apps', entry.name, 'src'))
  const files = [...appSourceRoots, 'packages/ui/src'].flatMap((sourceRoot) => {
    const absolute = resolve(root, sourceRoot)
    return collectSourceFiles(absolute)
  })
  return files.flatMap((file) => auditTypographySource(readFileSync(file, 'utf8'), relative(root, file).replaceAll('\\', '/')))
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const failures = auditTypography()
  if (failures.length) {
    console.error(`字体审计失败：发现 ${failures.length} 处低于 ${MIN_TEXT_PX}px 的业务文字。`)
    for (const failure of failures) {
      const context = failure.selector ? ` (${failure.selector.replace(/\s+/g, ' ').slice(0, 80)})` : ''
      console.error(`${failure.file}:${failure.line} ${failure.kind} ${failure.value}px < ${failure.minimum}px${context}`)
    }
    process.exitCode = 1
  } else {
    console.log(`字体审计通过：业务文字与图表文字均不低于 ${MIN_TEXT_PX}px。`)
  }
}
