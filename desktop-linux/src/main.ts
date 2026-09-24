/**
 * Electron main process for the DeepSeek Harness desktop app.
 *
 * Responsibilities: resolve the self-contained backend payload, spawn the
 * bundled `dsh web` server, and open a native window at the served URL once
 * the readiness line appears. The window shows the `splash.ts` launch page in
 * the meantime, with the boot stage written onto it. Lifecycle keeps the
 * backend and the window bound: closing the window quits the app, quitting
 * stops the backend, a
 * second instance focuses the existing window, and a backend that dies or
 * fails to boot surfaces an actionable error dialog with a restart path.
 *
 * Source self-update: on launch (and every few hours) the shell compares the
 * payload's recorded source ref with the upstream master commit. When newer
 * code exists it opens the in-app Update Center (not a system notification).
 * From there the user can check, download, install, and watch progress; on
 * success the backend restarts on the new payload. The Electron shell itself
 * is not updated — only the bundled backend.
 *
 * The renderer is the plain remote web app over `http://127.0.0.1`; the
 * window is a sandboxed, nodeIntegration-free shell around it.
 * @module @deepseek-ai/dsh-desktop-linux/main
 */

import { app, dialog, shell, BrowserWindow, Menu } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PayloadManifest } from './payload.ts'
import { dshHome, readPayloadManifest, resolvePayloadRoot } from './payload.ts'
import { launchServer, type ServerHandle } from './server-launcher.ts'
import { LOADING_HTML, splashStatusScript } from './splash.ts'
import { shouldOpenExternally } from './external-url.ts'
import { contextMenuTemplate } from './context-menu.ts'
import { UpdateCenter } from './updater/update-center.ts'
import { checkForUpdate } from './updater/update-check.ts'
import { chromiumFetch } from './updater/electron-net.ts'
import { resolveGitHubToken } from './updater/github-token.ts'
import { readOfferedUpdateSha, writeOfferedUpdateSha } from './updater/offered-update.ts'

/** Launcher flag that switches payload resolution to development mode. */
const DEV_FLAG = '--dev'

/** How often to re-check for updates while the app runs. */
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Window fill painted before the splash paints, so no white frame flashes. */
const SHELL_BACKGROUND = '#02040A'

/** Boot stages reported on the splash status line, in the order they run. */
const STAGE_RESOLVE = '正在定位运行时'
const STAGE_MANIFEST = '正在校验运行时清单'
const STAGE_SPAWN = '正在启动本地服务'
const STAGE_GUI = '正在载入界面'

let mainWindow: BrowserWindow | undefined
let server: ServerHandle | undefined
let appOrigin = ''
let stopping = false
/** True while a backend stop is initiated by this shell, suppressing the unexpected-exit dialog. */
let backendIntentionalStop = false
/** The active payload (root + manifest), refreshed on every backend start. */
let activePayload: { root: string; manifest: PayloadManifest } | undefined
/** True while a background availability check is in flight. */
let updateCheckBusy = false
/** Latest SHA already auto-offered in the Update Center (memory + `$DSH_HOME/desktop/offered-update.json`). */
let offeredUpdateSha: string | undefined

const updateCenter = new UpdateCenter({
  getPayload: () => activePayload,
  getParentWindow: () => mainWindow,
  restartBackend: async () => {
    await stopBackend()
    await startBackend()
  },
})

/**
 * The app icon for the window/taskbar: the packaged `Resources/icon.png`
 * (extraResources), or the repo's `build/icons/128x128.png` in a source
 * checkout. macOS derives the dock icon from the bundle; Linux/Windows use
 * this.
 *
 * Both paths stay at 128px. The icon reaches the window manager as
 * `_NET_WM_ICON`, and Electron drops any larger image, leaving the property
 * empty — the window then shows a generic icon wherever no desktop entry
 * claims it.
 */
