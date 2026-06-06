import { defineConfig } from 'astro/config'

// base는 반드시 앞뒤 슬래시 필요. CI는 PUBLIC_BASE_PATH=/graph-assembly(뒤 슬래시 없음)를
// 주입하므로 trailing slash를 정규화한다. 로컬/사용자사이트는 '/'.
const raw = process.env.PUBLIC_BASE_PATH ?? '/'
const base = raw.endsWith('/') ? raw : raw + '/'

export default defineConfig({
  site: 'https://assembly-assembler.github.io',
  base,
  // 어댑터 없음 = 완전 정적(SSG). 백엔드 0.
})
