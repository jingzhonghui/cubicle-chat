import { useState, useEffect } from 'react'

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

interface FileRecordsPageProps {
  isActive?: boolean
}

function FileRecordsPage({ isActive }: FileRecordsPageProps): JSX.Element {
  const [records, setRecords] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'send' | 'receive'>('all')

  useEffect(() => {
    if (isActive) {
      loadRecords()
    }
  }, [isActive])

  const loadRecords = async () => {
    setLoading(true)
    try {
      const data = await window.electronAPI.invoke<FileRecord[]>('file:getList')
      setRecords(data || [])
    } catch (error) {
      console.error('加载文件记录失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusIcon = (status: FileRecord['status']): string => {
    switch (status) {
      case 'completed': return '✅'
      case 'failed': return '❌'
      case 'rejected': return '🚫'
      case 'transferring': return '📤'
      case 'pending': return '⏳'
    }
  }

  const handleOpenFile = async (file: FileRecord) => {
    if (file.filePath && file.status === 'completed') {
      await window.electronAPI.invoke('file:open', { filePath: file.filePath })
    }
  }

  const handleOpenFolder = async (file: FileRecord) => {
    if (file.filePath) {
      await window.electronAPI.invoke('file:openFolder', { filePath: file.filePath })
    }
  }

  const filteredRecords = records.filter(r => {
    if (filter === 'all') return true
    return r.direction === filter
  })

  const getFileIcon = (mimeType: string, isImage: boolean): string => {
    if (isImage) return '🖼️'
    if (mimeType.includes('pdf')) return '📕'
    if (mimeType.includes('word') || mimeType.includes('document')) return '📘'
    if (mimeType.includes('excel') || mimeType.includes('sheet')) return '📗'
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📙'
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️'
    if (mimeType.includes('text')) return '📄'
    if (mimeType.includes('audio')) return '🎵'
    if (mimeType.includes('video')) return '🎬'
    return '📎'
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-base)] overflow-hidden">
      {/* 头部 */}
      <div className="h-12 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center px-4 flex-shrink-0">
        <div className="text-sm font-semibold text-[var(--text-primary)]">文件传输记录</div>
        <div className="flex-1" />
        <div className="flex gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-2 py-1 text-xs rounded ${
              filter === 'all'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-base)]'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilter('send')}
            className={`px-2 py-1 text-xs rounded ${
              filter === 'send'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-base)]'
            }`}
          >
            发送
          </button>
          <button
            onClick={() => setFilter('receive')}
            className={`px-2 py-1 text-xs rounded ${
              filter === 'receive'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-base)]'
            }`}
          >
            接收
          </button>
        </div>
      </div>

      {/* 记录列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[var(--text-secondary)]">
            加载中...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-[var(--text-disabled)]">
            <span className="text-3xl">📁</span>
            <div className="text-sm">暂无传输记录</div>
          </div>
        ) : (
          <div className="p-2 flex flex-col gap-1">
            {filteredRecords.map(record => (
              <div
                key={record.fileId}
                className="p-3 bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer"
                onClick={() => record.status === 'completed' && handleOpenFile(record)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{getFileIcon(record.mimeType, record.isImage)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {record.fileName}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5 flex gap-2">
                      <span>{record.direction === 'send' ? '发送' : '接收'}</span>
                      <span>{formatSize(record.fileSize)}</span>
                      <span>{formatTime(record.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm">{getStatusIcon(record.status)}</span>
                    {record.filePath && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenFolder(record)
                        }}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        打开文件夹
                      </button>
                    )}
                  </div>
                </div>
                {record.status === 'transferring' && record.fileSize > 0 && (
                  <div className="mt-2 h-1.5 bg-[var(--bg-base)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--accent)] to-green-500 rounded-full transition-all"
                      style={{ width: `${(record.transferredBytes / record.fileSize) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default FileRecordsPage