import { useState, useRef, useEffect } from 'react'
import { useMessageStore, Message } from '@store/messageStore'
import { useUserStore } from '@store/userStore'
import MessageBubble from '@components/chat/MessageBubble'
import { parseAvatar } from './Sidebar'

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
function ChatHeader({ targetName, targetAvatar, targetStatus, onSearchClick }: { targetName: string; targetAvatar?: string; targetStatus?: string; onSearchClick?: () => void }): JSX.Element {
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

  const emoji = parseAvatar(targetAvatar)
  const isEmoji = emoji !== ''

  return (
    <div className="h-12 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center px-4 gap-2.5 flex-shrink-0">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold overflow-hidden"
        style={{ backgroundColor: isEmoji ? '#E5E7EB' : colors[colorIndex] }}
      >
        {isEmoji ? (
          <span className="text-base">{emoji}</span>
        ) : (
          <span className="text-white">{targetName.charAt(0)}</span>
        )}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-[var(--text-primary)]">{targetName}</div>
        <div className="text-xs" style={{ color: targetStatus ? statusColors[targetStatus] : 'var(--text-secondary)' }}>
          {targetStatus ? `● ${statusLabels[targetStatus]}` : ''}
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={onSearchClick}
          className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] transition-colors border-none bg-transparent cursor-pointer"
          title="搜索消息"
        >
          🔍
        </button>
      </div>
    </div>
  )
}

