import { useState } from 'react'
import { useMessageStore } from '@store/messageStore'
import { useUserStore } from '@store/userStore'
import { parseAvatar } from './Sidebar'

interface GroupsPageProps {
  onSelectGroup: (conversationId: string) => void
}

interface GroupItemProps {
  group: {
    conversationId: string
    targetId: string
    targetName: string
    targetAvatar?: string
    memberIds?: string[]
    creatorId?: string
  }
  onClick: () => void
}

function GroupItem({ group, onClick }: GroupItemProps): JSX.Element {
  const { userInfo, onlineUsers } = useUserStore()
  const memberCount = group.memberIds?.length || 0

  const avatarEmoji = parseAvatar(group.targetAvatar)
  const isEmoji = avatarEmoji !== ''

  return (
    <div
      onClick={onClick}
      className="px-4 py-3 hover:bg-[var(--bg-base)] cursor-pointer border-b border-[var(--border)] last:border-b-0 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg"
          style={{ backgroundColor: isEmoji ? '#E5E7EB' : 'var(--accent)' }}
        >
          {isEmoji ? <span>{avatarEmoji}</span> : <span className="text-white">👫</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--text-primary)] truncate">
            {group.targetName}
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-0.5">
            {memberCount} 位成员
          </div>
        </div>
        <div className="text-[var(--accent)]">›</div>
      </div>
    </div>
  )
}

export default function GroupsPage({ onSelectGroup }: GroupsPageProps): JSX.Element {
  const { conversations } = useMessageStore()
  const { userInfo } = useUserStore()
  const [searchQuery, setSearchQuery] = useState('')

  const groups = conversations.filter((c) => c.type === 'group')

  const filteredGroups = groups.filter((g) =>
    g.targetName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleGroupClick = (conversationId: string) => {
    onSelectGroup(conversationId)
  }

  return (
    <div className="w-[var(--sidebar-w)] bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col flex-shrink-0">
      {/* 头部 */}
      <div className="px-4 pt-3 pb-2.5 border-b border-[var(--border)] flex-shrink-0">
        <div className="text-sm font-semibold text-[var(--text-primary)] mb-2">
          我的群聊
          <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">
            ({groups.length} 个)
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--bg-input)] rounded-lg px-2.5 py-1.5">
          <span className="text-[var(--text-secondary)] text-sm">🔍</span>
          <input
            type="text"
            placeholder="搜索群聊..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--text-primary)] placeholder-[var(--text-disabled)] font-inherit"
          />
        </div>
      </div>

      {/* 群聊列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
            <span className="text-3xl opacity-40">👫</span>
            <span className="text-sm mt-3">
              {searchQuery ? '未找到���配的群聊' : '暂无群聊'}
            </span>
            {!searchQuery && (
              <span className="text-xs text-[var(--text-disabled)] mt-1">
                在联系人页面创建群聊
              </span>
            )}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <GroupItem
              key={group.conversationId}
              group={group}
              onClick={() => handleGroupClick(group.conversationId)}
            />
          ))
        )}
      </div>
    </div>
  )
}