import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, clipboard, dialog, protocol, globalShortcut, type NativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from './utils'
import log from 'electron-log'
import { NetworkService } from './network/NetworkService'
import { DatabaseService } from './database/DatabaseService'
import ScreenshotService from './services/ScreenshotService'
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
let screenshotService: ScreenshotService | null = null

// 消息提醒相关变量
let trayFlashTimer: NodeJS.Timeout | null = null
let isTrayFlashing = false
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let hasUnreadMessages = false
let originalTrayImage: NativeImage | null = null
let highlightTrayImage: NativeImage | null = null
let overlayIcon: NativeImage | null = null

// 任务栏闪烁计时器
let taskbarFlashTimer: NodeJS.Timeout | null = null
let isTaskbarFlashing = false

// 请求单实例锁
const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  log.info('应用已经在运行，退出新实例')
  app.quit()
  process.exit(0)
}

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

  // 当窗口显示时，清除消息提醒
  mainWindow.on('show', () => {
    clearNotification()
  })

  // 当窗口获得焦点时，清除消息提醒
  mainWindow.on('focus', () => {
    clearNotification()
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(app as any).isQuitting) {
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

// 创建任务栏覆盖图标（红色圆点）
function createNativeOverlayIcon(): NativeImage {
  // 创建一个简单的红色圆点图标 (16x16)
  const size = 16
  // BGRA 格式像素数据
  const pixels = Buffer.alloc(size * size * 4)

  const centerX = size / 2
  const centerY = size / 2
  const radius = size / 2 - 1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)

      if (distance <= radius) {
        // 红色填充
        pixels[index] = 0     // B
        pixels[index + 1] = 0 // G
        pixels[index + 2] = 255 // R
        pixels[index + 3] = 255 // A
      } else {
        // 透明
        pixels[index] = 0
        pixels[index + 1] = 0
        pixels[index + 2] = 0
        pixels[index + 3] = 0
      }
    }
  }

  return nativeImage.createFromBuffer(pixels, { width: size, height: size })
}

// 创建纯色高亮图标
function createColoredTrayIcon(baseIcon: NativeImage, color: string): NativeImage {
  // 获取图标尺寸
  const size = baseIcon.getSize()

  // 创建 Buffer 来修改图标颜色
  const bitmap = baseIcon.toBitmap()
  const newBitmap = Buffer.from(bitmap)

  // 将颜色转换为 RGB
  const hex = color.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  // 修改像素颜色（BGRA 格式）
  for (let i = 0; i < newBitmap.length; i += 4) {
    const alpha = newBitmap[i + 3]
    if (alpha > 128) {
      newBitmap[i] = b
      newBitmap[i + 1] = g
      newBitmap[i + 2] = r
    }
  }

  return nativeImage.createFromBuffer(newBitmap, { width: size.width, height: size.height })
}

// 开始托盘图标闪动
function startTrayFlash(): void {
  if (!tray || isTrayFlashing || !originalTrayImage) {
    return
  }

  isTrayFlashing = true

  // 创建高亮图标（橙色/红色高亮）
  if (!highlightTrayImage) {
    highlightTrayImage = createColoredTrayIcon(originalTrayImage, '#FF6B35')
  }

  let isHighlight = false
  trayFlashTimer = setInterval(() => {
    if (!tray) return
    tray.setImage(isHighlight ? originalTrayImage! : highlightTrayImage!)
    isHighlight = !isHighlight
  }, 500) // 每500ms切换一次

  log.info('开始托盘图标闪动')
}

// 停止托盘图标闪动
function stopTrayFlash(): void {
  if (trayFlashTimer) {
    clearInterval(trayFlashTimer)
    trayFlashTimer = null
  }

  isTrayFlashing = false

  // 恢复原始图标
  if (tray && originalTrayImage) {
    tray.setImage(originalTrayImage)
  }

  // log.info('停止托盘图标闪动')
}

