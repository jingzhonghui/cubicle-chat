import { useState, useRef, useEffect } from 'react'
import { useMessageStore } from '@store/messageStore'
import { useUserStore } from '@store/userStore'
import MessageBubble from '@components/chat/MessageBubble'
import FileReceiveModal, { useFileReceiveRequests } from '@components/chat/FileReceiveModal'

type PageType = 'chat' | 'users' | 'files' | 'settings'

interface ChatAreaProps {
  currentPage: PageType
  selectedConversationId: string | null
  onSelectUser: (userId: string) => void
}

// 空状态组件
function EmptyState(): JSX.Element {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
      <span className="text-5xl opacity-30">🌐</span>
      <div className="text-center">
        <div className="text-sm font-medium text-[var(--text-secondary)]">
          等待局域网内的小伙伴上线...
        </div>
        <div className="text-xs text-[var(--text-disabled)] mt-2 leading-relaxed">
          CubicleChat 正在扫描局域网<br />
          自动发现在线用户，无需手动配置
        </div>
        <div className="text-[11px] text-[var(--text-disabled)] mt-4">
          广播端口 2425 · 每 30 秒发送心跳
        </div>
      </div>
    </div>
  )
}

// 选择用户提示
function SelectUserHint(): JSX.Element {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
      <span className="text-5xl opacity-30">💬</span>
      <div className="text-center">
        <div className="text-sm font-medium text-[var(--text-secondary)]">
          选择一位在线用户开始聊天
        </div>
        <div className="text-xs text-[var(--text-disabled)] mt-2 leading-relaxed">
          点击左侧用户旁的"发消息"按钮<br />
          或直接在会话列表中找到该用户
        </div>
      </div>
    </div>
  )
}

// 聊天头组件
function ChatHeader({ targetName, targetStatus }: { targetName: string; targetStatus?: string }): JSX.Element {
  const colors = ['#A4C8E8', '#A4E8B8', '#C4A4E8', '#E8D0A4', '#A4A4E8', '#E8A4A4', '#A4E8E0', '#E8C4A4']
  const colorIndex = targetName.charCodeAt(0) % colors.length

  const statusColors: Record<string, string> = {
    online: 'var(--status-online)',
    busy: 'var(--status-busy)',
    away: 'var(--status-away)',
    offline: 'var(--status-offline)'
  }

  const statusLabels: Record<string, string> = {
    online: '在线',
    busy: '忙碌',
    away: '离开',
    offline: '离线'
  }

  return (
    <div className="h-12 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center px-4 gap-2.5 flex-shrink-0">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold text-white"
        style={{ backgroundColor: colors[colorIndex] }}
      >
        {targetName.charAt(0)}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-[var(--text-primary)]">{targetName}</div>
        <div className="text-xs" style={{ color: targetStatus ? statusColors[targetStatus] : 'var(--text-secondary)' }}>
          {targetStatus ? `● ${statusLabels[targetStatus]}` : ''}
        </div>
      </div>
      <div className="flex gap-1">
        <button className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] transition-colors border-none bg-transparent cursor-pointer" title="搜索消息">
          🔍
        </button>
        <button className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] transition-colors border-none bg-transparent cursor-pointer" title="更多操作">
          ⋯
        </button>
      </div>
    </div>
  )
}

