import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'

// Focused behavior rules. Historical findings are governed by exact fingerprints,
// not disabled files or directory-wide exemptions.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/shared/api/generated.ts', 'vendor/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': hooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },
]