// 开始任务栏图标闪烁（红色圆点覆盖层）
function startTaskbarFlash(): void {
  if (!mainWindow || isTaskbarFlashing) {
    return
  }

  isTaskbarFlashing = true

  // 创建覆盖图标
  if (!overlayIcon) {
    overlayIcon = createNativeOverlayIcon()
  }

  // 立即显示红点
  mainWindow.setOverlayIcon(overlayIcon, '新消息')

  // 启动闪烁效果（红点/无红点交替）
  let showOverlay = true
  taskbarFlashTimer = setInterval(() => {
    if (!mainWindow) return
    if (showOverlay) {
      mainWindow.setOverlayIcon(overlayIcon, '新消息')
    } else {
      mainWindow.setOverlayIcon(null, '')
    }
    showOverlay = !showOverlay
  }, 500) // 每500ms闪烁一次

  log.info('开始任务栏图标闪烁')
}

// 停止任务栏图标闪烁
function stopTaskbarFlash(): void {
  if (taskbarFlashTimer) {
    clearInterval(taskbarFlashTimer)
    taskbarFlashTimer = null
  }

  isTaskbarFlashing = false

  // 清除覆盖图标
  if (mainWindow) {
    mainWindow.setOverlayIcon(null, '')
  }

  // log.info('停止任务栏图标闪烁')
}

// 触发新消息提醒
export function notifyNewMessage(): void {
  hasUnreadMessages = true

  if (!mainWindow) {
    return
  }

  // 如果窗口不可见（被隐藏到托盘），闪动托盘图标
  if (!mainWindow.isVisible() || mainWindow.isMinimized()) {
    startTrayFlash()
  } else {
    // 窗口可见时，闪烁任务栏图标（红色圆点覆盖层）
    startTaskbarFlash()
  }
}

// 清除消息提醒
function clearNotification(): void {
  hasUnreadMessages = false
  stopTrayFlash()
  stopTaskbarFlash()
  // log.info('清除消息提醒')
}