// 输入框组件
function MessageInput({ conversationId, disabled, targetId }: { conversationId: string; disabled?: boolean; targetId: string }): JSX.Element {
  const [message, setMessage] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { sendMessage, sendFileMessage } = useMessageStore()

  const emojis = ['😀', '😂', '🥰', '😎', '🤔', '😅', '👍', '❤️', '🔥', '✅', '🎉', '💡', '📌', '🚀', '👀', '💬', '🎨', '📊', '🗓️', '⚡', '😭', '😡', '🙏', '👋', '✨', '🌟', '💪', '🤝', '👏', '🙌']

  const handleSend = async () => {
    if (!message.trim() || disabled) return

    await sendMessage(conversationId, message.trim())
    setMessage('')
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const insertEmoji = (emoji: string) => {
    setMessage((prev) => prev + emoji)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }

  // 从文件路径获取文件名
  const getFileName = (filePath: string): string => {
    return filePath.split(/[\\/]/).pop() || filePath
  }

  // 判断是否为图片
  const isImageFile = (fileName: string): boolean => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
    return imageExtensions.includes(ext)
  }

  // 选择图片
  const handleSelectImage = async () => {
    try {
      const filePath = await window.electronAPI.invoke<string | null>('file:select')
      if (filePath && targetId) {
        const fileName = getFileName(filePath)
        const isImage = true
        // 先添加到本地消息列表（临时消息）
        const tempFileId = `temp-${Date.now()}`
        await sendFileMessage(conversationId, fileName, tempFileId, isImage)
        // 然后发送文件
        const result = await window.electronAPI.invoke<{ success: boolean; transferId?: string; error?: string }>('file:send', { to: targetId, filePath })
        if (result?.success && result.transferId) {
          // 更新消息的 fileId（实际 transferId）
          const { useMessageStore } = await import('@store/messageStore')
          useMessageStore.getState().updateMessageFileId(tempFileId, result.transferId)
        } else {
          // 发送失败，更新状态
          const { useMessageStore } = await import('@store/messageStore')
          useMessageStore.getState().updateMessageStatus(tempFileId, 'failed')
        }
      }
    } catch (error) {
      console.error('发送图片失败:', error)
    }
  }

  // 选择文件
  const handleSelectFile = async () => {
    try {
      const filePath = await window.electronAPI.invoke<string | null>('file:select')
      if (filePath && targetId) {
        const fileName = getFileName(filePath)
        const isImage = isImageFile(fileName)
        // 先添加到本地消息列表（临时消息）
        const tempFileId = `temp-${Date.now()}`
        await sendFileMessage(conversationId, fileName, tempFileId, isImage)
        // 然后发送文件
        const result = await window.electronAPI.invoke<{ success: boolean; transferId?: string; error?: string }>('file:send', { to: targetId, filePath })
        if (result?.success && result.transferId) {
          // 更新消息的 fileId（实际 transferId）
          const { useMessageStore } = await import('@store/messageStore')
          useMessageStore.getState().updateMessageFileId(tempFileId, result.transferId)
        } else {
          // 发送失败，更新状态
          const { useMessageStore } = await import('@store/messageStore')
          useMessageStore.getState().updateMessageStatus(tempFileId, 'failed')
        }
      }
    } catch (error) {
      console.error('发送文件失败:', error)
    }
  }

  return (
    <div className="bg-[var(--bg-surface)] border-t border-[var(--border)] flex-shrink-0 relative">
      {/* 表情面板 */}
      {showEmoji && (
        <div className="absolute bottom-full left-0 z-50 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg p-2 w-[250px]">
          <div className="grid grid-cols-8 gap-0.5">
            {emojis.map((emoji, i) => (
              <button
                key={i}
                onClick={() => insertEmoji(emoji)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-xl hover:bg-[var(--bg-base)] transition-colors border-none bg-transparent cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center gap-0.5 px-3 border-b border-[var(--border)] h-9">
        <button
          onClick={handleSelectImage}
          className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] transition-colors border-none bg-transparent cursor-pointer"
          title="发送图片"
        >
          🖼️
        </button>
        <button
          onClick={handleSelectFile}
          className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] transition-colors border-none bg-transparent cursor-pointer"
          title="发送文件"
        >
          📎
        </button>
        <button
          onClick={() => setShowEmoji(!showEmoji)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] transition-colors border-none bg-transparent cursor-pointer"
          title="表情"
        >
          😊
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setMessage('')}
          className="text-[11px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] border-none bg-transparent cursor-pointer"
        >
          清空
        </button>
      </div>

      {/* 输入框 */}
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息，Enter 发送..."
        disabled={disabled}
        rows={3}
        className="w-full px-3 py-2 text-sm text-[var(--text-primary)] bg-transparent outline-none resize-none min-h-[80px] max-h-[160px] overflow-y-auto placeholder-[var(--text-disabled)] font-inherit leading-relaxed"
        style={{ minHeight: '80px', maxHeight: '160px' }}
      />

      {/* 底部 */}
      <div className="flex items-center justify-end px-3 pb-2 pt-0.5">
        <span className="text-[11px] text-[var(--text-secondary)]">
          Enter 发送 · Shift+Enter 换行
        </span>
      </div>
    </div>
  )
}

function ChatArea({ currentPage, selectedConversationId, onSelectUser }: ChatAreaProps): JSX.Element {
  const { conversations, messages } = useMessageStore()
  const { userInfo } = useUserStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 文件接收请求
  const { pendingRequest, acceptFile, rejectFile, closeModal } = useFileReceiveRequests()

  // 获取当前会话
  const currentConversation = conversations.find((c) => c.conversationId === selectedConversationId)

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 根据页面和会话状态显示不同内容
  if (currentPage !== 'chat') {
    return <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-base)]" />
  }

  if (!selectedConversationId) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-base)]">
        <EmptyState />
      </div>
    )
  }

  if (!currentConversation) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-base)]">
        <SelectUserHint />
      </div>
    )
  }

  // 格式化日期分隔
  const formatDateDivider = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    if (messageDate.getTime() === today.getTime()) {
      return '今天'
    } else if (messageDate.getTime() === today.getTime() - 86400000) {
      return '昨天'
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
    }
  }

  // 获取会话消息
  const conversationMessages = messages.filter(
    (m) => m.conversationId === selectedConversationId
  )

  // 渲染消息列表
  const renderMessages = () => {
    if (conversationMessages.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-[var(--text-disabled)]">
            <span className="text-3xl">💬</span>
            <div className="text-sm mt-2">开始对话吧</div>
          </div>
        </div>
      )
    }

    let lastDate = ''

    return conversationMessages.map((msg, index) => {
      const isSelf = msg.senderId === userInfo?.userId
      const showDateDivider =
        index === 0 ||
        formatDateDivider(msg.sentAt) !== formatDateDivider(conversationMessages[index - 1].sentAt)

      const elements: JSX.Element[] = []

      if (showDateDivider) {
        elements.push(
          <div key={`date-${msg.sentAt}`} className="text-center text-[11px] text-[var(--text-secondary)] my-2 relative">
            <span className="absolute left-0 right-1/2 top-1/2 h-px bg-[var(--border)]" style={{ width: 'calc(50% - 50px)', right: 'auto', left: 0 }} />
            {formatDateDivider(msg.sentAt)}
            <span className="absolute right-0 left-1/2 top-1/2 h-px bg-[var(--border)]" style={{ width: 'calc(50% - 50px)', left: 'auto', right: 0 }} />
          </div>
        )
      }

      elements.push(
        <MessageBubble
          key={msg.messageId}
          message={msg}
          isSelf={isSelf}
        />
      )

      return elements
    })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* 聊天头 */}
      <ChatHeader
        targetName={currentConversation.targetName}
        targetStatus={currentConversation.targetStatus}
      />

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-0.5">
        {renderMessages()}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <MessageInput
        conversationId={selectedConversationId}
        targetId={currentConversation.targetId}
      />

      {/* 文件接收弹窗 */}
      <FileReceiveModal
        request={pendingRequest}
        onAccept={acceptFile}
        onReject={rejectFile}
        onClose={closeModal}
      />
    </div>
  )
}

export default ChatArea
