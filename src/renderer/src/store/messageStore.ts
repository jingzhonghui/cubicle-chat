import { create } from 'zustand'
import { useUserStore } from './userStore'

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

interface MessageStore {
  conversations: Conversation[]
  messages: Message[]
  currentConversationId: string | null
  currentPage: 'chat' | 'users' | 'files' | 'settings'
  isLoading: boolean

  // Actions
  loadConversations: () => Promise<void>
  loadMessages: (conversationId: string, limit?: number) => Promise<void>
  addMessage: (message: Message) => void
  sendMessage: (conversationId: string, content: string, contentType?: 'text' | 'emoji') => Promise<void>
  sendFileMessage: (conversationId: string, fileName: string, fileId: string, isImage: boolean) => Promise<void>
  recallMessage: (messageId: string, conversationId: string) => Promise<void>
  updateMessageStatus: (messageId: string, status: Message['status']) => void
  updateMessageId: (oldId: string, newId: string) => void
  updateMessageFileId: (oldFileId: string, newFileId: string) => void
  setCurrentConversation: (conversationId: string | null) => void
  setCurrentPage: (page: 'chat' | 'users' | 'files' | 'settings') => void
  createConversation: (targetId: string, type: 'single' | 'group', groupName?: string, targetInfo?: { nickname: string; avatar?: string; status?: string }) => Promise<Conversation | null>
  markAsRead: (conversationId: string) => void
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  conversations: [],
  messages: [],
  currentConversationId: null,
  currentPage: 'chat',
  isLoading: false,

  loadConversations: async () => {
    try {
      const conversations = await window.electronAPI.invoke<Conversation[]>('conversation:getList')
      set({ conversations: conversations || [] })
    } catch (error) {
      console.error('加载会话列表失败:', error)
    }
  },

