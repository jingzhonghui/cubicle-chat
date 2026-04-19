import { useState, useEffect } from 'react'
import { useMessageStore } from '../../store/messageStore'

interface Message {
  messageId: string
  conversationId: string
  senderId: string
  senderName?: string
  contentType: 'text' | 'emoji' | 'image' | 'file' | 'system' | 'recall'
  content: string
  fileId?: string
  status: 'sending' | 'sent' | 'delivered' | 'failed'
  isRecalled: boolean
  sentAt: number
  deliveredAt?: number
}

interface FileTransfer {
  transferId: string
  fileName: string
  fileSize: number
  progress: number
  speed: number
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'rejected'
  isImage: boolean
  direction?: 'send' | 'receive'
  filePath?: string
  thumbnailData?: string
}

// file:get IPC 返回的文件记录类型
interface FileRecord {
  fileId: string
  fileName: string
  filePath?: string
  fileSize: number
  mimeType: string
  fileMd5?: string
  direction: 'send' | 'receive'
  peerId: string
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'rejected'
  transferredBytes: number
  isImage: boolean
  thumbnailData?: string
  startedAt?: number
  completedAt?: number
  createdAt: number
}

interface MessageBubbleProps {
  message: Message
  isSelf: boolean
}

function MessageBubble({ message, isSelf }: MessageBubbleProps): JSX.Element {
  const [fileTransfer, setFileTransfer] = useState<FileTransfer | null>(null)
  const [imageUrl, setImageUrl] = useState<string>('')

  // 将本地文件路径转换为 local-resource:// 协议 URL
  // 使用三个斜杠 local-resource:/// 确保路径在 pathname 中
  // Windows 路径中的反斜杠需要转为正斜杠
  const toLocalResourceUrl = (filePath: string): string => {
    const normalizedPath = filePath.replace(/\\/g, '/')
    return `local-resource:///${normalizedPath}`
  }

  // 加载文件状态（组件挂载时从数据库获取）
  useEffect(() => {
    if (message.fileId && (message.contentType === 'file' || message.contentType === 'image')) {
      // 对于图片消息，如果 content 已经是 local-resource:// URL（发送中的临时消息），直接使用
      if (message.contentType === 'image' && message.content.startsWith('local-resource://')) {
        setImageUrl(message.content)
      }

      // 先从数据库加载文件状态
      window.electronAPI.invoke<FileRecord | null>('file:get', { fileId: message.fileId })
        .then((fileData) => {
          if (fileData) {
            // 转换为 FileTransfer 格式
            const transfer: FileTransfer = {
              transferId: fileData.fileId,
              fileName: fileData.fileName,
              fileSize: fileData.fileSize,
              direction: fileData.direction,
              status: fileData.status,
              progress: fileData.status === 'completed' ? 100 : 0,
              speed: 0,
              isImage: fileData.isImage,
              filePath: fileData.filePath,
              thumbnailData: fileData.thumbnailData
            }
            setFileTransfer(transfer)

            // 如果是图片且文件已完成传输，使用 local-resource:// 协议加载本地图片
            if (message.contentType === 'image' && fileData.status === 'completed' && fileData.filePath) {
              setImageUrl(toLocalResourceUrl(fileData.filePath))
            } else if (message.contentType === 'image' && fileData.thumbnailData) {
              // 传输中或未完成时，使用缩略图
              setImageUrl(fileData.thumbnailData)
            }
          }
        })
        .catch((error) => {
          console.error('加载文件状态失败:', error)
        })
    }
  }, [message.fileId, message.contentType])

  // 监听文件传输进度
  useEffect(() => {
    if (message.fileId && (message.contentType === 'file' || message.contentType === 'image')) {
      const unsubscribeProgress = window.electronAPI.on('file:progress', (data: FileTransfer) => {
        if (data.transferId === message.fileId) {
          setFileTransfer(data)
        }
      })

      const unsubscribeComplete = window.electronAPI.on('file:complete', (data: FileTransfer) => {
        if (data.transferId === message.fileId) {
          setFileTransfer(data)
          // 图片传输完成后，使用 local-resource:// 协议加载本地图片
          if (message.contentType === 'image' && data.status === 'completed' && data.filePath) {
            setImageUrl(toLocalResourceUrl(data.filePath))
          }
          // 更新消息状态
          if (data.status === 'completed') {
            useMessageStore.getState().updateMessageStatus(message.messageId, 'sent')
          } else if (data.status === 'failed') {
            useMessageStore.getState().updateMessageStatus(message.messageId, 'failed')
          }
        }
      })

      return () => {
        unsubscribeProgress()
        unsubscribeComplete()
      }
    }
  }, [message.fileId, message.contentType])

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  }

  // 打开文件所在文件夹
  const handleOpenFolder = async () => {
    if (message.fileId) {
      try {
        // 获取文件信息
        const files = await window.electronAPI.invoke<Array<{ fileId: string; filePath?: string }>>('file:getList')
        const file = files.find(f => f.fileId === message.fileId)
        if (file?.filePath) {
          await window.electronAPI.invoke('file:openFolder', { filePath: file.filePath })
        } else {
          console.error('文件路径不存在')
        }
      } catch (error) {
        console.error('打开文件夹失败:', error)
      }
    }
  }

  // 撤回消息
  if (message.isRecalled || message.contentType === 'recall') {
    return (
      <div className="msg-row flex gap-2 my-1 items-end max-w-[50%] self-start">
        <div className="msg-avatar w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-white bg-[var(--accent)]">
          {message.senderName?.charAt(0) || '?'}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          {!isSelf && (
            <div className="text-[11px] text-[var(--text-secondary)] mb-0.5">
              {message.senderName}
            </div>
          )}
          <div className="text-[13px] text-[var(--text-secondary)] italic py-1">
            {message.senderName} 撤回了一条消息
          </div>
        </div>
      </div>
    )
  }

  // 文件/图片消息
  const renderFileContent = () => {
    const isImage = message.contentType === 'image'
    const fileName = message.content
    const fileSize = fileTransfer?.fileSize
    const progress = fileTransfer?.progress || 0
    const speed = fileTransfer?.speed || 0
    const status = fileTransfer?.status || 'pending'

    // 获取文件图标
    const getFileIcon = (fileName: string): string => {
      const ext = fileName.split('.').pop()?.toLowerCase() || ''
      const iconMap: Record<string, string> = {
        pdf: '📕',
        doc: '📘', docx: '📘',
        xls: '📗', xlsx: '📗',
        ppt: '📙', pptx: '📙',
        zip: '🗜️', rar: '🗜️', '7z': '🗜️',
        txt: '📄',
        mp3: '🎵', wav: '🎵', ogg: '🎵',
        mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', bmp: '🖼️'
      }
      return iconMap[ext] || '📄'
    }

    // 图片消息
    if (isImage) {
      const handleDoubleClick = () => {
        if (imageUrl) {
          window.dispatchEvent(new CustomEvent('image:preview', {
            detail: { src: imageUrl, fileName: message.content }
          }))
        }
      }
      return (
        <div
          className="relative rounded-lg overflow-hidden max-w-[240px] cursor-pointer border border-[var(--border)]"
          onDoubleClick={handleDoubleClick}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="图片" className="w-full block max-h-[240px] object-cover" />
          ) : (
            <div className="w-[200px] h-[150px] bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-secondary)] text-sm">
              加载中...
            </div>
          )}
          {status === 'transferring' && (
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
              <div className="text-white text-sm font-medium">{progress}%</div>
              <div className="w-16 h-1 bg-white/30 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-white transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {status === 'pending' && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <div className="text-white text-xs">等待发送...</div>
            </div>
          )}
        </div>
      )
    }

    // 文件消息
    return (
      <div className={`file-bubble ${isSelf ? 'self' : ''}`} style={{
        maxWidth: '280px',
        padding: '12px',
        borderRadius: '12px',
        background: isSelf ? 'var(--accent)' : 'var(--bg-surface)',
        color: isSelf ? 'var(--text-on-accent)' : 'var(--text-primary)',
        border: isSelf ? 'none' : '1px solid var(--border)',
        borderBottomRightRadius: isSelf ? '4px' : undefined,
        borderBottomLeftRadius: !isSelf ? '4px' : undefined
      }}>
        <div className="flex items-center gap-2">
          <span className="text-[22px]">{getFileIcon(fileName)}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap">
              {fileName}
            </div>
            <div className="text-[11px] opacity-70 mt-0.5">
              {fileSize ? formatFileSize(fileSize) : '等待传输...'}
            </div>
          </div>
        </div>

        {/* 传输进度 - 渐变色进度条 */}
        {(status === 'transferring' || status === 'pending') && (
          <div className="mt-2">
            <div className="flex justify-between text-[11px] mb-1">
              <span className="opacity-70">{status === 'pending' ? '等待发送...' : `${progress}%`}</span>
              {status === 'transferring' && <span className="opacity-70">{formatSpeed(speed)}</span>}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: isSelf ? 'rgba(255,255,255,0.2)' : 'var(--bg-base)' }}>
              <div
                className="h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${status === 'pending' ? 0 : progress}%`,
                  background: 'linear-gradient(90deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)',
                  boxShadow: '0 0 4px rgba(16, 185, 129, 0.5)'
                }}
              />
            </div>
          </div>
        )}

        {/* 完成状态 - 绿色进度条 */}
        {status === 'completed' && (
          <div className="mt-2">
            <div className="flex justify-between text-[11px] mb-1">
              <span style={{ color: '#10b981' }}>✓ 传输完成</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: isSelf ? 'rgba(255,255,255,0.2)' : 'var(--bg-base)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: '100%',
                  background: 'linear-gradient(90deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)',
                  boxShadow: '0 0 4px rgba(16, 185, 129, 0.5)'
                }}
              />
            </div>
          </div>
        )}

        {/* 接收端显示打开文件夹按钮，发送端不显示 */}
        {status === 'completed' && !isSelf && (
          <div className="flex gap-2">
            <button
              onClick={handleOpenFolder}
              className="text-[12px] font-medium bg-transparent border-none cursor-pointer p-0 hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              打开文件夹
            </button>
          </div>
        )}

        {/* 失败状态 - 显示红色进度条 */}
        {status === 'failed' && (
          <div className="mt-2">
            <div className="flex justify-between text-[11px] mb-1">
              <span style={{ color: isSelf ? '#ffcccc' : 'var(--error)' }}>✗ 传输失败</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: isSelf ? 'rgba(255,255,255,0.2)' : 'var(--bg-base)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: '100%',
                  background: 'linear-gradient(90deg, #ef4444 0%, #f87171 50%, #fca5a5 100%)',
                  boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)'
                }}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  // 文本/表情消息
  const renderContent = () => {
    switch (message.contentType) {
      case 'image':
      case 'file':
        return renderFileContent()
      default:
        return (
          <div className={`bubble ${isSelf ? 'self' : 'other'}`}>
            {message.content}
          </div>
        )
    }
  }

  // 消息状态图标
  const renderStatus = () => {
    if (!isSelf) return null

    switch (message.status) {
      case 'sending':
        return <span className="text-[12px] text-[var(--text-disabled)]">发送中...</span>
      case 'failed':
        return <span className="text-[12px] text-[var(--error)]">❌</span>
      case 'delivered':
        return <span className="text-[12px] text-[var(--accent)]">✓✓</span>
      default:
        return <span className="text-[12px] text-[var(--accent)]">✓</span>
    }
  }

  const colors = ['#A4C8E8', '#A4E8B8', '#C4A4E8', '#E8D0A4', '#A4A4E8', '#E8A4A4', '#A4E8E0', '#E8C4A4']
  const colorIndex = message.senderName?.charCodeAt(0) % colors.length || 0
  const avatarBg = isSelf ? 'var(--accent)' : colors[colorIndex]

  return (
    <div className={`msg-row flex gap-2 my-1 items-end msg-animate max-w-[50%] ${isSelf ? 'flex-row-reverse self-end' : 'self-start'}`}>
      {/* 头像 */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-white flex-shrink-0"
        style={{ backgroundColor: avatarBg }}
      >
        {message.senderName?.charAt(0) || '?'}
      </div>

      {/* 内容 */}
      <div className={`flex flex-col gap-0.5 min-w-0 ${isSelf ? 'items-end' : ''}`}>
        {/* 发送者名称 */}
        {!isSelf && (
          <div className="text-[11px] text-[var(--text-secondary)] mb-0.5">
            {message.senderName}
          </div>
        )}

        {/* 消息气泡 */}
        {renderContent()}

        {/* 元信息 */}
        <div className={`flex items-center gap-1 text-[11px] text-[var(--text-secondary)] ${isSelf ? 'flex-row-reverse' : ''}`}>
          <span>{formatTime(message.sentAt)}</span>
          {renderStatus()}
        </div>
      </div>
    </div>
  )
}

export default MessageBubble