// 搜索面板组件
function SearchPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }): JSX.Element {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<Message[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const { searchMessages } = useMessageStore()
  const { userInfo } = useUserStore()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSearch = async () => {
    if (!keyword.trim()) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      const searchResults = await searchMessages(keyword.trim(), conversationId)
      setResults(searchResults)
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="absolute inset-0 z-50 bg-[var(--bg-base)] flex flex-col">
      <div className="h-12 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center px-4 gap-2 flex-shrink-0">
        <div className="flex items-center bg-[var(--bg-base)] rounded-md px-2 py-1 flex-1">
          <span className="text-[var(--text-secondary)] mr-2">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSearch}
            placeholder="搜索消息..."
            className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-disabled)]"
          />
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-colors border-none bg-transparent cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isSearching ? (
          <div className="flex items-center justify-center h-20 text-[var(--text-secondary)]">
            搜索中...
          </div>
        ) : results.length === 0 ? (
          keyword.trim() ? (
            <div className="flex items-center justify-center h-20 text-[var(--text-secondary)]">
              未找到相关消息
            </div>
          ) : (
            <div className="flex items-center justify-center h-20 text-[var(--text-disabled)]">
              输入关键词搜索消息
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((msg) => {
              const isSelf = msg.senderId === userInfo?.userId
              return (
                <div
                  key={msg.messageId}
                  className="p-2 bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${isSelf ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                      {isSelf ? '我' : msg.senderName}
                    </span>
                    <span className="text-xs text-[var(--text-disabled)]">
                      {formatTime(msg.sentAt)}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--text-primary)] line-clamp-2">
                    {msg.content}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// 预览文件类型
interface PendingFile {
  path: string
  name: string
  isImage: boolean
  previewUrl?: string
}

// 输入框组件
function MessageInput({ conversationId, disabled, targetId }: { conversationId: string; disabled?: boolean; targetId: string }): JSX.Element {
  const [message, setMessage] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
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

  // 获取文件图标
  const getFileIcon = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    const iconMap: Record<string, string> = {
      pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
      ppt: '📙', pptx: '📙', zip: '🗜️', rar: '🗜️', '7z': '🗜️',
      txt: '📄', mp3: '🎵', wav: '🎵', mp4: '🎬', avi: '🎬',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', bmp: '🖼️'
    }
    return iconMap[ext] || '📄'
  }

  // 发送单个文件
  const sendSingleFile = async (filePath: string) => {
    if (!targetId || !conversationId) return

    const fileName = getFileName(filePath)
    const isImage = isImageFile(fileName)

    try {
      // 先添加到本地消息列表（临时消息）
      const tempFileId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const content = isImage ? `local-resource:///${filePath.replace(/\\/g, '/')}` : fileName
      await sendFileMessage(conversationId, content, tempFileId, isImage)

      // 然后发送文件
      const result = await window.electronAPI.invoke<{ success: boolean; transferId?: string; error?: string }>('file:send', { to: targetId, filePath })

      if (result?.success && result.transferId) {
        const { useMessageStore } = await import('@store/messageStore')
        useMessageStore.getState().updateMessageFileId(tempFileId, result.transferId)
        useMessageStore.getState().updateMessageStatus(tempFileId, 'sending')
      } else {
        const { useMessageStore } = await import('@store/messageStore')
        useMessageStore.getState().updateMessageStatus(tempFileId, 'failed')
      }
    } catch (error) {
      console.error('发送文件失败:', error)
    }
  }

  // 将文件读取为 Data URL
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // 处理文件列表（拖拽或粘贴）
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      try {
        // 使用 Electron 的 webUtils.getPathForFile 获取文件路径
        let filePath = window.electronAPI.getFilePath(file)

        // 如果没有路径（从剪贴板粘贴的图片），先保存为临时文件
        if (!filePath) {
          const dataUrl = await readFileAsDataURL(file)
          const fileName = file.name || `clipboard-${Date.now()}.png`
          const result = await window.electronAPI.invoke<{ success: boolean; filePath?: string; error?: string }>('file:saveClipboardImage', {
            imageData: dataUrl,
            fileName
          })
          if (result?.success && result.filePath) {
            filePath = result.filePath
          } else {
            console.error('保存剪贴板图片失败:', result?.error)
            continue
          }
        }

        if (filePath) {
          await sendSingleFile(filePath)
        }
      } catch (error) {
        console.error('处理文件失败:', error)
      }
    }
  }

  // 拖拽事件处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled || !targetId) {
      alert('请先选择一个聊天对象')
      return
    }

    const files = e.dataTransfer.files
    handleFiles(files)
  }

  // 粘贴事件处理
  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled || !targetId) return

    const items = e.clipboardData.items
    const files: File[] = []

    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }

    if (files.length > 0) {
      e.preventDefault()
      // 使用 DataTransfer 创建 FileList
      const dataTransfer = new DataTransfer()
      files.forEach(file => dataTransfer.items.add(file))
      handleFiles(dataTransfer.files)
    }
  }

  // 移除待发送文件
  const removePendingFile = (index: number) => {
    setPendingFiles(prev => {
      const newFiles = [...prev]
      if (newFiles[index]?.previewUrl) {
        URL.revokeObjectURL(newFiles[index].previewUrl!)
      }
      newFiles.splice(index, 1)
      return newFiles
    })
  }

  // 清理预览URL
  useEffect(() => {
    return () => {
      pendingFiles.forEach(file => {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
      })
    }
  }, [])

  // 选择图片
  const handleSelectImage = async () => {
    try {
      const filePath = await window.electronAPI.invoke<string | null>('file:select')
      if (filePath && targetId) {
        const isImage = true
        // 先添加到本地消息列表（临时消息）
        // 图片临时消息的 content 使用 local-resource:// 协议 URL，以便立即显示
        const tempFileId = `temp-${Date.now()}`
        const imageUrl = `local-resource:///${filePath.replace(/\\/g, '/')}`
        await sendFileMessage(conversationId, imageUrl, tempFileId, isImage)
        // 然后发送文件
        const result = await window.electronAPI.invoke<{ success: boolean; transferId?: string; error?: string }>('file:send', { to: targetId, filePath })
        if (result?.success && result.transferId) {
          // 更新消息的 fileId（实际 transferId），并设置为发送中状态
          const { useMessageStore } = await import('@store/messageStore')
          useMessageStore.getState().updateMessageFileId(tempFileId, result.transferId)
          useMessageStore.getState().updateMessageStatus(tempFileId, 'sending')
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
        // 图片临时消息的 content 使用 local-resource:// 协议 URL，以便立即显示
        const content = isImage ? `local-resource:///${filePath.replace(/\\/g, '/')}` : fileName
        await sendFileMessage(conversationId, content, tempFileId, isImage)
        // 然后发送文件
        const result = await window.electronAPI.invoke<{ success: boolean; transferId?: string; error?: string }>('file:send', { to: targetId, filePath })
        if (result?.success && result.transferId) {
          // 更新消息的 fileId（实际 transferId），并设置为发送中状态
          const { useMessageStore } = await import('@store/messageStore')
          useMessageStore.getState().updateMessageFileId(tempFileId, result.transferId)
          useMessageStore.getState().updateMessageStatus(tempFileId, 'sending')
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

      {/* 拖拽提示遮罩 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-[var(--accent)]/20 border-2 border-dashed border-[var(--accent)] flex items-center justify-center pointer-events-none">
          <div className="text-[var(--accent)] text-lg font-medium flex items-center gap-2">
            <span>📁</span>
            <span>释放以发送文件</span>
          </div>
        </div>
      )}

      {/* 输入框 */}
      <div
        className="relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="输入消息，Enter 发送；支持拖拽或粘贴文件"
          disabled={disabled}
          rows={3}
          className="w-full px-3 py-2 text-sm text-[var(--text-primary)] bg-transparent outline-none resize-none min-h-[80px] max-h-[160px] overflow-y-auto placeholder-[var(--text-disabled)] font-inherit leading-relaxed"
          style={{ minHeight: '80px', maxHeight: '160px' }}
        />
      </div>

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
  const [showSearch, setShowSearch] = useState(false)

  // 获取当前会话
  const currentConversation = conversations.find((c) => c.conversationId === selectedConversationId)

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 关闭搜索面板时重置状态
  const handleCloseSearch = () => {
    setShowSearch(false)
  }

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

  // 显示搜索面板
  if (showSearch) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-base)] relative">
        <SearchPanel conversationId={selectedConversationId} onClose={handleCloseSearch} />
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
        targetAvatar={currentConversation.targetAvatar}
        targetStatus={currentConversation.targetStatus}
        onSearchClick={() => setShowSearch(true)}
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
    </div>
  )
}

export default ChatArea
