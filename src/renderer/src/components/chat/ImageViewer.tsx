import { useState, useEffect } from 'react'

interface ImageViewerProps {
  src: string
  fileName?: string
  onClose: () => void
}

export function ImageViewer({ src, fileName, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(s + 0.25, 3))
      } else if (e.key === '-') {
        setScale((s) => Math.max(s - 0.25, 0.25))
      } else if (e.key === '0') {
        setScale(1)
        setPosition({ x: 0, y: 0 })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale((s) => Math.max(0.25, Math.min(3, s + delta)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center cursor-move"
      onClick={onClose}
      onWheel={handleWheel}
    >
      {/* 工具栏 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/50 rounded-full px-4 py-2">
        <button
          className="text-white/80 hover:text-white text-sm px-2"
          onClick={(e) => { e.stopPropagation(); setScale((s) => Math.max(0.25, s - 0.25)) }}
        >
          缩小
        </button>
        <span className="text-white/80 text-sm min-w-[50px] text-center">{Math.round(scale * 100)}%</span>
        <button
          className="text-white/80 hover:text-white text-sm px-2"
          onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(3, s + 0.25)) }}
        >
          放大
        </button>
        <div className="w-px h-4 bg-white/30" />
        <button
          className="text-white/80 hover:text-white text-sm px-2"
          onClick={(e) => { e.stopPropagation(); setScale(1); setPosition({ x: 0, y: 0 }) }}
        >
          还原
        </button>
        <div className="w-px h-4 bg-white/30" />
        <button
          className="text-white/80 hover:text-white text-sm px-2"
          onClick={onClose}
        >
          关闭
        </button>
      </div>

      {/* 文件名 */}
      {fileName && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm bg-black/50 rounded-full px-4 py-1">
          {fileName}
        </div>
      )}

      {/* 说明 */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/40 text-xs">
        滚轮缩放 · 拖拽移动 · Esc 关闭
      </div>

      {/* 图片 */}
      <div
        className="relative"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={src}
          alt={fileName || '图片'}
          className="max-w-none transition-transform duration-150"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center'
          }}
          draggable={false}
        />
      </div>
    </div>
  )
}