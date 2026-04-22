import React, { useState, useRef, useEffect, useCallback } from 'react'

// 截图工具类型
type ToolType = 'select' | 'rectangle' | 'arrow' | 'brush' | 'text' | 'mosaic'

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

  // 工具状态
  const [currentTool, setCurrentTool] = useState<ToolType>('rectangle')
  const [currentColor, setCurrentColor] = useState(COLORS[0])
  const [strokeWidth, setStrokeWidth] = useState(3)

  // 标注列表
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null)
  const [history, setHistory] = useState<Annotation[][]>([[]])

  // 文字输入
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null)

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null)

  // 选区计算
  const selection = {
    x: Math.min(selectionStart.x, selectionEnd.x),
    y: Math.min(selectionStart.y, selectionEnd.y),
    width: Math.abs(selectionEnd.x - selectionStart.x),
    height: Math.abs(selectionEnd.y - selectionStart.y)
  }

  // 绘制背景和遮罩
  useEffect(() => {
    if (!overlayCanvasRef.current || !screenshotUrl) return

    const canvas = overlayCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.onload = () => {
      canvas.width = screenSize.width
      canvas.height = screenSize.height

      // 绘制背景图片
      ctx.drawImage(img, 0, 0, screenSize.width, screenSize.height)

      // 绘制半透明遮罩
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.fillRect(0, 0, screenSize.width, screenSize.height)
    }
    img.src = screenshotUrl
  }, [screenshotUrl, screenSize])

  // 绘制选区和标注
  useEffect(() => {
    if (!canvasRef.current) return

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

      // 重新绘制背景图片到选区
      if (screenshotUrl) {
        const img = new Image()
        img.onload = () => {
          ctx.save()
          ctx.beginPath()
          ctx.rect(selection.x, selection.y, selection.width, selection.height)
          ctx.clip()
          ctx.drawImage(img, 0, 0, screenSize.width, screenSize.height)
          ctx.restore()
        }
        img.src = screenshotUrl
      }

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
  }, [selection, screenshotUrl, screenSize])

  // 绘制标注
  useEffect(() => {
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
  }, [annotations, currentAnnotation, screenSize])

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
      case 'mosaic':
        if (ann.points && ann.points.length > 1 && screenshotUrl) {
          drawMosaic(ctx, ann.points, ann.strokeWidth)
        }
        break
      case 'text':
        if (ann.text && ann.rect) {
          ctx.font = `${ann.strokeWidth * 6}px sans-serif`
          ctx.fillText(ann.text, ann.rect.x, ann.rect.y)
        }
        break
    }
  }

  // 绘制箭头
  const drawArrow = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    const headLength = 15
    const angle = Math.atan2(y2 - y1, x2 - x1)

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fill()
  }

  // 绘制马赛克
  const drawMosaic = (ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], width: number) => {
    if (!screenshotUrl) return

    const img = new Image()
    img.onload = () => {
      // 获取像素数据
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = screenSize.width
      tempCanvas.height = screenSize.height
      const tempCtx = tempCanvas.getContext('2d')
      if (!tempCtx) return

      tempCtx.drawImage(img, 0, 0, screenSize.width, screenSize.height)

      // 对每个点周围区域应用马赛克
      const mosaicSize = width * 3
      const halfSize = mosaicSize / 2

      points.forEach(point => {
        const sx = Math.max(0, Math.floor(point.x - halfSize))
        const sy = Math.max(0, Math.floor(point.y - halfSize))
        const sw = Math.min(mosaicSize, screenSize.width - sx)
        const sh = Math.min(mosaicSize, screenSize.height - sy)

        if (sw <= 0 || sh <= 0) return

        const imageData = tempCtx.getImageData(sx, sy, sw, sh)
        const data = imageData.data

        // 简化像素（马赛克效果）
        for (let y = 0; y < sh; y += 4) {
          for (let x = 0; x < sw; x += 4) {
            const i = (y * sw + x) * 4
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]

            for (let ny = 0; ny < 4 && y + ny < sh; ny++) {
              for (let nx = 0; nx < 4 && x + nx < sw; nx++) {
                const ni = ((y + ny) * sw + (x + nx)) * 4
                data[ni] = r
                data[ni + 1] = g
                data[ni + 2] = b
              }
            }
          }
        }

        tempCtx.putImageData(imageData, sx, sy)

        // 绘制到主画布
        ctx.drawImage(tempCanvas, sx, sy, sw, sh, sx, sy, sw, sh)
      })
    }
    img.src = screenshotUrl
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

    // 如果没有选区，开始选区
    if (selection.width === 0 || currentTool !== 'select') {
      if (currentTool === 'rectangle' || currentTool === 'arrow') {
        setIsSelecting(true)
        setSelectionStart({ x, y })
        setSelectionEnd({ x, y })
      } else if (currentTool === 'brush' || currentTool === 'mosaic') {
        setIsSelecting(true)
        setSelectionStart({ x, y })
        setSelectionEnd({ x, y })
        setCurrentAnnotation({
          id: Date.now().toString(),
          type: currentTool,
          color: currentColor,
          strokeWidth,
          points: [{ x, y }]
        })
      } else if (currentTool === 'text') {
        // 文字输入
        setTextInput({ x, y, value: '' })
      }
      return
    }

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
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getCanvasCoords(e)

    if (isSelecting) {
      if (currentTool === 'brush' || currentTool === 'mosaic') {
        setCurrentAnnotation(prev => {
          if (!prev || !prev.points) return prev
          return {
            ...prev,
            points: [...prev.points, { x, y }]
          }
        })
      } else {
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
    if (isSelecting && currentAnnotation) {
      saveHistory()
      setAnnotations(prev => [...prev, currentAnnotation])
      setCurrentAnnotation(null)
    }

    if (isSelecting && (currentTool === 'rectangle' || currentTool === 'arrow')) {
      if (selection.width > 5 && selection.height > 5) {
        saveHistory()
        const ann: Annotation = {
          id: Date.now().toString(),
          type: currentTool,
          color: currentColor,
          strokeWidth,
          start: { x: selection.x, y: selection.y },
          end: { x: selection.x + selection.width, y: selection.y + selection.height },
          rect: { x: selection.x, y: selection.y, width: selection.width, height: selection.height }
        }
        setAnnotations(prev => [...prev, ann])
      }
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
        if (textInput) {
          setTextInput(null)
        } else {
          window.electronAPI.send('screenshot:cancel')
        }
      } else if (e.ctrlKey && e.key === 'z') {
        handleUndo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [textInput, handleUndo])

  // 文字提交
  const handleTextSubmit = () => {
    if (textInput && textInput.value.trim()) {
      saveHistory()
      const ann: Annotation = {
        id: Date.now().toString(),
        type: 'text',
        color: currentColor,
        strokeWidth,
        text: textInput.value,
        rect: { x: textInput.x, y: textInput.y, width: 0, height: 0 }
      }
      setAnnotations(prev => [...prev, ann])
    }
    setTextInput(null)
  }

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
    if (screenshotUrl) {
      const img = new Image()
      img.onload = () => {
        finalCtx.drawImage(
          img,
          selection.x, selection.y, selection.width, selection.height,
          0, 0, selection.width, selection.height
        )

        // 绘制标注（需要转换坐标）
        annotations.forEach(ann => {
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
      img.src = screenshotUrl
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
          title="矩形"
          active={currentTool === 'rectangle'}
          onClick={() => setCurrentTool('rectangle')}
        />
        <ToolButton
          icon="➡️"
          title="箭头"
          active={currentTool === 'arrow'}
          onClick={() => setCurrentTool('arrow')}
        />
        <ToolButton
          icon="✏️"
          title="画笔"
          active={currentTool === 'brush'}
          onClick={() => setCurrentTool('brush')}
        />
        <ToolButton
          icon="🔲"
          title="马赛克"
          active={currentTool === 'mosaic'}
          onClick={() => setCurrentTool('mosaic')}
        />
        <ToolButton
          icon="T"
          title="文字"
          active={currentTool === 'text'}
          onClick={() => setCurrentTool('text')}
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
          disabled={selection.width < 5 || selection.height < 5}
          className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          完成
        </button>
      </div>

      {/* 文字输入框 */}
      {textInput && (
        <div
          className="absolute"
          style={{ left: textInput.x, top: textInput.y }}
        >
          <input
            type="text"
            autoFocus
            value={textInput.value}
            onChange={e => setTextInput({ ...textInput, value: e.target.value })}
            onBlur={handleTextSubmit}
            onKeyDown={e => {
              if (e.key === 'Enter') handleTextSubmit()
              if (e.key === 'Escape') setTextInput(null)
            }}
            className="px-2 py-1 bg-white border-2 border-blue-500 rounded text-sm outline-none min-w-[100px]"
            style={{ color: currentColor, fontSize: strokeWidth * 6 }}
            placeholder="输入文字..."
          />
        </div>
      )}
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
