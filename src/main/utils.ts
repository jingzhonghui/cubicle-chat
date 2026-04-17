// electron-toolkit-utils 兼容实现

export const electronApp = {
  setAppUserModelId(id: string): void {
    if (process.platform === 'win32') {
      app.setAppUserModelId(id)
    }
  }
}

export const optimizer = {
  watchWindowShortcuts(window: Electron.BrowserWindow): void {
    window.on('blur', () => {
      // 可选：窗口失焦时的一些优化
    })
  }
}

export const is = {
  dev: process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
}

import { app } from 'electron'
