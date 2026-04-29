import dgram from 'dgram'
import os from 'os'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { DatabaseService, FileRecord } from '../database/DatabaseService'
import { TcpTransferService, FileTransfer, generateTransferId } from './TcpTransferService'
import { app } from 'electron'
import { getPrimaryMacAddress, generateMachineId } from '../utils'

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
  | 'GROUP_CREATE'
  | 'GROUP_INVITE'
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
    macAddress: string  // MAC 地址作为设备唯一标识
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
  macAddress: string  // MAC 地址作为设备唯一标识
  nickname: string
  ip: string
  port: number
  avatar?: string
  status: UserStatus
  lastHeartbeat: number
  version: string
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

// 常量配置
const UDP_PORT = 2425
const TCP_PORT = 2426
const HEARTBEAT_INTERVAL = 30000 // 30秒
const HEARTBEAT_TIMEOUT = 90000 // 90秒
const MAGIC = 'CCHT'
const VERSION = 1

// 网络服务回调接口
export interface NetworkServiceCallbacks {
  onNewMessage?: () => void
}

export class NetworkService {
  private udpSocket: dgram.Socket | null = null
  private mainWindow: BrowserWindow
  private databaseService: DatabaseService
  private tcpTransferService: TcpTransferService | null = null
  private onlineUsers: Map<string, OnlineUser> = new Map()
  private heartbeatTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private selfUserId: string
  private selfNickname: string
  private selfStatus: UserStatus = 'online'
  private selfAvatar: string = ''
  private broadcastAddress: string = ''
  private localIP: string = ''
  private tcpPort: number = TCP_PORT
  private callbacks: NetworkServiceCallbacks
  private isManualInterface: boolean = false // 标记是否手动设置了网卡
  private customBroadcastAddresses: string[] = [] // 用户自定义广播地址列表

  private selfMacAddress: string = ''  // 本机 MAC 地址

  constructor(mainWindow: BrowserWindow, databaseService: DatabaseService, callbacks?: NetworkServiceCallbacks) {
    this.mainWindow = mainWindow
    this.databaseService = databaseService
    this.callbacks = callbacks || {}

    // 获取主网卡 MAC 地址（用于日志和兼容性）
    const macAddress = getPrimaryMacAddress()
    this.selfMacAddress = macAddress || '00:00:00:00:00:00'

    // 获取本机用户信息
    let userInfo = this.databaseService.getUserInfo()

    // 如果用户信息不存在，创建并保存到数据库
    // 使用机器指纹生成 userId，基于所有物理网卡的组合哈希
    // 这样即使默认网卡变化，同一台机器也能生成相同的 userId
    if (!userInfo) {
      const userId = generateMachineId()
      const nickname = os.hostname()
      this.databaseService.setSetting('user.userId', userId)
      this.databaseService.setSetting('user.nickname', nickname)
      this.databaseService.setSetting('user.status', 'online')
      if (macAddress) {
        this.databaseService.setSetting('user.macAddress', macAddress)
      }
      userInfo = { userId, nickname, status: 'online' }
      log.info('创建新用户信息:', { userId, nickname, macAddress })
    } else {
      // 检查是否需要更新 userId（从旧版本升级或网卡变化的情况）
      const expectedUserId = generateMachineId()
      if (userInfo.userId !== expectedUserId) {
        log.info('检测到 userId 与机器指纹不匹配，更新 userId:', {
          old: userInfo.userId,
          new: expectedUserId
        })
        this.databaseService.setSetting('user.userId', expectedUserId)
        userInfo.userId = expectedUserId
      }
      log.info('使用现有用户信息:', { userId: userInfo.userId, nickname: userInfo.nickname, macAddress })
    }

    this.selfUserId = userInfo.userId
    this.selfNickname = userInfo.nickname
    this.selfStatus = userInfo.status ?? 'online'
    this.selfAvatar = userInfo.avatar ?? ''
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 从设置中加载网络接口配置
        this.loadInterfaceFromSettings()

        // 从设置中加载自定义广播地址
        this.loadCustomBroadcastAddresses()

        this.createUdpSocket()
        this.initTcpTransfer()
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

  private async initTcpTransfer(): Promise<void> {
    this.tcpTransferService = new TcpTransferService(this.mainWindow, this.databaseService)

    // 设置回调
    this.tcpTransferService.setCallbacks(
      // (transfer) => {
      () => {
        // 进度回调
        
        // log.debug(`文件传输进度: ${transfer.fileName} - ${transfer.progress}%`)
      },
      (transfer, success, error) => {
        // 完成回调
        if (success) {
          log.info(`文件传输完成: ${transfer.fileName}`)
          // 更新数据库
          this.databaseService.updateFileStatus(transfer.transferId, 'completed', transfer.fileSize)

          // 如果是接收的文件，更新文件路径
          if (transfer.direction === 'receive' && transfer.filePath) {
            this.databaseService.updateFilePath(transfer.transferId, transfer.filePath)
          }

          // 发送消息通知 - 使用完整的 transfer 对象确保 status 字段存在
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('file:complete', transfer)
          }
        } else {
          log.error(`文件传输失败: ${transfer.fileName} - ${error}`)
          this.databaseService.updateFileStatus(transfer.transferId, 'failed')
          // 发送失败通知
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('file:complete', transfer)
          }
        }
      }
    )

    // 启动 TCP 服务器
    try {
      this.tcpPort = await this.tcpTransferService.startServer()
      log.info(`TCP 文件传输服务启动，端口: ${this.tcpPort}`)
    } catch (error) {
      log.error('TCP 服务启动失败:', error)
    }
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

      // 如果没有手动设置网卡，才自动检测
      if (!this.isManualInterface) {
        // 计算本机 IP 和广播地址
        this.localIP = this.getLocalIP()
        this.broadcastAddress = this.getBroadcastAddress()
      } else {
        // 手动设置了网卡，重新计算对应网卡的广播地址
        this.broadcastAddress = this.calculateBroadcastAddress(this.localIP)
        log.info(`使用手动设置的网卡: ${this.localIP}`)
      }

      log.info(`本机 IP: ${this.localIP}, 广播地址: ${this.broadcastAddress}`)

