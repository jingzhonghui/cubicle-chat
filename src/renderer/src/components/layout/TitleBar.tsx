import { useState, useEffect } from 'react'

function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // 获取初始最大化状态
    window.electronAPI.invoke<boolean>('window:isMaximized').then(setIsMaximized)
  }, [])

  const handleMinimize = () => {
    window.electronAPI.send('window:minimize')
  }

  const handleMaximize = () => {
    window.electronAPI.send('window:maximize')
    setIsMaximized(!isMaximized)
  }

  const handleClose = () => {
    window.electronAPI.send('window:close')
  }

  return (
    <div className="h-8 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center px-3 gap-1.5 drag-region no-select flex-shrink-0">
      {/* macOS 风格按钮 */}
      <div className="flex gap-1.5 mr-2">
        <button
          onClick={handleClose}
          className="w-3 h-3 rounded-full bg-[#FF5F57] hover:opacity-80 transition-opacity"
          aria-label="关闭"
        />
        <button
          onClick={handleMinimize}
          className="w-3 h-3 rounded-full bg-[#FFBC2E] hover:opacity-80 transition-opacity"
          aria-label="最小化"
        />
        <button
          onClick={handleMaximize}
          className="w-3 h-3 rounded-full bg-[#28C840] hover:opacity-80 transition-opacity"
          aria-label={isMaximized ? '还原' : '最大化'}
        />
      </div>

      {/* 标题 */}
      <div className="flex-1 text-center text-xs text-[var(--text-secondary)]">
        CubicleChat
      </div>
    </div>
  )
}

export default TitleBar
