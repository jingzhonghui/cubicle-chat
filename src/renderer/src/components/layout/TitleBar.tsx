import { useState, useEffect, useCallback } from 'react'

// 窗口控制按钮类型
type WindowButtonType = 'close' | 'minimize' | 'maximize'

interface WindowButtonProps {
  type: WindowButtonType
  isMaximized?: boolean
  onClick: () => void
}

function WindowButton({ type, isMaximized, onClick }: WindowButtonProps): JSX.Element {
  const baseClasses = 'w-3 h-3 rounded-full flex items-center justify-center hover:opacity-80 transition-all'

  const buttonStyles: Record<WindowButtonType, string> = {
    close: 'bg-[#FF5F57] hover:bg-[#FF453A]',
    minimize: 'bg-[#FFBC2E] hover:bg-[#FFA000]',
    maximize: 'bg-[#28C840] hover:bg-[#1DB954]'
  }

  const labels: Record<WindowButtonType, string> = {
    close: '关闭',
    minimize: '最小化',
    maximize: isMaximized ? '还原' : '最大化'
  }

  // 最大化按钮内部图标
  const MaximizeIcon = (): JSX.Element => {
    if (isMaximized) {
      // 双方块图标表示还原
      return (
        <svg className="w-1.5 h-1.5 text-black/60" viewBox="0 0 8 8" fill="currentColor">
          <rect x="0" y="2" width="6" height="6" rx="0.5" />
          <rect x="2" y="0" width="6" height="6" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      )
    }
    // 单方块图标表示最大化
    return (
      <svg className="w-1.5 h-1.5 text-black/60" viewBox="0 0 8 8" fill="currentColor">
        <rect x="0.5" y="0.5" width="7" height="7" rx="1" />
      </svg>
    )
  }

  // 最小化按钮内部图标
  const MinimizeIcon = (): JSX.Element => (
    <svg className="w-1.5 h-0.5 bg-black/60 rounded-full" viewBox="0 0 6 2">
      <rect width="6" height="2" rx="1" fill="currentColor" />
    </svg>
  )

  // 关闭按钮内部图标
  const CloseIcon = (): JSX.Element => (
    <svg className="w-1.5 h-1.5 text-black/60" viewBox="0 0 8 8" fill="currentColor">
      <path
        d="M1 1L7 7M7 1L1 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )

  const icons: Record<WindowButtonType, JSX.Element> = {
    close: <CloseIcon />,
    minimize: <MinimizeIcon />,
    maximize: <MaximizeIcon />
  }

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${buttonStyles[type]}`}
      aria-label={labels[type]}
      title={labels[type]}
    >
      {icons[type]}
    </button>
  )
}

function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  // 监听窗口最大化状态变化
  useEffect(() => {
    // 获取初始最大化状态
    window.electronAPI.invoke<boolean>('window:isMaximized').then(setIsMaximized)

    // 监听窗口状态变化
    const unsubscribe = window.electronAPI.on('window:maximized-change', (maximized: unknown) => {
      setIsMaximized(maximized as boolean)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleMinimize = useCallback(() => {
    window.electronAPI.send('window:minimize')
  }, [])

  const handleMaximize = useCallback(() => {
    window.electronAPI.send('window:maximize')
  }, [])

  const handleClose = useCallback(() => {
    window.electronAPI.send('window:close')
  }, [])

  return (
    <div className="h-8 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center px-3 drag-region no-select flex-shrink-0 select-none">
      {/* 左侧标题区域 */}
      <div className="flex-1 flex items-center drag-region">
        <span className="text-xs text-[var(--text-secondary)]">CubicleChat</span>
      </div>

      {/* 右侧窗口控制按钮 - 禁止拖拽 */}
      <div className="no-drag flex gap-2 pr-1">
        <WindowButton
          type="minimize"
          onClick={handleMinimize}
        />
        <WindowButton
          type="maximize"
          isMaximized={isMaximized}
          onClick={handleMaximize}
        />
        <WindowButton
          type="close"
          onClick={handleClose}
        />
      </div>
    </div>
  )
}

export default TitleBar
