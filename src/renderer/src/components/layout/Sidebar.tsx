import { useState, useEffect } from 'react'
import { useMessageStore } from '@store/messageStore'
import { useUserStore } from '@store/userStore'
import UsersPage from './UsersPage'
import GroupsPage from './GroupsPage'

type PageType = 'chat' | 'users' | 'groups' | 'files' | 'settings'

// 内置头像映射（与 SettingsPage.tsx 保持一致）
const BUILTIN_AVATAR_MAP: Record<string, string> = {
  'cat': '🐱',
  'dog': '🐶',
  'fox': '🦊',
  'panda': '🐼',
  'rabbit': '🐰',
  'tiger': '🐯',
  'lion': '🦁',
  'bear': '🐻',
  'koala': '🐨',
  'pig': '🐷',
  'monkey': '🐵',
  'robot': '🤖',
  'alien': '👽',
  'ghost': '👻',
  'ninja': '🥷',
  'detective': '🕵️',
  'astronaut': '👨‍🚀',
  'scientist': '👨‍🔬',
  'artist': '👨‍🎨',
  'chef': '👨‍🍳',
  'student': '👨‍🎓',
  'business': '👨‍💼',
  'worker': '👨‍🔧',
  'farmer': '👨‍🌾',
  'pilot': '👨‍✈️',
  'police': '👮',
  'firefighter': '👨‍🚒',
  'doctor': '👨‍⚕️',
  'teacher': '👨‍🏫',
  'judge': '👨‍⚖️',
  'superhero': '🦸',
  'vampire': '🧛',
  'mage': '🧙',
  'fairy': '🧚',
  'angel': '👼',
  'devil': '😈',
  'clown': '🤡',
  'skull': '💀',
  'poo': '💩'
}

// 解析头像（返回 emoji 或空字符串表示使用默认首字母）
export function parseAvatar(avatar?: string): string {
  if (!avatar || avatar === 'default' || avatar === '') {
    return ''
  }
  // 兼容旧数据：如果 avatar 是 base64 图片，返回空（使用默认）
  if (avatar.startsWith('data:')) {
    return ''
  }
  return BUILTIN_AVATAR_MAP[avatar] || ''
}

interface SidebarProps {
  currentPage: PageType
  selectedConversationId: string | null
  onSelectConversation: (conversationId: string | null) => void
}

