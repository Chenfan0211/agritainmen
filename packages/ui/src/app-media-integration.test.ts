import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { normalize } from 'node:path'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(import.meta.dirname, '../../..')
const appNames = ['user', 'farmhouse', 'promoter', 'store', 'supplier', 'dashboard'] as const
const miniProgramApps = new Set(['user', 'farmhouse', 'promoter', 'supplier'])
const activeApps = ['admin', ...appNames] as const

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
  it.each(activeApps)('%s 启动时清理已下线联盟端数据', (appName) => {
    const main = read(`apps/${appName}/src/main.ts`)
    expect(main).toContain('purgeRetiredAllianceData')
    expect(main).toMatch(/createApp\(\)[\s\S]*purgeRetiredAllianceData\(\)/)
  })

  it.each(appNames)('%s 配置 ui 依赖、类型源码和 H5 runtime', (appName) => {
    const packageJson = JSON.parse(read(`apps/${appName}/package.json`)) as { dependencies?: Record<string, string> }
    const tsconfig = read(`apps/${appName}/tsconfig.json`)
    const main = read(`apps/${appName}/src/main.ts`)
    const runtime = read(`apps/${appName}/src/media-runtime.ts`)

    expect(packageJson.dependencies?.['@agritainment/ui']).toBe('workspace:*')
    expect(tsconfig).toContain('../../packages/ui/src/**/*.vue')
    expect(main).toContain("import './media-runtime'")
    expect(runtime).toContain('configureMediaRuntime')
    expect(runtime).toContain('createH5MediaRuntime')
  })

  it.each(['user', 'supplier'] as const)('%s 在 createApp 前完成 H5 runtime 配置', (appName) => {
    const main = read(`apps/${appName}/src/main.ts`)
    const runtime = read(`apps/${appName}/src/media-runtime.ts`)
    const runtimeConfigIndex = runtime.indexOf('configureMediaRuntime(h5MediaRuntime)')
    expect(runtimeConfigIndex).toBeGreaterThanOrEqual(0)
    expect(main.indexOf("import './media-runtime'")).toBeLessThan(main.indexOf('import App from'))
    expect(runtime).toContain('const h5MediaRuntime = createH5MediaRuntime()')
    expect(runtime).toContain('configureMediaRuntime(h5MediaRuntime)')
  })

  it.each([...miniProgramApps])('%s 的 H5 configure 与 H5 runtime 使用同一入口', (appName) => {
    const main = read(`apps/${appName}/src/main.ts`)
    const runtime = read(`apps/${appName}/src/media-runtime.ts`)
    expect(main).toContain("import './media-runtime'")
    expect(runtime).toMatch(/#ifdef H5[\s\S]*import \{ configureMediaRuntime, createH5MediaRuntime \} from '@agritainment\/ui\/h5'/)
    expect(runtime).toMatch(/#ifdef MP-WEIXIN[\s\S]*import \{ configureMediaRuntime as configureMiniProgramMediaRuntime \} from '@agritainment\/ui'/)
  })

  it.each([...miniProgramApps])('%s 将 H5 与小程序 runtime import 放在独立条件入口', (appName) => {
    const runtime = read(`apps/${appName}/src/media-runtime.ts`)
    expect(runtime).toMatch(/#ifdef H5[\s\S]*?from '@agritainment\/ui\/h5'[\s\S]*?#endif/)
    expect(runtime).toMatch(/#ifdef MP-WEIXIN[\s\S]*?from '@agritainment\/ui\/mp'[\s\S]*?#endif/)
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
