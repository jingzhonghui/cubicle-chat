/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 设计令牌 - 亮色主题
        primary: {
          DEFAULT: '#2D7DD2',
          light: '#E8F1FB',
          hover: '#2568B8'
        },
        surface: '#FFFFFF',
        elevated: '#FAFAFA',
        'bg-base': '#F5F5F5',
        'bg-input': '#F0F0F0',
        'text-primary': '#1A1A1A',
        'text-secondary': '#6B7280',
        'text-disabled': '#9CA3AF',
        'border-strong': '#D1D5DB',
        'status-online': '#22C55E',
        'status-busy': '#F59E0B',
        'status-away': '#9CA3AF',
        'status-offline': '#D1D5DB'
      },
      spacing: {
        'nav': '48px',
        'sidebar': '240px',
        'titlebar': '32px'
      },
      borderRadius: {
        'msg': '12px'
      },
      fontFamily: {
        sans: ['Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', '-apple-system', 'sans-serif']
      },
      boxShadow: {
        'sm': '0 1px 3px rgba(0,0,0,0.08)',
        'md': '0 4px 12px rgba(0,0,0,0.10)',
        'lg': '0 8px 24px rgba(0,0,0,0.12)'
      }
    }
  },
  plugins: []
}