// 会话头像组件
function Avatar({
  name,
  color,
  avatar,
  size = 'normal',
  showStatus,
  status
}: {
  name: string
  color: string
  avatar?: string
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

  const emoji = parseAvatar(avatar)
  const isEmoji = emoji !== ''

  return (
    <div className={`relative ${sizeClasses[size].split(' ')[0]}`}>
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold flex-shrink-0 overflow-hidden`}
        style={{ backgroundColor: isEmoji ? '#E5E7EB' : color }}
      >
        {isEmoji ? (
          <span className={size === 'small' ? 'text-base' : size === 'large' ? 'text-base' : 'text-xl'}>{emoji}</span>
        ) : (
          <span className="text-white">{name.charAt(0)}</span>
        )}
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

// 右键菜单组件
function ContextMenu({
  x,
  y,
  onClose,
  onDelete,
  onClearAll,
  showDelete,
  showClearAll
}: {
  x: number
  y: number
  onClose: () => void
  onDelete: () => void
  onClearAll: () => void
  showDelete: boolean
  showClearAll: boolean
}): JSX.Element {
  useEffect(() => {
    const handleClick = () => onClose()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      className="fixed z-50 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[140px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {showClearAll && (
        <button
          className="w-full px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2"
          onClick={() => {
            onClearAll()
            onClose()
          }}
        >
          <span>🧹</span>
          <span>清空列表</span>
        </button>
      )}
      {showDelete && (
        <button
          className="w-full px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2"
          onClick={() => {
            onDelete()
            onClose()
          }}
        >
          <span>🗑️</span>
          <span>删除会话</span>
        </button>
      )}
    </div>
  )
}

// 会话项组件
function SessionItem({
  conversation,
  isActive,
  onClick,
  onContextMenu
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
  onContextMenu: (e: React.MouseEvent, conversationId?: string) => void
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
      onContextMenu={onContextMenu}
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
        avatar={conversation.targetAvatar}
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversationId: string | undefined } | null>(null)
  const { conversations, createConversation, deleteConversation, leaveGroup, deleteGroup } = useMessageStore()
  const { onlineUsers, userInfo } = useUserStore()

  // 从用户页面选择用户时处理会话创建
  const handleUserSelect = async (userId: string) => {
    // 检查是否已有会话
    const existingConv = conversations.find((c) => c.targetId === userId)
    if (existingConv) {
      onSelectConversation(existingConv.conversationId)
    } else {
      // 创建新会话
      const user = onlineUsers.find(u => u.userId === userId)
      const conv = await createConversation(userId, 'single', undefined, user ? {
        nickname: user.nickname,
        avatar: user.avatar,
        status: user.status
      } : undefined)
      if (conv) {
        // 再次检查（可能 createConversation 内部已经处理了）
        const updatedConv = useMessageStore.getState().conversations.find((c) => c.conversationId === conv.conversationId)
        if (updatedConv) {
          onSelectConversation(updatedConv.conversationId)
        }
      }
    }
  }

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, conversationId?: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, conversationId })
  }

  // 右键点击空白区域
  const handleListContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, conversationId: undefined })
  }

  // 删除会话
  const handleDeleteConversation = async (conversationId?: string) => {
    if (!conversationId) return

    const conv = conversations.find(c => c.conversationId === conversationId)
    if (!conv) return

    if (conv.type === 'group') {
      // 群聊：创建者可删除，其他成员可退出
      const isCreator = conv.creatorId === userInfo?.userId
      if (isCreator) {
        if (confirm('删除群聊会清空所有聊天记录')) {
          await deleteGroup(conv.targetId, conv.conversationId)
          if (selectedConversationId === conversationId) {
            onSelectConversation(null)
          }
        }
      } else {
        if (confirm('退出群聊后将不再接收消息')) {
          await leaveGroup(conv.targetId, conv.conversationId)
          if (selectedConversationId === conversationId) {
            onSelectConversation(null)
          }
        }
      }
    } else {
      if (confirm('删除会话会清空聊天记录')) {
        await deleteConversation(conversationId)
        if (selectedConversationId === conversationId) {
          onSelectConversation(null)
        }
      }
    }
  }

  // 清空列表
  const handleClearAll = async () => {
    if (confirm('清空列表会删除所有的聊天记录')) {
      // 删除所有会话
      for (const conv of conversations) {
        await deleteConversation(conv.conversationId)
      }
      // 清除选中状态
      onSelectConversation(null)
    }
  }

  // 根据当前页面显示不同内容
  // 用户页面显示在线用户列表
  if (currentPage === 'users') {
    return (
      <UsersPage
        onSelectUser={handleUserSelect}
      />
    )
  }

  // 群聊列表页面
  if (currentPage === 'groups') {
    return (
      <GroupsPage
        onSelectGroup={(conversationId) => onSelectConversation(conversationId)}
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
      <div className="flex-1 overflow-y-auto py-1" onContextMenu={handleListContextMenu}>
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--text-secondary)]">
            <span className="text-2xl opacity-40">💬</span>
            <span className="text-sm mt-2">
              {searchQuery ? '未找到匹配的会话' : '暂无会话'}
            </span>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            // 群聊始终显示为在线，单聊才查在线用户状态
            let targetStatus: string
            if (conv.type === 'group') {
              targetStatus = 'online'
            } else {
              const onlineUser = onlineUsers.find(u => u.userId === conv.targetId)
              targetStatus = onlineUser ? onlineUser.status : 'offline'
            }
            const enrichedConv = {
              ...conv,
              targetStatus
            }
            return (
              <SessionItem
                key={conv.conversationId}
                conversation={enrichedConv}
                isActive={selectedConversationId === conv.conversationId}
                onClick={() => onSelectConversation(conv.conversationId)}
                onContextMenu={(e) => handleContextMenu(e, conv.conversationId)}
              />
            )
          })
        )}

        {/* 右键菜单 */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onDelete={() => handleDeleteConversation(contextMenu.conversationId)}
            onClearAll={handleClearAll}
            showDelete={!!contextMenu.conversationId}
            showClearAll={true}
          />
        )}
      </div>
    </div>
  )
}

export default Sidebar