function windowIconPath(): string | undefined {
  const packaged = join(process.resourcesPath, 'icon.png')
  if (existsSync(packaged)) return packaged
  const dev = fileURLToPath(new URL('../build/icons/128x128.png', import.meta.url))
  return existsSync(dev) ? dev : undefined
}

/** Create the app window: sandboxed renderer, no navigation off the app origin. */
function createWindow(): BrowserWindow {
  const icon = windowIconPath()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: SHELL_BACKGROUND,
    // Keep the menu bar visible: Linux users otherwise only get Alt-to-reveal,
    // which hides Update Center behind an invisible chrome affordance.
    autoHideMenuBar: false,
    title: 'DeepSeek Harness',
    ...(icon !== undefined ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => { win.show() })
  // Electron shows no context menu by itself: without this handler a
  // right-click in the shell does nothing at all, including in the terminal.
  win.webContents.on('context-menu', (_event, params) => {
    const template = contextMenuTemplate(params)
    if (template.length > 0) Menu.buildFromTemplate(template).popup({ window: win })
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternally(url, appOrigin)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (appOrigin !== '' && !url.startsWith(appOrigin)) event.preventDefault()
  })
  return win
}

/** Present a fatal error with a restart path and act on the choice. */
async function fatal(title: string, detail: string): Promise<void> {
  if (mainWindow === undefined || mainWindow.isDestroyed()) {
    dialog.showErrorBox(title, detail)
    app.exit(1)
    return
  }
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'error',
    title,
    message: title,
    detail,
    buttons: ['Restart', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  })
  if (response === 0) {
    await stopBackend()
    await startBackend()
  } else {
    app.quit()
  }
}

/** Stop the running backend, if any. */
async function stopBackend(): Promise<void> {
  const current = server
  server = undefined
  if (current !== undefined) {
    backendIntentionalStop = true
    await current.stop()
  }
}

/**
 * Advance the splash status line.
 *
 * The window may already be loading the GUI URL, in which case the expression
 * finds no `window.dshSplash` and evaluates to undefined; a lost status line is
 * cosmetic and must not fail the boot.
 * @param text - the boot stage now starting.
 */
function setSplashStatus(text: string): void {
  const win = mainWindow
  if (win === undefined || win.isDestroyed()) return
  void win.webContents.executeJavaScript(splashStatusScript(text)).catch(() => {
    // Only reachable once the splash has been replaced or torn down.
  })
}

/** Resolve the payload, spawn the backend, and load its URL into the window. */
async function startBackend(): Promise<void> {
  setSplashStatus(STAGE_RESOLVE)
  const packagedRoot = process.argv.includes(DEV_FLAG) ? undefined : join(process.resourcesPath, 'dsh')
  const payloadRoot = resolvePayloadRoot(packagedRoot)
  if (payloadRoot === undefined) {
    await fatal(
      'DeepSeek Harness payload is missing',
      'The bundled backend was not found. Reinstall the application, or in a source checkout run '
      + '`pnpm --filter @deepseek-ai/dsh-desktop-linux run build:payload` and relaunch with `pnpm --filter @deepseek-ai/dsh-desktop-linux run dev`.',
    )
    return
  }
  let manifest: PayloadManifest
  setSplashStatus(STAGE_MANIFEST)
  try {
    manifest = readPayloadManifest(payloadRoot)
  } catch (error) {
    await fatal('DeepSeek Harness payload is invalid', String(error))
    return
  }
  activePayload = { root: payloadRoot, manifest }
  backendIntentionalStop = false
  setSplashStatus(STAGE_SPAWN)
  server = launchServer({
    nodeBinary: join(payloadRoot, manifest.nodeBinary),
    cliEntry: join(payloadRoot, manifest.cliEntry),
    onLine: (line) => { console.log('[dsh web]', line) },
  })
  void server.exited.then(({ code, signal }) => {
    if (backendIntentionalStop) return
    void fatal(
      'DeepSeek Harness backend stopped',
      `The backend exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'null'}). Restart it to continue.`,
    )
  })
  try {
    const url = await server.url
    appOrigin = new URL(url).origin
    setSplashStatus(STAGE_GUI)
    if (mainWindow !== undefined && !mainWindow.isDestroyed()) await mainWindow.loadURL(url)
    // The first update check happens after the GUI is up; later ones on an
    // interval. Only payloads that record a source ref participate.
    if (manifest.sourceRef !== undefined) void scheduleUpdateCheck()
  } catch (error) {
    await fatal('DeepSeek Harness failed to start', String(error))
  }
}

