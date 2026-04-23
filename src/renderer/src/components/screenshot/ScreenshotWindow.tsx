import React, { useState, useRef, useEffect, useCallback } from 'react'

// 截图工具类型
type ToolType = 'select' | 'rectangle' | 'arrow' | 'brush'

// 标注元素
interface Annotation {
  id: string
  type: ToolType
  color: string
  strokeWidth: number
  points?: { x: number; y: number }[]
  rect?: { x: number; y: number; width: number; height: number }
  text?: string
  start?: { x: number; y: number }
  end?: { x: number; y: number }
}

// 颜色预设
const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#1C1C1E']

// Props 接口
interface ScreenshotWindowProps {
  screenshotImage: string
  screenWidth: number
  screenHeight: number
  scaleFactor: number
  onComplete: (data: { imageData: string; saveToClipboard: boolean }) => void
  onCancel: () => void
}

function ScreenshotWindow({ screenshotImage, screenWidth, screenHeight, scaleFactor, onComplete, onCancel }: ScreenshotWindowProps): JSX.Element {
  const [screenshotUrl] = useState<string>(screenshotImage)
  // 使用实际的像素尺寸（缩放后的尺寸）
  const dpr = window.devicePixelRatio || 1
  const [screenSize] = useState({ 
    width: Math.floor(screenWidth * dpr), 
    height: Math.floor(screenHeight * dpr) 
  })

  // 选区状态
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 })
  const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  
  // 标注矩形坐标（独立于选区，用于矩形/箭头工具的绘制预览）
  const [annotationRect, setAnnotationRect] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)

  // 工具状态
  const [currentTool, setCurrentTool] = useState<ToolType>('select')
  const [currentColor, setCurrentColor] = useState(COLORS[0])
  const [strokeWidth, setStrokeWidth] = useState(3)

  // 标注列表
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null)
  const [history, setHistory] = useState<Annotation[][]>([[]])

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null)
  
  // 缓存背景图片，避免重复加载导致的闪烁
  const backgroundImageRef = useRef<HTMLImageElement | null>(null)
  const isImageLoadedRef = useRef(false)

  // 选区计算
  const selection = {
    x: Math.min(selectionStart.x, selectionEnd.x),
    y: Math.min(selectionStart.y, selectionEnd.y),
    width: Math.abs(selectionEnd.x - selectionStart.x),
    height: Math.abs(selectionEnd.y - selectionStart.y)
  }
  
  // 是否已创建选区（用于控制完成按钮和标注工具）
  const hasSelection = selection.width > 5 && selection.height > 5

  // 初始化：只加载一次背景图片
  useEffect(() => {
    if (!screenshotUrl) return
    
    const img = new Image()
    img.onload = () => {
      backgroundImageRef.current = img
      isImageLoadedRef.current = true
      // 图片加载完成后，触发一次初始绘制
      drawOverlay()
      drawSelection()
    }
    img.src = screenshotUrl
    
    return () => {
      isImageLoadedRef.current = false
      backgroundImageRef.current = null
    }
  }, [screenshotUrl])

  // 绘制背景和遮罩 - 只在初始化时调用
  const drawOverlay = useCallback(() => {
    if (!overlayCanvasRef.current || !backgroundImageRef.current) return

    const canvas = overlayCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = screenSize.width
    canvas.height = screenSize.height

    // 绘制背景图片
    ctx.drawImage(backgroundImageRef.current, 0, 0, screenSize.width, screenSize.height)

    // 绘制半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(0, 0, screenSize.width, screenSize.height)
  }, [screenSize])

  // 绘制选区和标注
  const drawSelection = useCallback(() => {
    if (!canvasRef.current || !backgroundImageRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = screenSize.width
    canvas.height = screenSize.height

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 如果有选区
    if (selection.width > 0 && selection.height > 0) {
      // 清除选区内的遮罩（显示原图）
      ctx.clearRect(selection.x, selection.y, selection.width, selection.height)

      // 使用缓存的背景图片绘制到选区
      ctx.save()
      ctx.beginPath()
      ctx.rect(selection.x, selection.y, selection.width, selection.height)
      ctx.clip()
      ctx.drawImage(backgroundImageRef.current, 0, 0, screenSize.width, screenSize.height)
      ctx.restore()

      // 绘制选区边框
      ctx.strokeStyle = '#007AFF'
      ctx.lineWidth = 2
      ctx.strokeRect(selection.x, selection.y, selection.width, selection.height)

      // 绘制控制点
      const handleSize = 8
      ctx.fillStyle = '#007AFF'
      const handles = [
        { x: selection.x, y: selection.y },
        { x: selection.x + selection.width, y: selection.y },
        { x: selection.x, y: selection.y + selection.height },
        { x: selection.x + selection.width, y: selection.y + selection.height },
        { x: selection.x + selection.width / 2, y: selection.y },
        { x: selection.x + selection.width / 2, y: selection.y + selection.height },
        { x: selection.x, y: selection.y + selection.height / 2 },
        { x: selection.x + selection.width, y: selection.y + selection.height / 2 }
      ]
      handles.forEach(h => {
        ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize)
      })

      // 显示尺寸
      ctx.fillStyle = '#007AFF'
      ctx.font = '12px sans-serif'
      ctx.fillText(`${selection.width} × ${selection.height}`, selection.x, selection.y - 5)
    }
  }, [selection, screenSize])

  // 绘制标注
  const drawAnnotations = useCallback(() => {
    if (!annotationCanvasRef.current) return

    const canvas = annotationCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = screenSize.width
    canvas.height = screenSize.height

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 绘制历史标注
    annotations.forEach(ann => {
      drawAnnotation(ctx, ann)
    })

    // 绘制当前正在绘制的标注
    if (currentAnnotation) {
      drawAnnotation(ctx, currentAnnotation)
    }

    // 绘制矩形/箭头工具的实时预览
    if (annotationRect && (currentTool === 'rectangle' || currentTool === 'arrow')) {
      const { start, end } = annotationRect
      ctx.strokeStyle = currentColor
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      
      if (currentTool === 'rectangle') {
        ctx.strokeRect(
          Math.min(start.x, end.x),
          Math.min(start.y, end.y),
          Math.abs(end.x - start.x),
          Math.abs(end.y - start.y)
        )
      } else if (currentTool === 'arrow') {
        drawArrow(ctx, start.x, start.y, end.x, end.y)
      }
    }
  }, [annotations, currentAnnotation, annotationRect, currentTool, currentColor, strokeWidth, screenSize])

  // 当相关状态变化时重绘
  useEffect(() => {
    drawSelection()
  }, [drawSelection])

  useEffect(() => {
    drawAnnotations()
  }, [drawAnnotations])

  // 绘制标注的辅助函数
  const drawAnnotation = (ctx: CanvasRenderingContext2D, ann: Annotation) => {
    ctx.strokeStyle = ann.color
    ctx.fillStyle = ann.color
    ctx.lineWidth = ann.strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    switch (ann.type) {
      case 'rectangle':
        if (ann.rect) {
          ctx.strokeRect(ann.rect.x, ann.rect.y, ann.rect.width, ann.rect.height)
        }
        break
      case 'arrow':
        if (ann.start && ann.end) {
          drawArrow(ctx, ann.start.x, ann.start.y, ann.end.x, ann.end.y)
        }
        break
      case 'brush':
        if (ann.points && ann.points.length > 1) {
          ctx.beginPath()
          ctx.moveTo(ann.points[0].x, ann.points[0].y)
          for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x, ann.points[i].y)
          }
          ctx.stroke()
        }
        break
    }
  }

  // 绘制箭头
  const drawArrow = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    const headLength = 15
    const angle = Math.atan2(y2 - y1, x2 - x1)

    // 计算线条终点（在线条端点处留出箭头头部位置）
    const lineEndX = x2 - headLength * Math.cos(angle)
    const lineEndY = y2 - headLength * Math.sin(angle)

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(lineEndX, lineEndY)
    ctx.stroke()

    // 绘制箭头头部
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fill()
  }

  // 保存历史
  const saveHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-20), [...annotations]])
  }, [annotations])

  // 撤销
  const handleUndo = useCallback(() => {
    if (history.length > 1) {
      const newHistory = [...history]
      newHistory.pop()
      setHistory(newHistory)
      setAnnotations(newHistory[newHistory.length - 1] || [])
    }
  }, [history])

  // 鼠标事件处理
  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  const isInSelection = (x: number, y: number) => {
    return x >= selection.x && x <= selection.x + selection.width &&
           y >= selection.y && y <= selection.y + selection.height
  }

  const isOnHandle = (x: number, y: number) => {
    const handleSize = 12
    const handles = [
      { x: selection.x, y: selection.y },
      { x: selection.x + selection.width, y: selection.y },
      { x: selection.x, y: selection.y + selection.height },
      { x: selection.x + selection.width, y: selection.y + selection.height }
    ]

    for (const h of handles) {
      if (Math.abs(x - h.x) <= handleSize && Math.abs(y - h.y) <= handleSize) {
        return true
      }
    }
    return false
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getCanvasCoords(e)

    // ESC 取消
    if (e.button === 2) return

    // 选择工具逻辑
    if (currentTool === 'select') {
      // 如果已有选区，可以拖动调整
      if (hasSelection) {
        // 选区内的操作
        if (isInSelection(x, y)) {
          if (!isOnHandle(x, y)) {
            // 拖动选区
            setIsDragging(true)
            setDragOffset({ x: x - selection.x, y: y - selection.y })
          }
        } else {
          // 开始新的选区
          setIsSelecting(true)
          setSelectionStart({ x, y })
          setSelectionEnd({ x, y })
        }
      } else {
        // 没有选区时，点击创建选区
        setIsSelecting(true)
        setSelectionStart({ x, y })
        setSelectionEnd({ x, y })
      }
      return
    }

    // 标注工具（矩形、箭头、画笔、文字）- 只在有选区时有效
    if (!hasSelection) {
      return
    }
    
    // 如果点击在选区外，标注工具不生效
    if (!isInSelection(x, y)) {
      return
    }

    // 在选区内执行标注操作
    if (currentTool === 'rectangle' || currentTool === 'arrow') {
      // 矩形和箭头工具：使用独立的 annotationRect
      setIsSelecting(true)
      setAnnotationRect({ start: { x, y }, end: { x, y } })
    } else if (currentTool === 'brush') {
      setIsSelecting(true)
      setCurrentAnnotation({
        id: Date.now().toString(),
        type: 'brush',
        color: currentColor,
        strokeWidth,
        points: [{ x, y }]
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getCanvasCoords(e)

    if (isSelecting) {
      if (currentTool === 'rectangle' || currentTool === 'arrow') {
        // 矩形/箭头工具：更新独立的 annotationRect
        setAnnotationRect(prev => prev ? { ...prev, end: { x, y } } : null)
      } else if (currentTool === 'brush') {
        // 画笔工具：只在选区内绘制
        if (isInSelection(x, y)) {
          setCurrentAnnotation(prev => {
            if (!prev || !prev.points) return prev
            return {
              ...prev,
              points: [...prev.points, { x, y }]
            }
          })
        }
      } else if (currentTool === 'select') {
        // 选择工具：更新选区端点
        setSelectionEnd({ x, y })
      }
    } else if (isDragging) {
      const newX = Math.max(0, Math.min(x - dragOffset.x, screenSize.width - selection.width))
      const newY = Math.max(0, Math.min(y - dragOffset.y, screenSize.height - selection.height))
      setSelectionStart({ x: newX, y: newY })
      setSelectionEnd({ x: newX + selection.width, y: newY + selection.height })
    }
  }

  const handleMouseUp = () => {
    // 处理画笔/马赛克标注
    if (isSelecting && currentAnnotation) {
      saveHistory()
      setAnnotations(prev => [...prev, currentAnnotation])
      setCurrentAnnotation(null)
    }

    // 处理矩形/箭头标注
    if (isSelecting && annotationRect) {
      const { start, end } = annotationRect
      const width = Math.abs(end.x - start.x)
      const height = Math.abs(end.y - start.y)
      
      // 只有当绘制的矩形足够大时才创建标注
      if (width > 5 && height > 5) {
        saveHistory()
        
        if (currentTool === 'rectangle') {
          // 矩形：使用规范化坐标
          const ann: Annotation = {
            id: Date.now().toString(),
            type: 'rectangle',
            color: currentColor,
            strokeWidth,
            start: {
              x: Math.min(start.x, end.x),
              y: Math.min(start.y, end.y)
            },
            end: {
              x: Math.max(start.x, end.x),
              y: Math.max(start.y, end.y)
            },
            rect: {
              x: Math.min(start.x, end.x),
              y: Math.min(start.y, end.y),
              width,
              height
            }
          }
          setAnnotations(prev => [...prev, ann])
        } else if (currentTool === 'arrow') {
          // 箭头：保持原始起点和终点坐标
          const ann: Annotation = {
            id: Date.now().toString(),
            type: 'arrow',
            color: currentColor,
            strokeWidth,
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y },
            rect: {
              x: Math.min(start.x, end.x),
              y: Math.min(start.y, end.y),
              width,
              height
            }
          }
          setAnnotations(prev => [...prev, ann])
        }
      }
      setAnnotationRect(null)
    }

    setIsSelecting(false)
    setIsDragging(false)
    setIsResizing(false)
    setResizeHandle(null)
  }

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electronAPI.send('screenshot:cancel')
      } else if (e.ctrlKey && e.key === 'z') {
        handleUndo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo])

  // 完成截图
  const handleComplete = async () => {
    if (selection.width < 5 || selection.height < 5) {
      alert('请先选择截图区域')
      return
    }

    // 创建最终截图
    const finalCanvas = document.createElement('canvas')
    finalCanvas.width = selection.width
    finalCanvas.height = selection.height
    const finalCtx = finalCanvas.getContext('2d')
    if (!finalCtx) return

    // 绘制背景
    if (backgroundImageRef.current) {
      finalCtx.drawImage(
        backgroundImageRef.current,
        selection.x, selection.y, selection.width, selection.height,
        0, 0, selection.width, selection.height
      )

      // 绘制标注（需要转换坐标）
      const allAnnotations = currentAnnotation 
        ? [...annotations, currentAnnotation] 
        : annotations
      
      allAnnotations.forEach(ann => {
        const offsetAnn = { ...ann }
        if (ann.rect) {
          offsetAnn.rect = {
            x: ann.rect.x - selection.x,
            y: ann.rect.y - selection.y,
            width: ann.rect.width,
            height: ann.rect.height
          }
        }
        if (ann.start) {
          offsetAnn.start = {
            x: ann.start.x - selection.x,
            y: ann.start.y - selection.y
          }
        }
        if (ann.end) {
          offsetAnn.end = {
            x: ann.end.x - selection.x,
            y: ann.end.y - selection.y
          }
        }
        if (ann.points) {
          offsetAnn.points = ann.points.map(p => ({
            x: p.x - selection.x,
            y: p.y - selection.y
          }))
        }
        drawAnnotation(finalCtx, offsetAnn)
      })

      const imageData = finalCanvas.toDataURL('image/png')
      onComplete({ imageData, saveToClipboard: true })
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ cursor: 'crosshair' }}>
      {/* 底层画布：背景和遮罩 */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute top-0 left-0"
        style={{ 
          width: screenWidth, 
          height: screenHeight 
        }}
      />

      {/* 选区画布 */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0"
        style={{ 
          width: screenWidth, 
          height: screenHeight 
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      {/* 标注画布 */}
      <canvas
        ref={annotationCanvasRef}
        className="absolute top-0 left-0 pointer-events-none"
        style={{ 
          width: screenWidth, 
          height: screenHeight 
        }}
      />

      {/* 工具栏 */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white rounded-xl shadow-2xl p-2 flex items-center gap-1">
        <ToolButton
          icon="◻️"
          title="选择工具"
          active={currentTool === 'select'}
          onClick={() => setCurrentTool('select')}
        />
        <ToolButton
          icon="▢"
          title="矩形"
          active={currentTool === 'rectangle'}
          onClick={() => hasSelection && setCurrentTool('rectangle')}
          disabled={!hasSelection}
        />
        <ToolButton
          icon="➡️"
          title="箭头"
          active={currentTool === 'arrow'}
          onClick={() => hasSelection && setCurrentTool('arrow')}
          disabled={!hasSelection}
        />
        <ToolButton
          icon="✏️"
          title="画笔"
          active={currentTool === 'brush'}
          onClick={() => hasSelection && setCurrentTool('brush')}
          disabled={!hasSelection}
        />

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* 颜色选择 */}
        <div className="flex gap-0.5">
          {COLORS.map(color => (
            <button
              key={color}
              onClick={() => setCurrentColor(color)}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                currentColor === color ? 'border-gray-800 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* 撤销 */}
        <ToolButton
          icon="↩️"
          title="撤销 (Ctrl+Z)"
          onClick={handleUndo}
          disabled={history.length <= 1}
        />

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* 取消 */}
        <ToolButton
          icon="✕"
          title="取消 (Esc)"
          onClick={onCancel}
        />

        {/* 完成 */}
        <button
          onClick={handleComplete}
          disabled={!hasSelection}
          className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          完成
        </button>
      </div>
    </div>
  )
}

// 工具按钮组件
function ToolButton({ icon, title, active, onClick, disabled }: {
  icon: string
  title: string
  active?: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-base transition-colors ${
        active
          ? 'bg-blue-100 text-blue-600'
          : 'hover:bg-gray-100 text-gray-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {icon}
    </button>
  )
}

export default ScreenshotWindow
