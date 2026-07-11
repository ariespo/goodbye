import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // 仅启用 React Hooks 核心规则,关闭实验性规则
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // 项目当前大量依赖 any 处理动态数据与外部 API,暂降级为警告
      '@typescript-eslint/no-explicit-any': 'warn',
      // 不要求每次 throw 都携带 cause
      '@typescript-eslint/only-throw-error': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/preserve-caught-error': 'off',
    },
  },
])
