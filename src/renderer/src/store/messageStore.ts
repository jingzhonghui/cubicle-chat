import { create } from 'zustand'

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
  isLoading: boolean

  // Actions
  loadConversations: () => Promise<void>
  loadMessages: (conversationId: string, limit?: number) => Promise<void>
  addMessage: (message: Message) => void
  sendMessage: (conversationId: string, content: string, contentType?: 'text' | 'emoji') => Promise<void>
  recallMessage: (messageId: string, conversationId: string) => Promise<void>
  updateMessageStatus: (messageId: string, status: Message['status']) => void
  setCurrentConversation: (conversationId: string | null) => void
  createConversation: (targetId: string, type: 'single' | 'group', groupName?: string) => Promise<Conversation | null>
  markAsRead: (conversationId: string) => void
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  conversations: [],
  messages: [],
  currentConversationId: null,
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
      const messages = await window.electronAPI.invoke<Message[]>('message:getHistory', {
        conversationId,
        limit
      })
      set({ messages: messages || [], currentConversationId: conversationId })
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
    if (!conversation) return

    // 创建本地消息（发送中状态）
    const tempMessage: Message = {
      messageId: `temp-${Date.now()}`,
      conversationId,
      senderId: '', // 稍后填充
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
      await window.electronAPI.invoke<boolean>('message:send', {
        to: conversation.targetId,
        content,
        contentType
      })

      // 更新消息状态
      get().updateMessageStatus(tempMessage.messageId, 'sent')

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
      get().updateMessageStatus(tempMessage.messageId, 'failed')
    }
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

  setCurrentConversation: (conversationId: string | null) => {
    set({ currentConversationId: conversationId })
    if (conversationId) {
      get().loadMessages(conversationId)
    }
  },

  createConversation: async (targetId: string, type: 'single' | 'group', groupName?: string) => {
    try {
      const conversation = await window.electronAPI.invoke<Conversation | null>('conversation:create', {
        type,
        targetId,
        groupName
      })
      if (conversation) {
        set((state) => ({
          conversations: [conversation, ...state.conversations]
        }))
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

// 初始化事件监听
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.on('msg:receive', (data: {
    messageId: string
    senderId: string
    senderName: string
    contentType: string
    content: string
    sentAt: number
  }) => {
    const message: Message = {
      messageId: data.messageId,
      conversationId: data.senderId,
      senderId: data.senderId,
      senderName: data.senderName,
      contentType: data.contentType as Message['contentType'],
      content: data.content,
      status: 'delivered',
      isRecalled: false,
      sentAt: data.sentAt,
      deliveredAt: Date.now()
    }

    useMessageStore.getState().addMessage(message)
  })

  window.electronAPI.on('msg:ack', (data: { messageId: string }) => {
    useMessageStore.getState().updateMessageStatus(data.messageId, 'delivered')
  })

  window.electronAPI.on('msg:withdrawn', (data: { messageId: string }) => {
    useMessageStore.getState().updateMessageStatus(data.messageId, 'recalled' as Message['status'])
  })
}
