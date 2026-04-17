import dgram from 'dgram'
import os from 'os'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { DatabaseService } from '../database/DatabaseService'
import { v4 as uuidv4 } from 'uuid'

// 包类型
export type PacketType =
  | 'ONLINE'
  | 'ONLINE_ACK'
  | 'HEARTBEAT'
  | 'OFFLINE'
  | 'TEXT'
  | 'TEXT_ACK'
  | 'WITHDRAW'
  | 'FILE_NOTIFY'
  | 'FILE_ACCEPT'
  | 'FILE_REJECT'
  | 'GROUP_CREATE'
  | 'GROUP_MESSAGE'
  | 'GROUP_LEAVE'
  | 'TYPING'
  | 'STATUS_CHANGE'

export type UserStatus = 'online' | 'busy' | 'away' | 'offline'

export interface UdpPacket {
  magic: 'CCHT'
  version: number
  type: PacketType
  msgId: string
  timestamp: number
  from: {
    userId: string
    nickname: string
    ip: string
    port: number
    avatar?: string
    status: UserStatus
    version: string
  }
  payload?: Record<string, unknown>
}

export interface OnlineUser {
  userId: string
  nickname: string
  ip: string
  port: number
  avatar?: string
  status: UserStatus
  lastHeartbeat: number
  version: string
}

// 常量配置
const UDP_PORT = 2425
const TCP_PORT = 2426
const HEARTBEAT_INTERVAL = 30000 // 30秒
const HEARTBEAT_TIMEOUT = 90000 // 90秒
const MAGIC = 'CCHT'
const VERSION = 1

export class NetworkService {
  private udpSocket: dgram.Socket | null = null
  private mainWindow: BrowserWindow
  private databaseService: DatabaseService
  private onlineUsers: Map<string, OnlineUser> = new Map()
  private heartbeatTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private selfUserId: string
  private selfNickname: string
  private selfStatus: UserStatus = 'online'
  private broadcastAddress: string = '255.255.255.255'

