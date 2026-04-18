import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// IPC 白名单
const sendChannels = [
  'window:minimize',
  'window:maximize',
  'window:close'
]

const invokeChannels = [
  'window:isMaximized',
  'user:getInfo',
  'user:updateInfo',
  'user:getOnlineUsers',
  'conversation:getList',
  'conversation:create',
  'message:getHistory',
  'message:send',
  'message:withdraw',
  'settings:get',
  'settings:set'
]

const receiveChannels = [
  'user:online',
  'user:offline',
  'user:update',
  'window:maximized-change',
  'msg:receive',
  'msg:ack',
  'msg:withdrawn',
  'file:progress',
  'file:complete',
  'typing:receive'
]

// 类型定义
export interface ElectronAPI {
  send: (channel: string, data?: unknown) => void
  invoke: <T = unknown>(channel: string, data?: unknown) => Promise<T>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void
}

export interface UserInfo {
  userId: string
  nickname: string
  avatar?: string
  status: 'online' | 'busy' | 'away' | 'offline'
}

export interface OnlineUser extends UserInfo {
  ip: string
  port: number
  lastSeenAt: number
}

export interface Conversation {
  conversationId: string
  type: 'single' | 'group'
  targetId: string
  targetName: string
  targetAvatar?: string
  targetStatus?: string
  lastMessage?: string
  lastMessageAt?: number
  unreadCount: number
  isPinned: boolean
  isMuted: boolean
}

export interface Message {
  messageId: string
  conversationId: string
  senderId: string
  senderName: string
  contentType: 'text' | 'emoji' | 'image' | 'file' | 'system' | 'recall'
  content: string
  fileId?: string
  status: 'sending' | 'sent' | 'delivered' | 'failed'
  isRecalled: boolean
  sentAt: number
  deliveredAt?: number
}

// API 实现
const electronAPI: ElectronAPI = {
  send: (channel: string, data?: unknown) => {
    if (sendChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },

  invoke: <T = unknown>(channel: string, data?: unknown): Promise<T> => {
    if (invokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data)
    }
    return Promise.reject(new Error(`IPC channel "${channel}" is not allowed`))
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!receiveChannels.includes(channel)) {
      console.warn(`IPC channel "${channel}" is not allowed to receive`)
      return () => {}
    }

    const listener = (_event: IpcRendererEvent, ...args: unknown[]) => {
      callback(...args)
    }

    ipcRenderer.on(channel, listener)

    // 返回取消订阅的函数
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    if (receiveChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback as never)
    }
  }
}

// 暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 类型声明
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
