# UDP 协议与用户发现机制设计

**版本**：v1.0  
**日期**：2026-04-17

---

## 1. 概述

CubicleChat 的网络层使用两种协议：

| 协议 | 用途 | 端口 |
|------|------|------|
| **UDP** | 用户发现广播、即时消息传递 | 2425（广播/单播） |
| **TCP** | 文件/图片可靠传输 | 2426 |

UDP 端口 2425 与飞秋（FeiQ）兼容，**未来可实现与飞秋用户的基础互通**。

---

## 2. 用户发现机制

### 2.1 工作原理

采用**UDP 广播 + 心跳**机制，流程如下：

```
应用启动
    │
    ▼
绑定 UDP 端口 2425
    │
    ├─ 监听 UDP 广播（0.0.0.0:2425）
    │
    └─ 发送 ONLINE 广播包
         │  目标地址：255.255.255.255:2425
         ▼
    局域网内所有用户收到广播
         │
         └─ 每个收到广播的用户回复 ONLINE_ACK 单播包

定时任务：每 30 秒发送 HEARTBEAT 广播
    │
    └─ 超过 90 秒未收到 HEARTBEAT → 标记用户离线
```

### 2.2 状态机

```
           应用启动
               │
               ▼
         ┌─────────┐  收到 HEARTBEAT/ONLINE_ACK
         │  ONLINE  │◄──────────────────────────┐
         └─────────┘                             │
               │                                 │
               │  90s 无心跳                     │
               ▼                                 │
         ┌─────────┐                             │
         │ TIMEOUT  │  收到任意包 ─────────────►─┘
         └─────────┘
               │
               │  30s 后仍无响应
               ▼
         ┌─────────┐
         │ OFFLINE  │
         └─────────┘
               │
               │  收到 ONLINE 包
               ▼
         ┌─────────┐
         │  ONLINE  │
         └─────────┘
```

---

## 3. UDP 消息协议

### 3.1 数据包格式

所有 UDP 数据包使用 **JSON** 编码（UTF-8），外层固定格式：

```typescript
interface UdpPacket {
  // 协议头（固定）
  magic: "CCHT";            // 魔数，用于过滤无关广播包
  version: 1;               // 协议版本
  type: PacketType;         // 包类型（见下方枚举）
  msgId: string;            // UUID，用于去重/ACK
  timestamp: number;        // Unix timestamp（毫秒）

  // 发送方信息
  from: {
    userId: string;         // UUID（本机生成，持久化存储）
    nickname: string;       // 显示名称
    ip: string;             // 发送方 IP（接收方从 socket 取）
    port: number;           // TCP 文件传输端口（2426）
    avatar?: string;        // Base64 缩略头像（64x64 JPEG，最大 8KB）
    status: UserStatus;     // 'online' | 'busy' | 'away'
    version: string;        // 客户端版本号（用于兼容性检查）
  };

  // 消息载荷（依 type 不同）
  payload?: Record<string, unknown>;
}

type PacketType =
  | "ONLINE"          // 上线广播
  | "ONLINE_ACK"      // 上线回复
  | "HEARTBEAT"       // 心跳广播
  | "OFFLINE"         // 主动下线
  | "TEXT"            // 文本消息
  | "TEXT_ACK"        // 消息已接收确认
  | "WITHDRAW"        // 撤回消息
  | "FILE_NOTIFY"     // 文件传输通知
  | "FILE_ACCEPT"     // 接受文件
  | "FILE_REJECT"     // 拒绝文件
  | "GROUP_CREATE"    // 创建群组
  | "GROUP_INVITE"    // 群组邀请
  | "GROUP_MESSAGE"   // 群消息
  | "GROUP_LEAVE"     // 离开群组
  | "TYPING"          // 正在输入...
  | "STATUS_CHANGE";  // 状态变更
```

### 3.2 各类型 Payload 定义

#### ONLINE / HEARTBEAT / ONLINE_ACK
```typescript
// payload 为空，所有信息在 from 字段中
payload: undefined
```

#### OFFLINE
```typescript
payload: {
  reason?: "manual" | "crash";  // 下线原因（可选）
}
```

#### TEXT（单聊文本消息）
```typescript
payload: {
  to: string;            // 目标用户 userId
  content: string;       // 消息内容（明文，v1.0）
  contentType: "text" | "emoji";
  replyTo?: string;      // 引用消息的 msgId（可选）
}
```

#### TEXT（群消息）
```typescript
payload: {
  to: string;            // 群组 groupId
  groupId: string;       // 标识这是群消息
  content: string;
  contentType: "text" | "emoji";
}
```

#### TEXT_ACK（消息已收到确认）
```typescript
payload: {
  ackMsgId: string;      // 被确认的消息 msgId
}
```



#### WITHDRAW（撤回消息）
```typescript
payload: {
  targetMsgId: string;   // 要撤回的消息 ID
  to: string;            // 接收方（单聊）或 groupId（群聊）
}
```

