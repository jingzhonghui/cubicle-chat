import { create } from 'zustand'

export interface UserInfo {
  userId: string
  nickname: string
  avatar?: string
  status: 'online' | 'busy' | 'away' | 'offline'
}

export interface OnlineUser extends UserInfo {
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
  updateUserInfo: (info: Partial<UserInfo>) => Promise<void>
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

  updateUserInfo: async (info: Partial<UserInfo>) => {
    try {
      await window.electronAPI.invoke<boolean>('user:updateInfo', info)
      const currentInfo = get().userInfo
      if (currentInfo) {
        set({ userInfo: { ...currentInfo, ...info } })
      }
    } catch (error) {
      console.error('更新用户信息失败:', error)
    }
  },

  addOnlineUser: (user: OnlineUser) => {
    set((state) => {
      const exists = state.onlineUsers.some((u) => u.userId === user.userId)
      if (exists) {
        return {
          onlineUsers: state.onlineUsers.map((u) =>
            u.userId === user.userId ? user : u
          )
        }
      }
      return { onlineUsers: [...state.onlineUsers, user] }
    })
  },

  removeOnlineUser: (userId: string) => {
    set((state) => ({
      onlineUsers: state.onlineUsers.filter((u) => u.userId !== userId)
    }))
  },

  updateOnlineUser: (user: OnlineUser) => {
    set((state) => ({
      onlineUsers: state.onlineUsers.map((u) =>
        u.userId === user.userId ? user : u
      )
    }))
  }
}))

// 初始化事件监听
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.on('user:online', (user: OnlineUser) => {
    useUserStore.getState().addOnlineUser(user)
  })

  window.electronAPI.on('user:offline', (data: { userId: string }) => {
    useUserStore.getState().removeOnlineUser(data.userId)
  })

  window.electronAPI.on('user:update', (user: OnlineUser) => {
    useUserStore.getState().updateOnlineUser(user)
  })
}
