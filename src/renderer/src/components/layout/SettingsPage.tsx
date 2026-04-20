import { useState, useEffect, useRef } from 'react'
import { useSettingsStore, type Theme, type Language, type UserStatus } from '@store/settingsStore'
import { useUserStore } from '@store/userStore'

interface SettingsPageProps {
  isActive: boolean
}

// 设置项组件 - 文本输入
function SettingItemText({
  label,
  value,
  onChange,
  placeholder,
  description
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  description?: string
}): JSX.Element {
  return (
    <div className="py-3">
      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-disabled)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
      />
      {description && (
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{description}</p>
      )}
    </div>
  )
}

// 设置项组件 - 数字输入
function SettingItemNumber({
  label,
  value,
  onChange,
  min,
  max,
  description
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  description?: string
}): JSX.Element {
  return (
    <div className="py-3">
      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        className="w-32 px-3 py-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
      />
      {description && (
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{description}</p>
      )}
    </div>
  )
}

// 设置项组件 - 选择
function SettingItemSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  description
}: {
  label: string
  value: T
  options: { value: T; label: string; icon?: string }[]
  onChange: (value: T) => void
  description?: string
}): JSX.Element {
  return (
    <div className="py-3">
      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all border
              ${value === option.value
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--bg-input)] text-[var(--text-primary)] border-[var(--border)] hover:border-[var(--accent)]'
              }
            `}
          >
            {option.icon && <span className="mr-1">{option.icon}</span>}
            {option.label}
          </button>
        ))}
      </div>
      {description && (
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{description}</p>
      )}
    </div>
  )
}

// 设置项组件 - 开关
function SettingItemToggle({
  label,
  checked,
  onChange,
  description
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
}): JSX.Element {
  return (
    <div className="py-3 flex items-start justify-between">
      <div className="flex-1">
        <label className="block text-sm font-medium text-[var(--text-primary)]">
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`
          relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)]
          ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}
        `}
      >
        <span
          className={`
            absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  )
}

// 设置项组件 - 文件夹选择
function SettingItemFolder({
  label,
  value,
  onChange,
  description
}: {
  label: string
  value: string
  onChange: (value: string) => void
  description?: string
}): JSX.Element {
  const handleSelectFolder = async () => {
    try {
      // 使用文件夹选择对话框
      const result = await window.electronAPI.invoke<string | null>('file:select', { isDirectory: true, title: '选择文件接收目录' })
      if (result) {
        onChange(result)
      }
    } catch (error) {
      console.error('选择文件夹失败:', error)
    }
  }

  return (
    <div className="py-3">
      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          readOnly
          className="flex-1 px-3 py-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] outline-none"
        />
        <button
          onClick={handleSelectFolder}
          className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
        >
          浏览
        </button>
      </div>
      {description && (
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{description}</p>
      )}
    </div>
  )
}

// 设置分组组件
function SettingGroup({
  title,
  icon,
  children
}: {
  title: string
  icon?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2 px-1">
        {icon && <span>{icon}</span>}
        {title}
      </h3>
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] px-4">
        {children}
      </div>
    </div>
  )
}

