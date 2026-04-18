import { useState } from 'react'
import { useMessageStore } from '@store/messageStore'
import UsersPage from './UsersPage'

type PageType = 'chat' | 'users' | 'files' | 'settings'

interface SidebarProps {
  currentPage: PageType
  selectedConversationId: string | null
  onSelectConversation: (conversationId: string) => void
}

// 会话头像组件
function Avatar({
  name,
  color,
  size = 'normal',
  showStatus,
  status
}: {
  name: string
  color: string
  size?: 'small' | 'normal' | 'large'
  showStatus?: boolean
  status?: string
}): JSX.Element {
  const sizeClasses = {
    small: 'w-8 h-8 text-[12px]',
    normal: 'w-10 h-10 text-[14px]',
    large: 'w-8 h-8 text-xs'
  }

  const statusColors: Record<string, string> = {
    online: 'var(--status-online)',
    busy: 'var(--status-busy)',
    away: 'var(--status-away)',
    offline: 'var(--status-offline)'
  }

  return (
    <div className={`relative ${sizeClasses[size].split(' ')[0]}`}>
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}
        style={{ backgroundColor: color }}
      >
        {name.charAt(0)}
      </div>
      {showStatus && status && (
        <span
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-surface)]"
          style={{ backgroundColor: statusColors[status] || statusColors.offline }}
        />
      )}
    </div>
  )
}

// 会话项组件
function SessionItem({
  conversation,
  isActive,
  onClick
}: {
  conversation: {
    conversationId: string
    targetName: string
    targetAvatar?: string
    targetStatus?: string
    lastMessage?: string
    lastMessageAt?: number
    unreadCount: number
    isPinned: boolean
  }
  isActive: boolean
  onClick: () => void
}): JSX.Element {
  const formatTime = (timestamp?: number): string => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const oneDay = 24 * 60 * 60 * 1000

    if (diff < oneDay) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } else if (diff < 2 * oneDay) {
      return '昨天'
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    }
  }

  const colors = ['#A4C8E8', '#A4E8B8', '#C4A4E8', '#E8D0A4', '#A4A4E8', '#E8A4A4', '#A4E8E0', '#E8C4A4']
  const colorIndex = conversation.conversationId.charCodeAt(0) % colors.length

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors
        ${isActive
          ? 'bg-[var(--accent-light)] border-l-[3px] border-[var(--accent)] pl-[9px]'
          : 'hover:bg-[var(--bg-base)]'
        }
      `}
    >
      <Avatar
        name={conversation.targetName}
        color={colors[colorIndex]}
        showStatus={!!conversation.targetStatus}
        status={conversation.targetStatus}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
          {conversation.targetName}
        </div>
        <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
          {conversation.lastMessage || '暂无消息'}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[11px] text-[var(--text-secondary)]">
          {formatTime(conversation.lastMessageAt)}
        </span>
        {conversation.unreadCount > 0 && (
          <span className="bg-[var(--error)] text-white text-[10px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
            {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
          </span>
        )}
      </div>
    </div>
  )
}

function Sidebar({ currentPage, selectedConversationId, onSelectConversation }: SidebarProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const { conversations } = useMessageStore()

  // 根据当前页面显示不同内容
  // 用户页面显示在线用户列表
  if (currentPage === 'users') {
    return (
      <UsersPage
        onSelectUser={(userId) => onSelectConversation(userId)}
      />
    )
  }

  // 其他非聊天页面显示空占位
  if (currentPage !== 'chat') {
    return <div className="w-[var(--sidebar-w)] bg-[var(--bg-surface)] border-r border-[var(--border)] flex-shrink-0" />
  }

  // 过滤会话
  const filteredConversations = conversations.filter((conv) =>
    conv.targetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (conv.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <div className="w-[var(--sidebar-w)] bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col flex-shrink-0">
      {/* 头部 */}
      <div className="px-3 pt-2.5 pb-2 border-b border-[var(--border)] flex-shrink-0">
        <div className="text-sm font-semibold text-[var(--text-primary)] mb-2">消息</div>
        <div className="flex items-center gap-1.5 bg-[var(--bg-input)] rounded-lg px-2.5 py-1.5">
          <span className="text-[var(--text-secondary)] text-sm">🔍</span>
          <input
            type="text"
            placeholder="搜索会话或消息..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)] placeholder-[var(--text-disabled)] font-inherit"
          />
        </div>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--text-secondary)]">
            <span className="text-2xl opacity-40">💬</span>
            <span className="text-sm mt-2">
              {searchQuery ? '未找到匹配的会话' : '暂无会话'}
            </span>
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <SessionItem
              key={conv.conversationId}
              conversation={conv}
              isActive={selectedConversationId === conv.conversationId}
              onClick={() => onSelectConversation(conv.conversationId)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default Sidebar
