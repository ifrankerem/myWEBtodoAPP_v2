import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})

const config = [
  {
    // `worker/` is a separate Cloudflare Workers package with its own tsconfig.
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts', 'worker/**'],
  },
  ...compat.config({
    extends: ['next/core-web-vitals', 'next/typescript'],
  }),
  {
    rules: {
      // Task photos are data URLs and the static export disables image optimization.
      '@next/next/no-img-element': 'off',
    },
  },
]

export default config
