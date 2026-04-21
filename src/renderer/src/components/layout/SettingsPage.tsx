import { useState, useEffect } from 'react'
import { useSettingsStore, type Theme, type Language, type UserStatus } from '@store/settingsStore'
import { useUserStore } from '@store/userStore'

// 网卡接口类型
interface NetworkInterface {
  name: string
  address: string
  netmask: string
  broadcast: string
  isInternal: boolean
  isVirtual: boolean
  priority: number
}

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

// 内置头像列表
const BUILTIN_AVATARS = [
  { id: 'default', emoji: '', label: '默认（首字母）' },
  { id: 'cat', emoji: '🐱', label: '猫咪' },
  { id: 'dog', emoji: '🐶', label: '狗狗' },
  { id: 'fox', emoji: '🦊', label: '狐狸' },
  { id: 'panda', emoji: '🐼', label: '熊猫' },
  { id: 'rabbit', emoji: '🐰', label: '兔子' },
  { id: 'tiger', emoji: '🐯', label: '老虎' },
  { id: 'lion', emoji: '🦁', label: '狮子' },
  { id: 'bear', emoji: '🐻', label: '棕熊' },
  { id: 'koala', emoji: '🐨', label: '考拉' },
  { id: 'pig', emoji: '🐷', label: '小猪' },
  { id: 'monkey', emoji: '🐵', label: '猴子' },
  { id: 'robot', emoji: '🤖', label: '机器人' },
  { id: 'alien', emoji: '👽', label: '外星人' },
  { id: 'ghost', emoji: '👻', label: '幽灵' },
  { id: 'ninja', emoji: '🥷', label: '忍者' },
  { id: 'detective', emoji: '🕵️', label: '侦探' },
  { id: 'astronaut', emoji: '👨‍🚀', label: '宇航员' },
  { id: 'scientist', emoji: '👨‍🔬', label: '科学家' },
  { id: 'artist', emoji: '👨‍🎨', label: '艺术家' },
  { id: 'chef', emoji: '👨‍🍳', label: '厨师' },
  { id: 'student', emoji: '👨‍🎓', label: '学生' },
  { id: 'business', emoji: '👨‍💼', label: '商务' },
  { id: 'worker', emoji: '👨‍🔧', label: '工程师' },
  { id: 'farmer', emoji: '👨‍🌾', label: '农民' },
  { id: 'pilot', emoji: '👨‍✈️', label: '飞行员' },
  { id: 'police', emoji: '👮', label: '警察' },
  { id: 'firefighter', emoji: '👨‍🚒', label: '消防员' },
  { id: 'doctor', emoji: '👨‍⚕️', label: '医生' },
  { id: 'teacher', emoji: '👨‍🏫', label: '教师' },
  { id: 'judge', emoji: '👨‍⚖️', label: '法官' },
  { id: 'superhero', emoji: '🦸', label: '超级英雄' },
  { id: 'vampire', emoji: '🧛', label: '吸血鬼' },
  { id: 'mage', emoji: '🧙', label: '法师' },
  { id: 'fairy', emoji: '🧚', label: '精灵' },
  { id: 'angel', emoji: '👼', label: '天使' },
  { id: 'devil', emoji: '😈', label: '恶魔' },
  { id: 'clown', emoji: '🤡', label: '小丑' },
  { id: 'skull', emoji: '💀', label: '骷髅' },
  { id: 'poo', emoji: '💩', label: '便便' }
]

