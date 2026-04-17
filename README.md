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

- ✅ 局域网用户自动发现（UDP 广播）
- ✅ 即时消息收发
- ✅ 消息状态（发送中/已发送/已送达）
- ✅ 系统托盘
- ✅ 自定义标题栏
- ⏳ 文件传输
- ⏳ 图片发送
- ⏳ 群聊功能
- ⏳ 消息历史
- ⏳ 暗色主题

## 协议

| 端口 | 用途 |
|------|------|
| UDP 2425 | 用户发现/消息 |
| TCP 2426 | 文件传输 |

## 许可证

MIT
