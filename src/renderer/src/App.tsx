import { useState, useEffect } from 'react'
import TitleBar from '@components/layout/TitleBar'
import NavBar from '@components/layout/NavBar'
import Sidebar from '@components/layout/Sidebar'
import ChatArea from '@components/layout/ChatArea'
import { useUserStore } from '@store/userStore'
import { useMessageStore } from '@store/messageStore'

type PageType = 'chat' | 'users' | 'files' | 'settings'

function App(): JSX.Element {
  const [currentPage, setCurrentPage] = useState<PageType>('chat')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const { loadUserInfo, loadOnlineUsers } = useUserStore()
  const { loadConversations } = useMessageStore()

  useEffect(() => {
    // 初始化加载数据
    loadUserInfo()
    loadOnlineUsers()
    loadConversations()
  }, [loadUserInfo, loadOnlineUsers, loadConversations])

  const handleNavigate = (page: PageType) => {
    setCurrentPage(page)
  }

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId)
    if (currentPage !== 'chat') {
      setCurrentPage('chat')
    }
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-base)]">
      {/* 标题栏 */}
      <TitleBar />

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 导航栏 */}
        <NavBar
          currentPage={currentPage}
          onNavigate={handleNavigate}
        />

        {/* 会话列表 */}
        <Sidebar
          currentPage={currentPage}
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
        />

        {/* 聊天区 */}
        <ChatArea
          currentPage={currentPage}
          selectedConversationId={selectedConversationId}
          onSelectUser={handleSelectConversation}
        />
      </div>
    </div>
  )
}

export default App
