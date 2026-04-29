import { useUserStore } from '@store/userStore'
import { parseAvatar } from './Sidebar'

interface GroupMembersModalProps {
  groupName: string
  memberIds: string[]
  onClose: () => void
}

export default function GroupMembersModal({ groupName, memberIds, onClose }: GroupMembersModalProps): JSX.Element {
  const { userInfo, onlineUsers } = useUserStore()

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={handleBackdropClick}>
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-lg w-[360px] max-h-[70vh] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            群成员 ({memberIds.length})
          </span>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-lg leading-none border-none bg-transparent cursor-pointer">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {memberIds.map((memberId) => {
            const isMe = memberId === userInfo?.userId
            const onlineUser = onlineUsers.find((u) => u.userId === memberId)
            const memberName = onlineUser?.nickname || (isMe ? userInfo?.nickname : '未知用户')
            const memberAvatar = onlineUser?.avatar || (isMe ? userInfo?.avatar : undefined)
            const memberStatus = isMe ? (userInfo?.status || 'online') : (onlineUser?.status || 'offline')

            const avatarEmoji = parseAvatar(memberAvatar)
            const isEmoji = avatarEmoji !== ''
            const colors = ['#A4C8E8', '#A4E8B8', '#C4A4E8', '#E8D0A4', '#A4A4E8', '#E8A4A4', '#A4E8E0', '#E8C4A4']
            const colorIndex = memberName.charCodeAt(0) % colors.length

            return (
              <div
                key={memberId}
                className="px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-base)] transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0 overflow-hidden"
                  style={{ backgroundColor: isEmoji ? '#E5E7EB' : colors[colorIndex] }}
                >
                  {isEmoji ? (
                    <span className="text-base">{avatarEmoji}</span>
                  ) : (
                    <span className="text-white">{memberName.charAt(0)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)] truncate flex items-center gap-1">
                    {memberName}
                    {isMe && <span className="text-xs text-[var(--text-secondary)]">(我)</span>}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {memberStatus === 'online' ? '● 在线' : '○ 离线'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}