      // 初始化完成后发送上线广播
      setTimeout(() => {
        this.broadcastOnline()
      }, 500)
    })

    this.udpSocket.bind(UDP_PORT)
  }

  private handleMessage(msg: Buffer, _rinfo: dgram.RemoteInfo): void {
    try {
      const packet = this.decodePacket(msg)

      // 过滤无效包
      if (!packet || packet.magic !== MAGIC || packet.version !== VERSION) {
        // log.debug(`收到无效包: magic=${packet?.magic}, version=${packet?.version}`)
        return
      }

      // 过滤自己的消息
      if (packet.from.userId === this.selfUserId) {
        // log.debug('过滤自己的消息')
        return
      }

      // log.debug(`收到消息: type=${packet.type}, from=${packet.from.nickname} (${packet.from.ip})`)

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
          this.handleUserOffline(packet.from.macAddress || packet.from.userId)
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
        case 'FILE_NOTIFY':
          this.handleFileNotify(packet)
          break
        case 'FILE_ACCEPT':
          this.handleFileAccept(packet)
          break
        case 'GROUP_CREATE':
          this.handleGroupCreate(packet)
          break
        case 'GROUP_INVITE':
          this.handleGroupInvite(packet)
          break
        case 'GROUP_MESSAGE':
          this.handleGroupMessage(packet)
          break
        case 'GROUP_LEAVE':
          this.handleGroupLeave(packet)
          break
      }
    } catch (error) {
      log.error('处理消息失败:', error)
    }
  }

  private handleUserOnline(packet: UdpPacket): void {
    // 使用 MAC 地址作为主键识别用户
    const macAddress = packet.from.macAddress || packet.from.userId
    
    const user: OnlineUser = {
      userId: packet.from.userId,
      macAddress: macAddress,
      nickname: packet.from.nickname,
      ip: packet.from.ip,
      port: packet.from.port,
      avatar: packet.from.avatar,
      status: packet.from.status,
      lastHeartbeat: Date.now(),
      version: packet.from.version
    }

    // 检查是否已存在相同 MAC 地址的用户
    const existingUser = this.findUserByMacAddress(macAddress)
    const isNew = !existingUser

    if (existingUser) {
      // 更新现有用户信息（保留 userId 不变，但更新其他信息）
      existingUser.userId = packet.from.userId  // 可能从旧版本升级
      existingUser.nickname = packet.from.nickname
      existingUser.ip = packet.from.ip
      existingUser.port = packet.from.port
      existingUser.avatar = packet.from.avatar
      existingUser.status = packet.from.status
      existingUser.lastHeartbeat = Date.now()
      existingUser.version = packet.from.version
      // log.info(`更新用户(通过MAC): ${user.nickname} (${user.ip}), mac=${macAddress}, avatar=${user.avatar}`)
    } else {
      // 新用户
      this.onlineUsers.set(macAddress, user)
      log.info(`新用户上线: ${user.nickname} (${user.ip}), mac=${macAddress}, avatar=${user.avatar}, onlineUsersCount=${this.onlineUsers.size}`)
    }

    // 保存到数据库
    this.databaseService.saveUser(user)

    // 通知渲染进程（检查窗口是否可用）
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (isNew) {
        this.mainWindow.webContents.send('user:online', user)
      } else {
        this.mainWindow.webContents.send('user:update', existingUser || user)
      }
    } else {
      log.warn(`窗口不可用，无法发送用户上线事件: ${user.nickname}`)
    }
    // 注意：ACK 回复在 switch 语句中处理，避免无限循环
  }

  /**
   * 通过 MAC 地址查找用户
   */
  private findUserByMacAddress(macAddress: string): OnlineUser | undefined {
    // 首先尝试直接通过 MAC 地址查找
    if (this.onlineUsers.has(macAddress)) {
      return this.onlineUsers.get(macAddress)
    }

    // 兼容旧版本：遍历查找（如果用户使用了旧版本发送的消息没有 MAC 地址）
    for (const user of this.onlineUsers.values()) {
      if (user.macAddress === macAddress) {
        return user
      }
    }

    return undefined
  }

  /**
   * 通过 userId 查找用户
   */
  private findUserByUserId(userId: string): OnlineUser | undefined {
    for (const user of this.onlineUsers.values()) {
      if (user.userId === userId) {
        return user
      }
    }
    return undefined
  }

  private handleUserOffline(macAddress: string): void {
    // 使用 MAC 地址查找用户
    const user = this.findUserByMacAddress(macAddress)
    if (user) {
      this.onlineUsers.delete(user.macAddress)
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('user:offline', { macAddress: user.macAddress, userId: user.userId })
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

    // 保存消息到数据库（重复则忽略）
    try {
      this.databaseService.saveMessage({
        messageId: packet.msgId,
        conversationId: conversation.conversationId,
        senderId: packet.from.userId,
        contentType: payload.contentType as 'text' | 'emoji' | 'image' | 'file',
        content: payload.content,
        replyToId: payload.replyTo
      })
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        log.info(`忽略重复消息: ${packet.msgId}`)
        return
      }
      throw error
    }

    // 发送 ACK
    this.sendPacket('TEXT_ACK', { ackMsgId: packet.msgId })

    // 触发新消息提醒回调
    if (this.callbacks.onNewMessage) {
      this.callbacks.onNewMessage()
    }

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
    log.info(`收到状态变更: from=${packet.from.nickname}, avatar=${packet.from.avatar}, status=${packet.from.status}`)
    
    // 使用 MAC 地址识别用户
    const macAddress = packet.from.macAddress || packet.from.userId
    let user = this.findUserByMacAddress(macAddress)
    const isNew = !user

    if (user) {
      // 更新现有用户信息
      user.userId = packet.from.userId
      user.nickname = packet.from.nickname
      user.avatar = packet.from.avatar
      user.status = packet.from.status
      user.lastHeartbeat = Date.now()
      log.info(`更新现有用户头像: ${user.nickname}, mac=${macAddress}, avatar=${user.avatar}`)
    } else {
      // 用户不在列表中，创建新用户记录
      user = {
        userId: packet.from.userId,
        macAddress: macAddress,
        nickname: packet.from.nickname,
        ip: packet.from.ip,
        port: packet.from.port,
        avatar: packet.from.avatar,
        status: packet.from.status,
        lastHeartbeat: Date.now(),
        version: packet.from.version
      }
      this.onlineUsers.set(macAddress, user)
      log.info(`创建新用户: ${user.nickname}, mac=${macAddress}, avatar=${user.avatar}`)
    }

    // 保存到数据库
    this.databaseService.saveUser(user)

    // 通知渲染进程
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (isNew) {
        this.mainWindow.webContents.send('user:online', user)
      } else {
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

  private handleFileNotify(packet: UdpPacket): void {
    const payload = packet.payload as {
      to: string
      transferId: string
      fileName: string
      fileSize: number
      fileMd5: string
      fileType: string
      isImage: boolean
      thumbnailData?: string
      tcpPort?: number
    }

    // 只处理发给自己的消息
    if (payload.to !== this.selfUserId) {
      return
    }

    log.info(`收到文件传输请求: ${payload.fileName} (${this.formatFileSize(payload.fileSize)}) from ${packet.from.nickname}, isImage=${payload.isImage}`)

    // 自动接受文件，无需确认
    this.autoAcceptFile(packet, payload)
  }

  // 自动接受文件
  private async autoAcceptFile(packet: UdpPacket, payload: {
    to: string
    transferId: string
    fileName: string
    fileSize: number
    fileMd5: string
    fileType: string
    isImage: boolean
    thumbnailData?: string
    tcpPort?: number
  }): Promise<void> {
    const request = {
      from: {
        userId: packet.from.userId,
        nickname: packet.from.nickname,
        ip: packet.from.ip,
        port: packet.from.port,
        avatar: packet.from.avatar,
        status: packet.from.status,
        lastHeartbeat: Date.now(),
        version: packet.from.version
      },
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      fileMd5: payload.fileMd5,
      mimeType: payload.fileType,
      isImage: payload.isImage,
      thumbnailData: payload.thumbnailData,
      timestamp: Date.now()
    }

    const { from, fileName, fileSize, fileMd5, mimeType, isImage, thumbnailData } = request

    // 保存文件记录到数据库
    const downloadPath = this.databaseService.getDownloadPath()
    const filePath = path.join(downloadPath, `${Date.now()}_${fileName}`)
    log.info(`图片自动接收，文件保存路径: ${filePath}`)

    const fileRecord: FileRecord = {
      fileId: payload.transferId,
      fileName,
      filePath,
      fileSize,
      mimeType,
      fileMd5,
      direction: 'receive',
      peerId: from.userId,
      status: 'pending',
      transferredBytes: 0,
      isImage,
      thumbnailData,
      createdAt: Date.now()
    }
    this.databaseService.saveFile(fileRecord)

    // 创建传输记录
    const transfer: FileTransfer = {
      transferId: payload.transferId,
      fileName,
      filePath,
      fileSize,
      fileMd5,
      mimeType,
      direction: 'receive',
      peerId: from.userId,
      peerIp: from.ip,
      status: 'pending',
      transferredBytes: 0,
      isImage,
      thumbnailData,
      progress: 0,
      speed: 0,
      startTime: Date.now()
    }
    this.tcpTransferService?.addTransfer(transfer)
    log.info(`图片传输记录已添加: ${payload.transferId}`)

    // 查找或创建会话
    let conversation = this.databaseService.getConversationByTarget(from.userId, 'single')
    let isNewConversation = false
    if (!conversation) {
      conversation = this.databaseService.createConversation({
        type: 'single',
        targetId: from.userId,
        targetInfo: {
          nickname: from.nickname,
          avatar: from.avatar,
          status: from.status
        }
      })
      isNewConversation = !!conversation
    }

    if (conversation) {
      // 使用 transferId 作为消息ID，避免重复消息
      // 同一个文件传输的 transferId 是唯一的，这样可以防止重复处理 FILE_NOTIFY
      const messageId = payload.transferId
      const now = Date.now()

      // 检查是否已存在相同 fileId 的消息，避免重复创建
      const existingMessage = this.databaseService.getMessageByFileId(payload.transferId)
      if (existingMessage) {
        log.info(`消息已存在，跳过重复处理: transferId=${payload.transferId}`)
        return
      }

      // 保存消息到数据库
      this.databaseService.saveMessage({
        messageId,
        conversationId: conversation.conversationId,
        senderId: from.userId,
        contentType: isImage ? 'image' : 'file',
        content: fileName,
        fileId: payload.transferId
      })

      // 更新会话的最后消息
      this.databaseService.updateConversationLastMessage(conversation.conversationId, messageId, now)

      // 发送通知到渲染进程（不显示确认框，只显示消息）
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('msg:receive', {
          messageId,
          conversationId: conversation.conversationId,
          senderId: from.userId,
          senderName: from.nickname,
          contentType: isImage ? 'image' : 'file',
          content: fileName,
          fileId: payload.transferId,
          sentAt: now,
          isNewConversation
        })
      }

      // 触发新消息提醒
      if (this.callbacks.onNewMessage) {
        this.callbacks.onNewMessage()
      }
    }

    // 发送 FILE_ACCEPT，包含本机 TCP 端口供发送方连接
    const packetResponse: UdpPacket = {
      magic: MAGIC,
      version: VERSION,
      type: 'FILE_ACCEPT',
      msgId: uuidv4(),
      timestamp: Date.now(),
      from: {
        userId: this.selfUserId,
        macAddress: this.selfMacAddress,
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: this.tcpPort,
        avatar: this.selfAvatar,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload: {
        transferId: payload.transferId,
        tcpPort: this.tcpPort
      }
    }

    // 单播发送到对方
    this.sendPacketTo(packetResponse, from.ip)

    log.info(`文件自动接受已发送确认: ${payload.transferId}`)
  }

  private handleFileAccept(packet: UdpPacket): void {
    const payload = packet.payload as {
      transferId: string
      offset?: number
      tcpPort?: number
    }

    log.info(`对方接受了文件传输: ${payload.transferId}, tcpPort: ${payload.tcpPort}`)

    // 开始发送文件
    this.startFileSend(payload.transferId, payload.offset || 0, payload.tcpPort)
  }

  // ========== 群聊处理 ==========

  private handleGroupCreate(packet: UdpPacket): void {
    const payload = packet.payload as {
      groupId: string
      groupName: string
      memberIds: string[]
      creatorId: string
    }

    // 检查自己是否被邀请
    if (!payload.memberIds.includes(this.selfUserId)) {
      return
    }

    log.info(`收到群创建通知: ${payload.groupName}, members=${payload.memberIds.length}`)

    // 保存创建者信息
    this.databaseService.saveUser({
      userId: packet.from.userId,
      macAddress: packet.from.macAddress || packet.from.userId,
      nickname: packet.from.nickname,
      ip: packet.from.ip,
      port: packet.from.port,
      avatar: packet.from.avatar,
      status: packet.from.status,
      lastHeartbeat: Date.now(),
      version: packet.from.version
    })

    // 查找或创建会话
    let conversation = this.databaseService.getConversationByTarget(payload.groupId, 'group')
    let isNewConversation = false
    if (!conversation) {
      conversation = this.databaseService.createConversation({
        type: 'group',
        targetId: payload.groupId,
        groupName: payload.groupName,
        memberIds: payload.memberIds,
        creatorId: payload.creatorId
      })
      isNewConversation = !!conversation
    } else {
      // 更新成员列表
      this.databaseService.updateGroupMembers(conversation.conversationId, payload.memberIds)
    }

    if (conversation && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('msg:receive', {
        messageId: packet.msgId,
        conversationId: conversation.conversationId,
        senderId: packet.from.userId,
        senderName: packet.from.nickname,
        contentType: 'system',
        content: `${packet.from.nickname} 创建了群聊`,
        sentAt: packet.timestamp,
        isNewConversation
      })

      if (isNewConversation) {
        this.mainWindow.webContents.send('conversation:new', conversation)
      }
    }
  }

  private handleGroupInvite(packet: UdpPacket): void {
    const payload = packet.payload as {
      groupId: string
      groupName: string
      memberIds: string[]
      inviterId: string
    }

    // 检查自己是否被邀请
    if (!payload.memberIds.includes(this.selfUserId)) {
      return
    }

    log.info(`收到群邀请: ${payload.groupName}, members=${payload.memberIds.length}`)

    // 查找或创建会话
    let conversation = this.databaseService.getConversationByTarget(payload.groupId, 'group')
    let isNewConversation = false
    if (!conversation) {
      conversation = this.databaseService.createConversation({
        type: 'group',
        targetId: payload.groupId,
        groupName: payload.groupName,
        memberIds: payload.memberIds
      })
      isNewConversation = !!conversation
    } else {
      // 更新成员列表
      this.databaseService.updateGroupMembers(conversation.conversationId, payload.memberIds)
    }

    if (conversation && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('msg:receive', {
        messageId: packet.msgId,
        conversationId: conversation.conversationId,
        senderId: packet.from.userId,
        senderName: packet.from.nickname,
        contentType: 'system',
        content: `${packet.from.nickname} 邀请你加入群聊`,
        sentAt: packet.timestamp,
        isNewConversation
      })

      if (isNewConversation) {
        this.mainWindow.webContents.send('conversation:new', conversation)
      }
    }
  }

  private handleGroupMessage(packet: UdpPacket): void {
    const payload = packet.payload as {
      groupId: string
      content: string
      contentType: string
      replyTo?: string
    }

    // 查找本地群聊会话
    let conversation = this.databaseService.getConversationByTarget(payload.groupId, 'group')

    // 如果本地没有该群聊会话，说明自己不在群里，忽略此消息
    if (!conversation) {
      return
    }

    // 再次确认自己是群成员（防止幽灵群聊）
    const members = this.databaseService.getGroupMembers(conversation.conversationId)
    if (!members.includes(this.selfUserId)) {
      return
    }

    log.info(`收到群消息: group=${payload.groupId}, from=${packet.from.nickname}`)

    const isNewConversation = false

    // 保存消息到数据库（重复则忽略）
    try {
      this.databaseService.saveMessage({
        messageId: packet.msgId,
        conversationId: conversation.conversationId,
        senderId: packet.from.userId,
        contentType: payload.contentType as 'text' | 'emoji' | 'image' | 'file',
        content: payload.content,
        replyToId: payload.replyTo
      })
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        log.info(`忽略重复群消息: ${packet.msgId}`)
        return
      }
      throw error
    }

    // 发送 ACK
    this.sendPacketTo({
      magic: MAGIC,
      version: VERSION,
      type: 'TEXT_ACK',
      msgId: uuidv4(),
      timestamp: Date.now(),
      from: {
        userId: this.selfUserId,
        macAddress: this.selfMacAddress,
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: this.tcpPort,
        avatar: this.selfAvatar,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload: { ackMsgId: packet.msgId }
    }, packet.from.ip)

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

      if (isNewConversation && conversation) {
        this.mainWindow.webContents.send('conversation:new', conversation)
      }
    }

    if (this.callbacks.onNewMessage) {
      this.callbacks.onNewMessage()
    }
  }

  private handleGroupLeave(packet: UdpPacket): void {
    const payload = packet.payload as {
      groupId: string
      leaverId: string
    }

    const conversation = this.databaseService.getConversationByTarget(payload.groupId, 'group')
    if (!conversation) return

    // 更新成员列表（移除退出的成员）
    const members = this.databaseService.getGroupMembers(conversation.conversationId)
    const newMembers = members.filter(id => id !== payload.leaverId)
    this.databaseService.updateGroupMembers(conversation.conversationId, newMembers)

    // 保存系统消息
    this.databaseService.saveMessage({
      messageId: packet.msgId,
      conversationId: conversation.conversationId,
      senderId: payload.leaverId,
      contentType: 'system',
      content: `${packet.from.nickname} 退出了群聊`
    })

    // 通知渲染进程
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('msg:receive', {
        messageId: packet.msgId,
        conversationId: conversation.conversationId,
        senderId: payload.leaverId,
        senderName: packet.from.nickname,
        contentType: 'system',
        content: `${packet.from.nickname} 退出了群聊`,
        sentAt: packet.timestamp,
        isNewConversation: false
      })

      // 通知成员变更
      this.mainWindow.webContents.send('group:members', {
        conversationId: conversation.conversationId,
        memberIds: newMembers
      })
    }
  }

  // ========== 群聊公开方法 ==========

  async createGroup(groupName: string, memberIds: string[]): Promise<{ success: boolean; groupId?: string; error?: string }> {
    const groupId = uuidv4()
    const allMembers = Array.from(new Set([this.selfUserId, ...memberIds]))

    // 创建会话
    const conversation = this.databaseService.createConversation({
      type: 'group',
      targetId: groupId,
      groupName,
      memberIds: allMembers,
      creatorId: this.selfUserId
    })

    if (!conversation) {
      return { success: false, error: '创建会话失败' }
    }

    // 发送 GROUP_CREATE 广播给所有成员
    const packet: UdpPacket = {
      magic: MAGIC,
      version: VERSION,
      type: 'GROUP_CREATE',
      msgId: uuidv4(),
      timestamp: Date.now(),
      from: {
        userId: this.selfUserId,
        macAddress: this.selfMacAddress,
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: this.tcpPort,
        avatar: this.selfAvatar,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload: {
        groupId,
        groupName,
        memberIds: allMembers,
        creatorId: this.selfUserId
      }
    }

    this.sendPacketDirect(packet)

    // 通知渲染进程
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('conversation:new', conversation)
    }

    return { success: true, groupId }
  }

  async inviteToGroup(groupId: string, conversationId: string, userIds: string[]): Promise<{ success: boolean; error?: string }> {
    const conversation = this.databaseService.getConversationByTarget(groupId, 'group')
    if (!conversation) {
      return { success: false, error: '群聊不存在' }
    }

    // 只有创建者可以邀请
    const creatorId = this.databaseService.getGroupCreator(conversationId)
    if (creatorId !== this.selfUserId) {
      return { success: false, error: '只有群主可以邀请成员' }
    }

    // 更新成员列表
    const currentMembers = this.databaseService.getGroupMembers(conversationId)
    const newMembers = Array.from(new Set([...currentMembers, ...userIds]))
    this.databaseService.updateGroupMembers(conversationId, newMembers)

    // 发送 GROUP_INVITE 广播给新成员
    const packet: UdpPacket = {
      magic: MAGIC,
      version: VERSION,
      type: 'GROUP_INVITE',
      msgId: uuidv4(),
      timestamp: Date.now(),
      from: {
        userId: this.selfUserId,
        macAddress: this.selfMacAddress,
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: this.tcpPort,
        avatar: this.selfAvatar,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload: {
        groupId,
        groupName: conversation.targetName,
        memberIds: newMembers,
        inviterId: this.selfUserId
      }
    }

    this.sendPacketDirect(packet)

    return { success: true }
  }

  async leaveGroup(groupId: string, conversationId: string): Promise<{ success: boolean; error?: string }> {
    const conversation = this.databaseService.getConversationByTarget(groupId, 'group')
    if (!conversation) {
      return { success: false, error: '群聊不存在' }
    }

    // 从成员列表中移除自己
    const members = this.databaseService.getGroupMembers(conversationId)
    const newMembers = members.filter(id => id !== this.selfUserId)
    this.databaseService.updateGroupMembers(conversationId, newMembers)

    // 发送 GROUP_LEAVE 广播
    const packet: UdpPacket = {
      magic: MAGIC,
      version: VERSION,
      type: 'GROUP_LEAVE',
      msgId: uuidv4(),
      timestamp: Date.now(),
      from: {
        userId: this.selfUserId,
        macAddress: this.selfMacAddress,
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: this.tcpPort,
        avatar: this.selfAvatar,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload: {
        groupId,
        leaverId: this.selfUserId
      }
    }

    this.sendPacketDirect(packet)

    return { success: true }
  }

  async deleteGroup(groupId: string, conversationId: string): Promise<{ success: boolean; error?: string }> {
    const conversation = this.databaseService.getConversationByTarget(groupId, 'group')
    if (!conversation) {
      return { success: false, error: '群聊不存在' }
    }

    // 只有创建者可以删除
    const creatorId = this.databaseService.getGroupCreator(conversationId)
    if (creatorId !== this.selfUserId) {
      return { success: false, error: '只有群主可以删除群聊' }
    }

    // 从数据库中删除
    this.databaseService.deleteGroup(conversationId)

    // 发送 GROUP_LEAVE 广播（通知所有成员群已解散）
    const packet: UdpPacket = {
      magic: MAGIC,
      version: VERSION,
      type: 'GROUP_LEAVE',
      msgId: uuidv4(),
      timestamp: Date.now(),
      from: {
        userId: this.selfUserId,
        macAddress: this.selfMacAddress,
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: this.tcpPort,
        avatar: this.selfAvatar,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload: {
        groupId,
        leaverId: this.selfUserId
      }
    }

    this.sendPacketDirect(packet)

    return { success: true }
  }

  async sendGroupMessage(data: {
    groupId: string
    conversationId: string
    content: string
    contentType: string
    replyTo?: string
  }): Promise<{ success: boolean; messageId?: string }> {
    const messageId = uuidv4()
    const now = Date.now()

    // 保存消息到数据库
    try {
      this.databaseService.saveMessage({
        messageId,
        conversationId: data.conversationId,
        senderId: this.selfUserId,
        contentType: data.contentType as 'text' | 'emoji' | 'image' | 'file',
        content: data.content,
        replyToId: data.replyTo
      })
    } catch (error) {
      log.error('保存群消息失败:', error)
    }

    // 广播群消息
    const packet: UdpPacket = {
      magic: MAGIC,
      version: VERSION,
      type: 'GROUP_MESSAGE',
      msgId: messageId,
      timestamp: now,
      from: {
        userId: this.selfUserId,
        macAddress: this.selfMacAddress,
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: this.tcpPort,
        avatar: this.selfAvatar,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload: {
        groupId: data.groupId,
        content: data.content,
        contentType: data.contentType,
        replyTo: data.replyTo
      }
    }

    this.sendPacketDirect(packet)

    return { success: true, messageId }
  }

  // ========== 文件传输（群聊）==========

  async sendGroupFile(groupId: string, conversationId: string, filePath: string): Promise<{ success: boolean; transferId?: string; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }

      const stats = fs.statSync(filePath)
      const fileSize = stats.size
      const fileName = path.basename(filePath)
      const ext = path.extname(fileName).toLowerCase()

      const fileMd5 = await this.calculateFileMd5(filePath)
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
      const isImage = imageExtensions.includes(ext)
      const mimeType = this.getMimeType(ext)
      const transferId = generateTransferId()

      const fileRecord: FileRecord = {
        fileId: transferId,
        fileName,
        filePath,
        fileSize,
        mimeType,
        fileMd5,
        direction: 'send',
        peerId: groupId,
        status: 'pending',
        transferredBytes: 0,
        isImage,
        createdAt: Date.now()
      }
      this.databaseService.saveFile(fileRecord)

      const transfer: FileTransfer = {
        transferId,
        fileName,
        filePath,
        fileSize,
        fileMd5,
        mimeType,
        direction: 'send',
        peerId: groupId,
        peerIp: '255.255.255.255',
        status: 'pending',
        transferredBytes: 0,
        isImage,
        progress: 0,
        speed: 0,
        startTime: Date.now()
      }
      this.tcpTransferService?.addTransfer(transfer)

      // 生成缩略图
      let thumbnailData: string | undefined
      if (isImage) {
        thumbnailData = await this.generateThumbnail(filePath)
      }

      // 保存消息
      const messageId = uuidv4()
      const now = Date.now()
      this.databaseService.saveMessage({
        messageId,
        conversationId,
        senderId: this.selfUserId,
        contentType: isImage ? 'image' : 'file',
        content: fileName,
        fileId: transferId
      })
      this.databaseService.updateConversationLastMessage(conversationId, messageId, now)

      // 广播 FILE_NOTIFY（群聊）
      const packet: UdpPacket = {
        magic: MAGIC,
        version: VERSION,
        type: 'FILE_NOTIFY',
        msgId: uuidv4(),
        timestamp: now,
        from: {
          userId: this.selfUserId,
          macAddress: this.selfMacAddress,
          nickname: this.selfNickname,
          ip: this.localIP || this.getLocalIP(),
          port: this.tcpPort,
          avatar: this.selfAvatar,
          status: this.selfStatus,
          version: app.getVersion()
        },
        payload: {
          to: groupId,
          transferId,
          fileName,
          fileSize,
          fileMd5,
          fileType: mimeType,
          isImage,
          thumbnailData,
          tcpPort: this.tcpPort,
          isGroup: true,
          groupId
        }
      }

      this.sendPacketDirect(packet)

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('file:send-start', {
          transferId,
          fileName,
          fileSize,
          isImage,
          toUserId: groupId,
          toNickname: '群聊'
        })
      }

      return { success: true, transferId }
    } catch (error) {
      log.error('发送群文件失败:', error)
      return { success: false, error: String(error) }
    }
  }

  // 开始发送文件（收到 FILE_ACCEPT 后）
  private async startFileSend(transferId: string, offset: number = 0, targetTcpPort?: number): Promise<void> {
    log.info(`开始文件发送: transferId=${transferId}, offset=${offset}, targetTcpPort=${targetTcpPort}`)

    const transfer = this.tcpTransferService?.getTransfer(transferId)
    if (!transfer) {
      log.error(`未找到传输记录: ${transferId}`)
      const allTransfers = this.tcpTransferService?.getAllTransfers()
      log.info(`可用的传输记录: ${allTransfers?.map(t => t.transferId).join(', ')}`)
      return
    }

    log.info(`找到传输记录: ${transfer.fileName}, 方向: ${transfer.direction}, 状态: ${transfer.status}`)

    const targetUser = this.findUserByUserId(transfer.peerId)
    if (!targetUser) {
      log.error(`用户不在线: ${transfer.peerId}`)
      log.info(`在线用户: ${Array.from(this.onlineUsers.values()).map(u => `${u.nickname}(${u.userId})`).join(', ')}`)
      return
    }

    const tcpPort = targetTcpPort || targetUser.port || TCP_PORT
    log.info(`目标用户: ${targetUser.nickname} (${targetUser.ip}:${tcpPort})`)

    try {
      await this.tcpTransferService?.sendFile(
        targetUser.ip,
        tcpPort,
        transfer.filePath,
        transfer.peerId,
        transferId,
        offset
      )
      log.info(`文件发送完成: ${transfer.fileName}`)
    } catch (error) {
      log.error(`文件发送失败: ${error}`)
      this.databaseService.updateFileStatus(transferId, 'failed')
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  // 发送文件
  async sendFile(to: string, filePath: string): Promise<{ success: boolean; transferId?: string; error?: string }> {
    const targetUser = this.findUserByUserId(to)
    if (!targetUser) {
      return { success: false, error: '用户不在线' }
    }

    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }

      const stats = fs.statSync(filePath)
      const fileSize = stats.size
      const fileName = path.basename(filePath)
      const ext = path.extname(fileName).toLowerCase()

      // 计算 MD5
      const fileMd5 = await this.calculateFileMd5(filePath)

      // 判断是否为图片
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
      const isImage = imageExtensions.includes(ext)

      // 获取 MIME 类型
      const mimeType = this.getMimeType(ext)

      // 生成传输 ID
      const transferId = generateTransferId()

      // 保存文件记录到数据库
      const fileRecord: FileRecord = {
        fileId: transferId,
        fileName,
        filePath,
        fileSize,
        mimeType,
        fileMd5,
        direction: 'send',
        peerId: to,
        status: 'pending',
        transferredBytes: 0,
        isImage,
        createdAt: Date.now()
      }
      this.databaseService.saveFile(fileRecord)

      // 创建传输记录
      const transfer: FileTransfer = {
        transferId,
        fileName,
        filePath,
        fileSize,
        fileMd5,
        mimeType,
        direction: 'send',
        peerId: to,
        peerIp: targetUser.ip,
        status: 'pending',
        transferredBytes: 0,
        isImage,
        progress: 0,
        speed: 0,
        startTime: Date.now()
      }
      this.tcpTransferService?.addTransfer(transfer)

      // 查找或创建会话
      let conversation = this.databaseService.getConversationByTarget(to, 'single')
      if (!conversation) {
        conversation = this.databaseService.createConversation({
          type: 'single',
          targetId: to,
          targetInfo: {
            nickname: targetUser.nickname,
            avatar: targetUser.avatar,
            status: targetUser.status
          }
        })
      }

      if (!conversation) {
        return { success: false, error: '无法创建会话' }
      }

      // 生成消息 ID
      const messageId = uuidv4()
      const now = Date.now()

      // 保存消息到数据库
      this.databaseService.saveMessage({
        messageId,
        conversationId: conversation.conversationId,
        senderId: this.selfUserId,
        contentType: isImage ? 'image' : 'file',
        content: fileName,
        fileId: transferId
      })

      // 更新会话的最后消息
      this.databaseService.updateConversationLastMessage(conversation.conversationId, messageId, now)

      // 生成缩略图数据（如果是图片）
      let thumbnailData: string | undefined
      if (isImage) {
        thumbnailData = await this.generateThumbnail(filePath)
      }

      // 发送 FILE_NOTIFY
      const notifyPayload = {
        to,
        transferId,
        fileName,
        fileSize,
        fileMd5,
        fileType: mimeType,
        isImage,
        thumbnailData,
        tcpPort: this.tcpPort
      }

      // 使用自定义 msgId
      const packet: UdpPacket = {
        magic: MAGIC,
        version: VERSION,
        type: 'FILE_NOTIFY',
        msgId: uuidv4(),
        timestamp: now,
        from: {
          userId: this.selfUserId,
          macAddress: this.selfMacAddress,
          nickname: this.selfNickname,
          ip: this.localIP || this.getLocalIP(),
          port: this.tcpPort,
          avatar: this.selfAvatar,
          status: this.selfStatus,
          version: app.getVersion()
        },
        payload: notifyPayload
      }

      this.sendPacketDirect(packet)

      // 通知渲染进程
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('file:send-start', {
          transferId,
          fileName,
          fileSize,
          isImage,
          toUserId: to,
          toNickname: targetUser.nickname
        })
      }

      return { success: true, transferId }
    } catch (error) {
      log.error('发送文件失败:', error)
      return { success: false, error: String(error) }
    }
  }

  // 单播发送数据包
  private sendPacketTo(packet: UdpPacket, targetIp: string): void {
    if (!this.udpSocket) {
      log.warn('UDP socket 未就绪')
      return
    }

    const buffer = this.encodePacket(packet)
    const targetPort = UDP_PORT

    this.udpSocket.send(buffer, targetPort, targetIp, (err) => {
      if (err) {
        log.error(`发送数据包到 ${targetIp} 失败:`, err)
      }
    })
  }

  // 计算文件 MD5
  private async calculateFileMd5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5')
      const stream = fs.createReadStream(filePath)

      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  // 生成缩略图（Base64）
  private async generateThumbnail(filePath: string): Promise<string | undefined> {
    try {
      // 使用 sharp 库生成缩略图
      const sharp = require('sharp')
      const thumbnail = await sharp(filePath)
        .resize(240, 240, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
      return `data:image/jpeg;base64,${thumbnail.toString('base64')}`
    } catch (error) {
      log.warn('生成缩略图失败:', error)
      return undefined
    }
  }

  // 获取 MIME 类型
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska'
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  // 获取传输服务
  getTcpTransferService(): TcpTransferService | null {
    return this.tcpTransferService
  }

  // 获取所有可用的网络接口
  getNetworkInterfaces(includeVirtual = false): NetworkInterface[] {
    const interfaces = os.networkInterfaces()
    const result: NetworkInterface[] = []

    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name]
      if (!iface) continue

      for (const info of iface) {
        // 只处理 IPv4
        if (info.family !== 'IPv4') {
          continue
        }

        // 检查是否为虚拟网卡
        const isVirtual = this.isVirtualInterface(name, info.address)

        // 如果不包含虚拟网卡且当前是虚拟网卡，则跳过
        if (!includeVirtual && isVirtual) {
          continue
        }

        // 计算优先级
        let priority = 999
        if (info.internal) {
          priority = 999 // 回环接口优先级最低
        } else if (/WLAN|Wi-Fi|Wireless/i.test(name)) {
          priority = 1 // WiFi 优先级最高
        } else if (/以太网|Ethernet/i.test(name) && !isVirtual) {
          priority = 2 // 以太网次之
        } else if (!isVirtual) {
          priority = 3 // 其他物理网卡
        } else {
          priority = 100 // 虚拟网卡
        }

        // 计算广播地址
        let broadcast = '255.255.255.255'
        if (info.netmask && !info.internal) {
          const ipParts = info.address.split('.').map(Number)
          const maskParts = info.netmask.split('.').map(Number)
          const broadcastParts = ipParts.map((ipPart, i) => ipPart | (~maskParts[i] & 255))
          broadcast = broadcastParts.join('.')
        }

        result.push({
          name,
          address: info.address,
          netmask: info.netmask || '',
          broadcast,
          isInternal: info.internal,
          isVirtual,
          priority
        })
      }
    }

    // 按优先级排序
    result.sort((a, b) => a.priority - b.priority)

    return result
  }

  // 检查是否为虚拟网卡
  private isVirtualInterface(name: string, address: string): boolean {
    // 检查虚拟网卡名称
    if (/^(vEthernet|VMware|VirtualBox|Docker|ZeroTier|WSL|Tailscale|NordVPN|TAP-Windows|veth|br-|docker|virbr)/i.test(name)) {
      return true
    }

    // 检查虚拟网段
    if (address.startsWith('127.') ||
        address.startsWith('172.23.') ||
        address.startsWith('172.24.') ||
        address.startsWith('172.25.') ||
        address.startsWith('172.26.') ||
        address.startsWith('172.27.') ||
        address.startsWith('172.28.') ||
        address.startsWith('172.29.') ||
        address.startsWith('172.30.') ||
        address.startsWith('172.31.') ||
        address.startsWith('169.254.') ||
        address.startsWith('192.168.56.')) {
      return true
    }

    return false
  }

  // 获取当前使用的网络接口
  getCurrentInterface(): NetworkInterface | null {
    const currentIP = this.localIP
    if (!currentIP) return null

    const interfaces = this.getNetworkInterfaces()
    return interfaces.find(iface => iface.address === currentIP) || null
  }

  // 切换网络接口
  async switchInterface(address: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 验证地址是否有效
      const interfaces = this.getNetworkInterfaces()
      const targetInterface = interfaces.find(iface => iface.address === address)

      if (!targetInterface) {
        return { success: false, error: '无效的网络接口地址' }
      }

      // 如果当前已经是这个地址，不需要切换
      if (this.localIP === address) {
        return { success: true }
      }

      log.info(`切换网络接口: ${this.localIP} -> ${address} (${targetInterface.name})`)

      // 1. 发送下线通知（使用旧的网络接口）
      this.sendOffline()

      // 2. 清空在线用户列表
      const previousUsers = Array.from(this.onlineUsers.keys())
      this.onlineUsers.clear()

      // 3. 通知渲染进程用户已离线
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        for (const userId of previousUsers) {
          this.mainWindow.webContents.send('user:offline', { userId })
        }
      }

      // 4. 更新网络配置
      this.localIP = address
      this.broadcastAddress = targetInterface.broadcast
      this.isManualInterface = true // 标记为手动设置

      // 5. 重新绑定 UDP socket
      await this.rebindUdpSocket()

      // 6. 发送上线广播（使用新的网络接口）
      setTimeout(() => {
        this.broadcastOnline()
      }, 500)

      log.info(`网络接口切换成功: ${address} (${targetInterface.name}), 广播地址: ${this.broadcastAddress}`)
      return { success: true }
    } catch (error) {
      log.error('切换网络接口失败:', error)
      return { success: false, error: String(error) }
    }
  }

  // 重新绑定 UDP Socket
  private async rebindUdpSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 关闭现有的 socket
        if (this.udpSocket) {
          this.udpSocket.close()
          this.udpSocket = null
        }

        // 创建新的 socket
        this.createUdpSocket()

        // 等待 socket 准备好
        setTimeout(() => {
          if (this.udpSocket) {
            resolve()
          } else {
            reject(new Error('UDP socket 重新绑定失败'))
          }
        }, 1000)
      } catch (error) {
        reject(error)
      }
    })
  }

  // 从设置中加载网络接口配置
  loadInterfaceFromSettings(): void {
    const savedInterface = this.databaseService.getSetting('network.interface')
    if (savedInterface) {
      const interfaces = this.getNetworkInterfaces()
      const targetInterface = interfaces.find(iface => iface.address === savedInterface)
      if (targetInterface) {
        this.localIP = targetInterface.address
        this.broadcastAddress = targetInterface.broadcast
        this.isManualInterface = true // 标记为手动设置
        log.info(`从设置加载网络接口: ${this.localIP} (${targetInterface.name})`)
      }
    }
  }

  // 从设置中加载自定义广播地址
  loadCustomBroadcastAddresses(): void {
    const addressesStr = this.databaseService.getSetting('network.customBroadcastAddresses')
    if (addressesStr) {
      try {
        this.customBroadcastAddresses = JSON.parse(addressesStr)
        log.info(`从设置加载自定义广播地址: ${this.customBroadcastAddresses.join(', ')}`)
      } catch (error) {
        log.error('解析自定义广播地址失败:', error)
        this.customBroadcastAddresses = []
      }
    }
  }

  // 获取所有广播地址（默认 + 自定义）
  getAllBroadcastAddresses(): string[] {
    const addresses = new Set<string>()

    // 添加默认广播地址
    if (this.broadcastAddress) {
      addresses.add(this.broadcastAddress)
    }

    // 添加受限广播地址（255.255.255.255）作为兜底
    addresses.add('255.255.255.255')

    // 添加自定义广播地址
    this.customBroadcastAddresses.forEach(addr => {
      if (this.isValidBroadcastAddress(addr)) {
        addresses.add(addr)
      }
    })

    return Array.from(addresses)
  }

  // 验证广播地址格式
  private isValidBroadcastAddress(address: string): boolean {
    const parts = address.split('.')
    if (parts.length !== 4) return false

    return parts.every(part => {
      const num = parseInt(part, 10)
      return !isNaN(num) && num >= 0 && num <= 255
    })
  }

  // 获取自定义广播地址列表
  getCustomBroadcastAddresses(): string[] {
    return [...this.customBroadcastAddresses]
  }

  // 添加自定义广播地址
  addCustomBroadcastAddress(address: string): { success: boolean; error?: string } {
    // 验证地址格式
    if (!this.isValidBroadcastAddress(address)) {
      return { success: false, error: '无效的广播地址格式' }
    }

    // 检查是否已存在
    if (this.customBroadcastAddresses.includes(address)) {
      return { success: false, error: '该广播地址已存在' }
    }

    // 添加到列表
    this.customBroadcastAddresses.push(address)

    // 保存到数据库
    this.saveCustomBroadcastAddresses()

    log.info(`添加自定义广播地址: ${address}`)
    return { success: true }
  }

  // 删除自定义广播地址
  removeCustomBroadcastAddress(address: string): { success: boolean; error?: string } {
    const index = this.customBroadcastAddresses.indexOf(address)
    if (index === -1) {
      return { success: false, error: '该广播地址不存在' }
    }

    this.customBroadcastAddresses.splice(index, 1)
    this.saveCustomBroadcastAddresses()

    log.info(`删除自定义广播地址: ${address}`)
    return { success: true }
  }

  // 保存自定义广播地址到数据库
  private saveCustomBroadcastAddresses(): void {
    const addressesStr = JSON.stringify(this.customBroadcastAddresses)
    this.databaseService.setSetting('network.customBroadcastAddresses', addressesStr)
  }

  private broadcastOnline(): void {
    // log.info(`发送上线广播: localIP=${this.localIP}, broadcastAddress=${this.broadcastAddress}`)
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
      this.onlineUsers.forEach((user, macAddress) => {
        if (now - user.lastHeartbeat > HEARTBEAT_TIMEOUT) {
          this.handleUserOffline(macAddress)
        }
      })
    }, 10000)
  }

  private sendPacket(type: PacketType, payload: Record<string, unknown>): void {
    if (!this.udpSocket || !this.broadcastAddress) {
      log.warn(`UDP socket 未就绪或广播地址未设置: socket=${!!this.udpSocket}, broadcastAddress=${this.broadcastAddress}`)
      return
    }
    // log.debug(`发送包: type=${type}, broadcastAddress=${this.broadcastAddress}`)

    const packet: UdpPacket = {
      magic: MAGIC,
      version: VERSION,
      type,
      msgId: uuidv4(),
      timestamp: Date.now(),
      from: {
        userId: this.selfUserId,
        macAddress: this.selfMacAddress,  // 包含 MAC 地址
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: TCP_PORT,
        avatar: this.selfAvatar,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload
    }

    this.sendPacketDirect(packet)
  }

  private sendPacketDirect(packet: UdpPacket): void {
    if (!this.udpSocket) {
      log.warn('UDP socket 未就绪')
      return
    }

    const buffer = this.encodePacket(packet)
    const addresses = this.getAllBroadcastAddresses()

    // log.debug(`向 ${addresses.length} 个广播地址发送数据包: ${packet.type}`)

    // 向所有广播地址发送
    for (const address of addresses) {
      this.udpSocket.send(buffer, UDP_PORT, address, (err) => {
        if (err) {
          log.debug(`发送广播到 ${address} 失败:`, err)
        }
      })
    }
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
          // log.debug(`跳过虚拟网卡: ${name} - ${info.address}`)
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
          // log.debug(`跳过虚拟网段: ${name} - ${info.address}`)
          continue
        }

        // 跳过 VirtualBox 虚拟网段 192.168.56.x
        if (info.address.startsWith('192.168.56.')) {
          // log.debug(`跳过 VirtualBox 网段: ${name} - ${info.address}`)
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
    return this.calculateBroadcastAddress(ip)
  }

  // 计算指定 IP 的广播地址
  private calculateBroadcastAddress(ip: string): string {
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
    const targetUser = this.findUserByUserId(data.to)
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
        macAddress: this.selfMacAddress,
        nickname: this.selfNickname,
        ip: this.localIP || this.getLocalIP(),
        port: TCP_PORT,
        avatar: this.selfAvatar,
        status: this.selfStatus,
        version: app.getVersion()
      },
      payload
    }

    this.sendPacketDirect(packet)

    // 返回消息 ID 给渲染进程
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

  async broadcastStatusChange(userInfo: { nickname: string; status: string; avatar?: string }): Promise<void> {
    // 更新本地缓存
    this.selfNickname = userInfo.nickname
    this.selfStatus = userInfo.status as UserStatus
    if (userInfo.avatar !== undefined) {
      this.selfAvatar = userInfo.avatar
    }
    // 广播状态变更
    log.info(`广播状态变更: nickname=${this.selfNickname}, avatar=${this.selfAvatar}, status=${this.selfStatus}`)
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

    if (this.tcpTransferService) {
      this.tcpTransferService.closeServer()
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
