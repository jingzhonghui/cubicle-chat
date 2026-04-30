import { useState, useEffect } from 'react'
import { useUserStore } from '@store/userStore'
import { useMessageStore } from '@store/messageStore'
import { parseAvatar } from './Sidebar'

interface GroupsPageProps {
  onSelectGroup: (conversationId: string) => void
}

interface GroupInfo {
  groupId: string
  groupName: string
  memberIds: string[]
  creatorId: string
  conversationId?: string
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

function GroupItem({ group, onClick }: { group: GroupInfo; onClick: () => void }): JSX.Element {
  const memberCount = group.memberIds?.length || 0

  return (
    <div
      onClick={onClick}
      className="px-4 py-3 hover:bg-[var(--bg-base)] cursor-pointer border-b border-[var(--border)] last:border-b-0 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <span className="text-white">👫</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--text-primary)] truncate">
            {group.groupName}
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
  const [groups, setGroups] = useState<GroupInfo[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const { createGroup, createConversation } = useMessageStore()

  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    try {
      const groupList = await window.electronAPI.invoke<Array<{ groupId: string; groupName: string; memberIds: string[]; creatorId: string }>>('group:getList')
      setGroups(groupList)
    } catch (error) {
      console.error('加载群列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async (name: string, memberIds: string[]) => {
    const result = await createGroup(name, memberIds)
    if (result?.success) {
      setShowCreateGroup(false)
      await loadGroups()
    } else {
      alert(result?.error || '创建群聊失败')
    }
  }

  const filteredGroups = groups.filter((g) =>
    g.groupName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleGroupClick = async (groupId: string, groupName?: string) => {
    // 使用 messageStore 的 createConversation 确保新会话正确加入状态管理
    try {
      const conv = await createConversation(groupId, 'group', groupName)
      if (conv) {
        onSelectGroup(conv.conversationId)
      }
    } catch (error) {
      console.error('进入群聊失败:', error)
    }
  }

  if (loading) {
    return (
      <div className="w-[var(--sidebar-w)] bg-[var(--bg-surface)] border-r border-[var(--border)] flex items-center justify-center">
        <span className="text-[var(--text-secondary)]">加载中...</span>
      </div>
    )
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
              {searchQuery ? '未找到匹配的群聊' : '暂无群聊'}
            </span>
            {!searchQuery && (
              <span className="text-xs text-[var(--text-disabled)] mt-1">
                点击下方按钮创建群聊
              </span>
            )}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <GroupItem
              key={group.groupId}
              group={group}
              onClick={() => handleGroupClick(group.groupId, group.groupName)}
            />
          ))
        )}
      </div>

      {/* 底部创建群聊按钮 */}
      <div className="px-4 py-2.5 border-t border-[var(--border)] flex-shrink-0 flex items-center justify-between">
        <div className="text-[11px] text-[var(--text-disabled)]">
          点击创建新群聊
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