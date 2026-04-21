// electron-toolkit-utils 兼容实现

import { app } from 'electron'
import os from 'os'
import log from 'electron-log'

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

/**
 * 获取主网卡的 MAC 地址
 * 优先选择物理网卡（非虚拟网卡），作为设备唯一标识
 */
export function getPrimaryMacAddress(): string | null {
  const interfaces = os.networkInterfaces()

  // 网卡优先级（数字越小优先级越高）
  const priorityMap: Record<string, number> = {
    'eth': 1,      // Linux 以太网
    'en': 2,       // macOS 以太网
    'Ethernet': 3, // Windows 以太网
    'wlan': 4,     // Linux WiFi
    'wl': 5,       // Linux WiFi (新)
    'Wi-Fi': 6,    // Windows WiFi
  }

  const candidates: Array<{ name: string; mac: string; priority: number }> = []

  for (const [name, infos] of Object.entries(interfaces)) {
    // 跳过虚拟网卡
    if (/^(vEthernet|VMware|VirtualBox|Docker|ZeroTier|WSL|Tailscale|NordVPN|TAP-Windows|veth|br-|docker|lo)/i.test(name)) {
      log.debug(`跳过虚拟网卡: ${name}`)
      continue
    }

    if (!infos) continue

    for (const info of infos) {
      // 只考虑 IPv4 且非内部地址
      if (info.family !== 'IPv4' || info.internal) {
        continue
      }

      // 确保有 MAC 地址且不是全零
      if (!info.mac || info.mac === '00:00:00:00:00:00') {
        continue
      }

      // 计算优先级
      let priority = 100
      for (const [prefix, p] of Object.entries(priorityMap)) {
        if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
          priority = p
          break
        }
      }

      candidates.push({ name, mac: info.mac, priority })
    }
  }

  // 按优先级排序
  candidates.sort((a, b) => a.priority - b.priority)

  if (candidates.length > 0) {
    log.info(`选择主网卡 MAC 地址: ${candidates[0].name} - ${candidates[0].mac}`)
    return candidates[0].mac
  }

  log.warn('未找到可用的物理网卡 MAC 地址')
  return null
}

/**
 * 生成基于 MAC 地址的用户 ID
 * 这样即使重新安装软件，同一台电脑也能生成相同的 userId
 */
export function generateUserIdFromMac(macAddress: string | null): string {
  if (!macAddress) {
    // 如果没有 MAC 地址，回退到随机 UUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  // 将 MAC 地址转换为 UUID 格式
  // MAC: 00:1A:2B:3C:4D:5E -> UUID: 00001a2b-3c4d-5e00-0000-000000000000
  const cleanMac = macAddress.replace(/:/g, '').toLowerCase()
  const paddedMac = cleanMac.padEnd(12, '0')

  return `${paddedMac.substring(0, 8)}-${paddedMac.substring(8, 12)}-4${paddedMac.substring(13, 15)}-a${paddedMac.substring(15, 16)}00-000000000000`
}
