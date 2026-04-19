import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import os from 'os'
import fs from 'fs'

export interface UserInfo {
  userId: string
  nickname: string
  avatar?: string
  status: 'online' | 'busy' | 'away' | 'offline'
}

export interface OnlineUser {
  userId: string
  nickname: string
  ip: string
  port: number
  avatar?: string
  status: 'online' | 'busy' | 'away' | 'offline'
  lastHeartbeat: number
  version: string
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
  senderName?: string
  contentType: 'text' | 'emoji' | 'image' | 'file' | 'system' | 'recall'
  content: string
  fileId?: string
  replyToId?: string
  status: 'sending' | 'sent' | 'delivered' | 'failed'
  isRecalled: boolean
  sentAt: number
  deliveredAt?: number
  createdAt: number
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

export class DatabaseService {
  private db: Database.Database | null = null
  private dbPath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.dbPath = join(userDataPath, 'cubicle-chat.db')
  }

  async init(): Promise<void> {
    try {
      this.db = new Database(this.dbPath)

      // 配置 SQLite
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('synchronous = NORMAL')
      this.db.pragma('cache_size = -64000')
      this.db.pragma('foreign_keys = ON')
      this.db.pragma('temp_store = MEMORY')

      // 创建表
      this.createTables()

      // 初始化用户信息
      this.initUserInfo()

      log.info(`数据库初始化成功: ${this.dbPath}`)
    } catch (error) {
      log.error('数据库初始化失败:', error)
      throw error
    }
  }

