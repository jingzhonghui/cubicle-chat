import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from './utils'
import log from 'electron-log'
import { NetworkService } from './network/NetworkService'
import { DatabaseService } from './database/DatabaseService'
import fs from 'fs'
import path from 'path'

// 注册自定义协议（必须在 app.ready 之前调用）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-resource',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      standard: false,
      bypassCSP: true,
      stream: true
    }
  }
])

// 配置日志
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

// 全局变量
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let networkService: NetworkService | null = null
let databaseService: DatabaseService | null = null

// 创建主窗口
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 680,
    minWidth: 320,
    minHeight: 480,
    show: false,
    frame: false, // 自定义标题栏
    autoHideMenuBar: true,
    backgroundColor: '#F5F5F5',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 等待页面加载完成后再初始化服务
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('页面加载完成，准备初始化服务...')
    initServices().then(() => {
      log.info('服务初始化完成')
    }).catch((err) => {
      log.error('服务初始化失败:', err)
    })
  })

  // 监听窗口最大化状态变化
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-change', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-change', false)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 窗口关闭时最小化到托盘
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // 加载页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  log.info('主窗口创建成功')
}

// 创建系统托盘
function createTray(): void {
  // 根据环境选择图标路径
  const iconPath = is.dev
    ? join(__dirname, '../../resources/tray.png')
    : join(process.resourcesPath, 'app.asar.unpacked/resources/tray.png')

  let trayIcon: nativeImage

  try {
    trayIcon = nativeImage.createFromPath(iconPath)
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  if (trayIcon.isEmpty()) {
    return
  }

  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 CubicleChat',
      click: () => {
        mainWindow?.show()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('CubicleChat')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
  })

  log.info('系统托盘创建成功')
}

// 初始化服务
async function initServices(): Promise<void> {
  try {
    // 初始化数据库
    databaseService = new DatabaseService()
    await databaseService.init()
    log.info('数据库初始化成功')

    // 初始化网络服务
    networkService = new NetworkService(mainWindow!, databaseService)
    await networkService.init()
    log.info('网络服务初始化成功')
  } catch (error) {
    log.error('服务初始化失败:', error)
  }
}

// 注册 IPC 处理器
function registerIpcHandlers(): void {
  // 窗口控制
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    mainWindow?.hide()
  })

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false
  })

  // 用户信息
  ipcMain.handle('user:getInfo', () => {
    return databaseService?.getUserInfo() ?? null
  })

  ipcMain.handle('user:updateInfo', (_, info) => {
    return databaseService?.updateUserInfo(info) ?? false
  })

  // 获取在线用户
  ipcMain.handle('user:getOnlineUsers', () => {
    return networkService?.getOnlineUsers() ?? []
  })

  // 获取会话列表
  ipcMain.handle('conversation:getList', () => {
    return databaseService?.getConversations() ?? []
  })

  ipcMain.handle('conversation:create', (_, data) => {
    // 如果没有传递目标信息，尝试从在线用户获取
    if (!data.targetInfo && data.type === 'single') {
      const onlineUsers = networkService?.getOnlineUsers() ?? []
      const targetUser = onlineUsers.find(u => u.userId === data.targetId)
      if (targetUser) {
        data.targetInfo = {
          nickname: targetUser.nickname,
          avatar: targetUser.avatar,
          status: targetUser.status
        }
      }
    }
    return databaseService?.createConversation(data) ?? null
  })

  // 获取消息历史
  ipcMain.handle('message:getHistory', (_, data) => {
    return databaseService?.getMessageHistory(data.conversationId, data.limit, data.before) ?? []
  })

  // 发送消息
  ipcMain.handle('message:send', async (_, data) => {
    const result = await networkService?.sendMessage(data)
    return result ?? { success: false }
  })

  // 撤回消息
  ipcMain.handle('message:withdraw', async (_, data) => {
    return networkService?.withdrawMessage(data.messageId, data.conversationId) ?? false
  })

  // 设置
  ipcMain.handle('settings:get', (_, key) => {
    return databaseService?.getSetting(key) ?? null
  })

  ipcMain.handle('settings:set', (_, key, value) => {
    return databaseService?.setSetting(key, value) ?? false
  })

  // 文件传输
  ipcMain.handle('file:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      title: '选择要发送的文件'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('file:send', async (_, data: { to: string; filePath: string }) => {
    const result = await networkService?.sendFile(data.to, data.filePath)
    return result ?? { success: false, error: '网络服务未初始化' }
  })

  ipcMain.handle('file:accept', async (_, data: { transferId: string }) => {
    const result = await networkService?.acceptFile(data.transferId)
    return result ?? { success: false, error: '网络服务未初始化' }
  })

  ipcMain.handle('file:reject', async (_, data: { transferId: string; reason?: string }) => {
    await networkService?.rejectFile(data.transferId, data.reason)
    return true
  })

  ipcMain.handle('file:get', async (_, data: { fileId: string }) => {
    return databaseService?.getFile(data.fileId) ?? null
  })

  ipcMain.handle('file:getList', async (_, filter?: { direction?: 'send' | 'receive'; status?: string }) => {
    return databaseService?.getFileList(filter as { direction?: 'send' | 'receive'; status?: 'pending' | 'transferring' | 'completed' | 'failed' | 'rejected' }) ?? []
  })

  ipcMain.handle('file:open', async (_, data: { filePath: string }) => {
    if (data.filePath && await app.isPackaged) {
      await shell.openPath(data.filePath)
      return true
    }
    return false
  })

  ipcMain.handle('file:openFolder', async (_, data: { filePath: string }) => {
    if (data.filePath) {
      shell.showItemInFolder(data.filePath)
      return true
    }
    return false
  })

  log.info('IPC 处理器注册完成')
}

