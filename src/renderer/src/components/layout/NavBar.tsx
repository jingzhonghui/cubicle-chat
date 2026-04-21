import { useUserStore } from '@store/userStore'
import { useMessageStore } from '@store/messageStore'
import { parseAvatar } from './Sidebar'

type PageType = 'chat' | 'users' | 'files' | 'settings'

interface NavBarProps {
  currentPage: PageType
  onNavigate: (page: PageType) => void
}

// 导航图标组件
function NavIcon({ type, badge }: { type: PageType; badge?: number }): JSX.Element {
  const icons: Record<PageType, { icon: string; label: string }> = {
    chat: { icon: '💬', label: '会话列表' },
    users: { icon: '👥', label: '联系人' },
    files: { icon: '📁', label: '文件' },
    settings: { icon: '⚙️', label: '设置' }
  }

  return (
    <span className="relative">
      <span className="text-lg" role="img" aria-label={icons[type].label}>
        {icons[type].icon}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-[var(--error)] text-white text-[9px] font-bold min-w-[14px] h-3.5 rounded-full flex items-center justify-center px-0.5">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </span>
  )
}

function NavBar({ currentPage, onNavigate }: NavBarProps): JSX.Element {
  const { userInfo, onlineUsers } = useUserStore()
  const { conversations } = useMessageStore()

  const navItems: PageType[] = ['chat', 'users', 'files', 'settings']

  // 获取在线用户数量（排除自己）
  const onlineCount = onlineUsers.length

  // 计算所有会话的总未读消息数
  const totalUnreadCount = conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0)

  // 获取头像显示
  const avatarEmoji = parseAvatar(userInfo?.avatar)
  const isEmoji = avatarEmoji !== ''
  const avatarChar = userInfo?.nickname?.charAt(0) || '?'

  return (
    <div className="w-[var(--nav-w)] bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col items-center py-2 gap-1 flex-shrink-0">
      {/* 用户头像 */}
      <button
        className="w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center cursor-pointer mb-2 relative no-drag overflow-hidden"
        style={{ backgroundColor: isEmoji ? '#E5E7EB' : 'var(--accent)' }}
        title={userInfo?.nickname || '我的资料'}
        onClick={() => onNavigate('settings')}
      >
        {isEmoji ? (
          <span className="text-base">{avatarEmoji}</span>
        ) : (
          <span className="text-white">{avatarChar}</span>
        )}
        <span
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-surface)]"
          style={{ backgroundColor: 'var(--status-online)' }}
        />
      </button>

      {/* 导航按钮 */}
      {navItems.map((page) => (
        <button
          key={page}
          onClick={() => onNavigate(page)}
          className={`
            w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer
            transition-all duration-150 border-none bg-transparent relative
            ${currentPage === page
              ? 'bg-[var(--accent-light)] text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]'
            }
          `}
          title={page === 'chat' ? '会话列表' : page === 'users' ? `联系人 (${onlineCount}人在线)` : page === 'files' ? '文件传输记录' : '设置'}
        >
          <NavIcon
            type={page}
            badge={page === 'chat' && totalUnreadCount > 0 ? totalUnreadCount : undefined}
          />
          {/* 选中状态指示器 */}
          {currentPage === page && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[var(--accent)] rounded-r-full" />
          )}
        </button>
      ))}
    </div>
  )
}

export default NavBar
