import { useState, useEffect } from 'react'
import TitleBar from '@components/layout/TitleBar'
import NavBar from '@components/layout/NavBar'
import Sidebar from '@components/layout/Sidebar'
import ChatArea from '@components/layout/ChatArea'
import { ImageViewer } from '@components/chat/ImageViewer'
import { useUserStore, initUserStoreListeners } from '@store/userStore'
import { useMessageStore, initMessageStoreListeners } from '@store/messageStore'

type PageType = 'chat' | 'users' | 'files' | 'settings'

function App(): JSX.Element {
  const [currentPage, setCurrentPageState] = useState<PageType>('chat')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<{ src: string; fileName?: string } | null>(null)
  const { loadUserInfo, loadOnlineUsers } = useUserStore()
  const { loadConversations, setCurrentConversation, setCurrentPage } = useMessageStore()

  useEffect(() => {
    // 初始化事件监听
    const unsubscribeUser = initUserStoreListeners()
    const unsubscribeMessage = initMessageStoreListeners()

    // 图片预览事件
    const handleImagePreview = (e: CustomEvent<{ src: string; fileName?: string }>) => {
      setImagePreview(e.detail)
    }
    window.addEventListener('image:preview', handleImagePreview as EventListener)

    // 初始化加载数据
    loadUserInfo()
    loadOnlineUsers()
    loadConversations()

    return () => {
      unsubscribeUser()
      unsubscribeMessage()
      window.removeEventListener('image:preview', handleImagePreview as EventListener)
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

      {/* 图片查看器 */}
      {imagePreview && (
        <ImageViewer
          src={imagePreview.src}
          fileName={imagePreview.fileName}
          onClose={() => setImagePreview(null)}
        />
      )}
    </div>
  )
}

export default App
