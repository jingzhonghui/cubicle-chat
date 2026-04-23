// electron-toolkit-utils 兼容实现

import { app } from 'electron'
import os from 'os'
import log from 'electron-log'
import crypto from 'crypto'

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
 * 获取所有物理网卡的 MAC 地址列表
 * 用于生成稳定的机器唯一标识
 */
function getAllPhysicalMacs(): string[] {
  const interfaces = os.networkInterfaces()
  const macs: string[] = []

  for (const [name, infos] of Object.entries(interfaces)) {
    // 跳过虚拟网卡
    if (/^(vEthernet|VMware|VirtualBox|Docker|ZeroTier|WSL|Tailscale|NordVPN|TAP-Windows|veth|br-|docker|lo)/i.test(name)) {
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

      macs.push(info.mac.toLowerCase())
    }
  }

  // 去重并排序，确保顺序一致
  return [...new Set(macs)].sort()
}

/**
 * 获取主网卡的 MAC 地址
 * 优先选择物理网卡（非虚拟网卡），作为设备唯一标识
 */
export function getPrimaryMacAddress(): string | null {
  const macs = getAllPhysicalMacs()

  if (macs.length > 0) {
    log.info(`选择主网卡 MAC 地址: ${macs[0]}`)
    return macs[0]
  }

  log.warn('未找到可用的物理网卡 MAC 地址')
  return null
}

/**
 * 生成机器唯一标识
 * 基于所有物理网卡 MAC 地址的组合哈希
 * 这样即使默认网卡变化，同一台机器也能生成相同的 userId
 */
export function generateMachineId(): string {
  const macs = getAllPhysicalMacs()

  if (macs.length === 0) {
    // 如果没有 MAC 地址，回退到随机 UUID（这种情况极少发生）
    log.warn('未找到物理网卡，使用随机 UUID')
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  // 将所有 MAC 地址组合后哈希
  const combined = macs.join('|')
  log.info(`生成机器标识，基于 MAC 列表: ${macs.join(', ')}`)

  // 使用 SHA-256 生成哈希
  const hash = crypto.createHash('sha256').update(combined).digest('hex')

  // 转换为 UUID 格式 (8-4-4-4-12)
  const uuid = `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(16, 20)}-${hash.substring(20, 32)}`

  log.info(`生成的机器标识: ${uuid}`)
  return uuid
}