// 头像上传组件
function AvatarUpload({
  nickname,
  avatar,
  onChange
}: {
  nickname: string
  avatar?: string
  onChange: (avatar: string) => void
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const colors = ['#A4C8E8', '#A4E8B8', '#C4A4E8', '#E8D0A4', '#A4A4E8', '#E8A4A4', '#A4E8E0', '#E8C4A4']
  const colorIndex = nickname.charCodeAt(0) % colors.length

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      // 读取文件为 base64
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        // 限制图片大小，压缩到 64x64
        if (base64) {
          onChange(base64)
        }
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('读取头像失败:', error)
    }
  }

  return (
    <div className="py-3 flex items-center gap-4">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-semibold text-white overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
        style={{ backgroundColor: avatar ? 'transparent' : colors[colorIndex] }}
        onClick={() => fileInputRef.current?.click()}
      >
        {avatar ? (
          <img src={avatar} alt="头像" className="w-full h-full object-cover" />
        ) : (
          nickname.charAt(0).toUpperCase()
        )}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-[var(--text-primary)] mb-1">头像</div>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            更换头像
          </button>
          {avatar && (
            <button
              onClick={() => onChange('')}
              className="px-3 py-1.5 bg-[var(--bg-input)] text-[var(--text-secondary)] text-xs font-medium rounded-lg hover:bg-[var(--border)] transition-colors"
            >
              移除
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">支持 JPG、PNG 格式，建议 64×64 像素</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}

function SettingsPage({ isActive }: SettingsPageProps): JSX.Element {
  const { settings, loadSettings, setSetting, setSettings, isLoading, applyTheme } = useSettingsStore()
  const { userInfo, updateUserInfo } = useUserStore()
  const [activeSection, setActiveSection] = useState('profile')
  const [localNickname, setLocalNickname] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // 加载设置
  useEffect(() => {
    if (isActive) {
      loadSettings()
    }
  }, [isActive, loadSettings])

  // 同步本地昵称
  useEffect(() => {
    if (userInfo?.nickname) {
      setLocalNickname(userInfo.nickname)
    }
  }, [userInfo?.nickname])

  // 自动保存昵称
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localNickname && localNickname !== userInfo?.nickname) {
        handleNicknameChange(localNickname)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [localNickname])

  const handleNicknameChange = async (value: string) => {
    if (!value.trim()) return
    setSaveStatus('saving')
    try {
      const result = await updateUserInfo({ nickname: value.trim() })
      if (result) {
        setSaveStatus('saved')
        // 同时更新 settings store 中的值
        await setSetting('user.nickname', value.trim())
      } else {
        setSaveStatus('error')
      }
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error) {
      console.error('保存昵称失败:', error)
      setSaveStatus('error')
    }
  }

  const handleStatusChange = async (status: UserStatus) => {
    try {
      const result = await updateUserInfo({ status })
      if (result) {
        await setSetting('user.status', status)
      }
    } catch (error) {
      console.error('保存状态失败:', error)
    }
  }

  const handleAvatarChange = async (avatar: string) => {
    try {
      const result = await updateUserInfo({ avatar })
      if (result) {
        await setSetting('user.avatar', avatar)
      }
    } catch (error) {
      console.error('保存头像失败:', error)
    }
  }

  const handleResetToDefaults = async () => {
    if (confirm('确定要重置所有设置为默认值吗？')) {
      const { resetToDefaults } = useSettingsStore.getState()
      await resetToDefaults()
    }
  }

  const handleClearHistory = async () => {
    if (confirm('确定要清空所有历史消息吗？此操作不可恢复。')) {
      // TODO: 实现清空历史消息
      alert('功能开发中...')
    }
  }

  // 获取当前设置值
  const nickname = localNickname || userInfo?.nickname || ''
  const status = (settings['user.status'] as UserStatus) || 'online'
  const avatar = settings['user.avatar'] || userInfo?.avatar
  const downloadPath = settings['storage.downloadPath'] || ''
  const retentionDays = settings['storage.retentionDays'] || 180
  const udpPort = settings['network.udpPort'] || 2425
  const tcpPort = settings['network.tcpPort'] || 2426
  const notificationEnabled = settings['notification.enabled'] !== false
  const notificationSound = settings['notification.sound'] !== false
  const autoLaunch = settings['startup.autoLaunch'] === true
  const minimized = settings['startup.minimized'] === true
  const minimizeToTray = settings['ui.minimizeToTray'] !== false
  const language: Language = settings['ui.language'] || 'zh-CN'
  const theme: Theme = settings['ui.theme'] || 'system'

  const sections = [
    { id: 'profile', label: '个人资料', icon: '👤' },
    { id: 'storage', label: '存储管理', icon: '💾' },
    { id: 'network', label: '网络设置', icon: '🌐' },
    { id: 'notification', label: '通知设置', icon: '🔔' },
    { id: 'startup', label: '启动设置', icon: '🚀' },
    { id: 'appearance', label: '外观', icon: '🎨' }
  ]

  if (!isActive) {
    return <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-base)]" />
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* 头部 */}
      <div className="h-12 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center px-4 flex-shrink-0">
        <span className="text-base font-semibold text-[var(--text-primary)]">设置</span>
        {saveStatus === 'saving' && (
          <span className="ml-3 text-xs text-[var(--text-secondary)]">保存中...</span>
        )}
        {saveStatus === 'saved' && (
          <span className="ml-3 text-xs text-[var(--success)]">已保存</span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧导航 */}
        <div className="w-48 bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col py-2 flex-shrink-0">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`
                mx-2 px-3 py-2 rounded-lg text-left text-sm transition-colors flex items-center gap-2
                ${activeSection === section.id
                  ? 'bg-[var(--accent-light)] text-[var(--accent)] font-medium'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]'
                }
              `}
            >
              <span>{section.icon}</span>
              {section.label}
            </button>
          ))}
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-[var(--text-secondary)]">加载中...</div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              {/* 个人资料 */}
              {activeSection === 'profile' && (
                <>
                  <SettingGroup title="个人资料" icon="👤">
                    <AvatarUpload
                      nickname={nickname}
                      avatar={avatar}
                      onChange={handleAvatarChange}
                    />
                    <div className="border-t border-[var(--border)]">
                      <SettingItemText
                        label="昵称"
                        value={localNickname}
                        onChange={setLocalNickname}
                        placeholder="请输入昵称"
                        description="其他用户将看到此昵称"
                      />
                    </div>
                    <div className="border-t border-[var(--border)]">
                      <SettingItemSelect<UserStatus>
                        label="在线状态"
                        value={status}
                        options={[
                          { value: 'online', label: '在线', icon: '🟢' },
                          { value: 'busy', label: '忙碌', icon: '🟡' },
                          { value: 'away', label: '离开', icon: '⚪' },
                          { value: 'offline', label: '隐身', icon: '⚫' }
                        ]}
                        onChange={handleStatusChange}
                        description="设置您的在线状态，隐身模式下对他人显示离线"
                      />
                    </div>
                  </SettingGroup>
                </>
              )}

              {/* 存储管理 */}
              {activeSection === 'storage' && (
                <>
                  <SettingGroup title="文件存储" icon="💾">
                    <SettingItemFolder
                      label="文件接收目录"
                      value={downloadPath}
                      onChange={(value) => setSetting('storage.downloadPath', value)}
                      description="接收的文件将保存在此目录"
                    />
                    <div className="border-t border-[var(--border)]">
                      <SettingItemNumber
                        label="历史消息保留天数"
                        value={retentionDays}
                        onChange={(value) => setSetting('storage.retentionDays', value)}
                        min={30}
                        description="超过此天数的历史消息将被自动清理"
                      />
                    </div>
                  </SettingGroup>

                  <SettingGroup title="数据管理" icon="🗑️">
                    <div className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-[var(--text-primary)]">清空历史消息</div>
                          <p className="text-xs text-[var(--text-secondary)]">删除所有聊天记录，不可恢复</p>
                        </div>
                        <button
                          onClick={handleClearHistory}
                          className="px-4 py-2 bg-[var(--error)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
                        >
                          清空
                        </button>
                      </div>
                    </div>
                  </SettingGroup>
                </>
              )}

              {/* 网络设置 */}
              {activeSection === 'network' && (
                <>
                  <SettingGroup title="端口设置" icon="🌐">
                    <SettingItemNumber
                      label="UDP 广播端口"
                      value={udpPort}
                      onChange={(value) => setSetting('network.udpPort', value)}
                      min={1024}
                      max={65535}
                      description="用于用户发现和消息广播（默认 2425，与飞秋兼容）"
                    />
                    <div className="border-t border-[var(--border)]">
                      <SettingItemNumber
                        label="TCP 文件传输端口"
                        value={tcpPort}
                        onChange={(value) => setSetting('network.tcpPort', value)}
                        min={1024}
                        max={65535}
                        description="用于文件传输（默认 2426）"
                      />
                    </div>
                  </SettingGroup>

                  <div className="bg-[var(--accent-light)] rounded-xl p-4 mb-6">
                    <div className="text-sm font-medium text-[var(--accent)] mb-1">💡 提示</div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      修改端口后需要重启应用才能生效。请确保所选端口未被其他程序占用。
                    </p>
                  </div>
                </>
              )}

              {/* 通知设置 */}
              {activeSection === 'notification' && (
                <>
                  <SettingGroup title="消息通知" icon="🔔">
                    <SettingItemToggle
                      label="启用消息通知"
                      checked={notificationEnabled}
                      onChange={(checked) => setSetting('notification.enabled', checked)}
                      description="收到新消息时显示桌面通知"
                    />
                    <div className="border-t border-[var(--border)]">
                      <SettingItemToggle
                        label="通知提示音"
                        checked={notificationSound}
                        onChange={(checked) => setSetting('notification.sound', checked)}
                        description="收到消息时播放提示音"
                      />
                    </div>
                  </SettingGroup>
                </>
              )}

              {/* 启动设置 */}
              {activeSection === 'startup' && (
                <>
                  <SettingGroup title="启动行为" icon="🚀">
                    <SettingItemToggle
                      label="开机自启"
                      checked={autoLaunch}
                      onChange={(checked) => setSetting('startup.autoLaunch', checked)}
                      description="系统启动时自动运行 CubicleChat"
                    />
                    <div className="border-t border-[var(--border)]">
                      <SettingItemToggle
                        label="最小化启动"
                        checked={minimized}
                        onChange={(checked) => setSetting('startup.minimized', checked)}
                        description="启动时直接最小化到系统托盘"
                      />
                    </div>
                    <div className="border-t border-[var(--border)]">
                      <SettingItemToggle
                        label="关闭时最小化到托盘"
                        checked={minimizeToTray}
                        onChange={(checked) => setSetting('ui.minimizeToTray', checked)}
                        description="点击关闭按钮时最小化到系统托盘而非退出"
                      />
                    </div>
                  </SettingGroup>
                </>
              )}

              {/* 外观设置 */}
              {activeSection === 'appearance' && (
                <>
                  <SettingGroup title="界面主题" icon="🎨">
                    <SettingItemSelect<Theme>
                      label="主题"
                      value={theme}
                      options={[
                        { value: 'light', label: '亮色', icon: '☀️' },
                        { value: 'dark', label: '暗色', icon: '🌙' },
                        { value: 'system', label: '跟随系统', icon: '🖥️' }
                      ]}
                      onChange={async (value) => {
                        await setSetting('ui.theme', value)
                        applyTheme()
                      }}
                      description="选择应用界面主题"
                    />
                  </SettingGroup>

                  <SettingGroup title="语言" icon="🌐">
                    <SettingItemSelect<Language>
                      label="界面语言"
                      value={language}
                      options={[
                        { value: 'zh-CN', label: '简体中文', icon: '🇨🇳' },
                        { value: 'en-US', label: 'English', icon: '🇺🇸' }
                      ]}
                      onChange={(value) => setSetting('ui.language', value)}
                      description="选择应用显示语言"
                    />
                  </SettingGroup>
                </>
              )}

              {/* 底部重置按钮 */}
              <div className="mt-8 pt-6 border-t border-[var(--border)]">
                <button
                  onClick={handleResetToDefaults}
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--error)] transition-colors"
                >
                  重置所有设置为默认值
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
