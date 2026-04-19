import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'
export type Language = 'zh-CN' | 'en-US'
export type UserStatus = 'online' | 'busy' | 'away' | 'offline'

export interface AppSettings {
  // 用户设置
  'user.nickname': string
  'user.status': UserStatus
  'user.avatar'?: string
  
  // 存储设置
  'storage.downloadPath': string
  'storage.retentionDays': number
  
  // 网络设置
  'network.udpPort': number
  'network.tcpPort': number
  
  // 通知设置
  'notification.enabled': boolean
  'notification.sound': boolean
  
  // 启动设置
  'startup.autoLaunch': boolean
  'startup.minimized': boolean
  
  // 界面设置
  'ui.language': Language
  'ui.theme': Theme
  'ui.minimizeToTray': boolean
}

// 默认值
export const defaultSettings: Partial<AppSettings> = {
  'user.status': 'online',
  'storage.retentionDays': 180,
  'network.udpPort': 2425,
  'network.tcpPort': 2426,
  'notification.enabled': true,
  'notification.sound': true,
  'startup.autoLaunch': false,
  'startup.minimized': false,
  'ui.language': 'zh-CN',
  'ui.theme': 'system',
  'ui.minimizeToTray': true
}

interface SettingsStore {
  settings: Partial<AppSettings>
  isLoading: boolean
  hasChanges: boolean
  resolvedTheme: 'light' | 'dark'
  
  // Actions
  loadSettings: () => Promise<void>
  getSetting: <K extends keyof AppSettings>(key: K) => AppSettings[K] | undefined
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<boolean>
  setSettings: (settings: Partial<AppSettings>) => Promise<boolean>
  resetToDefaults: () => Promise<boolean>
  clearChanges: () => void
  applyTheme: () => void
}

// 应用主题到 document
function applyThemeToDocument(theme: 'light' | 'dark'): void {
  const root = document.documentElement
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else {
    root.removeAttribute('data-theme')
  }
}

// 解析系统主题
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: {},
  isLoading: false,
  hasChanges: false,
  resolvedTheme: 'light',

  loadSettings: async () => {
    set({ isLoading: true })
    try {
      // 批量加载所有设置
      const keys: (keyof AppSettings)[] = [
        'user.nickname',
        'user.status',
        'user.avatar',
        'storage.downloadPath',
        'storage.retentionDays',
        'network.udpPort',
        'network.tcpPort',
        'notification.enabled',
        'notification.sound',
        'startup.autoLaunch',
        'startup.minimized',
        'ui.language',
        'ui.theme',
        'ui.minimizeToTray'
      ]

      const loadedSettings: Partial<AppSettings> = {}

      for (const key of keys) {
        try {
          const value = await window.electronAPI.invoke<string | null>('settings:get', key)
          if (value !== null) {
            // 根据默认值类型进行转换
            const defaultValue = defaultSettings[key]
            if (typeof defaultValue === 'boolean') {
              loadedSettings[key] = (value === 'true') as AppSettings[typeof key]
            } else if (typeof defaultValue === 'number') {
              loadedSettings[key] = Number(value) as AppSettings[typeof key]
            } else {
              loadedSettings[key] = value as AppSettings[typeof key]
            }
          }
        } catch (error) {
          console.warn(`加载设置 ${key} 失败:`, error)
        }
      }

      // 合并默认值和加载的设置
      set({ 
        settings: { ...defaultSettings, ...loadedSettings },
        isLoading: false 
      })
    } catch (error) {
      console.error('加载设置失败:', error)
      set({ isLoading: false })
    }
  },

  getSetting: <K extends keyof AppSettings>(key: K): AppSettings[K] | undefined => {
    const value = get().settings[key]
    if (value !== undefined) {
      return value
    }
    return defaultSettings[key] as AppSettings[K] | undefined
  },

  setSetting: async <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<boolean> => {
    try {
      const strValue = String(value)
      const result = await window.electronAPI.invoke<boolean>('settings:set', key, strValue)
      if (result) {
        set((state) => ({
          settings: { ...state.settings, [key]: value },
          hasChanges: true
        }))
      }
      return result
    } catch (error) {
      console.error(`保存设置 ${key} 失败:`, error)
      return false
    }
  },

  setSettings: async (newSettings: Partial<AppSettings>): Promise<boolean> => {
    try {
      let allSuccess = true
      for (const [key, value] of Object.entries(newSettings)) {
        try {
          const strValue = String(value)
          const result = await window.electronAPI.invoke<boolean>('settings:set', key, strValue)
          if (!result) {
            allSuccess = false
          }
        } catch (error) {
          console.error(`保存设置 ${key} 失败:`, error)
          allSuccess = false
        }
      }

      if (allSuccess) {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
          hasChanges: true
        }))
      }
      return allSuccess
    } catch (error) {
      console.error('批量保存设置失败:', error)
      return false
    }
  },

  resetToDefaults: async (): Promise<boolean> => {
    try {
      let allSuccess = true
      for (const [key, value] of Object.entries(defaultSettings)) {
        try {
          const strValue = String(value)
          const result = await window.electronAPI.invoke<boolean>('settings:set', key, strValue)
          if (!result) {
            allSuccess = false
          }
        } catch (error) {
          console.error(`重置设置 ${key} 失败:`, error)
          allSuccess = false
        }
      }

      if (allSuccess) {
        set({ 
          settings: { ...defaultSettings },
          hasChanges: true
        })
      }
      return allSuccess
    } catch (error) {
      console.error('重置设置失败:', error)
      return false
    }
  },

  clearChanges: () => {
    set({ hasChanges: false })
  },

  applyTheme: () => {
    const themeSetting = get().settings['ui.theme'] as Theme || 'system'
    let resolved: 'light' | 'dark'
    
    if (themeSetting === 'system') {
      resolved = getSystemTheme()
    } else {
      resolved = themeSetting as 'light' | 'dark'
    }
    
    applyThemeToDocument(resolved)
    set({ resolvedTheme: resolved })
    console.log('[SettingsStore] 应用主题:', resolved, '(设置:', themeSetting, ')')
  }
}))

// 监听系统主题变化
if (typeof window !== 'undefined' && window.matchMedia) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', () => {
    const themeSetting = useSettingsStore.getState().settings['ui.theme'] as Theme
    if (themeSetting === 'system') {
      useSettingsStore.getState().applyTheme()
    }
  })
}
