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

// 删除确认对话框组件
interface DeleteConfirmDialogProps {
  fileName: string
  count?: number
  isBatch?: boolean
  onConfirm: (deleteLocalFile: boolean) => void
  onCancel: () => void
}

function DeleteConfirmDialog({ fileName, count = 1, isBatch = false, onConfirm, onCancel }: DeleteConfirmDialogProps): JSX.Element {
  const [deleteLocalFile, setDeleteLocalFile] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-2xl w-[360px] overflow-hidden">
        {/* 标题栏 */}
        <div className="bg-[var(--accent)] px-4 py-3 flex items-center justify-between">
          <div className="text-white font-medium">{isBatch ? '批量删除文件记录' : '删除文件记录'}</div>
          <button
            onClick={onCancel}
            className="w-6 h-6 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors border-none bg-transparent cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4">
          {/* 提示文本 */}
          {isBatch ? (
            <div className="text-sm mb-4" style={{ color: '#1a1a1a' }}>
              确定要删除选中的 {count} 个文件记录吗？
            </div>
          ) : (
            <>
              <div className="text-sm mb-4" style={{ color: '#1a1a1a' }}>
                删除文件记录会删除该传输记录
              </div>
              {/* 文件信息 - 仅单文件删除时显示 */}
              <div className="bg-[var(--bg-base)] rounded-lg p-3 mb-4">
                <div className="text-sm font-medium truncate" style={{ color: '#1a1a1a' }}>
                  {fileName}
                </div>
              </div>
            </>
          )}

          {/* 勾选框 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteLocalFile}
              onChange={(e) => setDeleteLocalFile(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">同时删除本地文件</span>
          </label>
        </div>

        {/* 操作按钮 */}
        <div className="flex border-t border-[var(--border)]">
          <button
            onClick={onCancel}
            className="flex-1 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-colors border-none bg-transparent cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(deleteLocalFile)}
            className="flex-1 py-3 text-sm font-medium text-white hover:opacity-90 transition-colors border-none cursor-pointer"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

function FileRecordsPage({ isActive }: FileRecordsPageProps): JSX.Element {
  const [records, setRecords] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'send' | 'receive'>('all')
  const [deleteDialog, setDeleteDialog] = useState<{ file?: FileRecord; count?: number; isBatch?: boolean } | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [isBatchMode, setIsBatchMode] = useState(false)

  useEffect(() => {
    if (isActive) {
      loadRecords()
    }
  }, [isActive])

  // 当切换筛选条件时，清除选择
  useEffect(() => {
    setSelectedFiles(new Set())
    setIsBatchMode(false)
  }, [filter])

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

  const handleDeleteClick = (file: FileRecord, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteDialog({ file, isBatch: false })
  }

  const handleDeleteConfirm = async (deleteLocalFile: boolean) => {
    if (!deleteDialog) return

    if (deleteDialog.file) {
      // 单个删除
      const { file } = deleteDialog
      try {
        const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>('file:delete', {
          fileId: file.fileId,
          deleteLocalFile
        })

        if (result?.success) {
          setRecords(prev => prev.filter(r => r.fileId !== file.fileId))
          // 从选中列表中移除
          setSelectedFiles(prev => {
            const newSet = new Set(prev)
            newSet.delete(file.fileId)
            return newSet
          })
        } else {
          console.error('删除文件记录失败:', result?.error)
          alert('删除失败: ' + (result?.error || '未知错误'))
        }
      } catch (error) {
        console.error('删除文件记录失败:', error)
        alert('删除失败')
      }
    }

    setDeleteDialog(null)
  }

  // 批量删除相关功能
  const toggleFileSelection = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedFiles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(fileId)) {
        newSet.delete(fileId)
      } else {
        newSet.add(fileId)
      }
      return newSet
    })
  }

  const toggleAllSelection = () => {
    const filteredIds = filteredRecords.map(r => r.fileId)
    const allSelected = filteredIds.every(id => selectedFiles.has(id))

    if (allSelected) {
      // 取消全选
      setSelectedFiles(prev => {
        const newSet = new Set(prev)
        filteredIds.forEach(id => newSet.delete(id))
        return newSet
      })
    } else {
      // 全选
      setSelectedFiles(prev => {
        const newSet = new Set(prev)
        filteredIds.forEach(id => newSet.add(id))
        return newSet
      })
    }
  }

  const handleBatchDeleteClick = () => {
    if (selectedFiles.size === 0) return
    setDeleteDialog({ count: selectedFiles.size, isBatch: true })
  }

  const handleBatchDeleteConfirm = async (deleteLocalFile: boolean) => {
    const filesToDelete = Array.from(selectedFiles)
    let successCount = 0
    let failCount = 0

    for (const fileId of filesToDelete) {
      try {
        const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>('file:delete', {
          fileId,
          deleteLocalFile
        })

        if (result?.success) {
          successCount++
        } else {
          failCount++
        }
      } catch (error) {
        console.error('删除文件记录失败:', error)
        failCount++
      }
    }

    // 刷新列表
    await loadRecords()
    setSelectedFiles(new Set())
    setIsBatchMode(false)
    setDeleteDialog(null)

    if (failCount > 0) {
      alert(`删除完成: ${successCount} 个成功, ${failCount} 个失败`)
    }
  }

  const filteredRecords = records.filter(r => {
    if (filter === 'all') return true
    return r.direction === filter
  })

  const selectedCount = selectedFiles.size
  const isAllSelected = filteredRecords.length > 0 && filteredRecords.every(r => selectedFiles.has(r.fileId))

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
      {/* 删除确认对话框 */}
      {deleteDialog && (
        <DeleteConfirmDialog
          fileName={deleteDialog.file?.fileName || ''}
          count={deleteDialog.count}
          isBatch={deleteDialog.isBatch}
          onConfirm={deleteDialog.isBatch ? handleBatchDeleteConfirm : handleDeleteConfirm}
          onCancel={() => setDeleteDialog(null)}
        />
      )}

      {/* 头部 */}
      <div className="h-12 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center px-4 flex-shrink-0">
        <div className="text-sm font-semibold text-[var(--text-primary)]">文件传输记录</div>
        <div className="flex-1" />
        <div className="flex gap-1">
          {/* 批量选择按钮 - 放在全部按钮前面，样式一致 */}
          {!isBatchMode && filteredRecords.length > 0 && (
            <button
              onClick={() => setIsBatchMode(true)}
              className="px-2 py-1 text-xs rounded text-[var(--text-secondary)] hover:bg-[var(--bg-base)]"
            >
              批量选择
            </button>
          )}
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

      {/* 批量操作栏 */}
      {isBatchMode && (
        <div className="h-10 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center px-4 flex-shrink-0">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleAllSelection}
              className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              已选择 {selectedCount} 项
            </span>
          </label>
          <div className="flex-1" />
          {selectedCount > 0 && (
            <button
              onClick={handleBatchDeleteClick}
              className="px-3 py-1 text-xs text-white rounded hover:opacity-90 transition-colors"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              批量删除
            </button>
          )}
          <button
            onClick={() => {
              setIsBatchMode(false)
              setSelectedFiles(new Set())
            }}
            className="ml-2 px-3 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-base)] rounded transition-colors"
          >
            取消
          </button>
        </div>
      )}

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
                className={`p-3 bg-[var(--bg-surface)] rounded-lg border cursor-pointer transition-colors ${
                  selectedFiles.has(record.fileId)
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                    : 'border-[var(--border)] hover:border-[var(--accent)]'
                }`}
                onClick={() => {
                  if (isBatchMode) {
                    // 批量模式下点击切换选择
                    setSelectedFiles(prev => {
                      const newSet = new Set(prev)
                      if (newSet.has(record.fileId)) {
                        newSet.delete(record.fileId)
                      } else {
                        newSet.add(record.fileId)
                      }
                      return newSet
                    })
                  } else if (record.status === 'completed') {
                    handleOpenFile(record)
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  {/* 批量模式下的勾选框 */}
                  {isBatchMode && (
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(record.fileId)}
                      onChange={(e) => toggleFileSelection(record.fileId, e as unknown as React.MouseEvent)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] flex-shrink-0"
                    />
                  )}
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
                    {!isBatchMode && (
                      <div className="flex gap-2">
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
                        <button
                          onClick={(e) => handleDeleteClick(record, e)}
                          className="text-xs text-[var(--text-secondary)] hover:text-red-500"
                          title="删除记录"
                        >
                          🗑️
                        </button>
                      </div>
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
