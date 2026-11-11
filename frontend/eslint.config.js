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
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Primitivos shadcn exportam `buttonVariants`/`badgeVariants` ao lado do
    // componente, por convenção do próprio shadcn. Só aqui a regra relaxa.
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // O vocabulário exporta duas funções de cor ao lado dos componentes
    // (design.md §8.7): corDeSerie e tomDeIntensidade são a única porta para a
    // rampa de dados, e tirá-las daqui quebraria "a tela importa tudo do
    // page.tsx". Só estes dois nomes escapam da regra.
    files: ['src/components/page.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: ['corDeSerie', 'tomDeIntensidade'] },
      ],
    },
  },
])
