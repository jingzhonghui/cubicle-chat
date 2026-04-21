# CubicleChat

局域网即时通讯工具

## 技术栈

- **框架**: Electron 29 + React 18
- **语言**: TypeScript 5
- **样式**: Tailwind CSS v3
- **状态管理**: Zustand
- **数据库**: better-sqlite3 + Drizzle ORM
- **构建**: Vite + electron-vite
- **打包**: electron-builder

## 项目结构

```
cubicle-chat/
├── src/
│   ├── main/                    # 主进程
│   │   ├── index.ts            # 主入口
│   │   ├── utils.ts            # 工具函数
│   │   ├── database/           # 数据库服务
│   │   │   └── DatabaseService.ts
│   │   └── network/            # 网络服务
│   │       └── NetworkService.ts
│   ├── preload/                 # 预加载脚本
│   │   └── index.ts            # IPC Bridge
│   └── renderer/                # 渲染进程
│       └── src/
│           ├── App.tsx          # 根组件
│           ├── main.tsx         # React 入口
│           ├── components/      # UI 组件
│           │   ├── layout/      # 布局组件
│           │   └── chat/        # 聊天组件
│           ├── store/           # Zustand 状态
│           └── styles/          # 全局样式
├── resources/                   # 应用资源
├── docs/                        # 项目文档
├── package.json
├── electron.vite.config.ts
├── tailwind.config.js
└── electron-builder.yml
```

## 开发

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
# 构建所有平台
npm run build

# 构建 Windows
npm run build:win

# 构建 macOS
npm run build:mac

# 构建 Linux
npm run build:linux
```

## 功能

### 已实现 ✅

- ✅ **局域网用户自动发现**（UDP 广播，支持多网卡选择）
- ✅ **即时消息收发**（支持 Enter 快捷键或按钮发送）
- ✅ **消息状态**（发送中/已发送/已送达/失败）
- ✅ **消息撤回**（2分钟内可撤回）
- ✅ **消息历史**（本地 SQLite 存储，支持关键词搜索）
- ✅ **文件传输**（TCP 分块传输，自动接受，进度显示，MD5 校验）
- ✅ **图片传输**（支持 PNG/JPG/GIF/WebP/BMP，双击查看大图）
- ✅ **文件拖拽/粘贴发送**
- ✅ **系统托盘**（最小化到托盘，新消息闪烁提醒）
- ✅ **自定义标题栏**
- ✅ **网络设置**（手动选择网络接口，自定义广播地址）
- ✅ **会话管理**（右键智能菜单：删除会话/清空列表）

### 进行中 ⏳

- ⏳ 群聊功能
- ⏳ 暗色主题
- ⏳ 断点续传

## 协议

| 端口 | 用途 |
|------|------|
| UDP 2425 | 用户发现/消息 |
| TCP 2426 | 文件传输 |

## 许可证

MIT
