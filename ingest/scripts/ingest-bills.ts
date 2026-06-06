/**
 * 22대 발의법안 전량 적재 (~17,333건).
 * 월별 피드/사람별 카드에 필요한 필드 포함: BILL_ID, BILL_NAME, PROPOSE_DT(월 그룹),
 * PROC_RESULT(처리결과), DETAIL_LINK(출처), RST_PROPOSER/RST_MONA_CD(대표발의),
 * PUBL_PROPOSER/PUBL_MONA_CD(공동발의), COMMITTEE.
 * 실행: npm run ingest:bills
 */
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { ASSEMBLY, fetchAll } from '../assembly/client.js'

async function main() {
  console.log('발의 전량 적재 시작 (AGE=22, pSize=100 순회)…')
  const bills = await fetchAll(ASSEMBLY.memberBills, { AGE: 22 }, 100)
  console.log(`[발의] code=${bills.code} total=${bills.total} 수집=${bills.rows.length}`)
  if (bills.code && bills.code !== 'INFO-000') {
    console.error(`  ⚠ ${bills.code}`)
    process.exit(1)
  }
  await mkdir('snapshots', { recursive: true })
  await writeFile('snapshots/bills_22.json', JSON.stringify(bills.rows))
  console.log(`saved snapshots/bills_22.json (${bills.rows.length} bills)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
