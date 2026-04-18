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
  isLoading: boolean

  // Actions
  loadConversations: () => Promise<void>
  loadMessages: (conversationId: string, limit?: number) => Promise<void>
  addMessage: (message: Message) => void
  sendMessage: (conversationId: string, content: string, contentType?: 'text' | 'emoji') => Promise<void>
  recallMessage: (messageId: string, conversationId: string) => Promise<void>
  updateMessageStatus: (messageId: string, status: Message['status']) => void
  updateMessageId: (oldId: string, newId: string) => void
  setCurrentConversation: (conversationId: string | null) => void
  createConversation: (targetId: string, type: 'single' | 'group', groupName?: string, targetInfo?: { nickname: string; avatar?: string; status?: string }) => Promise<Conversation | null>
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

  setCurrentConversation: (conversationId: string | null) => {
    set({ currentConversationId: conversationId })
    if (conversationId) {
      get().loadMessages(conversationId)
    }
  },

  createConversation: async (targetId: string, type: 'single' | 'group', groupName?: string, targetInfo?: { nickname: string; avatar?: string; status?: string }) => {
    try {
      // 先检查是否已存在
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
    conversationId: string
    senderId: string
    senderName: string
    contentType: string
    content: string
    sentAt: number
  }) => {
    const message: Message = {
      messageId: data.messageId,
      conversationId: data.conversationId,
      senderId: data.senderId,
      senderName: data.senderName,
      contentType: data.contentType as Message['contentType'],
      content: data.content,
      status: 'delivered',
      isRecalled: false,
      sentAt: data.sentAt,
      deliveredAt: Date.now()
    }

    const state = useMessageStore.getState()
    useMessageStore.getState().addMessage(message)
    
    // 如果当前正在这个会话中，刷新消息
    if (state.currentConversationId === data.conversationId) {
      useMessageStore.getState().loadMessages(data.conversationId)
    }
  })

  window.electronAPI.on('msg:ack', (data: { messageId: string }) => {
    useMessageStore.getState().updateMessageStatus(data.messageId, 'delivered')
  })

  window.electronAPI.on('msg:withdrawn', (data: { messageId: string }) => {
    useMessageStore.getState().updateMessageStatus(data.messageId, 'recalled' as Message['status'])
  })
}