/** Check upstream once and open the Update Center when newer code exists. */
async function scheduleUpdateCheck(): Promise<void> {
  if (updateCheckBusy || activePayload?.manifest.sourceRef === undefined) return
  updateCheckBusy = true
  try {
    const home = dshHome()
    if (offeredUpdateSha === undefined) offeredUpdateSha = readOfferedUpdateSha(home)
    const token = await resolveGitHubToken()
    const result = await checkForUpdate({
      currentSha: activePayload.manifest.sourceRef,
      // Chromium's stack follows the system proxy; Node's global fetch does not.
      fetchImpl: await chromiumFetch(),
      ...(token === undefined ? {} : { token }),
    })
    if (result.available && result.latestSha !== undefined && result.latestSha !== offeredUpdateSha) {
      offeredUpdateSha = result.latestSha
      writeOfferedUpdateSha(result.latestSha, home)
      updateCenter.open({ autoCheck: true })
    }
  } catch (error) {
    // A failed check (offline, API limit) is not an error surface; the next
    // interval or a manual menu click retries.
    console.log('[update] check failed:', error instanceof Error ? error.message : String(error))
  } finally {
    updateCheckBusy = false
  }
}

/**
 * Build the always-visible application menu.
 *
 * The window is a browser over the packaged GUI, so the standard Edit and View
 * roles stay in the menu: reload, zoom, and fullscreen are the escape hatch
 * when a booted GUI misbehaves, and the clipboard roles keep copy and paste
 * discoverable. Roles bring Chromium's own accelerators; labels are spelled out
 * because the rest of the menu is Chinese whatever the host locale resolves to.
 */
function installMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '更新',
      submenu: [
        { label: '打开更新中心', accelerator: 'CmdOrCtrl+U', click: () => { updateCenter.open({ autoCheck: true }) } },
      ],
    },
  ]))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow !== undefined) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  void app.whenReady().then(async () => {
    app.setAppUserModelId('ai.deepseek.harness')
    updateCenter.installIpc()
    installMenu()
    const win = createWindow()
    mainWindow = win
    win.setAutoHideMenuBar(false)
    win.setMenuBarVisibility(true)
    // Paint the splash before the backend resolves, so the first stage update
    // has a page to land in. A splash that fails to load must not block the
    // boot: the window already carries SHELL_BACKGROUND, so the worst case is a
    // dark frame, and setSplashStatus tolerates a page that never appeared.
    await win.loadURL(LOADING_HTML).catch((error: unknown) => {
      console.log('[splash] load failed:', error instanceof Error ? error.message : String(error))
    })
    await startBackend()
    setInterval(() => { void scheduleUpdateCheck() }, UPDATE_CHECK_INTERVAL_MS)
  })
  // Quit on close on every platform: the app IS the window for v1, so a
  // closed window must not leave an orphan backend or a dock ghost.
  app.on('window-all-closed', () => {
    app.quit()
  })
  app.on('will-quit', (event) => {
    if (stopping) return
    event.preventDefault()
    stopping = true
    void stopBackend().finally(() => {
      app.quit()
    })
  })
  // Last-resort sync kill for hard exits that never reach will-quit.
  process.on('exit', () => {
    try {
      server?.child.kill('SIGKILL')
    } catch {
      // The child may already be gone; the exit path must not throw.
    }
  })
}
