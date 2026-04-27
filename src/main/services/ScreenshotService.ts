import { desktopCapturer, screen, BrowserWindow, clipboard, nativeImage, app } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'

export interface ScreenshotResult {
  success: boolean
  filePath?: string
  error?: string
}

class ScreenshotService {
  private screenshotWindow: BrowserWindow | null = null
  private mainWindow: BrowserWindow | null = null
  private pendingCallback: ((result: ScreenshotResult) => void) | null = null
  private wasFocused: boolean = false

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  setMainWindow(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
  }

  /**
   * 恢复主窗口
   */
  private restoreMainWindow(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show()
      if (this.wasFocused) {
        this.mainWindow.focus()
      }
    }
  }

  /**
   * 等待指定毫秒
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 捕获全屏截图
   */
  async captureFullScreen(): Promise<string | null> {
    try {
      const primaryDisplay = screen.getPrimaryDisplay()
      // 使用实际像素尺寸（逻辑尺寸 × 缩放因子）
      const { width, height } = primaryDisplay.size
      const scaleFactor = primaryDisplay.scaleFactor
      const thumbnailSize = {
        width: Math.floor(width * scaleFactor),
        height: Math.floor(height * scaleFactor)
      }
      
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize
      })

      if (sources.length > 0) {
        const screenshot = sources[0].thumbnail
        // log.info(`截图尺寸: ${screenshot.getSize().width}x${screenshot.getSize().height}, 缩放因子: ${scaleFactor}`)
        return screenshot.toDataURL()
      }

      return null
    } catch (error) {
      log.error('截图失败:', error)
      return null
    }
  }

  /**
   * 打开截图选区窗口
   * 使用 hide 方式：先彻底隐藏主窗口，完成截图后再恢复
   * （hide 比 setOpacity(0) 更可靠，避免 compositor 在 Linux 下残留半透明窗口）
   */
  async startCapture(): Promise<void> {
    if (this.screenshotWindow) {
      return
    }

    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }

    // 保存原窗口状态
    this.wasFocused = this.mainWindow.isFocused()

    try {
      // 彻底隐藏主窗口（hide 比 setOpacity(0) 更可靠，确保不会被截入）
      this.mainWindow.hide()

      // 按平台给不同延迟，平衡体验与稳定性：
      // - Windows/macOS: compositor 同步快，100ms 足够
      // - Linux (X11/Wayland): compositor 可能有帧缓冲延迟，需 300ms 避免半透明残影
      const platformDelay = process.platform === 'linux' ? 300 : 100
      await this.delay(platformDelay)

      // 获取全屏截图
      const screenshotDataUrl = await this.captureFullScreen()

      if (!screenshotDataUrl) {
        log.error('无法获取屏幕截图')
        this.restoreMainWindow()
        return
      }

      // 保存截图到临时文件
      const tempDir = path.join(app.getPath('temp'), 'CubicleChat', 'screenshots')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      const tempFilePath = path.join(tempDir, `fullscreen-${Date.now()}.png`)
      
      // 将 base64 数据转换为 buffer 并保存
      const base64Data = screenshotDataUrl.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(tempFilePath, buffer)
      // log.info(`全屏截图已保存到临时文件: ${tempFilePath}`)

      // 获取屏幕尺寸
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.size
      const scaleFactor = primaryDisplay.scaleFactor

      // 创建全屏截图窗口
      this.screenshotWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        frame: false,
        transparent: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        fullscreen: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, '../preload/index.js')
        }
      })

      // 加载截图界面（使用文件路径）
      const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

      if (isDev && process.env['ELECTRON_RENDERER_URL']) {
        this.screenshotWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/screenshot?imagePath=${encodeURIComponent(tempFilePath)}&width=${width}&height=${height}&scale=${scaleFactor}`)
      } else {
        this.screenshotWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
          hash: `/screenshot?imagePath=${encodeURIComponent(tempFilePath)}&width=${width}&height=${height}&scale=${scaleFactor}`
        })
      }

      // 监听截图完成
      this.screenshotWindow.webContents.on('ipc-message', (_, channel, data) => {
        if (channel === 'screenshot:capture') {
          this.handleScreenshotCapture(data)
        }
      })

      this.screenshotWindow.on('closed', () => {
        this.screenshotWindow = null
        // 截图窗口关闭后才恢复主窗口
        this.restoreMainWindow()
      })
    } catch (error) {
      log.error('截图启动失败:', error)
      // 发生错误时恢复窗口
      this.restoreMainWindow()
    }
  }

  /**
   * 处理截图结果
   */
  handleScreenshotCapture(data: { imageData: string; saveToClipboard: boolean }): void {
    this.closeScreenshotWindow()

    const saveAndSend = async () => {
      try {
        // 创建临时文件
        const tempDir = path.join(app.getPath('temp'), 'CubicleChat', 'screenshots')
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true })
        }

        const fileName = `screenshot-${Date.now()}.png`
        const filePath = path.join(tempDir, fileName)

        // 将 base64 数据转换为 buffer 并保存
        const base64Data = data.imageData.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        fs.writeFileSync(filePath, buffer)

        log.info(`截图已保存: ${filePath}`)

        if (this.pendingCallback) {
          this.pendingCallback({ success: true, filePath })
          this.pendingCallback = null
        }
      } catch (error) {
        log.error('保存截图失败:', error)
        if (this.pendingCallback) {
          this.pendingCallback({ success: false, error: String(error) })
          this.pendingCallback = null
        }
      }
    }

    // 如果需要复制到剪贴板
    if (data.saveToClipboard) {
      try {
        const base64Data = data.imageData.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        const image = nativeImage.createFromBuffer(buffer)
        clipboard.writeImage(image)
        log.info('截图已复制到剪贴板')
      } catch (error) {
        log.error('复制到剪贴板失败:', error)
      }
    }

    saveAndSend()
    // 注意：不在这里恢复主窗口，而是在 screenshotWindow 的 closed 事件中恢复
  }

  /**
   * 关闭截图窗口
   */
  closeScreenshotWindow(): void {
    if (this.screenshotWindow && !this.screenshotWindow.isDestroyed()) {
      this.screenshotWindow.close()
    }
    this.screenshotWindow = null
  }

  /**
   * 取消截图
   */
  cancelCapture(): void {
    this.closeScreenshotWindow()
    if (this.pendingCallback) {
      this.pendingCallback({ success: false, error: '取消截图' })
      this.pendingCallback = null
    }
    // 取消时也恢复主窗口
    this.restoreMainWindow()
  }

  /**
   * 截图完成回调
   */
  onCaptureComplete(callback: (result: ScreenshotResult) => void): void {
    this.pendingCallback = callback
  }
}

export default ScreenshotService
