import { useState, useEffect } from 'react'

interface FileReceiveRequest {
  transferId: string
  fileName: string
  fileSize: number
  fileMd5: string
  mimeType: string
  isImage: boolean
  thumbnailData?: string
  fromUserId: string
  fromNickname: string
  fromAvatar?: string
  peerIp: string
  tcpPort: number
}

interface FileReceiveModalProps {
  request: FileReceiveRequest | null
  onAccept: (transferId: string) => void
  onReject: (transferId: string) => void
  onClose: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function getFileIcon(fileName: string): string {
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

function FileReceiveModal({ request, onAccept, onReject, onClose }: FileReceiveModalProps): JSX.Element | null {
  const [thumbnail, setThumbnail] = useState<string | null>(null)

  useEffect(() => {
    if (request?.isImage && request?.thumbnailData) {
      setThumbnail(request.thumbnailData)
    }
  }, [request])

  if (!request) return null

  const colors = ['#A4C8E8', '#A4E8B8', '#C4A4E8', '#E8D0A4', '#A4A4E8', '#E8A4A4', '#A4E8E0', '#E8C4A4']
  const colorIndex = request.fromNickname.charCodeAt(0) % colors.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-2xl w-[360px] overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-[var(--accent)] px-4 py-3 flex items-center justify-between">
          <div className="text-white font-medium">收到文件</div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors border-none bg-transparent cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4">
          {/* 用户信息 */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-semibold text-white"
              style={{ backgroundColor: colors[colorIndex] }}
            >
              {request.fromNickname.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {request.fromNickname}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                发送了一个文件
              </div>
            </div>
          </div>

          {/* 文件预览 */}
          <div className="bg-[var(--bg-base)] rounded-lg p-4 mb-4">
            {request.isImage && thumbnail ? (
              <div className="flex justify-center mb-3">
                <img
                  src={thumbnail}
                  alt="预览"
                  className="max-w-[200px] max-h-[150px] rounded-lg object-cover"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center mb-3">
                <span className="text-5xl">{getFileIcon(request.fileName)}</span>
              </div>
            )}
            <div className="text-sm font-medium text-[var(--text-primary)] text-center truncate">
              {request.fileName}
            </div>
            <div className="text-xs text-[var(--text-secondary)] text-center mt-1">
              {formatFileSize(request.fileSize)}
            </div>
          </div>

          {/* 安全提示 */}
          <div className="text-xs text-[var(--text-secondary)] mb-4 flex items-start gap-1.5">
            <span>🔒</span>
            <span>文件传输采用局域网直连，数据不会经过服务器</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex border-t border-[var(--border)]">
          <button
            onClick={() => onReject(request.transferId)}
            className="flex-1 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-colors border-none bg-transparent cursor-pointer"
          >
            拒绝
          </button>
          <button
            onClick={() => onAccept(request.transferId)}
            className="flex-1 py-3 text-sm font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors border-none bg-transparent cursor-pointer"
          >
            接收
          </button>
        </div>
      </div>
    </div>
  )
}

// 文件接收请求管理器
export function useFileReceiveRequests(): {
  pendingRequest: FileReceiveRequest | null
  acceptFile: (transferId: string) => Promise<void>
  rejectFile: (transferId: string) => void
  closeModal: () => void
} {
  const [pendingRequest, setPendingRequest] = useState<FileReceiveRequest | null>(null)

  useEffect(() => {
    const unsubscribe = window.electronAPI.on('file:receive-request', (...args: unknown[]) => {
      const data = args[0] as FileReceiveRequest
      console.log('收到文件接收请求:', data)
      setPendingRequest(data)
    })

    return unsubscribe
  }, [])

  const acceptFile = async (transferId: string) => {
    try {
      await window.electronAPI.invoke('file:accept', { transferId })
      setPendingRequest(null)
    } catch (error) {
      console.error('接受文件失败:', error)
    }
  }

  const rejectFile = async (transferId: string) => {
    try {
      await window.electronAPI.invoke('file:reject', { transferId })
      setPendingRequest(null)
    } catch (error) {
      console.error('拒绝文件失败:', error)
    }
  }

  const closeModal = () => {
    setPendingRequest(null)
  }

  return { pendingRequest, acceptFile, rejectFile, closeModal }
}

export default FileReceiveModal
