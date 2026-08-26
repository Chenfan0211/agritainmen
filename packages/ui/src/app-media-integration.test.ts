import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { normalize } from 'node:path'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(import.meta.dirname, '../../..')
const appNames = ['user', 'farmhouse', 'promoter', 'alliance', 'store', 'supplier', 'dashboard'] as const
const miniProgramApps = new Set(['user', 'farmhouse', 'promoter', 'alliance', 'supplier'])

function read(relativePath: string): string {
  return readFileSync(resolve(workspaceRoot, relativePath), 'utf8')
}

function resolveUiEntry(appName: string): string {
  const appRoot = resolve(workspaceRoot, 'apps', appName)
  const script = `
    import { resolve } from 'node:path'
    import { loadConfigFromFile, resolveConfig } from './node_modules/vite/dist/node/index.js'

    const configEnv = { command: 'build', mode: 'test', isSsrBuild: false, isPreview: false }
    const loaded = await loadConfigFromFile(configEnv, 'vite.config.ts')
    const config = await resolveConfig({
      ...loaded.config,
      configFile: false,
      logLevel: 'silent',
      plugins: [],
      root: process.cwd()
    }, 'build')
    const resolver = config.createResolver()
    const resolved = await resolver('@agritainment/ui', resolve('src/main.ts'))
    process.stdout.write('\\n@@RESOLVED@@' + (resolved ?? ''))
  `
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: appRoot,
    encoding: 'utf8'
  })
  return output.split('@@RESOLVED@@').at(-1)?.trim() ?? ''
}

describe('cross-app media runtime wiring', () => {
  it.each(appNames)('%s 配置 ui 依赖、类型源码和 H5 runtime', (appName) => {
    const packageJson = JSON.parse(read(`apps/${appName}/package.json`)) as { dependencies?: Record<string, string> }
    const tsconfig = read(`apps/${appName}/tsconfig.json`)
    const main = read(`apps/${appName}/src/main.ts`)

    expect(packageJson.dependencies?.['@agritainment/ui']).toBe('workspace:*')
    expect(tsconfig).toContain('../../packages/ui/src/**/*.vue')
    expect(main).toContain('configureMediaRuntime')
    expect(main).toContain('createH5MediaRuntime')
  })

  it.each([...miniProgramApps])('%s 将 H5 与小程序 runtime import 放在独立条件入口', (appName) => {
    const main = read(`apps/${appName}/src/main.ts`)
    expect(main).toMatch(/#ifdef H5[\s\S]*?from '@agritainment\/ui\/h5'[\s\S]*?#endif/)
    expect(main).toMatch(/#ifdef MP-WEIXIN[\s\S]*?from '@agritainment\/ui\/mp'[\s\S]*?#endif/)
  })

  it.each([...miniProgramApps])('%s 从 app 内依赖路径解析共享 UI，避免 MP chunk 越过 input root', (appName) => {
    const resolvedEntry = normalize(resolveUiEntry(appName))
    const expectedPrefix = normalize(resolve(workspaceRoot, 'apps', appName, 'node_modules', '@agritainment', 'ui'))

    expect(resolvedEntry).toContain(expectedPrefix)
  })
})

describe('cross-app business image boundary', () => {
  it.each(appNames)('%s 不把业务媒体值直接传给原生 image', (appName) => {
    const pagePaths = appName === 'dashboard'
      ? [`apps/${appName}/src/pages/index/index.vue`, `apps/${appName}/src/pages/login/index.vue`]
      : [`apps/${appName}/src/pages/index/index.vue`]
    for (const pagePath of pagePaths) {
      const source = read(pagePath)
      const nativeDynamicSources = [...source.matchAll(/<(?:image|img)\b[^>]*\s:src="([^"]+)"[^>]*>/g)]
        .map((match) => match[1])
        .filter((binding) => !/QrDataUrl|qrDataUrl|Icon\b|\/static\/icons\//.test(binding))
      expect(nativeDynamicSources, pagePath).toEqual([])
    }
  })
})