  private createTables(): void {
    if (!this.db) return

    // 用户表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        avatar TEXT,
        status TEXT NOT NULL DEFAULT 'online',
        ip_address TEXT,
        udp_port INTEGER DEFAULT 2425,
        tcp_port INTEGER DEFAULT 2426,
        client_version TEXT,
        is_self INTEGER NOT NULL DEFAULT 0,
        is_blocked INTEGER NOT NULL DEFAULT 0,
        group_name TEXT,
        remark TEXT,
        last_seen_at INTEGER,
        first_seen_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // 会话表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        conversation_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        group_name TEXT,
        member_ids TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        is_muted INTEGER NOT NULL DEFAULT 0,
        unread_count INTEGER NOT NULL DEFAULT 0,
        last_message_id TEXT,
        last_message_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // 消息表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content TEXT,
        file_id TEXT,
        reply_to_id TEXT,
        status TEXT DEFAULT 'sent',
        is_recalled INTEGER NOT NULL DEFAULT 0,
        sent_at INTEGER NOT NULL,
        delivered_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
      )
    `)

    // 文件表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        file_id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        file_path TEXT,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        file_md5 TEXT,
        direction TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        transferred_bytes INTEGER DEFAULT 0,
        is_image INTEGER DEFAULT 0,
        thumbnail_data TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL
      )
    `)

    // 设置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_ip ON users(ip_address);
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_conversations_target ON conversations(target_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_messages_file ON messages(file_id);
    `)

    log.info('数据库表创建完成')
  }

  private initUserInfo(): void {
    const userInfo = this.getUserInfo()
    if (!userInfo) {
      const userId = this.generateUUID()
      const nickname = os.hostname()
      this.setSetting('user.userId', userId)
      this.setSetting('user.nickname', nickname)
      this.setSetting('user.status', 'online')
    }

    // 初始化默认设置
    this.initDefaultSettings()
  }

  private initDefaultSettings(): void {
    const defaults: Record<string, string> = {
      'user.status': 'online',
      'storage.retentionDays': '180',
      'network.udpPort': '2425',
      'network.tcpPort': '2426',
      'notification.enabled': 'true',
      'notification.sound': 'true',
      'startup.autoLaunch': 'false',
      'startup.minimized': 'false',
      'ui.language': 'zh-CN',
      'ui.theme': 'system',
      'ui.minimizeToTray': 'true'
    }

    for (const [key, value] of Object.entries(defaults)) {
      const existing = this.getSetting(key)
      if (existing === null) {
        this.setSetting(key, value)
      }
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  // 用户相关
  getUserInfo(): UserInfo | null {
    const userId = this.getSetting('user.userId')
    const nickname = this.getSetting('user.nickname')
    const avatar = this.getSetting('user.avatar')
    const status = (this.getSetting('user.status') as UserInfo['status']) || 'online'

    if (!userId || !nickname) return null

    return { userId, nickname, avatar, status }
  }

  updateUserInfo(info: Partial<UserInfo>): boolean {
    if (info.nickname !== undefined) {
      this.setSetting('user.nickname', info.nickname)
    }
    if (info.avatar !== undefined) {
      this.setSetting('user.avatar', info.avatar)
    }
    if (info.status !== undefined) {
      this.setSetting('user.status', info.status)
    }
    return true
  }

  // 批量获取设置
  getSettings(keys?: string[]): Record<string, string | null> {
    if (!this.db) return {}

    if (keys && keys.length > 0) {
      const result: Record<string, string | null> = {}
      for (const key of keys) {
        result[key] = this.getSetting(key)
      }
      return result
    }

    // 获取所有设置
    const stmt = this.db.prepare('SELECT key, value FROM settings')
    const rows = stmt.all() as Array<{ key: string; value: string }>
    const result: Record<string, string | null> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  // 批量设置
  setSettings(settings: Record<string, string>): boolean {
    if (!this.db) return false

    try {
      for (const [key, value] of Object.entries(settings)) {
        this.setSetting(key, value)
      }
      return true
    } catch (error) {
      log.error('批量设置失败:', error)
      return false
    }
  }

  saveUser(user: OnlineUser): void {
    if (!this.db) return

    // 检查用户是否已存在
    const existing = this.db.prepare('SELECT first_seen_at FROM users WHERE user_id = ?').get(user.userId) as { first_seen_at: number } | undefined
    const firstSeenAt = existing?.first_seen_at || user.lastHeartbeat

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO users (
        user_id, nickname, avatar, status, ip_address, udp_port, tcp_port,
        client_version, last_seen_at, first_seen_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      user.userId,
      user.nickname,
      user.avatar || null,
      user.status,
      user.ip,
      user.port, // udp_port
      null,      // tcp_port（暂未使用）
      user.version,
      user.lastHeartbeat,
      firstSeenAt,
      Date.now()
    )
  }

  // 会话相关
  getConversations(): Conversation[] {
    if (!this.db) return []

    const stmt = this.db.prepare(`
      SELECT * FROM conversations ORDER BY is_pinned DESC, last_message_at DESC
    `)

    const rows = stmt.all() as Array<{
      conversation_id: string
      type: string
      target_id: string
      group_name: string
      is_pinned: number
      is_muted: number
      unread_count: number
      last_message_id: string
      last_message_at: number
    }>

    return rows.map((row) => {
      // 获取目标用户信息
      const targetStmt = this.db!.prepare(
        row.type === 'single' ? 'SELECT * FROM users WHERE user_id = ?' : 'SELECT * FROM users WHERE user_id = ?'
      )
      const target = row.type === 'single' ? targetStmt.get(row.target_id) as { nickname: string; avatar: string; status: string } | undefined : undefined

      // 获取最后一条消息
      let lastMessage = ''
      if (row.last_message_id) {
        const msgStmt = this.db!.prepare('SELECT content FROM messages WHERE message_id = ?')
        const msg = msgStmt.get(row.last_message_id) as { content: string } | undefined
        lastMessage = msg?.content || ''
      }

      return {
        conversationId: row.conversation_id,
        type: row.type as 'single' | 'group',
        targetId: row.target_id,
        targetName: row.type === 'group' ? row.group_name || '群聊' : target?.nickname || '未知用户',
        targetAvatar: target?.avatar,
        targetStatus: target?.status,
        lastMessage,
        lastMessageAt: row.last_message_at,
        unreadCount: row.unread_count,
        isPinned: Boolean(row.is_pinned),
        isMuted: Boolean(row.is_muted)
      }
    })
  }

  getConversationByTarget(targetId: string, type: 'single' | 'group'): Conversation | null {
    if (!this.db) return null

    const stmt = this.db.prepare('SELECT * FROM conversations WHERE target_id = ? AND type = ?')
    const row = stmt.get(targetId, type) as {
      conversation_id: string
      type: string
      target_id: string
      group_name: string
      is_pinned: number
      is_muted: number
      unread_count: number
      last_message_id: string
      last_message_at: number
    } | undefined

    if (!row) return null

    // 获取目标用户信息
    const targetStmt = this.db.prepare('SELECT * FROM users WHERE user_id = ?')
    const target = targetStmt.get(row.target_id) as { nickname: string; avatar: string; status: string } | undefined

    // 获取最后一条消息
    let lastMessage = ''
    if (row.last_message_id) {
      const msgStmt = this.db.prepare('SELECT content FROM messages WHERE message_id = ?')
      const msg = msgStmt.get(row.last_message_id) as { content: string } | undefined
      lastMessage = msg?.content || ''
    }

    return {
      conversationId: row.conversation_id,
      type: row.type as 'single' | 'group',
      targetId: row.target_id,
      targetName: row.type === 'group' ? row.group_name || '群聊' : target?.nickname || '未知用户',
      targetAvatar: target?.avatar,
      targetStatus: target?.status,
      lastMessage,
      lastMessageAt: row.last_message_at,
      unreadCount: row.unread_count,
      isPinned: Boolean(row.is_pinned),
      isMuted: Boolean(row.is_muted)
    }
  }

  createConversation(data: { 
    type: 'single' | 'group'; 
    targetId: string; 
    groupName?: string;
    targetInfo?: { nickname: string; avatar?: string; status?: string }
  }): Conversation | null {
    if (!this.db) return null

    // 检查会话是否已存在
    const existingConv = this.db.prepare('SELECT * FROM conversations WHERE target_id = ? AND type = ?').get(data.targetId, data.type) as {
      conversation_id: string;
      type: string;
      target_id: string;
      group_name: string;
      is_pinned: number;
      is_muted: number;
      unread_count: number;
    } | undefined

    if (existingConv) {
      // 返回已存在的会话
      return {
        conversationId: existingConv.conversation_id,
        type: existingConv.type as 'single' | 'group',
        targetId: existingConv.target_id,
        targetName: data.targetInfo?.nickname || data.groupName || '未知用户',
        targetAvatar: data.targetInfo?.avatar,
        targetStatus: data.targetInfo?.status,
        unreadCount: existingConv.unread_count,
        isPinned: Boolean(existingConv.is_pinned),
        isMuted: Boolean(existingConv.is_muted)
      }
    }

    const conversationId = this.generateUUID()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO conversations (
        conversation_id, type, target_id, group_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      conversationId,
      data.type,
      data.targetId,
      data.groupName || null,
      now,
      now
    )

    return {
      conversationId,
      type: data.type,
      targetId: data.targetId,
      targetName: data.targetInfo?.nickname || data.groupName || '新会话',
      targetAvatar: data.targetInfo?.avatar,
      targetStatus: data.targetInfo?.status,
      unreadCount: 0,
      isPinned: false,
      isMuted: false
    }
  }

  // 消息相关
  saveMessage(data: {
    messageId: string
    conversationId: string
    senderId: string
    contentType: Message['contentType']
    content: string
    replyToId?: string
    fileId?: string
  }): Message {
    if (!this.db) throw new Error('数据库未初始化')

    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO messages (
        message_id, conversation_id, sender_id, content_type, content,
        reply_to_id, file_id, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      data.messageId,
      data.conversationId,
      data.senderId,
      data.contentType,
      data.content,
      data.replyToId || null,
      data.fileId || null,
      now,
      now
    )

    // 更新会话的最后消息
    this.updateConversationLastMessage(data.conversationId, data.messageId, now)

    return {
      messageId: data.messageId,
      conversationId: data.conversationId,
      senderId: data.senderId,
      contentType: data.contentType,
      content: data.content,
      replyToId: data.replyToId,
      status: 'sent',
      isRecalled: false,
      sentAt: now,
      createdAt: now
    }
  }

  updateConversationLastMessage(conversationId: string, messageId: string, timestamp: number): void {
    if (!this.db) return

    const stmt = this.db.prepare(`
      UPDATE conversations SET last_message_id = ?, last_message_at = ?, updated_at = ? WHERE conversation_id = ?
    `)
    stmt.run(messageId, timestamp, Date.now(), conversationId)
  }

  getMessageHistory(conversationId: string, limit = 50, before?: number): Message[] {
    if (!this.db) return []

    let sql = `
      SELECT m.*, u.nickname as sender_name
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.user_id
      WHERE m.conversation_id = ?
    `

    if (before) {
      sql += ` AND m.sent_at < ?`
    }

    sql += ` ORDER BY m.sent_at DESC LIMIT ?`

    const stmt = this.db.prepare(sql)
    const rows = before
      ? (stmt.all(conversationId, before, limit) as Array<{
          message_id: string
          conversation_id: string
          sender_id: string
          sender_name: string
          content_type: string
          content: string
          file_id: string
          reply_to_id: string
          status: string
          is_recalled: number
          sent_at: number
          delivered_at: number
          created_at: number
        }>)
      : (stmt.all(conversationId, limit) as Array<{
          message_id: string
          conversation_id: string
          sender_id: string
          sender_name: string
          content_type: string
          content: string
          file_id: string
          reply_to_id: string
          status: string
          is_recalled: number
          sent_at: number
          delivered_at: number
          created_at: number
        }>)

    return rows
      .map((row) => ({
        messageId: row.message_id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        senderName: row.sender_name,
        contentType: row.content_type as Message['contentType'],
        content: row.content,
        fileId: row.file_id,
        replyToId: row.reply_to_id,
        status: row.status as Message['status'],
        isRecalled: Boolean(row.is_recalled),
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        createdAt: row.created_at
      }))
      .reverse()
  }

  recallMessage(messageId: string): void {
    if (!this.db) return

    const stmt = this.db.prepare(`
      UPDATE messages SET is_recalled = 1, content_type = 'recall', content = '[消息已撤回]' WHERE message_id = ?
    `)
    stmt.run(messageId)
  }

  searchMessages(keyword: string, conversationId?: string, limit = 50): Message[] {
    if (!this.db || !keyword.trim()) return []

    const searchPattern = `%${keyword.trim()}%`
    let sql = `
      SELECT m.*, u.nickname as sender_name
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.user_id
      WHERE m.content LIKE ? AND m.content_type NOT IN ('recall', 'system')
    `
    const params: unknown[] = [searchPattern]

    if (conversationId) {
      sql += ` AND m.conversation_id = ?`
      params.push(conversationId)
    }

    sql += ` ORDER BY m.sent_at DESC LIMIT ?`
    params.push(limit)

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as Array<{
      message_id: string
      conversation_id: string
      sender_id: string
      sender_name: string
      content_type: string
      content: string
      file_id: string
      reply_to_id: string
      status: string
      is_recalled: number
      sent_at: number
      delivered_at: number
      created_at: number
    }>

    return rows.map((row) => ({
      messageId: row.message_id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      contentType: row.content_type as Message['contentType'],
      content: row.content,
      fileId: row.file_id,
      replyToId: row.reply_to_id,
      status: row.status as Message['status'],
      isRecalled: Boolean(row.is_recalled),
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      createdAt: row.created_at
    }))
  }

  // 设置相关
  getSetting(key: string): string | null {
    if (!this.db) return null

    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?')
    const row = stmt.get(key) as { value: string } | undefined
    return row?.value || null
  }

  setSetting(key: string, value: string | null | undefined): boolean {
    if (!this.db) return false

    // 处理空值，确保不会违反 NOT NULL 约束
    const safeValue = (value === null || value === undefined) ? '' : String(value)
    
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    stmt.run(key, safeValue)
    return true
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
    log.info('数据库连接已关闭')
  }

  // 文件相关
  saveFile(file: FileRecord): FileRecord {
    if (!this.db) throw new Error('数据库未初始化')

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO files (
        file_id, file_name, file_path, file_size, mime_type, file_md5,
        direction, peer_id, status, transferred_bytes, is_image, thumbnail_data,
        started_at, completed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      file.fileId,
      file.fileName,
      file.filePath || null,
      file.fileSize,
      file.mimeType,
      file.fileMd5 || null,
      file.direction,
      file.peerId,
      file.status,
      file.transferredBytes,
      file.isImage ? 1 : 0,
      file.thumbnailData || null,
      file.startedAt || null,
      file.completedAt || null,
      file.createdAt
    )

    return file
  }

  getFile(fileId: string): FileRecord | null {
    if (!this.db) return null

    const stmt = this.db.prepare('SELECT * FROM files WHERE file_id = ?')
    const row = stmt.get(fileId) as {
      file_id: string
      file_name: string
      file_path: string
      file_size: number
      mime_type: string
      file_md5: string
      direction: string
      peer_id: string
      status: string
      transferred_bytes: number
      is_image: number
      thumbnail_data: string
      started_at: number
      completed_at: number
      created_at: number
    } | undefined

    if (!row) return null

    return {
      fileId: row.file_id,
      fileName: row.file_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      fileMd5: row.file_md5,
      direction: row.direction as 'send' | 'receive',
      peerId: row.peer_id,
      status: row.status as FileRecord['status'],
      transferredBytes: row.transferred_bytes,
      isImage: Boolean(row.is_image),
      thumbnailData: row.thumbnail_data,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at
    }
  }

  getFileList(filter?: { direction?: 'send' | 'receive'; status?: FileRecord['status'] }): FileRecord[] {
    if (!this.db) return []

    let sql = 'SELECT * FROM files WHERE 1=1'
    const params: unknown[] = []

    if (filter?.direction) {
      sql += ' AND direction = ?'
      params.push(filter.direction)
    }

    if (filter?.status) {
      sql += ' AND status = ?'
      params.push(filter.status)
    }

    sql += ' ORDER BY created_at DESC'

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as Array<{
      file_id: string
      file_name: string
      file_path: string
      file_size: number
      mime_type: string
      file_md5: string
      direction: string
      peer_id: string
      status: string
      transferred_bytes: number
      is_image: number
      thumbnail_data: string
      started_at: number
      completed_at: number
      created_at: number
    }>

    return rows.map((row) => ({
      fileId: row.file_id,
      fileName: row.file_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      fileMd5: row.file_md5,
      direction: row.direction as 'send' | 'receive',
      peerId: row.peer_id,
      status: row.status as FileRecord['status'],
      transferredBytes: row.transferred_bytes,
      isImage: Boolean(row.is_image),
      thumbnailData: row.thumbnail_data,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at
    }))
  }

  updateFileStatus(fileId: string, status: FileRecord['status'], transferredBytes?: number): void {
    if (!this.db) return

    const updates: string[] = ['status = ?']
    const params: unknown[] = [status]

    if (transferredBytes !== undefined) {
      updates.push('transferred_bytes = ?')
      params.push(transferredBytes)
    }

    if (status === 'completed') {
      updates.push('completed_at = ?')
      params.push(Date.now())
    }

    if (status === 'transferring') {
      updates.push('started_at = COALESCE(started_at, ?)')
      params.push(Date.now())
    }

    params.push(fileId)

    const stmt = this.db.prepare(`UPDATE files SET ${updates.join(', ')} WHERE file_id = ?`)
    stmt.run(...params)
  }

  updateFilePath(fileId: string, filePath: string): void {
    if (!this.db) return

    const stmt = this.db.prepare('UPDATE files SET file_path = ? WHERE file_id = ?')
    stmt.run(filePath, fileId)
  }

  // 更新会话目标用户信息（当用户昵称/头像/状态变更时调用）
  updateConversationTargetInfo(userId: string, nickname: string, avatar?: string, status?: string): void {
    if (!this.db) return

    const stmt = this.db.prepare(`
      UPDATE conversations 
      SET updated_at = ?
      WHERE target_id = ? AND type = 'single'
    `)
    stmt.run(Date.now(), userId)
  }

  deleteFile(fileId: string): void {
    if (!this.db) return

    const stmt = this.db.prepare('DELETE FROM files WHERE file_id = ?')
    stmt.run(fileId)
  }

  deleteConversation(conversationId: string): boolean {
    if (!this.db) return false

    try {
      // 删除消息
      const deleteMessages = this.db.prepare('DELETE FROM messages WHERE conversation_id = ?')
      deleteMessages.run(conversationId)

      // 删除会话
      const deleteConv = this.db.prepare('DELETE FROM conversations WHERE conversation_id = ?')
      deleteConv.run(conversationId)

      return true
    } catch (error) {
      log.error('删除会话失败:', error)
      return false
    }
  }

  getDownloadPath(): string {
    const downloadPath = app.getPath('downloads')
    const cubicleChatPath = join(downloadPath, 'CubicleChat')

    // 确保目录存在
    if (!fs.existsSync(cubicleChatPath)) {
      fs.mkdirSync(cubicleChatPath, { recursive: true })
    }

    return cubicleChatPath
  }
}
