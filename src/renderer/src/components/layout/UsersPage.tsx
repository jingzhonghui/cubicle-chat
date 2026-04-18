import { useState } from 'react'
import { useUserStore } from '@store/userStore'
import { useMessageStore } from '@store/messageStore'

interface UsersPageProps {
  onSelectUser: (userId: string) => void
}

// 头像组件
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
    large: 'w-12 h-12 text-[16px]'
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
        {name.charAt(0).toUpperCase()}
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
  const [searchQuery, setSearchQuery] = useState('')

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

      {/* 底部提示 */}
      <div className="px-4 py-2.5 border-t border-[var(--border)] flex-shrink-0">
        <div className="text-[11px] text-[var(--text-disabled)] text-center">
          局域网用户自动发现 · UDP 广播
        </div>
      </div>
    </div>
  )
}

export default UsersPage