  constructor(mainWindow: BrowserWindow, databaseService: DatabaseService) {
    this.mainWindow = mainWindow
    this.databaseService = databaseService

    // 获取本机用户信息
    const userInfo = this.databaseService.getUserInfo()
    this.selfUserId = userInfo?.userId ?? uuidv4()
    this.selfNickname = userInfo?.nickname ?? os.hostname()
    this.selfStatus = userInfo?.status ?? 'online'
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.createUdpSocket()
        this.startHeartbeat()
        this.startCleanup()
        this.broadcastOnline()
        resolve()
      } catch (error) {
        log.error('网络服务初始化失败:', error)
        reject(error)
      }
    })
  }

  private createUdpSocket(): void {
    this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

    this.udpSocket.on('error', (err) => {
      log.error('UDP Socket 错误:', err)
    })

    this.udpSocket.on('message', (msg, rinfo) => {
      this.handleMessage(msg, rinfo)
    })

    this.udpSocket.on('listening', () => {
      const address = this.udpSocket!.address()
      log.info(`UDP Socket 监听中: ${address.address}:${address.port}`)

      // 设置广播
      this.udpSocket!.setBroadcast(true)
    })

    this.udpSocket.bind(UDP_PORT)
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const packet = this.decodePacket(msg)

      // 过滤无效包
      if (!packet || packet.magic !== MAGIC || packet.version !== VERSION) {
        return
      }

      // 过滤自己的消息
      if (packet.from.userId === this.selfUserId) {
        return
      }

      // 处理不同类型的消息
      switch (packet.type) {
        case 'ONLINE':
        case 'HEARTBEAT':
          this.handleUserOnline(packet)
          break
        case 'ONLINE_ACK':
          this.handleUserOnline(packet)
          break
        case 'OFFLINE':
          this.handleUserOffline(packet.from.userId)
          break
        case 'TEXT':
          this.handleTextMessage(packet)
          break
        case 'TEXT_ACK':
          this.handleTextAck(packet)
          break
        case 'WITHDRAW':
          this.handleWithdraw(packet)
          break
        case 'STATUS_CHANGE':
          this.handleStatusChange(packet)
          break
        case 'TYPING':
          this.handleTyping(packet)
          break
        default:
          log.debug('未知的消息类型:', packet.type)
      }
    } catch (error) {
      log.error('处理消息失败:', error)
    }
  }

  private handleUserOnline(packet: UdpPacket): void {
    const user: OnlineUser = {
      userId: packet.from.userId,
      nickname: packet.from.nickname,
      ip: packet.from.ip,
      port: packet.from.port,
      avatar: packet.from.avatar,
      status: packet.from.status,
      lastHeartbeat: Date.now(),
      version: packet.from.version
    }

    const isNew = !this.onlineUsers.has(user.userId)
    this.onlineUsers.set(user.userId, user)

    // 保存到数据库
    this.databaseService.saveUser(user)

    // 通知渲染进程
    if (isNew) {
      this.mainWindow.webContents.send('user:online', user)
    } else {
      this.mainWindow.webContents.send('user:update', user)
    }

    // 回复 ACK
    this.sendPacket('ONLINE_ACK', {})
  }

  private handleUserOffline(userId: string): void {
    if (this.onlineUsers.has(userId)) {
      this.onlineUsers.delete(userId)
      this.mainWindow.webContents.send('user:offline', { userId })
    }
  }

  private handleTextMessage(packet: UdpPacket): void {
    const payload = packet.payload as {
      to: string
      content: string
      contentType: string
      replyTo?: string
    }

    // 只处理发给自己的消息
    if (payload.to !== this.selfUserId) {
      return
    }

    // 保存消息到数据库
    this.databaseService.saveMessage({
      messageId: packet.msgId,
      conversationId: payload.to,
      senderId: packet.from.userId,
      contentType: payload.contentType as 'text' | 'emoji' | 'image' | 'file',
      content: payload.content,
      replyToId: payload.replyTo
    })

    // 发送 ACK
    this.sendPacket('TEXT_ACK', { ackMsgId: packet.msgId })

    // 通知渲染进程
    this.mainWindow.webContents.send('msg:receive', {
      messageId: packet.msgId,
      senderId: packet.from.userId,
      senderName: packet.from.nickname,
      contentType: payload.contentType,
      content: payload.content,
      sentAt: packet.timestamp
    })
  }

  private handleTextAck(packet: UdpPacket): void {
    const payload = packet.payload as { ackMsgId: string }
    this.mainWindow.webContents.send('msg:ack', { messageId: payload.ackMsgId })
  }

  private handleWithdraw(packet: UdpPacket): void {
    const payload = packet.payload as { targetMsgId: string }
    this.databaseService.recallMessage(payload.targetMsgId)
    this.mainWindow.webContents.send('msg:withdrawn', { messageId: payload.targetMsgId })
  }

  private handleStatusChange(packet: UdpPacket): void {
    const user = this.onlineUsers.get(packet.from.userId)
    if (user) {
      user.status = packet.from.status
      this.mainWindow.webContents.send('user:update', user)
    }
  }

  private handleTyping(packet: UdpPacket): void {
    const payload = packet.payload as { to: string; isTyping: boolean }
    if (payload.to === this.selfUserId) {
      this.mainWindow.webContents.send('typing:receive', {
        from: packet.from.userId,
        fromName: packet.from.nickname,
        isTyping: payload.isTyping
      })
    }
  }

  private broadcastOnline(): void {
    this.sendPacket('ONLINE', {})
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendPacket('HEARTBEAT', {})
    }, HEARTBEAT_INTERVAL)
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      this.onlineUsers.forEach((user, userId) => {
        if (now - user.lastHeartbeat > HEARTBEAT_TIMEOUT) {
          this.handleUserOffline(userId)
        }
      })
    }, 10000)
  }

  private sendPacket(type: PacketType, payload: Record<string, unknown>): void {
    if (!this.udpSocket) return

    const packet: UdpPacket = {
      magic: MAGIC,
      version: VERSION,
      type,
      msgId: uuidv4(),
      timestamp: Date.now(),
      from: {
        userId: this.selfUserId,
        nickname: this.selfNickname,
        ip: this.getLocalIP(),
        port: TCP_PORT,
        status: this.selfStatus,
        version: '1.0.0'
      },
      payload
    }

    const buffer = this.encodePacket(packet)

    // 发送到广播地址
    this.udpSocket.send(buffer, UDP_PORT, this.broadcastAddress, (err) => {
      if (err) {
        log.error('发送广播失败:', err)
      }
    })
  }

  private encodePacket(packet: UdpPacket): Buffer {
    return Buffer.from(JSON.stringify(packet), 'utf-8')
  }

  private decodePacket(buffer: Buffer): UdpPacket | null {
    try {
      return JSON.parse(buffer.toString('utf-8'))
    } catch {
      return null
    }
  }

  private getLocalIP(): string {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name]
      if (!iface) continue
      for (const info of iface) {
        if (info.family === 'IPv4' && !info.internal) {
          return info.address
        }
      }
    }
    return '127.0.0.1'
  }

  // 公开方法
  getOnlineUsers(): OnlineUser[] {
    return Array.from(this.onlineUsers.values())
  }

  async sendMessage(data: {
    to: string
    content: string
    contentType: string
    replyTo?: string
  }): Promise<boolean> {
    const targetUser = this.onlineUsers.get(data.to)
    if (!targetUser) {
      log.warn('用户不在线:', data.to)
      return false
    }

    const payload = {
      to: data.to,
      content: data.content,
      contentType: data.contentType,
      replyTo: data.replyTo
    }

    this.sendPacket('TEXT', payload)
    return true
  }

  async withdrawMessage(messageId: string, conversationId: string): Promise<boolean> {
    const payload = { targetMsgId: messageId, to: conversationId }
    this.sendPacket('WITHDRAW', payload)
    return true
  }

  updateStatus(status: UserStatus): void {
    this.selfStatus = status
    this.databaseService.updateUserInfo({ status })
    this.sendPacket('STATUS_CHANGE', {})
  }

  sendTyping(to: string, isTyping: boolean): void {
    const payload = { to, isTyping }
    this.sendPacket('TYPING', payload)
  }

  sendOffline(): void {
    this.sendPacket('OFFLINE', {})
  }

  destroy(): void {
    this.sendOffline()

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    if (this.udpSocket) {
      this.udpSocket.close()
    }
  }
}

// 生成 UUID 的简单实现
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