// 应用入口
app.whenReady().then(async () => {
  // 设置日志
  log.info('CubicleChat 启动中...')
  log.info(`Electron 版本: ${process.versions.electron}`)
  log.info(`Node 版本: ${process.versions.node}`)

  // 注册 local-resource 协议处理器
  protocol.handle('local-resource', async (request) => {
    try {
      const urlStr = request.url

      log.info(`local-resource 原始请求 URL: ${urlStr}`)

      // 从 URL 中提取文件路径
      // 格式: local-resource:///E:/Users/test/photo.jpg (非标准协议，路径保持原样)
      let filePath = urlStr.replace(/^local-resource:\/\//i, '')

      // 去除可能多余的前导斜杠（三个斜杠会产生一个多余的 /）
      if (filePath.startsWith('/') && filePath.length > 2 && filePath.charAt(2) === ':') {
        // Windows 路径如 /E:/Users/... → E:/Users/...
        filePath = filePath.substring(1)
      }

      // 解码 URL 编码字符（处理中文路径、空格等）
      filePath = decodeURIComponent(filePath)

      log.info(`local-resource 解析文件路径: ${filePath}`)

      // 安全检查：确保路径存在且是文件
      if (!fs.existsSync(filePath)) {
        log.warn(`local-resource: 文件不存在: ${filePath}`)
        return new Response('File not found', { status: 404 })
      }

      const stat = fs.statSync(filePath)
      if (!stat.isFile()) {
        return new Response('Not a file', { status: 400 })
      }

      const data = await fs.promises.readFile(filePath)

      // 根据扩展名推断 MIME 类型
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml'
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'

      return new Response(data, {
        headers: { 'Content-Type': mimeType }
      })
    } catch (error) {
      log.error('local-resource 协议处理失败:', error)
      return new Response('Internal error', { status: 500 })
    }
  })

  // 设置应用 ID (Windows)
  electronApp.setAppUserModelId('com.cubicle.chat')

  // 监听窗口激活 (macOS)
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 创建窗口
  createWindow()

  // 创建托盘
  createTray()

  // 注册 IPC
  registerIpcHandlers()

  // 服务将在页面加载完成后初始化（在 did-finish-load 事件中）

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

// 退出前清理
app.on('before-quit', () => {
  app.isQuitting = true
  networkService?.destroy()
  databaseService?.close()
  log.info('CubicleChat 已退出')
})

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  log.error('未捕获的异常:', error)
})

process.on('unhandledRejection', (reason) => {
  log.error('未处理的 Promise 拒绝:', reason)
})

// 扩展 app 类型
declare module 'electron' {
  interface App {
    isQuitting: boolean
  }
}

app.isQuitting = false