#### FILE_NOTIFY（文件传输通知）
```typescript
payload: {
  to: string;            // 接收方 userId
  transferId: string;    // 本次传输的唯一 ID
  fileName: string;      // 文件名
  fileSize: number;      // 文件大小（字节）
  fileType: string;      // MIME 类型
  fileMd5: string;       // 文件 MD5（用于完整性校验）
  isImage: boolean;      // 是否图片（影响 UI 展示）
  tcpPort: number;       // 发送方 TCP 监听端口
  thumbnailData?: string; // 图片缩略图 Base64（isImage=true 时）
}
```

#### FILE_ACCEPT / FILE_REJECT
```typescript
payload: {
  transferId: string;    // 对应的传输 ID
  offset?: number;       // 断点续传起始偏移（FILE_ACCEPT 时）
}
```

#### TYPING（正在输入）
```typescript
payload: {
  to: string;            // 目标用户/群组 ID
  isTyping: boolean;     // true=开始输入，false=停止输入
}
```

---

## 4. 消息可靠性设计

### 4.1 单聊消息确认机制

UDP 本身不保证投递，需要应用层实现 ACK：

```
发送方                              接收方
   │                                  │
   │──── TEXT (msgId: "abc123") ────►│
   │                                  │  写入数据库
   │◄─── TEXT_ACK (ackMsgId: "abc123")│
   │                                  │
   │  收到 ACK → 标记已送达            │
```

**超时重试策略：**

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 500,
  backoffMultiplier: 2,
  // 重试间隔：500ms → 1000ms → 2000ms
};

async function sendWithAck(packet: UdpPacket): Promise<void> {
  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    udpSocket.send(packet, targetIp, UDP_PORT);
    const acked = await waitForAck(packet.msgId, delay(attempt));
    if (acked) return;
  }
  // 3 次重试失败 → 标记消息为"发送失败"
  throw new MessageDeliveryError(packet.msgId);
}
```

### 4.2 消息去重

```typescript
// 使用 LRU Cache 缓存最近 1000 条已处理 msgId
const processedMsgIds = new LRUCache<string, true>({ max: 1000 });

function onReceivePacket(packet: UdpPacket) {
  if (processedMsgIds.has(packet.msgId)) return; // 丢弃重复包
  processedMsgIds.set(packet.msgId, true);
  handlePacket(packet);
}
```

### 4.3 消息序号与排序

- 每条消息携带 `timestamp`（毫秒），UI 按时间戳排序
- 时钟漂移容忍：接受时钟差 ±60 秒内的消息
- 同一毫秒内的消息按 `msgId` 字典序排序

---

## 5. 多网卡与网络环境处理

### 5.1 网络接口枚举

```typescript
import { networkInterfaces } from 'os';

function getBroadcastAddresses(): string[] {
  const interfaces = networkInterfaces();
  const addresses: string[] = [];

  for (const iface of Object.values(interfaces)) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        // 计算广播地址：IP & ~mask | ~mask
        const broadcast = calcBroadcast(addr.address, addr.netmask);
        addresses.push(broadcast);
      }
    }
  }

  return addresses.length > 0 ? addresses : ['255.255.255.255'];
}
```

### 5.2 多网卡策略

- 默认对**所有非回环 IPv4 接口**发送广播
- 设置界面提供手动选择网络接口选项（高级设置）
- 监听 `network-change` 系统事件，自动重新广播

### 5.3 子网穿越（未来）

v1.0 仅支持同一子网广播（255.255.255.255），v1.1 规划：
- 支持手动添加已知 IP 地址的对端（点对点单播模式）
- 支持多播（Multicast）作为广播替代，穿越部分路由器

---

## 6. 端口冲突处理

```typescript
async function bindUdpSocket(): Promise<dgram.Socket> {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  return new Promise((resolve, reject) => {
    socket.bind(UDP_PORT, () => {
      socket.setBroadcast(true);
      resolve(socket);
    });

    socket.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        // 端口被占用 → 弹出设置提示用户更改端口
        showPortConflictDialog(UDP_PORT);
      }
      reject(err);
    });
  });
}
```

---

## 7. 与飞秋协议的兼容性

飞秋（FeiQ）基于 IPMSG 协议（UDP 2425），以下为兼容性说明：

| 功能 | CubicleChat | 飞秋 | 互通状态 |
|------|-------------|------|---------|
| 用户发现 | UDP 广播 2425 | UDP 广播 2425 | ✅ 可见（但数据格式不同） |
| 文本消息 | JSON 格式 | IPMSG 自定义格式 | ❌ 格式不兼容 |
| 文件传输 | TCP 2426 | TCP 随机端口 | ❌ 协议不兼容 |

> **v1.1 规划**：可选实现 IPMSG 协议解析，实现与飞秋的基础文本消息互通。

---

## 8. 流量估算

| 场景 | 单包大小 | 频率 | 带宽（100用户） |
|------|---------|------|----------------|
| HEARTBEAT | ~300 B | 30s/次 | ~1 KB/s |
| TEXT 消息 | ~500 B | 按需 | 按聊天量 |
| FILE_NOTIFY | ~1 KB | 按需 | 忽略 |
| ONLINE 广播 | ~500 B | 启动时 | 一次性 |

> UDP 广播在 100 用户局域网中每秒带宽消耗 < 5 KB，可忽略不计。

---

*本文档涵盖 v1.0 协议规范，协议变更需修改版本号字段并保持向后兼容。*
