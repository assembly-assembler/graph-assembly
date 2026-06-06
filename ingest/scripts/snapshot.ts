/**
 * 22대 국회 원본 스냅샷. ASSEMBLY_API_KEY 설정 후 `npm run snapshot`.
 *   1) 현직 의원 300명
 *   2) 발의법안 모집단(17,333) head
 *   3) 표결 의안 집계(ncocpgfiaoituanbr) → 표결 BILL_ID 확보
 *   4) 그 BILL_ID로 의원별 표결(nojepdqqaweusdfbi) 표본
 */
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { ASSEMBLY, callAssembly, fetchAll } from '../assembly/client.js'

async function save(name: string, data: unknown) {
  await mkdir('snapshots', { recursive: true })
  await writeFile(`snapshots/${name}.json`, JSON.stringify(data, null, 2))
  console.log(`  → saved snapshots/${name}.json`)
}

async function main() {
  // 1) 현직 의원
  const members = await fetchAll(ASSEMBLY.members, {}, 100)
  console.log(`[의원] code=${members.code} total=${members.total} 수집=${members.rows.length}`)
  await save('members_22', members.rows)

  // 2) 발의법안 모집단 head
  const bills = await callAssembly(ASSEMBLY.memberBills, { AGE: 22, pIndex: 1, pSize: 1 })
  console.log(`[발의] code=${bills.code} total=${bills.total}`)
  await save('bills_22_head', { code: bills.code, total: bills.total, sampleRow: bills.rows[0] ?? null })

  // 3) 표결 의안 집계 → BILL_ID 확보
  const counts = await callAssembly(ASSEMBLY.voteCounts, { AGE: 22, pIndex: 1, pSize: 5 })
  console.log(`[표결의안] code=${counts.code} total=${counts.total}`)
  await save('vote_counts_22_head', { code: counts.code, total: counts.total, rows: counts.rows })

  // 4) 의원별 표결 표본
  const votedBillId = (counts.rows[0] as { BILL_ID?: string } | undefined)?.BILL_ID
  if (votedBillId) {
    const v = await callAssembly(ASSEMBLY.votesByMember, { AGE: 22, BILL_ID: votedBillId, pSize: 300 })
    console.log(`[의원별표결] BILL_ID=${votedBillId} code=${v.code} 행=${v.rows.length} (RESULT_VOTE_MOD)`)
    await save('vote_record_sample', { billId: votedBillId, rows: v.rows })
  }

  console.log('\n다음: 발의 전량(AGE=22 순회)→bill/bill_sponsorship(RST_MONA_CD/PUBL_MONA_CD 조인), 표결 1,595의안 순회→vote_record.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
