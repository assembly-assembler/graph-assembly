/**
 * 법안 제안이유·주요내용 적재 (likms 의안정보시스템 — open.assembly OpenAPI엔 없음).
 *
 * 출처: GET http://likms.assembly.go.kr/bill/bi/popup/billSummary.do?billId={BILL_ID}
 *   · billId만 있으면 됨(우리가 bills_22.json에 이미 보유). 쿠키/세션/리퍼러 불필요.
 *   · ⚠️ 브라우저 UA 필수(UA 없으면 12바이트로 차단). curlGet이 이미 UA를 붙인다.
 *   · 본문은 <pre class="print_pre"> 안에 통째로. 첫 줄 "제안이유 및 주요내용" 헤더만 제거.
 *   (라이브 검증 2026-06)
 *
 * 산출: snapshots/bill_summaries_22.json  =  { [billId]: string }   (본문 없으면 "")
 *   · 재개 가능: 기존 파일에 있는 billId는 건너뜀. 주기적 체크포인트 저장.
 *   · 1회 전량 적재 후 repo 커밋 → 이후 CI는 신규 법안만 증분.
 *
 * 실행: npm run ingest:summaries           (전량/증분)
 *       SUMMARY_LIMIT=30 npm run ingest:summaries   (소표본 스모크 테스트)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { curlGet } from '../assembly/client.js'

const BILLS_PATH = 'snapshots/bills_22.json'
const OUT_PATH = 'snapshots/bill_summaries_22.json'
const POPUP = 'http://likms.assembly.go.kr/bill/bi/popup/billSummary.do?billId='
const CONCURRENCY = 8
const CHECKPOINT_EVERY = 200

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
}
function decode(s: string) {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
}

/** 팝업 HTML에서 제안이유·주요내용 본문만 추출. 없으면 "" */
function extractSummary(html: string): string {
  const m = html.match(/<pre class="print_pre">([\s\S]*?)<\/pre>/)
  if (!m) return ''
  let text = decode(m[1])
  // 첫 줄 헤더 제거 + 줄별 trim + 빈 줄 정리
  text = text.replace(/^\s*제안이유\s*및\s*주요내용\s*/, '')
  text = text
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text
}

async function fetchSummary(billId: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const html = await curlGet(POPUP + encodeURIComponent(billId))
      if (html && html.length > 50) return extractSummary(html)
    } catch {
      /* 재시도 */
    }
  }
  return ''
}

async function main() {
  const bills = JSON.parse(await readFile(BILLS_PATH, 'utf-8')) as { BILL_ID: string }[]
  const billIds = [...new Set(bills.map((b) => b.BILL_ID).filter(Boolean))]

  let store: Record<string, string> = {}
  try {
    store = JSON.parse(await readFile(OUT_PATH, 'utf-8'))
  } catch {
    /* 최초 실행 */
  }

  let todo = billIds.filter((id) => !(id in store))
  const limit = Number(process.env.SUMMARY_LIMIT) || 0
  if (limit > 0) todo = todo.slice(0, limit)

  console.log(
    `제안이유 적재: 전체 ${billIds.length} · 기존 ${billIds.length - billIds.filter((id) => !(id in store)).length} · 이번 대상 ${todo.length}${limit ? ` (LIMIT ${limit})` : ''}`,
  )
  await mkdir('snapshots', { recursive: true })

  let done = 0
  let filled = 0
  let cursor = 0
  const save = () => writeFile(OUT_PATH, JSON.stringify(store))

  async function worker() {
    while (cursor < todo.length) {
      const id = todo[cursor++]
      const text = await fetchSummary(id)
      store[id] = text
      done++
      if (text) filled++
      if (done % CHECKPOINT_EVERY === 0) {
        await save()
        console.log(`  … ${done}/${todo.length} (본문 ${filled}건) 체크포인트 저장`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await save()
  console.log(`완료: 이번 ${done}건 처리, 본문 ${filled}건 / 누적 ${Object.keys(store).length}건 → ${OUT_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