// 内置头像选择组件
function AvatarSelector({
  nickname,
  avatar,
  onChange
}: {
  nickname: string
  avatar?: string
  onChange: (avatar: string) => void
}): JSX.Element {
  const colors = ['#A4C8E8', '#A4E8B8', '#C4A4E8', '#E8D0A4', '#A4A4E8', '#E8A4A4', '#A4E8E0', '#E8C4A4']
  const colorIndex = nickname.charCodeAt(0) % colors.length
  const [showSelector, setShowSelector] = useState(false)

  // 获取当前显示的内容
  const getCurrentDisplay = () => {
    if (!avatar || avatar === '') {
      return { type: 'letter', content: nickname.charAt(0).toUpperCase() }
    }
    const builtin = BUILTIN_AVATARS.find(a => a.id === avatar)
    if (builtin) {
      return { type: 'emoji', content: builtin.emoji }
    }
    // 兼容旧数据（base64 图片）
    if (avatar.startsWith('data:')) {
      return { type: 'image', content: avatar }
    }
    return { type: 'letter', content: nickname.charAt(0).toUpperCase() }
  }

  const currentDisplay = getCurrentDisplay()

  const handleSelect = (avatarId: string) => {
    onChange(avatarId)
    setShowSelector(false)
  }

  return (
    <div className="py-3">
      <div className="flex items-center gap-4 mb-3">
        {/* 当前头像预览 */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-semibold text-white overflow-hidden"
          style={{
            backgroundColor: currentDisplay.type === 'letter' ? colors[colorIndex] : '#E5E7EB',
            border: '2px solid var(--border)'
          }}
        >
          {currentDisplay.type === 'image' ? (
            <img src={currentDisplay.content} alt="头像" className="w-full h-full object-cover" />
          ) : currentDisplay.type === 'emoji' ? (
            <span className="text-3xl">{currentDisplay.content}</span>
          ) : (
            <span>{currentDisplay.content}</span>
          )}
        </div>

        <div className="flex-1">
          <div className="text-sm font-medium text-[var(--text-primary)] mb-1">头像</div>
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            {showSelector ? '关闭选择' : '更换头像'}
          </button>
        </div>
      </div>

      {/* 头像选择面板 */}
      {showSelector && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3">
          <div className="text-xs text-[var(--text-secondary)] mb-2">选择内置头像：</div>
          <div className="grid grid-cols-8 gap-1.5 max-h-[200px] overflow-y-auto">
            {BUILTIN_AVATARS.map((builtinAvatar) => (
              <button
                key={builtinAvatar.id}
                onClick={() => handleSelect(builtinAvatar.id)}
                title={builtinAvatar.label}
                className={`
                  w-10 h-10 rounded-lg flex items-center justify-center text-xl
                  transition-all hover:bg-[var(--bg-base)]
                  ${avatar === builtinAvatar.id
                    ? 'bg-[var(--accent-light)] ring-2 ring-[var(--accent)]'
                    : 'bg-[var(--bg-input)]'
                  }
                `}
              >
                {builtinAvatar.id === 'default' ? (
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                    style={{ backgroundColor: colors[colorIndex] }}
                  >
                    {nickname.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  builtinAvatar.emoji
                )}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-disabled)]">
            点击头像即可更换，默认使用昵称首字母
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsPage({ isActive }: SettingsPageProps): JSX.Element {
  const { settings, loadSettings, setSetting, isLoading, applyTheme } = useSettingsStore()
  const { userInfo, updateUserInfo, loadOnlineUsers } = useUserStore()
  const [activeSection, setActiveSection] = useState('profile')
  const [localNickname, setLocalNickname] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // 网卡相关状态
  const [networkInterfaces, setNetworkInterfaces] = useState<NetworkInterface[]>([])
  const [currentInterface, setCurrentInterface] = useState<NetworkInterface | null>(null)
  const [isSwitchingInterface, setIsSwitchingInterface] = useState(false)

  // 自定义广播地址状态
  const [customBroadcastAddresses, setCustomBroadcastAddresses] = useState<string[]>([])
  const [allBroadcastAddresses, setAllBroadcastAddresses] = useState<string[]>([])
  const [newBroadcastAddress, setNewBroadcastAddress] = useState('')
  const [isAddingAddress, setIsAddingAddress] = useState(false)

  // 加载网卡列表
  const loadNetworkInterfaces = async (includeVirtual = false) => {
    try {
      const interfaces = await window.electronAPI.invoke<NetworkInterface[]>('network:getInterfaces', includeVirtual)
      setNetworkInterfaces(interfaces)
      const current = await window.electronAPI.invoke<NetworkInterface | null>('network:getCurrentInterface')
      setCurrentInterface(current)
    } catch (error) {
      console.error('加载网卡列表失败:', error)
    }
  }

  // 加载广播地址列表
  const loadBroadcastAddresses = async () => {
    try {
      const custom = await window.electronAPI.invoke<string[]>('network:getCustomBroadcastAddresses')
      const all = await window.electronAPI.invoke<string[]>('network:getAllBroadcastAddresses')
      setCustomBroadcastAddresses(custom)
      setAllBroadcastAddresses(all)
    } catch (error) {
      console.error('加载广播地址失败:', error)
    }
  }

  // 添加自定义广播地址
  const handleAddBroadcastAddress = async () => {
    if (!newBroadcastAddress.trim()) return

    // 验证 IP 地址格式
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipPattern.test(newBroadcastAddress.trim())) {
      alert('请输入有效的广播地址，格式如：172.16.7.255')
      return
    }

    setIsAddingAddress(true)
    try {
      const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
        'network:addCustomBroadcastAddress',
        newBroadcastAddress.trim()
      )

      if (result.success) {
        setNewBroadcastAddress('')
        await loadBroadcastAddresses()
        setSaveStatus('saved')
      } else {
        alert(`添加失败: ${result.error || '未知错误'}`)
        setSaveStatus('error')
      }
    } catch (error) {
      console.error('添加广播地址失败:', error)
      alert('添加失败，请重试')
      setSaveStatus('error')
    } finally {
      setIsAddingAddress(false)
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  // 删除自定义广播地址
  const handleRemoveBroadcastAddress = async (address: string) => {
    try {
      const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
        'network:removeCustomBroadcastAddress',
        address
      )

      if (result.success) {
        await loadBroadcastAddresses()
        setSaveStatus('saved')
      } else {
        alert(`删除失败: ${result.error || '未知错误'}`)
        setSaveStatus('error')
      }
    } catch (error) {
      console.error('删除广播地址失败:', error)
      alert('删除失败，请重试')
      setSaveStatus('error')
    } finally {
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  // 加载设置
  useEffect(() => {
    if (isActive) {
      loadSettings()
    }
  }, [isActive, loadSettings])

  // 获取显示虚拟网卡设置
  const showVirtualInterfaces = settings['network.showVirtualInterfaces'] === true

  // 当切换到网络设置标签时，刷新网卡列表和广播地址
  useEffect(() => {
    if (isActive && activeSection === 'network') {
      loadNetworkInterfaces(showVirtualInterfaces)
      loadBroadcastAddresses()
    }
  }, [isActive, activeSection, showVirtualInterfaces])

  // 处理网卡切换
  const handleSwitchInterface = async (address: string) => {
    if (address === currentInterface?.address) return

    // 确认切换
    const targetInterface = networkInterfaces.find(iface => iface.address === address)
    if (!targetInterface) return

    const confirmed = confirm(
      `确定要切换到网卡 "${targetInterface.name}" (${targetInterface.address}) 吗？\n\n` +
      `切换网卡将：\n` +
      `1. 清空当前在线用户列表\n` +
      `2. 使用新的网卡重新广播发现用户\n\n` +
      `此操作可能需要几秒钟完成。`
    )

    if (!confirmed) return

    setIsSwitchingInterface(true)
    setSaveStatus('saving')

    try {
      const result = await window.electronAPI.invoke<{ success: boolean; error?: string }>(
        'network:switchInterface',
        address
      )

      if (result.success) {
        // 更新设置
        await setSetting('network.interface', address)
        // 重新加载网卡列表以获取最新状态
        await loadNetworkInterfaces()
        // 刷新在线用户列表（此时应该为空）
        await loadOnlineUsers()
        setSaveStatus('saved')
      } else {
        alert(`切换网卡失败: ${result.error || '未知错误'}`)
        setSaveStatus('error')
      }
    } catch (error) {
      console.error('切换网卡失败:', error)
      alert('切换网卡失败，请重试')
      setSaveStatus('error')
    } finally {
      setIsSwitchingInterface(false)
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

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
                    <AvatarSelector
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
                  <SettingGroup title="网卡选择" icon="🖧">
                    <SettingItemToggle
                      label="显示虚拟网卡"
                      checked={showVirtualInterfaces}
                      onChange={(checked) => setSetting('network.showVirtualInterfaces', checked)}
                      description="显示虚拟网卡（如 VMware、Docker、VPN 等）供手动选择"
                    />

                    <div className="py-3 border-t border-[var(--border)]">
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                        当前使用的网卡
                      </label>
                      {currentInterface ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--accent-light)] rounded-lg">
                          <span className="text-sm text-[var(--accent)]">
                            {currentInterface.isInternal ? '🔄' : currentInterface.isVirtual ? '🔧' : '📡'}
                          </span>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-[var(--text-primary)]">
                              {currentInterface.name}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)]">
                              {currentInterface.address} / {currentInterface.netmask}
                            </div>
                          </div>
                          {currentInterface.isVirtual && (
                            <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                              虚拟网卡
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-[var(--text-secondary)] px-3 py-2">
                          自动选择网卡
                        </div>
                      )}
                      <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                        程序会自动选择最优的物理网卡进行通信
                      </p>
                    </div>

                    <div className="border-t border-[var(--border)]">
                      <div className="py-3">
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                          手动选择网卡
                        </label>
                        {networkInterfaces.length > 0 ? (
                          <div className="space-y-2">
                            {networkInterfaces.map((iface) => (
                              <button
                                key={iface.address}
                                onClick={() => handleSwitchInterface(iface.address)}
                                disabled={isSwitchingInterface || iface.address === currentInterface?.address}
                                className={`
                                  w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all border
                                  ${iface.address === currentInterface?.address
                                    ? 'bg-[var(--accent-light)] border-[var(--accent)]'
                                    : 'bg-[var(--bg-input)] border-[var(--border)] hover:border-[var(--accent)]'
                                  }
                                  ${isSwitchingInterface ? 'opacity-50 cursor-not-allowed' : ''}
                                `}
                              >
                                <span className="text-sm">
                                  {iface.isInternal ? '🔄' : iface.isVirtual ? '🔧' : '📡'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                                    {iface.name}
                                  </div>
                                  <div className="text-xs text-[var(--text-secondary)] truncate">
                                    {iface.address} / {iface.netmask}
                                  </div>
                                </div>
                                {iface.address === currentInterface?.address && (
                                  <span className="text-xs px-2 py-0.5 bg-[var(--accent)] text-white rounded-full flex-shrink-0">
                                    当前
                                  </span>
                                )}
                                {iface.priority <= 3 && !iface.isVirtual && (
                                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex-shrink-0">
                                    推荐
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-[var(--text-secondary)] px-3 py-2 bg-[var(--bg-input)] rounded-lg">
                            未找到可用的网络接口
                          </div>
                        )}
                        {isSwitchingInterface && (
                          <p className="mt-2 text-xs text-[var(--accent)]">
                            正在切换网卡并重新发现用户...
                          </p>
                        )}
                        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                          多网卡环境下，如果自动选择的网卡不正确，可以手动切换
                        </p>
                      </div>
                    </div>
                  </SettingGroup>

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

                  <SettingGroup title="跨网段广播" icon="📡">
                    <div className="py-3">
                      <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                        当前广播地址
                      </label>
                      <div className="space-y-1.5">
                        {allBroadcastAddresses.map((addr) => (
                          <div
                            key={addr}
                            className="flex items-center justify-between px-3 py-2 bg-[var(--bg-input)] rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">
                                {addr === '255.255.255.255' ? '🌍' : '📡'}
                              </span>
                              <span className="text-sm text-[var(--text-primary)] font-mono">
                                {addr}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {addr === currentInterface?.broadcast && (
                                <span className="text-xs px-2 py-0.5 bg-[var(--accent-light)] text-[var(--accent)] rounded-full">
                                  当前网段
                                </span>
                              )}
                              {addr === '255.255.255.255' && (
                                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                  受限广播
                                </span>
                              )}
                              {customBroadcastAddresses.includes(addr) && (
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                                  自定义
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                        程序会向以上所有地址发送广播以发现其他网段的用户
                      </p>
                    </div>

                    <div className="border-t border-[var(--border)]">
                      <div className="py-3">
                        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                          添加自定义广播地址
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newBroadcastAddress}
                            onChange={(e) => setNewBroadcastAddress(e.target.value)}
                            placeholder="例如：172.16.7.255"
                            className="flex-1 px-3 py-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-disabled)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleAddBroadcastAddress()
                              }
                            }}
                          />
                          <button
                            onClick={handleAddBroadcastAddress}
                            disabled={isAddingAddress || !newBroadcastAddress.trim()}
                            className="px-4 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isAddingAddress ? '添加中...' : '添加'}
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                          输入其他网段的广播地址（如 172.16.7.255），用于发现该网段的用户
                        </p>
                      </div>
                    </div>

                    {customBroadcastAddresses.length > 0 && (
                      <div className="border-t border-[var(--border)]">
                        <div className="py-3">
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                            自定义地址列表
                          </label>
                          <div className="space-y-2">
                            {customBroadcastAddresses.map((addr) => (
                              <div
                                key={addr}
                                className="flex items-center justify-between px-3 py-2 bg-[var(--bg-input)] rounded-lg"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">📡</span>
                                  <span className="text-sm text-[var(--text-primary)] font-mono">
                                    {addr}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleRemoveBroadcastAddress(addr)}
                                  className="text-xs px-2 py-1 text-[var(--error)] hover:bg-red-50 rounded transition-colors"
                                >
                                  删除
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </SettingGroup>

                  <div className="bg-[var(--accent-light)] rounded-xl p-4 mb-6">
                    <div className="text-sm font-medium text-[var(--accent)] mb-1">💡 提示</div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      修改端口后需要重启应用才能生效。请确保所选端口未被其他程序占用。
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      跨网段广播依赖路由器配置，如无法发现其他网段用户，请联系网管开启 directed-broadcast 功能。
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
