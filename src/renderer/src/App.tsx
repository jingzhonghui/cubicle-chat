import { useState, useEffect } from 'react'
import TitleBar from '@components/layout/TitleBar'
import NavBar from '@components/layout/NavBar'
import Sidebar from '@components/layout/Sidebar'
import ChatArea from '@components/layout/ChatArea'
import SettingsPage from '@components/layout/SettingsPage'
import FileRecordsPage from '@components/layout/FileRecordsPage'
import { ImageViewer } from '@components/chat/ImageViewer'
import ScreenshotWindow from '@components/screenshot/ScreenshotWindow'
import { useUserStore, initUserStoreListeners } from '@store/userStore'
import { useMessageStore, initMessageStoreListeners } from '@store/messageStore'
import { useSettingsStore } from '@store/settingsStore'

type PageType = 'chat' | 'users' | 'files' | 'settings'

// 解析截图参数
function parseScreenshotParams(): { image: string; width: number; height: number; scale: number } | null {
  const hash = window.location.hash
  if (!hash.startsWith('#/screenshot')) return null
  
  const params = new URLSearchParams(hash.split('?')[1] || '')
  // 支持 imagePath（新方式）或 image（旧方式）
  const imagePath = params.get('imagePath')
  const image = params.get('image')
  const width = parseInt(params.get('width') || '1920')
  const height = parseInt(params.get('height') || '1080')
  const scale = parseFloat(params.get('scale') || '1')
  
  // 使用文件路径或 base64 数据
  const imageData = imagePath || image
  if (!imageData) return null
  
  // 如果是文件路径，转换为 local-resource URL
  const screenshotImage = imagePath 
    ? `local-resource:///${imagePath.replace(/\\/g, '/')}`
    : imageData
  
  // 返回逻辑尺寸，供组件内部计算实际像素尺寸
  return { image: screenshotImage, width, height, scale }
}

function App(): JSX.Element {
  const [currentPage, setCurrentPageState] = useState<PageType>('chat')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<{ src: string; fileName?: string } | null>(null)
  // 同步解析截图参数
  const screenshotParams = parseScreenshotParams()
  const { loadUserInfo, loadOnlineUsers } = useUserStore()
  const { loadConversations, setCurrentConversation, setCurrentPage } = useMessageStore()
  const { loadSettings, applyTheme } = useSettingsStore()

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
    loadSettings().then(() => {
      applyTheme()
    })

    return () => {
      unsubscribeUser()
      unsubscribeMessage()
      window.removeEventListener('image:preview', handleImagePreview as EventListener)
    }
  }, [loadUserInfo, loadOnlineUsers, loadConversations, loadSettings, applyTheme])

  const handleNavigate = (page: PageType) => {
    setCurrentPageState(page)
    setCurrentPage(page)
  }

  const handleSelectConversation = (conversationId: string | null) => {
    setSelectedConversationId(conversationId)
    setCurrentConversation(conversationId)
    if (currentPage !== 'chat') {
      setCurrentPageState('chat')
      setCurrentPage('chat')
    }
  }

  // 截图窗口完成回调
  const handleScreenshotComplete = (data: { imageData: string; saveToClipboard: boolean }) => {
    window.electronAPI.send('screenshot:capture', data)
    // 重新加载主页面
    window.location.hash = ''
    window.location.reload()
  }

  const handleScreenshotCancel = () => {
    window.electronAPI.send('screenshot:cancel')
    // 重新加载主页面
    window.location.hash = ''
    window.location.reload()
  }

  // 如果是截图模式，只显示截图窗口
  if (screenshotParams) {
    return (
      <ScreenshotWindow
        screenshotImage={screenshotParams.image}
        screenWidth={screenshotParams.width}
        screenHeight={screenshotParams.height}
        scaleFactor={screenshotParams.scale}
        onComplete={handleScreenshotComplete}
        onCancel={handleScreenshotCancel}
      />
    )
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

        {/* 会话列表 - 设置页面或文件传输记录页面时不显示 */}
        {currentPage !== 'settings' && currentPage !== 'files' && (
          <Sidebar
            currentPage={currentPage}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
          />
        )}

        {/* 聊天区、设置页面或文件传输记录页面 */}
        {currentPage === 'settings' ? (
          <SettingsPage isActive={currentPage === 'settings'} />
        ) : currentPage === 'files' ? (
          <FileRecordsPage isActive={currentPage === 'files'} />
        ) : (
          <ChatArea
            currentPage={currentPage}
            selectedConversationId={selectedConversationId}
            onSelectUser={handleSelectConversation}
          />
        )}
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
