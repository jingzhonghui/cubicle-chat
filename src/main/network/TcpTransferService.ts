import net from 'net'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { app } from 'electron'

// TCP 端口范围
const TCP_PORT_START = 2426
const TCP_PORT_END = 2499

// 分块大小策略
const CHUNK_SIZE = {
  SMALL: 128 * 1024,      // < 1 MB: 128KB
  MEDIUM: 512 * 1024,    // 1 - 100 MB: 512KB
  LARGE: 1024 * 1024     // > 100 MB: 1MB
}

// 文件传输状态
export type TransferStatus = 'pending' | 'transferring' | 'completed' | 'failed' | 'rejected' | 'cancelled'

// 文件传输信息
export interface FileTransfer {
  transferId: string
  fileName: string
  filePath: string
  fileSize: number
  fileMd5?: string
  mimeType: string
  direction: 'send' | 'receive'
  peerId: string
  peerIp: string
  status: TransferStatus
  transferredBytes: number
  isImage: boolean
  thumbnailData?: string
  progress: number
  speed: number
  startTime: number
}

// 传输进度回调
export type ProgressCallback = (transfer: FileTransfer) => void
// 传输完成回调
export type CompleteCallback = (transfer: FileTransfer, success: boolean, error?: string) => void

// TCP 帧类型
type TcpFrameType = 'HANDSHAKE' | 'HANDSHAKE_OK' | 'CHUNK' | 'CHUNK_END' | 'TRANSFER_DONE' | 'TRANSFER_ERROR' | 'CANCEL'

interface TcpFrame {
  type: TcpFrameType
  transferId?: string
  offset?: number
  fileMd5?: string
  seq?: number
  data?: string  // Base64 编码的数据
  totalSize?: number
  reason?: string
}

export class TcpTransferService {
  private mainWindow: BrowserWindow
  private server: net.Server | null = null
  private serverPort: number = TCP_PORT_START
  private transfers: Map<string, FileTransfer> = new Map()
  private pendingConnections: Map<string, net.Socket> = new Map()
  private onProgress: ProgressCallback | null = null
  private onComplete: CompleteCallback | null = null

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  setCallbacks(onProgress: ProgressCallback, onComplete: CompleteCallback): void {
    this.onProgress = onProgress
    this.onComplete = onComplete
  }