// 创建系统托盘
function createTray(): void {
  // 根据环境选择图标路径
  const iconPath = is.dev
    ? join(__dirname, '../../resources/tray.png')
    : join(process.resourcesPath, 'app.asar.unpacked/resources/tray.png')

  try {
    originalTrayImage = nativeImage.createFromPath(iconPath)
  } catch {
    originalTrayImage = nativeImage.createEmpty()
  }

  if (originalTrayImage.isEmpty()) {
    return
  }

  tray = new Tray(originalTrayImage)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 CubicleChat',
      click: () => {
        mainWindow?.show()
        clearNotification()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (app as any).isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('CubicleChat')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
    clearNotification()
  })

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        clearNotification()
      }
    }
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

    // 初始化网络服务，传入消息通知回调
    networkService = new NetworkService(mainWindow!, databaseService, {
      onNewMessage: () => {
        notifyNewMessage()
      }
    })
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

  ipcMain.handle('user:updateInfo', async (_, info) => {
    const result = databaseService?.updateUserInfo(info) ?? false
    if (result && networkService) {
      // 如果更新了昵称或状态，广播给其他用户
      if (info.nickname !== undefined || info.status !== undefined || info.avatar !== undefined) {
        const userInfo = databaseService?.getUserInfo()
        if (userInfo) {
          await networkService.broadcastStatusChange(userInfo)
        }
      }
    }
    return result
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

  ipcMain.handle('conversation:delete', (_, data) => {
    return databaseService?.deleteConversation(data.conversationId) ?? false
  })

  // 获取消息历史
  ipcMain.handle('message:getHistory', (_, data) => {
    return databaseService?.getMessageHistory(data.conversationId, data.limit, data.before) ?? []
  })

  // 搜索消息
  ipcMain.handle('message:search', (_, data) => {
    return databaseService?.searchMessages(data.keyword, data.conversationId, data.limit) ?? []
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

  // ========== 群聊 IPC ==========
  ipcMain.handle('group:create', async (_, data: { groupName: string; memberIds: string[] }) => {
    return networkService?.createGroup(data.groupName, data.memberIds) ?? { success: false, error: '网络服务未初始化' }
  })

  ipcMain.handle('group:invite', async (_, data: { groupId: string; conversationId: string; userIds: string[] }) => {
    return networkService?.inviteToGroup(data.groupId, data.conversationId, data.userIds) ?? { success: false, error: '网络服务未初始化' }
  })

  ipcMain.handle('group:leave', async (_, data: { groupId: string; conversationId: string }) => {
    return networkService?.leaveGroup(data.groupId, data.conversationId) ?? { success: false, error: '网络服务未初始化' }
  })

  ipcMain.handle('group:delete', async (_, data: { groupId: string; conversationId: string }) => {
    return networkService?.deleteGroup(data.groupId, data.conversationId) ?? { success: false, error: '网络服务未初始化' }
  })

  ipcMain.handle('group:sendMessage', async (_, data: { groupId: string; conversationId: string; content: string; contentType: string }) => {
    return networkService?.sendGroupMessage(data) ?? { success: false }
  })

  ipcMain.handle('group:sendFile', async (_, data: { groupId: string; conversationId: string; filePath: string }) => {
    return networkService?.sendGroupFile(data.groupId, data.conversationId, data.filePath) ?? { success: false, error: '网络服务未初始化' }
  })

  ipcMain.handle('group:getMembers', async (_, data: { conversationId: string }) => {
    return databaseService?.getGroupMembers(data.conversationId) ?? []
  })

  ipcMain.handle('group:getCreator', async (_, data: { conversationId: string }) => {
    return databaseService?.getGroupCreator(data.conversationId) ?? null
  })

  ipcMain.handle('group:getList', async () => {
    const userInfo = databaseService?.getUserInfo()
    return databaseService?.getGroups(userInfo?.userId) ?? []
  })

  // 设置
  ipcMain.handle('settings:get', (_, key) => {
    return databaseService?.getSetting(key) ?? null
  })

  ipcMain.handle('settings:set', (_, key, value) => {
    return databaseService?.setSetting(key, value) ?? false
  })

  // 文件传输
  ipcMain.handle('file:select', async (_, options?: { isDirectory?: boolean; title?: string }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: options?.isDirectory ? ['openDirectory'] : ['openFile'],
      title: options?.title || (options?.isDirectory ? '选择文件夹' : '选择文件')
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

  // 保存剪贴板图片为临时文件
  ipcMain.handle('file:saveClipboardImage', async (_, data: { imageData: string; fileName: string }) => {
    try {
      // 从 base64 数据创建缓冲区
      const base64Data = data.imageData.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')

      // 创建临时文件路径
      const tempDir = path.join(app.getPath('temp'), 'CubicleChat')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      const tempFilePath = path.join(tempDir, data.fileName)

      // 写入文件
      fs.writeFileSync(tempFilePath, buffer)

      return { success: true, filePath: tempFilePath }
    } catch (error) {
      log.error('保存剪贴板图片失败:', error)
      return { success: false, error: String(error) }
    }
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

  // 删除文件记录
  ipcMain.handle('file:delete', async (_, data: { fileId: string; deleteLocalFile?: boolean }) => {
    try {
      // 获取文件路径（如果需要删除本地文件）
      let filePath: string | null = null
      if (data.deleteLocalFile) {
        filePath = databaseService?.getFilePath(data.fileId) || null
      }

      // 删除数据库记录
      const deleted = databaseService?.deleteFile(data.fileId)
      if (!deleted) {
        return { success: false, error: '删除记录失败' }
      }

      // 删除本地文件
      if (data.deleteLocalFile && filePath) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
        } catch (fsError) {
          log.error('删除本地文件失败:', fsError)
          // 记录已删除，但文件删除失败，仍然返回成功
        }
      }

      return { success: true }
    } catch (error) {
      log.error('删除文件记录失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 网络接口相关
  ipcMain.handle('network:getInterfaces', (_, includeVirtual = false) => {
    return networkService?.getNetworkInterfaces(includeVirtual) ?? []
  })

  ipcMain.handle('network:getCurrentInterface', () => {
    return networkService?.getCurrentInterface() ?? null
  })

  ipcMain.handle('network:switchInterface', async (_, address: string) => {
    const result = await networkService?.switchInterface(address)
    if (result?.success) {
      // 保存到设置
      databaseService?.setSetting('network.interface', address)
    }
    return result ?? { success: false, error: '网络服务未初始化' }
  })

  // 自定义广播地址相关 IPC
  ipcMain.handle('network:getCustomBroadcastAddresses', () => {
    return networkService?.getCustomBroadcastAddresses() ?? []
  })

  ipcMain.handle('network:addCustomBroadcastAddress', (_, address: string) => {
    const result = networkService?.addCustomBroadcastAddress(address)
    return result ?? { success: false, error: '网络服务未初始化' }
  })

  ipcMain.handle('network:removeCustomBroadcastAddress', (_, address: string) => {
    const result = networkService?.removeCustomBroadcastAddress(address)
    return result ?? { success: false, error: '网络服务未初始化' }
  })

  ipcMain.handle('network:getAllBroadcastAddresses', () => {
    return networkService?.getAllBroadcastAddresses() ?? []
  })

  // 截图相关
  ipcMain.handle('screenshot:start', () => {
    if (screenshotService) {
      // 设置回调
      screenshotService.onCaptureComplete((result) => {
        // 通知渲染进程截图完成
        mainWindow?.webContents.send('screenshot:complete', result)
      })
      screenshotService.startCapture()
      return true
    }
    return false
  })

  ipcMain.on('screenshot:cancel', () => {
    screenshotService?.cancelCapture()
  })

  // 图片复制到剪贴板
  ipcMain.handle('image:copyToClipboard', async (_, data: { imageUrl: string }) => {
    try {
      // 从 local-resource:// 协议 URL 提取文件路径
      let filePath = data.imageUrl.replace(/^local-resource:\/\//i, '')

      // 去除可能多余的前导斜杠
      if (filePath.startsWith('/') && filePath.length > 2 && filePath.charAt(2) === ':') {
        filePath = filePath.substring(1)
      }

      filePath = decodeURIComponent(filePath)

      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }

      // 读取文件并写入剪贴板
      const buffer = await fs.promises.readFile(filePath)
      const image = nativeImage.createFromBuffer(buffer)
      clipboard.writeImage(image)

      return { success: true }
    } catch (error) {
      log.error('复制图片到剪贴板失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 图片另存为
  ipcMain.handle('image:saveAs', async (_, data: { imageUrl: string; fileName: string }) => {
    try {
      // 从 local-resource:// 协议 URL 提取文件路径
      let filePath = data.imageUrl.replace(/^local-resource:\/\//i, '')

      // 去除可能多余的前导斜杠
      if (filePath.startsWith('/') && filePath.length > 2 && filePath.charAt(2) === ':') {
        filePath = filePath.substring(1)
      }

      filePath = decodeURIComponent(filePath)

      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }

      // 显示保存对话框
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: data.fileName,
        filters: [
          { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: '用户取消' }
      }

      // 复制文件到目标路径
      await fs.promises.copyFile(filePath, result.filePath)

      return { success: true, filePath: result.filePath }
    } catch (error) {
      log.error('图片另存为失败:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.on('screenshot:capture', (_, data: { imageData: string; saveToClipboard: boolean }) => {
    if (screenshotService) {
      screenshotService.onCaptureComplete((result) => {
        // 通知渲染进程截图完成
        mainWindow?.webContents.send('screenshot:complete', result)
      })
      screenshotService.handleScreenshotCapture(data)
    }
  })

  log.info('IPC 处理器注册完成')
}

// 注册全局快捷键
function registerGlobalShortcuts(): void {
  // 截图快捷键 Ctrl+Alt+A
  globalShortcut.register('CommandOrControl+Alt+A', () => {
    if (screenshotService) {
      screenshotService.startCapture()
    }
  })
  log.info('全局快捷键注册完成')
}

// 当第二个实例启动时，聚焦到第一个实例的窗口
app.on('second-instance', () => {
  log.info('检测到第二个实例启动，聚焦到主窗口')
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }
})

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

      // log.info(`local-resource 原始请求 URL: ${urlStr}`)

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

      // log.info(`local-resource 解析文件路径: ${filePath}`)

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

  // 初始化截图服务
  if (mainWindow) {
    screenshotService = new ScreenshotService(mainWindow)
  }

  // 注册全局快捷键
  registerGlobalShortcuts()

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any).isQuitting = true
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
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Electron {
    interface App {
      isQuitting: boolean
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(app as any).isQuitting = false
