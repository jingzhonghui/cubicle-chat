import { useState } from 'react'
import { useUserStore } from '@store/userStore'
import { useMessageStore } from '@store/messageStore'
import { parseAvatar } from './Sidebar'

interface UsersPageProps {
  onSelectUser: (userId: string) => void
}

// 创建群聊弹窗
function CreateGroupModal({
  onClose,
  onCreate
}: {
  onClose: () => void
  onCreate: (name: string, memberIds: string[]) => void
}): JSX.Element {
  const { onlineUsers, userInfo } = useUserStore()
  const [groupName, setGroupName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleMember = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  const handleCreate = () => {
    if (!groupName.trim() || selectedIds.size === 0) return
    onCreate(groupName.trim(), Array.from(selectedIds))
    onClose()
  }

  const availableUsers = onlineUsers.filter((u) => u.userId !== userInfo?.userId)

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-lg w-[360px] max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text-primary)]">创建群聊</span>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-lg leading-none border-none bg-transparent cursor-pointer">✕</button>
        </div>

        <div className="px-4 py-3">
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="群聊名称"
            className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] rounded-lg outline-none border border-transparent focus:border-[var(--accent)] text-[var(--text-primary)] placeholder-[var(--text-disabled)]"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <div className="text-xs text-[var(--text-secondary)] mb-2">选择成员（{selectedIds.size} 人）</div>
          {availableUsers.length === 0 ? (
            <div className="text-sm text-[var(--text-disabled)] text-center py-4">暂无可添加的成员</div>
          ) : (
            availableUsers.map((user) => (
              <label
                key={user.userId}
                className="flex items-center gap-3 py-2 px-1 hover:bg-[var(--bg-base)] rounded-lg cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(user.userId)}
                  onChange={() => toggleMember(user.userId)}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
                <div className="flex-1 text-sm text-[var(--text-primary)]">{user.nickname}</div>
              </label>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] rounded-lg border-none bg-transparent cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!groupName.trim() || selectedIds.size === 0}
            className="px-4 py-1.5 text-sm bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed border-none cursor-pointer"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

// 头像组件
function Avatar({
  name,
  avatar,
  color,
  size = 'normal',
  showStatus,
  status
}: {
  name: string
  avatar?: string
  color: string
  size?: 'small' | 'normal' | 'large'
  showStatus?: boolean
  status?: string
}): JSX.Element {
  const sizeClasses = {
    small: 'w-8 h-8 text-[12px]',
    normal: 'w-10 h-10 text-[14px]',
    large: 'w-12 h-12 text-[16px]'
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
          <span className={size === 'large' ? 'text-2xl' : size === 'small' ? 'text-base' : 'text-xl'}>{emoji}</span>
        ) : (
          <span className="text-white">{name.charAt(0).toUpperCase()}</span>
        )}
      </div>
      {showStatus && status && (
        <span
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white"
          style={{ backgroundColor: statusColors[status] || statusColors.offline }}
        />
      )}
    </div>
  )
}

// 用户项组件
function UserItem({
  user,
  onMessageClick
}: {
  user: {
    userId: string
    nickname: string
    avatar?: string
    status: string
    ip: string
  }
  onMessageClick: (userId: string) => void
}): JSX.Element {
  const colors = ['#A4C8E8', '#A4E8B8', '#C4A4E8', '#E8D0A4', '#A4A4E8', '#E8A4A4', '#A4E8E0', '#E8C4A4']
  const colorIndex = user.userId.charCodeAt(0) % colors.length

  const statusLabels: Record<string, string> = {
    online: '在线',
    busy: '忙碌',
    away: '离开',
    offline: '离线'
  }

  const isOnline = user.status === 'online'

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-base)] transition-colors cursor-default">
      <Avatar
        name={user.nickname}
        avatar={user.avatar}
        color={colors[colorIndex]}
        size="normal"
        showStatus
        status={user.status}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
          {user.nickname}
        </div>
        <div className="text-xs text-[var(--text-secondary)] mt-0.5">
          {isOnline ? (
            <span className="text-[var(--status-online)]">● {statusLabels[user.status]}</span>
          ) : (
            <span className="text-[var(--text-disabled)]">{statusLabels[user.status]}</span>
          )}
        </div>
      </div>
      {isOnline && (
        <button
          onClick={() => onMessageClick(user.userId)}
          className="px-3 py-1.5 text-xs font-medium text-[var(--accent)] bg-[var(--accent-light)] rounded-md hover:bg-[var(--accent)] hover:text-white transition-colors"
        >
          发消息
        </button>
      )}
    </div>
  )
}

