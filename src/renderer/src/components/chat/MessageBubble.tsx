interface Message {
  messageId: string
  conversationId: string
  senderId: string
  senderName?: string
  contentType: 'text' | 'emoji' | 'image' | 'file' | 'system' | 'recall'
  content: string
  fileId?: string
  status: 'sending' | 'sent' | 'delivered' | 'failed'
  isRecalled: boolean
  sentAt: number
  deliveredAt?: number
}

interface MessageBubbleProps {
  message: Message
  isSelf: boolean
}

function MessageBubble({ message, isSelf }: MessageBubbleProps): JSX.Element {
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 撤回消息
  if (message.isRecalled || message.contentType === 'recall') {
    return (
      <div className="msg-row flex gap-2 my-1 items-end">
        <div className="msg-avatar w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-white bg-[var(--accent)]">
          {message.senderName?.charAt(0) || '?'}
        </div>
        <div className="flex flex-col gap-0.5 max-w-[65%]">
          {!isSelf && (
            <div className="text-[11px] text-[var(--text-secondary)] mb-0.5">
              {message.senderName}
            </div>
          )}
          <div className="text-[13px] text-[var(--text-secondary)] italic py-1">
            {message.senderName} 撤回了一条消息
          </div>
        </div>
      </div>
    )
  }

  // 文本/表情消息
  const renderContent = () => {
    switch (message.contentType) {
      case 'image':
        return (
          <div className="img-bubble rounded-lg overflow-hidden max-w-[200px] cursor-pointer img-bubble-border border border-[var(--border)]">
            <img src={message.content} alt="图片" className="w-full block" />
          </div>
        )
      case 'file':
        return (
          <div className={`file-bubble ${isSelf ? 'self' : ''}`}>
            <div className="flex items-center gap-2">
              <span className="text-[22px]">📄</span>
              <div>
                <div className="text-[13px] font-medium truncate max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {message.content}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  文件
                </div>
              </div>
            </div>
            <div className={`h-px my-2 ${isSelf ? 'bg-[rgba(255,255,255,0.2)]' : 'bg-[var(--border)]'}`} />
            <div className="flex gap-2">
              <button className="text-[12px] text-[var(--accent)] font-medium bg-transparent border-none cursor-pointer p-0">
                打开文件夹
              </button>
            </div>
          </div>
        )
      default:
        return (
          <div className={`bubble ${isSelf ? 'self' : 'other'}`}>
            {message.content}
          </div>
        )
    }
  }

  // 消息状态图标
  const renderStatus = () => {
    if (!isSelf) return null

    switch (message.status) {
      case 'sending':
        return <span className="text-[12px] text-[var(--text-disabled)]">发送中...</span>
      case 'failed':
        return <span className="text-[12px] text-[var(--error)]">❌</span>
      case 'delivered':
        return <span className="text-[12px] text-[var(--accent)]">✓✓</span>
      default:
        return <span className="text-[12px] text-[var(--accent)]">✓</span>
    }
  }

  const colors = ['#A4C8E8', '#A4E8B8', '#C4A4E8', '#E8D0A4', '#A4A4E8', '#E8A4A4', '#A4E8E0', '#E8C4A4']
  const colorIndex = message.senderName?.charCodeAt(0) % colors.length || 0
  const avatarBg = isSelf ? 'var(--accent)' : colors[colorIndex]

  return (
    <div className={`msg-row flex gap-2 my-1 items-end msg-animate ${isSelf ? 'flex-row-reverse' : ''}`}>
      {/* 头像 */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-white flex-shrink-0"
        style={{ backgroundColor: avatarBg }}
      >
        {message.senderName?.charAt(0) || '?'}
      </div>

      {/* 内容 */}
      <div className={`flex flex-col gap-0.5 ${isSelf ? 'items-end' : ''}`}>
        {/* 发送者名称 */}
        {!isSelf && (
          <div className="text-[11px] text-[var(--text-secondary)] mb-0.5">
            {message.senderName}
          </div>
        )}

        {/* 消息气泡 */}
        {renderContent()}

        {/* 元信息 */}
        <div className={`flex items-center gap-1 text-[11px] text-[var(--text-secondary)] ${isSelf ? 'flex-row-reverse' : ''}`}>
          <span>{formatTime(message.sentAt)}</span>
          {renderStatus()}
        </div>
      </div>
    </div>
  )
}

export default MessageBubble