  loadMessages: async (conversationId: string, limit = 50) => {
    try {
      set({ isLoading: true })
      const serverMessages = await window.electronAPI.invoke<Message[]>('message:getHistory', {
        conversationId,
        limit
      }) || []
      
      // 合并现有消息和服务器消息，避免丢失本地消息
      set((state) => {
        // 保留不属于当前会话的本地消息（如正在发送的临时消息）
        const otherMessages = state.messages.filter((m) => {
          // 保留其他会话的消息
          if (m.conversationId !== conversationId) return true
          // 保留当前会话的临时消息（还没收到服务器确认的）
          if (m.messageId.startsWith('temp-')) return true
          return false
        })
        
        // 合并服务器消息和保留的本地消息
        const allMessages = [...otherMessages, ...serverMessages]
        // 按时间排序
        allMessages.sort((a, b) => a.sentAt - b.sentAt)
        
        return { messages: allMessages, currentConversationId: conversationId }
      })
    } catch (error) {
      console.error('加载消息历史失败:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  addMessage: (message: Message) => {
    set((state) => {
      // 检查是否已存在
      const exists = state.messages.some((m) => m.messageId === message.messageId)
      if (exists) {
        return state
      }
      return { messages: [...state.messages, message] }
    })
  },

  sendMessage: async (conversationId: string, content: string, contentType: 'text' | 'emoji' = 'text') => {
    const conversation = get().conversations.find((c) => c.conversationId === conversationId)
    const userInfo = useUserStore.getState().userInfo
    if (!conversation || !userInfo) return

    // 创建本地消息（发送中状态）
    const localMessageId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const tempMessage: Message = {
      messageId: localMessageId,
      conversationId,
      senderId: userInfo.userId, // 使用当前用户的 userId
      senderName: userInfo.nickname,
      contentType,
      content,
      status: 'sending',
      isRecalled: false,
      sentAt: Date.now()
    }

    // 添加到消息列表
    get().addMessage(tempMessage)

    try {
      // 发送到主进程
      const result = await window.electronAPI.invoke<{ success: boolean; messageId?: string }>('message:send', {
        to: conversation.targetId,
        content,
        contentType
      })

      if (result?.success && result.messageId) {
        // 使用服务器返回的真实消息 ID 更新本地消息
        get().updateMessageId(localMessageId, result.messageId)
        get().updateMessageStatus(result.messageId, 'sent')
      } else {
        get().updateMessageStatus(localMessageId, 'failed')
      }

      // 更新会话的最后消息
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.conversationId === conversationId
            ? { ...c, lastMessage: content, lastMessageAt: Date.now() }
            : c
        )
      }))
    } catch (error) {
      console.error('发送消息失败:', error)
      get().updateMessageStatus(localMessageId, 'failed')
    }
  },

  sendFileMessage: async (conversationId: string, fileName: string, fileId: string, isImage: boolean) => {
    const conversation = get().conversations.find((c) => c.conversationId === conversationId)
    const userInfo = useUserStore.getState().userInfo
    if (!conversation || !userInfo) return

    // 创建本地消息（发送中状态）
    const localMessageId = `temp-file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const tempMessage: Message = {
      messageId: localMessageId,
      conversationId,
      senderId: userInfo.userId,
      senderName: userInfo.nickname,
      contentType: isImage ? 'image' : 'file',
      content: fileName,
      fileId,
      status: 'sending',
      isRecalled: false,
      sentAt: Date.now()
    }

    // 添加到消息列表
    get().addMessage(tempMessage)

    // 更新会话的最后消息
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.conversationId === conversationId
          ? { ...c, lastMessage: fileName, lastMessageAt: Date.now() }
          : c
      )
    }))
  },

  recallMessage: async (messageId: string, conversationId: string) => {
    try {
      await window.electronAPI.invoke<boolean>('message:withdraw', { messageId, conversationId })
    } catch (error) {
      console.error('撤回消息失败:', error)
    }
  },

  updateMessageStatus: (messageId: string, status: Message['status']) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.messageId === messageId ? { ...m, status } : m
      )
    }))
  },

  updateMessageId: (oldId: string, newId: string) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.messageId === oldId ? { ...m, messageId: newId } : m
      )
    }))
  },

  updateMessageFileId: (oldFileId: string, newFileId: string) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.fileId === oldFileId ? { ...m, fileId: newFileId } : m
      )
    }))
  },

  setCurrentConversation: (conversationId: string | null) => {
    set({ currentConversationId: conversationId })
    if (conversationId) {
      get().loadMessages(conversationId)
      // 标记为已读
      get().markAsRead(conversationId)
    }
  },

  setCurrentPage: (page: 'chat' | 'users' | 'files' | 'settings') => {
    set({ currentPage: page })
  },

  createConversation: async (targetId: string, type: 'single' | 'group', groupName?: string, targetInfo?: { nickname: string; avatar?: string; status?: string }) => {
    try {
      // 先检查本地是否已存在
      const existing = get().conversations.find(c => c.targetId === targetId && c.type === type)
      if (existing) {
        return existing
      }
      
      const conversation = await window.electronAPI.invoke<Conversation | null>('conversation:create', {
        type,
        targetId,
        groupName,
        targetInfo
      })
      
      if (conversation) {
        // 再次检查是否已存在（可能 loadConversations 已经加载过了）
        const stillExists = get().conversations.find(c => c.conversationId === conversation.conversationId)
        if (!stillExists) {
          set((state) => ({
            conversations: [conversation, ...state.conversations]
          }))
        }
      }
      return conversation
    } catch (error) {
      console.error('创建会话失败:', error)
      return null
    }
  },

  markAsRead: (conversationId: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.conversationId === conversationId ? { ...c, unreadCount: 0 } : c
      )
    }))
  }
}))



// 初始化事件监听 - 返回取消订阅函数
export function initMessageStoreListeners(): () => void {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return () => {}
  }

  console.log('[MessageStore] 初始化事件监听')

  const unsubscribeReceive = window.electronAPI.on('msg:receive', (data: {
    messageId: string
    conversationId: string
    senderId: string
    senderName: string
    contentType: string
    content: string
    fileId?: string
    sentAt: number
    isNewConversation?: boolean
  }) => {
    console.log('[MessageStore] 收到 msg:receive 事件:', data.messageId, 'fileId:', data.fileId)

    const message: Message = {
      messageId: data.messageId,
      conversationId: data.conversationId,
      senderId: data.senderId,
      senderName: data.senderName,
      contentType: data.contentType as Message['contentType'],
      content: data.content,
      fileId: data.fileId,
      status: 'delivered',
      isRecalled: false,
      sentAt: data.sentAt,
      deliveredAt: Date.now()
    }

    // 获取最新状态
    const state = useMessageStore.getState()
    const isCurrentConversation = state.currentConversationId === data.conversationId
    const isChatPage = state.currentPage === 'chat'

    console.log(`[MessageStore] 当前页面: ${state.currentPage}, 当前会话: ${state.currentConversationId}, 消息会话: ${data.conversationId}`)

    // 如果当前正在查看这个会话且处于聊天页面，直接添加消息并标记已读，不增加未读数
    if (isCurrentConversation && isChatPage) {
      console.log('[MessageStore] 当前正在查看该会话，直接添加消息并标记已读')
      useMessageStore.getState().addMessage(message)
      useMessageStore.setState((state) => ({
        conversations: state.conversations.map((c) =>
          c.conversationId === data.conversationId
            ? { ...c, lastMessage: data.content, lastMessageAt: data.sentAt, unreadCount: 0 }
            : c
        )
      }))
      return
    }

    // 否则添加消息并增加未读数
    console.log('[MessageStore] 不在当前会话，增加未读数')
    useMessageStore.getState().addMessage(message)

    // 如果是新会话，添加到会话列表
    if (data.isNewConversation) {
      const exists = state.conversations.some(c => c.conversationId === data.conversationId)
      if (!exists) {
        const newConversation: Conversation = {
          conversationId: data.conversationId,
          type: 'single',
          targetId: data.senderId,
          targetName: data.senderName,
          lastMessage: data.content,
          lastMessageAt: data.sentAt,
          unreadCount: 1,
          isPinned: false,
          isMuted: false
        }
        useMessageStore.setState((state) => ({
          conversations: [newConversation, ...state.conversations]
        }))
      }
    } else {
      // 更新现有会话的最后消息和未读数
      useMessageStore.setState((state) => ({
        conversations: state.conversations.map((c) =>
          c.conversationId === data.conversationId
            ? { ...c, lastMessage: data.content, lastMessageAt: data.sentAt, unreadCount: c.unreadCount + 1 }
            : c
        )
      }))
    }
  })

  const unsubscribeAck = window.electronAPI.on('msg:ack', (data: { messageId: string }) => {
    useMessageStore.getState().updateMessageStatus(data.messageId, 'delivered')
  })

  const unsubscribeWithdrawn = window.electronAPI.on('msg:withdrawn', (data: { messageId: string }) => {
    useMessageStore.getState().updateMessageStatus(data.messageId, 'recalled' as Message['status'])
  })

  const unsubscribeConversationNew = window.electronAPI.on('conversation:new', (conversation: Conversation) => {
    const state = useMessageStore.getState()
    const exists = state.conversations.some(c => c.conversationId === conversation.conversationId)
    if (!exists) {
      useMessageStore.setState((state) => ({
        conversations: [conversation, ...state.conversations]
      }))
    }
  })

  return () => {
    unsubscribeReceive()
    unsubscribeAck()
    unsubscribeWithdrawn()
    unsubscribeConversationNew()
  }
}