function UsersPage({ onSelectUser }: UsersPageProps): JSX.Element {
  const { onlineUsers } = useUserStore()
  const { createGroup } = useMessageStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    const result = await createGroup(name, memberIds)
    if (result?.success) {
      setShowCreateGroup(false)
    } else {
      alert(result?.error || '创建群聊失败')
    }
  }

  // 过滤用户
  const filteredUsers = onlineUsers.filter((user) =>
    user.nickname.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 按状态分组
  const onlineUsersList = filteredUsers.filter((u) => u.status === 'online')
  const offlineUsersList = filteredUsers.filter((u) => u.status !== 'online')

  // 直接将 userId 传给 Sidebar 的 handleUserSelect 处理
  const handleMessageClick = (userId: string) => {
    onSelectUser(userId)
  }

  return (
    <div className="w-[var(--sidebar-w)] bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col flex-shrink-0">
      {/* 头部 */}
      <div className="px-4 pt-3 pb-2.5 border-b border-[var(--border)] flex-shrink-0">
        <div className="text-sm font-semibold text-[var(--text-primary)] mb-2">
          联系人
          <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">
            ({onlineUsers.length} 人在线)
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--bg-input)] rounded-lg px-2.5 py-1.5">
          <span className="text-[var(--text-secondary)] text-sm">🔍</span>
          <input
            type="text"
            placeholder="搜索联系人..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)] placeholder-[var(--text-disabled)] font-inherit"
          />
        </div>
      </div>

      {/* 用户列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
            <span className="text-3xl opacity-40">👥</span>
            <span className="text-sm mt-3">
              {searchQuery ? '未找到匹配的联系人' : '暂无联系人'}
            </span>
            <span className="text-xs text-[var(--text-disabled)] mt-1">
              等待局域网内其他用户上线...
            </span>
          </div>
        ) : (
          <>
            {/* 在线用户 */}
            {onlineUsersList.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide flex items-center gap-2 sticky top-0 bg-[var(--bg-surface)] z-10">
                  在线
                  <span className="bg-[var(--bg-input)] text-[10px] px-1.5 py-0.5 rounded-full">
                    {onlineUsersList.length}
                  </span>
                </div>
                {onlineUsersList.map((user) => (
                  <UserItem
                    key={user.userId}
                    user={user}
                    onMessageClick={handleMessageClick}
                  />
                ))}
              </div>
            )}

            {/* 离线用户 */}
            {offlineUsersList.length > 0 && (
              <div className="mt-2">
                <div className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide flex items-center gap-2 sticky top-0 bg-[var(--bg-surface)] z-10">
                  离线
                  <span className="bg-[var(--bg-input)] text-[10px] px-1.5 py-0.5 rounded-full">
                    {offlineUsersList.length}
                  </span>
                </div>
                {offlineUsersList.map((user) => (
                  <UserItem
                    key={user.userId}
                    user={user}
                    onMessageClick={handleMessageClick}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="px-4 py-2.5 border-t border-[var(--border)] flex-shrink-0 flex items-center justify-between">
        <div className="text-[11px] text-[var(--text-disabled)]">
          局域网用户自动发现
        </div>
        <button
          onClick={() => setShowCreateGroup(true)}
          className="text-xs px-3 py-1.5 bg-[var(--accent-light)] text-[var(--accent)] rounded-md hover:bg-[var(--accent)] hover:text-white transition-colors border-none cursor-pointer"
        >
          + 创建群聊
        </button>
      </div>

      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreate={handleCreateGroup}
        />
      )}
    </div>
  )
}

export default UsersPage
