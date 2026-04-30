import { useState, useEffect } from 'react'
import { useUserStore } from '@store/userStore'
import { parseAvatar } from './Sidebar'

interface GroupMembersModalProps {
  groupName: string
  memberIds: string[]
  isCreator?: boolean
  onInvite?: (userIds: string[]) => void
  onClose: () => void
}

export default function GroupMembersModal({ groupName, memberIds, isCreator, onInvite, onClose }: GroupMembersModalProps): JSX.Element {
  const { userInfo, onlineUsers } = useUserStore()
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [cachedUsers, setCachedUsers] = useState<Record<string, { nickname: string; avatar?: string }>>({})

  // 从数据库加载群成员信息（含离线用户）
  useEffect(() => {
    const offlineIds = memberIds.filter(id => {
      if (id === userInfo?.userId) return false
      return !onlineUsers.find(u => u.userId === id)
    })
    if (offlineIds.length === 0) return
    window.electronAPI.invoke<Array<{ userId: string; nickname: string; avatar?: string }>>('user:getByIds', offlineIds).then((users) => {
      const map: Record<string, { nickname: string; avatar?: string }> = {}
      for (const u of users) {
        map[u.userId] = { nickname: u.nickname, avatar: u.avatar }
      }
      setCachedUsers(map)
    })
  }, [memberIds, onlineUsers, userInfo?.userId])

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

  const handleInvite = () => {
    if (selectedIds.size === 0) return
    onInvite?.(Array.from(selectedIds))
    setShowInvitePanel(false)
    setSelectedIds(new Set())
  }

  const existingMemberIds = new Set(memberIds)
  const availableUsers = onlineUsers.filter((u) => u.userId !== userInfo?.userId && !existingMemberIds.has(u.userId))

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

        {/* 邀请成员面板 */}
        {showInvitePanel && (
          <div className="border-b border-[var(--border)] px-4 py-3 max-h-[200px] overflow-y-auto">
            <div className="text-xs text-[var(--text-secondary)] mb-2">选择要邀请的成员（{selectedIds.size} 人）</div>
            {availableUsers.length === 0 ? (
              <div className="text-sm text-[var(--text-disabled)] text-center py-2">暂无可添加的成员</div>
            ) : (
              availableUsers.map((user) => (
                <label
                  key={user.userId}
                  className="flex items-center gap-3 py-1.5 px-1 hover:bg-[var(--bg-base)] rounded-lg cursor-pointer"
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
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => { setShowInvitePanel(false); setSelectedIds(new Set()) }}
                className="px-3 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-base)] rounded-md border-none bg-transparent cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleInvite}
                disabled={selectedIds.size === 0}
                className="px-3 py-1 text-xs bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed border-none cursor-pointer"
              >
                邀请
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {memberIds.map((memberId) => {
            const isMe = memberId === userInfo?.userId
            const onlineUser = onlineUsers.find((u) => u.userId === memberId)
            const cached = cachedUsers[memberId]
            const memberName = onlineUser?.nickname || cached?.nickname || (isMe ? userInfo?.nickname : '未知用户')
            const memberAvatar = onlineUser?.avatar || cached?.avatar || (isMe ? userInfo?.avatar : undefined)
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

        {/* 底部邀请按钮（仅群主可见） */}
        {isCreator && (
          <div className="px-4 py-2.5 border-t border-[var(--border)] flex-shrink-0">
            <button
              onClick={() => setShowInvitePanel(true)}
              className="w-full py-1.5 text-sm bg-[var(--accent-light)] text-[var(--accent)] rounded-lg hover:bg-[var(--accent)] hover:text-white transition-colors border-none cursor-pointer"
            >
              + 邀请成员
            </button>
          </div>
        )}
      </div>
    </div>
  )
}