  // 启动 TCP 服务器
  async startServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const tryPort = (port: number): void => {
        this.server = net.createServer((socket) => {
          this.handleIncomingConnection(socket)
        })

        this.server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE' && port < TCP_PORT_END) {
            log.warn(`TCP 端口 ${port} 已被占用，尝试 ${port + 1}`)
            tryPort(port + 1)
          } else {
            log.error('TCP 服务器启动失败:', err)
            reject(err)
          }
        })

        this.server.listen(port, () => {
          this.serverPort = port
          log.info(`TCP 文件传输服务启动，监听端口: ${port}`)
          resolve(port)
        })
      }

      tryPort(TCP_PORT_START)
    })
  }

  // 获取服务器端口
  getServerPort(): number {
    return this.serverPort
  }

  // 关闭服务器
  closeServer(): void {
    if (this.server) {
      this.server.close()
      this.server = null
      log.info('TCP 文件传输服务已关闭')
    }
  }

  // 发送文件
  async sendFile(
    targetIp: string,
    targetPort: number,
    filePath: string,
    peerId: string,
    transferId: string,
    resumeOffset: number = 0
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        log.info(`开始发送文件: ${filePath} -> ${targetIp}:${targetPort}`)
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
          reject(new Error(`文件不存在: ${filePath}`))
          return
        }

        const stats = fs.statSync(filePath)
        const fileSize = stats.size
        const fileName = path.basename(filePath)
        log.info(`文件信息: ${fileName}, 大小: ${fileSize} bytes`)
        
        const fileMd5 = this.calculateFileMd5Sync(filePath)

        // 判断是否为图片
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
        const ext = path.extname(fileName).toLowerCase()
        const isImage = imageExtensions.includes(ext)

        // 获取 MIME 类型
        const mimeType = this.getMimeType(ext)

        // 更新或创建传输记录
        const transfer: FileTransfer = {
          transferId,
          fileName,
          filePath,
          fileSize,
          fileMd5,
          mimeType,
          direction: 'send',
          peerId,
          peerIp: targetIp,
          status: 'transferring',
          transferredBytes: resumeOffset,
          isImage,
          progress: 0,
          speed: 0,
          startTime: Date.now()
        }
        this.transfers.set(transferId, transfer)
        log.info(`传输记录已更新: ${transferId}, 状态: transferring`)

        // 连接到目标
        log.info(`正在连接到 ${targetIp}:${targetPort}...`)
        const socket = net.createConnection({ host: targetIp, port: targetPort }, () => {
          log.info(`已连接到 ${targetIp}:${targetPort}，开始发送文件: ${fileName}`)

          // 发送握手
          const handshake: TcpFrame = {
            type: 'HANDSHAKE',
            transferId,
            offset: resumeOffset,
            totalSize: fileSize
          }
          this.sendFrame(socket, handshake)
          log.info(`握手已发送: transferId=${transferId}`)

          // 开始发送文件
          this.sendFileChunks(socket, transfer, resumeOffset)
            .then(() => {
              log.info(`文件发送完成: ${fileName}`)
              transfer.status = 'completed'
              transfer.progress = 100
              this.notifyProgress(transfer)
              this.onComplete?.(transfer, true)
              socket.end()
              resolve()
            })
            .catch((err) => {
              log.error(`文件发送失败: ${err.message}`)
              transfer.status = 'failed'
              this.notifyProgress(transfer)
              this.onComplete?.(transfer, false, err.message)
              socket.end()
              reject(err)
            })
        })

        socket.on('error', (err) => {
          log.error(`TCP 连接错误: ${err.message}`)
          transfer.status = 'failed'
          this.notifyProgress(transfer)
          this.onComplete?.(transfer, false, err.message)
          reject(err)
        })

        socket.on('close', (hadError) => {
          if (hadError) {
            log.warn(`TCP 连接关闭（有错误）`)
          } else {
            log.info(`TCP 连接关闭（正常）`)
          }
        })

        // 监听服务器响应
        socket.on('data', (data) => {
          this.handleServerResponse(socket, data, transfer)
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  // 发送文件分块
  private async sendFileChunks(
    socket: net.Socket,
    transfer: FileTransfer,
    startOffset: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileSize = transfer.fileSize
      let offset = startOffset
      let seq = 0
      let lastUpdateTime = Date.now()
      let lastUpdateBytes = startOffset

      // 确定分块大小
      let chunkSize = CHUNK_SIZE.MEDIUM
      if (fileSize < 1024 * 1024) {
        chunkSize = CHUNK_SIZE.SMALL
      } else if (fileSize > 100 * 1024 * 1024) {
        chunkSize = CHUNK_SIZE.LARGE
      }

      const stream = fs.createReadStream(transfer.filePath, {
        start: offset,
        highWaterMark: chunkSize
      })

      stream.on('data', (chunk: Buffer) => {
        // 发送分块
        const frame: TcpFrame = {
          type: 'CHUNK',
          transferId: transfer.transferId,
          offset,
          seq: seq++,
          data: chunk.toString('base64')
        }
        this.sendFrame(socket, frame)

        offset += chunk.length
        transfer.transferredBytes = offset
        transfer.progress = Math.round((offset / fileSize) * 100)

        // 计算速度
        const now = Date.now()
        const elapsed = (now - lastUpdateTime) / 1000
        if (elapsed >= 0.5) {
          transfer.speed = (offset - lastUpdateBytes) / elapsed
          lastUpdateTime = now
          lastUpdateBytes = offset
          this.notifyProgress(transfer)
        }
      })

      stream.on('end', () => {
        // 发送结束标记
        const endFrame: TcpFrame = {
          type: 'CHUNK_END',
          transferId: transfer.transferId,
          fileMd5: transfer.fileMd5
        }
        this.sendFrame(socket, endFrame)
        resolve()
      })

      stream.on('error', (err) => {
        reject(err)
      })
    })
  }

  // 处理服务器响应
  private handleServerResponse(socket: net.Socket, data: Buffer, transfer: FileTransfer): void {
    try {
      const frames = this.extractFrames(data)
      for (const frame of frames) {
        if (frame.type === 'HANDSHAKE_OK') {
          log.info(`握手成功: ${transfer.transferId}`)
        } else if (frame.type === 'TRANSFER_DONE') {
          log.info(`传输完成确认: ${transfer.transferId}`)
        } else if (frame.type === 'TRANSFER_ERROR') {
          log.error(`传输错误: ${frame.reason}`)
          transfer.status = 'failed'
          this.notifyProgress(transfer)
          socket.end()
        } else if (frame.type === 'CANCEL') {
          log.info(`传输被取消: ${transfer.transferId}`)
          transfer.status = 'cancelled'
          this.notifyProgress(transfer)
          socket.end()
        }
      }
    } catch (err) {
      log.error(`处理服务器响应失败: ${err}`)
    }
  }

  // 处理传入连接
  private handleIncomingConnection(socket: net.Socket): void {
    let buffer = Buffer.alloc(0)
    let currentTransfer: FileTransfer | null = null
    let receiveStream: fs.WriteStream | null = null
    let receivedBytes = 0
    let expectedMd5: string | null = null

    socket.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data])

      // 解析并处理帧
      while (buffer.length >= 4) {
        const frameLength = buffer.readUInt32BE(0)
        if (buffer.length < 4 + frameLength) {
          break
        }

        const frameData = buffer.slice(4, 4 + frameLength)
        buffer = buffer.slice(4 + frameLength)

        try {
          const frame: TcpFrame = JSON.parse(frameData.toString('utf-8'))
          
          // 处理不同类型的帧
          switch (frame.type) {
            case 'HANDSHAKE': {
              const transferId = frame.transferId!
              const offset = frame.offset || 0
              const totalSize = frame.totalSize!

              log.info(`收到握手: transferId=${transferId}, offset=${offset}, totalSize=${totalSize}`)

              // 查找传输记录
              const transfer = this.transfers.get(transferId)
              if (!transfer) {
                log.error(`未找到传输记录: ${transferId}`)
                const errorFrame: TcpFrame = { type: 'TRANSFER_ERROR', reason: '未找到传输记录' }
                this.sendFrame(socket, errorFrame)
                socket.end()
                break
              }

              // 更新传输记录
              transfer.status = 'transferring'
              transfer.fileSize = totalSize
              currentTransfer = transfer
              receivedBytes = offset

              // 发送握手确认
              const ackFrame: TcpFrame = { type: 'HANDSHAKE_OK', transferId }
              this.sendFrame(socket, ackFrame)

              // 创建文件写入流
              try {
                receiveStream = fs.createWriteStream(transfer.filePath, { start: offset })
                log.info(`开始接收文件: ${transfer.fileName} -> ${transfer.filePath}`)
              } catch (err) {
                log.error(`创建文件写入流失败: ${err}`)
                const errorFrame: TcpFrame = { type: 'TRANSFER_ERROR', reason: String(err) }
                this.sendFrame(socket, errorFrame)
                socket.end()
              }
              break
            }

            case 'CHUNK': {
              const chunkData = Buffer.from(frame.data!, 'base64')
              if (receiveStream) {
                receiveStream.write(chunkData)
              }
              receivedBytes += chunkData.length
              if (currentTransfer) {
                currentTransfer.transferredBytes = receivedBytes
                currentTransfer.progress = Math.round((receivedBytes / currentTransfer.fileSize) * 100)
                this.notifyProgress(currentTransfer)
              }
              break
            }

            case 'CHUNK_END': {
              expectedMd5 = frame.fileMd5!
              log.info(`收到文件结束标记，期望 MD5: ${expectedMd5}`)
              
              // 关闭写入流
              if (receiveStream) {
                receiveStream.end(() => {
                  receiveStream = null
                  
                  // 验证 MD5
                  if (currentTransfer && expectedMd5) {
                    const actualMd5 = this.calculateFileMd5Sync(currentTransfer.filePath)
                    if (actualMd5 === expectedMd5) {
                      log.info(`文件 MD5 校验成功: ${currentTransfer.fileName}`)
                      currentTransfer.status = 'completed'
                      currentTransfer.progress = 100
                      const doneFrame: TcpFrame = { type: 'TRANSFER_DONE' }
                      this.sendFrame(socket, doneFrame)
                    } else {
                      log.error(`文件 MD5 校验失败: 期望 ${expectedMd5}, 实际 ${actualMd5}`)
                      currentTransfer.status = 'failed'
                      // 删除损坏的文件
                      fs.unlink(currentTransfer.filePath, () => {})
                    }
                    this.notifyProgress(currentTransfer)
                    this.onComplete?.(currentTransfer, currentTransfer.status === 'completed')
                    socket.end()
                  }
                })
              }
              break
            }

            case 'CANCEL': {
              log.info(`收到取消传输命令`)
              if (receiveStream) {
                receiveStream.end()
                receiveStream = null
              }
              if (currentTransfer) {
                currentTransfer.status = 'cancelled'
                this.notifyProgress(currentTransfer)
              }
              socket.end()
              break
            }
          }
        } catch (err) {
          log.error(`解析帧失败: ${err}`)
        }
      }
    })

    socket.on('error', (err) => {
      log.error(`接收连接错误: ${err.message}`)
      if (receiveStream) {
        receiveStream.end()
        receiveStream = null
      }
      if (currentTransfer) {
        currentTransfer.status = 'failed'
        this.notifyProgress(currentTransfer)
      }
    })

    socket.on('close', () => {
      if (receiveStream) {
        receiveStream.end()
        receiveStream = null
      }
    })
  }



  // 发送帧
  private sendFrame(socket: net.Socket, frame: TcpFrame): void {
    try {
      const data = Buffer.from(JSON.stringify(frame), 'utf-8')
      const lengthBuffer = Buffer.alloc(4)
      lengthBuffer.writeUInt32BE(data.length)
      socket.write(Buffer.concat([lengthBuffer, data]))
    } catch (err) {
      log.error(`发送帧失败: ${err}`)
    }
  }

  // 提取帧
  private extractFrames(buffer: Buffer): TcpFrame[] {
    const frames: TcpFrame[] = []
    let pos = 0

    while (pos < buffer.length && buffer.length - pos >= 4) {
      const frameLength = buffer.readUInt32BE(pos)
      if (buffer.length < pos + 4 + frameLength) {
        break
      }

      const frameData = buffer.slice(pos + 4, pos + 4 + frameLength)
      try {
        frames.push(JSON.parse(frameData.toString('utf-8')))
      } catch {
        // 忽略解析失败的帧
      }
      pos += 4 + frameLength
    }

    return frames
  }

  // 计算文件 MD5 (同步)
  private calculateFileMd5Sync(filePath: string): string {
    const hash = crypto.createHash('md5')
    const data = fs.readFileSync(filePath)
    hash.update(data)
    return hash.digest('hex')
  }

  // 计算文件 MD5 (异步，流式)
  async calculateFileMd5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5')
      const stream = fs.createReadStream(filePath)

      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  // 获取 MIME 类型
  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.mov': 'video/quicktime',
      '.exe': 'application/x-msdownload',
      '.dll': 'application/x-msdownload'
    }

    return mimeTypes[ext] || 'application/octet-stream'
  }

  // 添加传输记录
  addTransfer(transfer: FileTransfer): void {
    this.transfers.set(transfer.transferId, transfer)
  }

  // 获取传输记录
  getTransfer(transferId: string): FileTransfer | undefined {
    return this.transfers.get(transferId)
  }

  // 获取所有传输记录
  getAllTransfers(): FileTransfer[] {
    return Array.from(this.transfers.values())
  }

  // 取消传输
  cancelTransfer(transferId: string): void {
    const transfer = this.transfers.get(transferId)
    if (transfer) {
      transfer.status = 'cancelled'
      this.notifyProgress(transfer)
      this.onComplete?.(transfer, false, '用户取消')
    }
  }

  // 通知进度
  private notifyProgress(transfer: FileTransfer): void {
    this.onProgress?.(transfer)

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (transfer.status === 'completed') {
        this.mainWindow.webContents.send('file:complete', transfer)
      } else {
        this.mainWindow.webContents.send('file:progress', transfer)
      }
    }
  }

  // 获取下载目录
  getDownloadPath(): string {
    const downloadPath = app.getPath('downloads')
    const cubicleChatPath = path.join(downloadPath, 'CubicleChat')
    
    // 确保目录存在
    if (!fs.existsSync(cubicleChatPath)) {
      fs.mkdirSync(cubicleChatPath, { recursive: true })
    }
    
    return cubicleChatPath
  }

  // 清理已完成的传输
  cleanupCompleted(): void {
    for (const [id, transfer] of this.transfers.entries()) {
      if (transfer.status === 'completed' || transfer.status === 'failed') {
        this.transfers.delete(id)
      }
    }
  }
}

// 生成 UUID
export function generateTransferId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
