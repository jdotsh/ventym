import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Use string-literal unions, not enum.' },
      ],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'no-console': 'error',
    },
  },
  { files: ['src/utils/logger.ts', 'db/seed.ts', 'drizzle.config.ts'], rules: { 'no-console': 'off' } },
  // `*-main/` = local reference repos (study only); fence them all from the build.
  { ignores: ['dist/', '.wrangler/', 'node_modules/', '**/*-main/'] },
)
