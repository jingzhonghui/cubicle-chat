# CubicleChat 资源目录

此目录用于存放应用图标和其他资源文件。

## 需要的图标文件

- `icon.ico` - Windows 应用图标
- `icon.icns` - macOS 应用图标  
- `icon.png` - Linux 应用图标 (至少 256x256)
- `tray.png` - 系统托盘图标 (16x16 或 32x32)

## 图标生成建议

1. 设计一个 1024x1024 的 PNG 原图
2. 使用工具生成各平台所需格式：
   - Windows: 使用在线工具或 `electron-icon-maker`
   - macOS: 使用 `iconutil` 或在线工具
   - Linux: 直接使用 PNG

## 临时方案

如果暂时没有图标，应用会使用默认图标启动。
