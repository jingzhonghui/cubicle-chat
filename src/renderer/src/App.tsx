import { useState, useEffect } from 'react'
import TitleBar from '@components/layout/TitleBar'
import NavBar from '@components/layout/NavBar'
import Sidebar from '@components/layout/Sidebar'
import ChatArea from '@components/layout/ChatArea'
import { useUserStore, initUserStoreListeners } from '@store/userStore'
import { useMessageStore, initMessageStoreListeners } from '@store/messageStore'

type PageType = 'chat' | 'users' | 'files' | 'settings'

function App(): JSX.Element {
  const [currentPage, setCurrentPageState] = useState<PageType>('chat')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const { loadUserInfo, loadOnlineUsers } = useUserStore()
  const { loadConversations, setCurrentConversation, setCurrentPage } = useMessageStore()

  useEffect(() => {
    // 初始化事件监听
    const unsubscribeUser = initUserStoreListeners()
    const unsubscribeMessage = initMessageStoreListeners()

    // 初始化加载数据
    loadUserInfo()
    loadOnlineUsers()
    loadConversations()

    return () => {
      unsubscribeUser()
      unsubscribeMessage()
    }
  }, [loadUserInfo, loadOnlineUsers, loadConversations])

  const handleNavigate = (page: PageType) => {
    setCurrentPageState(page)
    setCurrentPage(page)
  }

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId)
    setCurrentConversation(conversationId)
    if (currentPage !== 'chat') {
      setCurrentPageState('chat')
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
