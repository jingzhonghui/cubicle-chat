import { create } from 'zustand'

export interface UserInfo {
  userId: string
  nickname: string
  avatar?: string
  status: 'online' | 'busy' | 'away' | 'offline'
}

export interface OnlineUser extends UserInfo {
  macAddress: string  // MAC 地址作为设备唯一标识
  ip: string
  port: number
  lastSeenAt: number
  version: string
}

interface UserStore {
  userInfo: UserInfo | null
  onlineUsers: OnlineUser[]
  isLoading: boolean

  // Actions
  loadUserInfo: () => Promise<void>
  loadOnlineUsers: () => Promise<void>
  updateUserInfo: (info: Partial<UserInfo>) => Promise<boolean>
  addOnlineUser: (user: OnlineUser) => void
  removeOnlineUser: (userId: string) => void
  updateOnlineUser: (user: OnlineUser) => void
}

export const useUserStore = create<UserStore>((set, get) => ({
  userInfo: null,
  onlineUsers: [],
  isLoading: false,

  loadUserInfo: async () => {
    try {
      const info = await window.electronAPI.invoke<UserInfo | null>('user:getInfo')
      if (info) {
        set({ userInfo: info })
      }
    } catch (error) {
      console.error('加载用户信息失败:', error)
    }
  },

  loadOnlineUsers: async () => {
    try {
      const users = await window.electronAPI.invoke<OnlineUser[]>('user:getOnlineUsers')
      set({ onlineUsers: users || [] })
    } catch (error) {
      console.error('加载在线用户失败:', error)
    }
  },

  updateUserInfo: async (info: Partial<UserInfo>): Promise<boolean> => {
    try {
      const result = await window.electronAPI.invoke<boolean>('user:updateInfo', info)
      if (result) {
        const currentInfo = get().userInfo
        if (currentInfo) {
          set({ userInfo: { ...currentInfo, ...info } })
        }
      }
      return result
    } catch (error) {
      console.error('更新用户信息失败:', error)
      return false
    }
  },

  addOnlineUser: (user: OnlineUser) => {
    set((state) => {
      // 使用 MAC 地址去重
      const exists = state.onlineUsers.some((u) => u.macAddress === user.macAddress)
      if (exists) {
        return {
          onlineUsers: state.onlineUsers.map((u) =>
            u.macAddress === user.macAddress ? user : u
          )
        }
      }
      return { onlineUsers: [...state.onlineUsers, user] }
    })
  },

  removeOnlineUser: (macAddress: string) => {
    set((state) => ({
      onlineUsers: state.onlineUsers.filter((u) => u.macAddress !== macAddress)
    }))
  },

  updateOnlineUser: (user: OnlineUser) => {
    set((state) => ({
      onlineUsers: state.onlineUsers.map((u) =>
        u.macAddress === user.macAddress ? user : u
      )
    }))
  }
}))

// 初始化事件监听 - 返回取消订阅函数
export function initUserStoreListeners(): () => void {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return () => {}
  }

  console.log('[UserStore] 初始化事件监听')

  const unsubscribeOnline = window.electronAPI.on('user:online', (...args: unknown[]) => {
    const user = args[0] as OnlineUser
    console.log('[UserStore] 收到 user:online 事件:', user.nickname)
    useUserStore.getState().addOnlineUser(user)
  })

  const unsubscribeOffline = window.electronAPI.on('user:offline', (...args: unknown[]) => {
    const data = args[0] as { macAddress: string }
    console.log('[UserStore] 收到 user:offline 事件:', data.macAddress)
    useUserStore.getState().removeOnlineUser(data.macAddress)
  })

  const unsubscribeUpdate = window.electronAPI.on('user:update', (...args: unknown[]) => {
    const user = args[0] as OnlineUser
    console.log('[UserStore] 收到 user:update 事件:', user.nickname)
    useUserStore.getState().updateOnlineUser(user)
  })

  return () => {
    unsubscribeOnline()
    unsubscribeOffline()
    unsubscribeUpdate()
  }
}
