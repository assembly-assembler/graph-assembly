/**
 * 22대 본회의 표결 전량 적재.
 *   1) 표결 의안 집계(ncocpgfiaoituanbr, ~1,595) → 의안 목록 + 찬반 집계
 *   2) 각 의안의 의원별 표결(nojepdqqaweusdfbi, BILL_ID별) → compact 행
 * compact: { b:BILL_ID, m:MONA_CD, v:RESULT_VOTE_MOD(찬성/반대/기권/불참), d:VOTE_DATE }
 * 실행: npm run ingest:votes  (≈1,595 호출, 수 분 소요)
 */
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { ASSEMBLY, callAssembly, fetchAll } from '../assembly/client.js'

async function main() {
  await mkdir('snapshots', { recursive: true })

  console.log('표결 의안 집계 적재…')
  const agg = await fetchAll(ASSEMBLY.voteCounts, { AGE: 22 }, 100)
  console.log(`[표결의안] ${agg.rows.length}건 (code=${agg.code})`)
  await writeFile('snapshots/vote_bills_22.json', JSON.stringify(agg.rows))

  console.log('의안별 의원 표결 순회…')
  const out: { b: string; m: string; v: string; d: string }[] = []
  let i = 0
  for (const row of agg.rows as Record<string, string>[]) {
    const billId = row.BILL_ID
    if (!billId) continue
    const v = await callAssembly(ASSEMBLY.votesByMember, { AGE: 22, BILL_ID: billId, pSize: 1000 })
    for (const r of v.rows as Record<string, string>[]) {
      if (!r.MONA_CD) continue
      out.push({ b: billId, m: r.MONA_CD, v: r.RESULT_VOTE_MOD, d: r.VOTE_DATE })
    }
    if (++i % 100 === 0) console.log(`  ${i}/${agg.rows.length} 의안 · ${out.length} 표결행`)
  }
  await writeFile('snapshots/vote_records_22.json', JSON.stringify(out))
  console.log(`saved snapshots/vote_records_22.json (${out.length} records)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
