import dgram from 'dgram'
import os from 'os'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { DatabaseService } from '../database/DatabaseService'
import { app } from 'electron'

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
  private broadcastAddress: string = ''
  private localIP: string = ''

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
        // broadcastOnline 会在 listening 事件后调用
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
      log.info('UDP socket 开始监听')
      
      // 设置广播
      this.udpSocket!.setBroadcast(true)
      
      // 计算本机 IP 和广播地址
      this.localIP = this.getLocalIP()
      this.broadcastAddress = this.getBroadcastAddress()
      
      log.info(`本机 IP: ${this.localIP}, 广播地址: ${this.broadcastAddress}`)
      
      // 初始化完成后发送上线广播
      setTimeout(() => {
        this.broadcastOnline()
      }, 500)
    })

    this.udpSocket.bind(UDP_PORT)
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const packet = this.decodePacket(msg)

      // 过滤无效包
      if (!packet || packet.magic !== MAGIC || packet.version !== VERSION) {
        log.debug(`收到无效包: magic=${packet?.magic}, version=${packet?.version}`)
        return
      }

      // 过滤自己的消息
      if (packet.from.userId === this.selfUserId) {
        log.debug('过滤自己的消息')
        return
      }

      log.debug(`收到消息: type=${packet.type}, from=${packet.from.nickname} (${packet.from.ip})`)

      // 处理不同类型的消息
      switch (packet.type) {
        case 'ONLINE':
        case 'HEARTBEAT':
          this.handleUserOnline(packet)
          // ONLINE 需要回复 ACK，但 HEARTBEAT 不需要
          if (packet.type === 'ONLINE') {
            this.sendPacket('ONLINE_ACK', {})
          }
          break
        case 'ONLINE_ACK':
          this.handleUserOnline(packet)
          // ONLINE_ACK 不需要再回复，避免无限循环
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

    log.info(`处理用户上线: ${user.nickname} (${user.ip}), isNew=${isNew}, onlineUsersCount=${this.onlineUsers.size}`)

    // 保存到数据库
    this.databaseService.saveUser(user)

    // 通知渲染进程（检查窗口是否可用）
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (isNew) {
        log.info(`发送 user:online 事件到渲染进程: ${user.nickname}`)
        this.mainWindow.webContents.send('user:online', user)
      } else {
        log.debug(`发送 user:update 事件到渲染进程: ${user.nickname}`)
        this.mainWindow.webContents.send('user:update', user)
      }
    } else {
      log.warn(`窗口不可用，无法发送用户上线事件: ${user.nickname}`)
    }
    // 注意：ACK 回复在 switch 语句中处理，避免无限循环
  }

  private handleUserOffline(userId: string): void {
    if (this.onlineUsers.has(userId)) {
      this.onlineUsers.delete(userId)
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('user:offline', { userId })
      }
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

    // 查找或创建会话
    let conversation = this.databaseService.getConversationByTarget(packet.from.userId, 'single')
    let isNewConversation = false
    if (!conversation) {
      // 会话不存在，创建新会话
      conversation = this.databaseService.createConversation({
        type: 'single',
        targetId: packet.from.userId,
        targetInfo: {
          nickname: packet.from.nickname,
          avatar: packet.from.avatar,
          status: packet.from.status
        }
      })
      isNewConversation = !!conversation
    } else {
      // 会话已存在，更新会话的目标信息（使用最新收到的信息）
      conversation = {
        ...conversation,
        targetName: packet.from.nickname,
        targetAvatar: packet.from.avatar,
        targetStatus: packet.from.status
      }
    }

    if (!conversation) {
      log.error('无法创建会话保存消息')
      return
    }

    // 保存消息到数据库
    this.databaseService.saveMessage({
      messageId: packet.msgId,
      conversationId: conversation.conversationId,
      senderId: packet.from.userId,
      contentType: payload.contentType as 'text' | 'emoji' | 'image' | 'file',
      content: payload.content,
      replyToId: payload.replyTo
    })

    // 发送 ACK
    this.sendPacket('TEXT_ACK', { ackMsgId: packet.msgId })

    // 通知渲染进程
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('msg:receive', {
        messageId: packet.msgId,
        conversationId: conversation.conversationId,
        senderId: packet.from.userId,
        senderName: packet.from.nickname,
        contentType: payload.contentType,
        content: payload.content,
        sentAt: packet.timestamp,
        isNewConversation
      })

      // 如果是新创建的会话，通知渲染进程更新会话列表
      if (isNewConversation && conversation) {
        this.mainWindow.webContents.send('conversation:new', conversation)
      }
    }
  }

  private handleTextAck(packet: UdpPacket): void {
    const payload = packet.payload as { ackMsgId: string }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('msg:ack', { messageId: payload.ackMsgId })
    }
  }

  private handleWithdraw(packet: UdpPacket): void {
    const payload = packet.payload as { targetMsgId: string }
    this.databaseService.recallMessage(payload.targetMsgId)
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('msg:withdrawn', { messageId: payload.targetMsgId })
    }
  }

  private handleStatusChange(packet: UdpPacket): void {
    const user = this.onlineUsers.get(packet.from.userId)
    if (user) {
      user.status = packet.from.status
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('user:update', user)
      }
    }
  }

  private handleTyping(packet: UdpPacket): void {
    const payload = packet.payload as { to: string; isTyping: boolean }
    if (payload.to === this.selfUserId) {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('typing:receive', {
          from: packet.from.userId,
          fromName: packet.from.nickname,
          isTyping: payload.isTyping
        })
      }
    }
  }

  private broadcastOnline(): void {
    log.info(`发送上线广播: localIP=${this.localIP}, broadcastAddress=${this.broadcastAddress}`)
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
    if (!this.udpSocket || !this.broadcastAddress) {
      log.warn(`UDP socket 未就绪或广播地址未设置: socket=${!!this.udpSocket}, broadcastAddress=${this.broadcastAddress}`)
      return
    }
    log.debug(`发送包: type=${type}, broadcastAddress=${this.broadcastAddress}`)

    const packet: UdpPacket = {
      magic: MAGIC,
      version: VERSION,
      type,
      msgId: uuidv4(),
      timestamp: Date.now(),
      from: {
        userId: this.selfUserId,
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: TCP_PORT,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload
    }

    this.sendPacketDirect(packet)
  }

  private sendPacketDirect(packet: UdpPacket): void {
    if (!this.udpSocket || !this.broadcastAddress) {
      log.warn('UDP socket 未就绪或广播地址未设置')
      return
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
    const candidates: Array<{ address: string; name: string; cidr?: string | null; priority: number }> = []

    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name]
      if (!iface) continue

      for (const info of iface) {
        // 跳过内部地址和链路本地地址
        if (info.family !== 'IPv4' || info.internal || info.address.startsWith('169.254')) {
          continue
        }

        // 跳过虚拟网卡（Hyper-V, VMware, VirtualBox, Docker, ZeroTier 等）
        if (/^(vEthernet|VMware|VirtualBox|Docker|ZeroTier|WSL|Tailscale|NordVPN|TAP-Windows)/i.test(name)) {
          log.debug(`跳过虚拟网卡: ${name} - ${info.address}`)
          continue
        }

        // 跳过回环和特定虚拟网段
        if (info.address.startsWith('127.') ||
            info.address.startsWith('172.23.') ||  // Hyper-V Default Switch
            info.address.startsWith('172.24.') ||
            info.address.startsWith('172.25.') ||
            info.address.startsWith('172.26.') ||
            info.address.startsWith('172.27.') ||
            info.address.startsWith('172.28.') ||
            info.address.startsWith('172.29.') ||
            info.address.startsWith('172.30.') ||
            info.address.startsWith('172.31.')) {
          log.debug(`跳过虚拟网段: ${name} - ${info.address}`)
          continue
        }

        // 跳过 VirtualBox 虚拟网段 192.168.56.x
        if (info.address.startsWith('192.168.56.')) {
          log.debug(`跳过 VirtualBox 网段: ${name} - ${info.address}`)
          continue
        }

        // 计算优先级（数值越小优先级越高）
        let priority = 999

        // WLAN (WiFi) 优先级最高
        if (/WLAN|Wi-Fi|Wireless/i.test(name)) {
          priority = 1
        }
        // 以太网（物理网卡）次之
        else if (/以太网|Ethernet/i.test(name) && !/VirtualBox|VMware/i.test(name)) {
          priority = 2
        }
        // 其他网卡
        else {
          priority = 3
        }

        candidates.push({ address: info.address, name, cidr: info.cidr, priority })
      }
    }

    // 按优先级排序
    candidates.sort((a, b) => a.priority - b.priority)

    // 优先选择 192.168.x.x 或 10.x.x.x 网段（家庭/办公网络常用）
    for (const c of candidates) {
      if (c.address.startsWith('192.168.') || c.address.startsWith('10.')) {
        log.info(`选择物理网卡 IP: ${c.address} (${c.name}, 优先级=${c.priority})`)
        return c.address
      }
    }

    // 如果没有找到优先网段，返回第一个候选
    if (candidates.length > 0) {
      log.info(`选择网卡 IP: ${candidates[0].address} (${candidates[0].name})`)
      return candidates[0].address
    }

    log.warn('未找到合适的网卡，使用 127.0.0.1')
    return '127.0.0.1'
  }
  
  // 计算给定 IP 的子网广播地址（根据 netmask 动态计算）
  private getBroadcastAddress(): string {
    const ip = this.localIP || this.getLocalIP()
    if (ip === '127.0.0.1') {
      return '127.0.0.1' // 本地回环不用广播
    }
    
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name]
      if (!iface) continue
      for (const info of iface) {
        // 找到匹配的本机 IP 接口
        if (info.family === 'IPv4' && !info.internal && info.address === ip && info.netmask) {
          // 根据 netmask 计算广播地址
          // 例如：IP=192.168.31.35, netmask=255.255.255.0
          // 广播地址 = IP | (~netmask)
          const ipParts = ip.split('.').map(Number)
          const maskParts = info.netmask.split('.').map(Number)
          const broadcastParts = ipParts.map((ipPart, i) => ipPart | (~maskParts[i] & 255))
          return broadcastParts.join('.')
        }
      }
    }
    
    // 回退到受限广播地址（适用于所有网络）
    return '255.255.255.255'
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
  }): Promise<{ success: boolean; messageId?: string }> {
    const targetUser = this.onlineUsers.get(data.to)
    if (!targetUser) {
      log.warn('用户不在线:', data.to)
      return { success: false }
    }

    // 查找或创建会话
    let conversation = this.databaseService.getConversationByTarget(data.to, 'single')
    if (!conversation) {
      conversation = this.databaseService.createConversation({
        type: 'single',
        targetId: data.to,
        targetInfo: {
          nickname: targetUser.nickname,
          avatar: targetUser.avatar,
          status: targetUser.status
        }
      })
    }

    if (!conversation) {
      log.error('无法创建会话保存发送的消息')
      return { success: false }
    }

    // 生成消息 ID
    const messageId = uuidv4()
    const now = Date.now()

    // 保存消息到数据库
    try {
      this.databaseService.saveMessage({
        messageId,
        conversationId: conversation.conversationId,
        senderId: this.selfUserId,
        contentType: data.contentType as 'text' | 'emoji' | 'image' | 'file',
        content: data.content,
        replyToId: data.replyTo
      })
    } catch (error) {
      log.error('保存发送消息失败:', error)
    }

    const payload = {
      to: data.to,
      content: data.content,
      contentType: data.contentType,
      replyTo: data.replyTo
    }

    // 使用自定义 msgId
    const packet: UdpPacket = {
      magic: MAGIC,
      version: VERSION,
      type: 'TEXT',
      msgId: messageId,
      timestamp: now,
      from: {
        userId: this.selfUserId,
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: TCP_PORT,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload
    }

    this.sendPacketDirect(packet)
    return { success: true, messageId }
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
