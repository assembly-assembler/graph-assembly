import { defineConfig } from 'astro/config'

// GitHub Pages 프로젝트 사이트: https://assembly-assembler.github.io/<repo>/
// CI(deploy.yml)가 PUBLIC_BASE_PATH=/<repo> 주입. 로컬/사용자사이트는 '/'.
export default defineConfig({
  site: 'https://assembly-assembler.github.io',
  base: process.env.PUBLIC_BASE_PATH ?? '/',
  // 어댑터 없음 = 완전 정적(SSG). 백엔드 0.
})
