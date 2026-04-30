import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'

// IPC 白名单
const sendChannels = [
  'window:minimize',
  'window:maximize',
  'window:close',
  'screenshot:capture',
  'screenshot:cancel'
]

const invokeChannels = [
  'window:isMaximized',
  'user:getInfo',
  'user:updateInfo',
  'user:getOnlineUsers',
  'user:getByIds',
  'conversation:getList',
  'conversation:create',
  'conversation:delete',
  'message:getHistory',
  'message:search',
  'message:send',
  'message:withdraw',
  'settings:get',
  'settings:set',
  'file:send',
  'file:select',
  'file:get',
  'file:getList',
  'file:open',
  'group:create',
  'group:invite',
  'group:leave',
  'group:delete',
  'group:sendMessage',
  'group:sendFile',
  'group:getMembers',
  'group:getCreator',
  'group:getList',
  'file:openFolder',
  'file:delete',
  'file:saveClipboardImage',
  'network:getInterfaces',
  'network:getCurrentInterface',
  'network:switchInterface',
  'network:getCustomBroadcastAddresses',
  'network:addCustomBroadcastAddress',
  'network:removeCustomBroadcastAddress',
  'network:getAllBroadcastAddresses',
  'screenshot:start',
  'screenshot:cancel',
  'image:copyToClipboard',
  'image:saveAs'
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
  'file:send-start',
  'typing:receive',
  'conversation:new',
  'group:members',
  'group:dissolved',
  'screenshot:complete'
]

// 类型定义
export interface ElectronAPI {
  send: (channel: string, data?: unknown) => void
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void
  getFilePath: (file: File) => string
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
  memberIds?: string[]
  creatorId?: string
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

export interface FileRecord {
  fileId: string
  fileName: string
  filePath?: string
  fileSize: number
  mimeType: string
  fileMd5?: string
  direction: 'send' | 'receive'
  peerId: string
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'rejected'
  transferredBytes: number
  isImage: boolean
  thumbnailData?: string
  startedAt?: number
  completedAt?: number
  createdAt: number
}

export interface FileTransfer {
  transferId: string
  fileName: string
  fileSize: number
  filePath?: string
  direction: 'send' | 'receive'
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'rejected'
  progress: number
  speed: number
  isImage: boolean
  thumbnailData?: string
}

export interface FileReceiveRequest {
  transferId: string
  fileName: string
  fileSize: number
  fileMd5: string
  mimeType: string
  isImage: boolean
  thumbnailData?: string
  fromUserId: string
  fromNickname: string
  fromAvatar?: string
  peerIp: string
  tcpPort: number
}

export interface NetworkInterface {
  name: string
  address: string
  netmask: string
  broadcast: string
  isInternal: boolean
  isVirtual: boolean
  priority: number
}

// API 实现
const electronAPI: ElectronAPI = {
  send: (channel: string, data?: unknown) => {
    if (sendChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },

  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
    if (invokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
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
  },

  getFilePath: (file: File): string => {
    return webUtils.getPathForFile(file)
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
