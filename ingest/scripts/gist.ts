/**
 * 카드용 한 줄 요약(gist) 부트스트랩 헬퍼.
 *
 * 원천: snapshots/bill_summaries_22.json  ({ billId: 제안이유·주요내용 원문 })  ← ingest:summaries 산출
 * 산출: snapshots/bill_summaries_llm_22.json  ({ billId: gist })  ← LLM(빌드타임)이 채움
 *
 * 런타임 LLM 0 원칙: 이 스크립트는 LLM을 호출하지 않는다. LLM(루틴의 Claude)은
 * `next`로 받은 원문을 읽고 gist를 만들어 `merge`로 다시 넣는다. (skill: bill-gist 참조)
 *
 * 사용:
 *   tsx ingest/scripts/gist.ts next [N]              # gist 없는 다음 N건을 JSON으로 출력(기본 40)
 *   tsx ingest/scripts/gist.ts chunks <N> <size> <dir>  # 다음 N건을 size개씩 청크파일로 분할(서브에이전트 백필용)
 *   tsx ingest/scripts/gist.ts merge <file>          # {billId:{before,after}} JSON을 snapshot에 병합
 *   tsx ingest/scripts/gist.ts mergedir <dir>        # dir 내 모든 *.json을 일괄 병합
 *   tsx ingest/scripts/gist.ts stats                 # 진행률
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'

const SUMMARIES = 'snapshots/bill_summaries_22.json'
const GISTS = 'snapshots/bill_summaries_llm_22.json'
const BILLS = 'snapshots/bills_22.json'

async function loadJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

type Gist = { before: string; after: string }

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  const summaries = await loadJson<Record<string, string>>(SUMMARIES, {})
  const gists = await loadJson<Record<string, Gist>>(GISTS, {})

  if (cmd === 'stats') {
    const withText = Object.values(summaries).filter(Boolean).length
    const done = Object.keys(gists).length
    console.log(`원문 있는 법안 ${withText} · gist 완료 ${done} · 남음 ${withText - done}`)
    return
  }

  if (cmd === 'next') {
    const n = Number(arg) || 40
    const bills = await loadJson<{ BILL_ID: string; BILL_NAME?: string }[]>(BILLS, [])
    const nameById = new Map(bills.map((b) => [b.BILL_ID, b.BILL_NAME ?? '']))
    const batch = Object.entries(summaries)
      .filter(([id, text]) => text && !(id in gists))
      .slice(0, n)
      .map(([id, text]) => ({ billId: id, name: nameById.get(id) ?? '', raw: text }))
    process.stdout.write(JSON.stringify(batch, null, 2))
    return
  }

  if (cmd === 'chunks') {
    const [, total, size, dir] = process.argv.slice(2)
    const N = Number(total) || 0
    const SZ = Number(size) || 50
    if (!N || !dir) throw new Error('chunks: 사용법 chunks <N> <size> <dir>')
    const bills = await loadJson<{ BILL_ID: string; BILL_NAME?: string }[]>(BILLS, [])
    const nameById = new Map(bills.map((b) => [b.BILL_ID, b.BILL_NAME ?? '']))
    const todo = Object.entries(summaries)
      .filter(([id, text]) => text && !(id in gists))
      .slice(0, N)
      .map(([id, text]) => ({ billId: id, name: nameById.get(id) ?? '', raw: text }))
    await mkdir(dir, { recursive: true })
    let c = 0
    for (let i = 0; i < todo.length; i += SZ) {
      const part = todo.slice(i, i + SZ)
      const name = `chunk-${String(c).padStart(3, '0')}.json`
      await writeFile(`${dir}/${name}`, JSON.stringify(part, null, 2))
      c++
    }
    console.log(`청크 ${c}개 (총 ${todo.length}건, 청크당 ${SZ}) → ${dir}`)
    return
  }

  if (cmd === 'merge' || cmd === 'mergedir') {
    if (!arg) throw new Error(`${cmd}: 경로 필요`)
    const files =
      cmd === 'mergedir'
        ? (await readdir(arg)).filter((f) => f.endsWith('.json')).map((f) => `${arg}/${f}`)
        : [arg]
    let added = 0
    for (const file of files) {
      const incoming = await loadJson<Record<string, Partial<Gist>>>(file, {})
      for (const [id, g] of Object.entries(incoming)) {
        const before = (g?.before ?? '').toString().trim()
        const after = (g?.after ?? '').toString().trim()
        if (before && after) {
          gists[id] = { before, after }
          added++
        }
      }
    }
    await writeFile(GISTS, JSON.stringify(gists))
    console.log(`병합 ${added}건 (${files.length}개 파일) → ${GISTS} (누적 ${Object.keys(gists).length}건)`)
    return
  }

  console.error('사용: gist.ts <next [N] | chunks <N> <size> <dir> | merge <file> | mergedir <dir> | stats>')
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
