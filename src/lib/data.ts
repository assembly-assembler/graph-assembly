import membersRaw from '../../snapshots/members_22.json'
import billsRaw from '../../snapshots/bills_22.json'
import voteRecordsRaw from '../../snapshots/vote_records_22.json'

const clean = (v: unknown) => {
  const s = (v ?? '').toString().trim()
  return s.length ? s : undefined
}

/* ===== 의원 ===== */
export type Member = {
  monaCd: string; name: string; party: string; district: string
  electType?: string; reele?: string; committees?: string; leadCommittee?: string
  position?: string; tel?: string; email?: string; homepage?: string; photo: string
}
export const members: Member[] = (membersRaw as Record<string, unknown>[]).map((r) => ({
  monaCd: String(r.MONA_CD),
  name: String(r.HG_NM ?? ''),
  party: String(r.POLY_NM ?? '무소속'),
  district: String(r.ORIG_NM ?? ''),
  electType: clean(r.ELECT_GBN_NM),
  reele: clean(r.REELE_GBN_NM),
  committees: clean(r.CMITS),
  leadCommittee: clean(r.CMIT_NM),
  position: clean(r.JOB_RES_NM),
  tel: clean(r.TEL_NO),
  email: clean(r.E_MAIL),
  homepage: clean(r.HOMEPAGE),
  photo: `https://www.assembly.go.kr/photo/${String(r.MONA_CD)}.jpg`,
}))
const byMona = new Map(members.map((m) => [m.monaCd, m]))
export function memberByMona(id: string) {
  return byMona.get(id)
}

/* ===== 발의법안 ===== */
export type Bill = {
  id: string; no?: string; name: string; date: string; month: string
  result: string; link?: string; committee?: string; rstMona: string; rstName?: string; coCount: number
}
const bills: Bill[] = (billsRaw as Record<string, string>[]).map((b) => {
  const publ = clean(b.PUBL_PROPOSER)
  return {
    id: b.BILL_ID,
    no: clean(b.BILL_NO),
    name: b.BILL_NAME ?? '(제목없음)',
    date: (b.PROPOSE_DT || '').slice(0, 10),
    month: (b.PROPOSE_DT || '').slice(0, 7),
    result: clean(b.PROC_RESULT) || '계류',
    link: clean(b.DETAIL_LINK),
    committee: clean(b.COMMITTEE),
    rstMona: b.RST_MONA_CD || '',
    rstName: clean(b.RST_PROPOSER),
    coCount: publ ? publ.split(',').filter(Boolean).length : 0,
  }
})

/* ===== 표결 (compact: b,m,v,d) ===== */
type VR = { b: string; m: string; v: string; d: string }
const voteRecords = voteRecordsRaw as VR[]

export type VoteSummary = { 찬성: number; 반대: number; 기권: number; 불참: number; total: number }
const emptyVotes = (): VoteSummary => ({ 찬성: 0, 반대: 0, 기권: 0, 불참: 0, total: 0 })
const key = (mona: string, month: string) => `${mona}|${month}`

// VOTE_DATE 형식: "YYYYMMDD HHMMSS" (대시 없음) → "YYYY-MM"
const voteMonth = (d: string) => (d && d.length >= 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}` : '')
const voteByKey = new Map<string, VoteSummary>() // mona|month
const voteByMona = new Map<string, VoteSummary>() // mona (전체)
for (const vr of voteRecords) {
  const month = voteMonth(vr.d || '')
  if (!vr.m || !month) continue
  for (const [mp, k] of [[voteByKey, key(vr.m, month)], [voteByMona, vr.m]] as const) {
    let s = mp.get(k)
    if (!s) { s = emptyVotes(); mp.set(k, s) }
    if (vr.v && vr.v in s) (s as Record<string, number>)[vr.v]++
    s.total++
  }
}
export function voteSummaryByMona(mona: string) {
  return voteByMona.get(mona) ?? emptyVotes()
}

/* ===== 카드 = 대표발의자 × 월 (그 달의 발의 + 표결요약) ===== */
export type Card = { monaCd: string; month: string; member?: Member; bills: Bill[]; votes: VoteSummary }
const cardMap = new Map<string, Card>()
for (const b of bills) {
  if (!b.rstMona || !b.month) continue
  const k = key(b.rstMona, b.month)
  let c = cardMap.get(k)
  if (!c) {
    c = { monaCd: b.rstMona, month: b.month, member: byMona.get(b.rstMona), bills: [], votes: voteByKey.get(k) ?? emptyVotes() }
    cardMap.set(k, c)
  }
  c.bills.push(b)
}

function monthLabel(m: string) {
  const [y, mm] = m.split('-')
  return `${y}년 ${Number(mm)}월`
}
export type MonthGroup = { month: string; label: string; cards: Card[] }
export const feed: MonthGroup[] = [...new Set([...cardMap.values()].map((c) => c.month))]
  .sort((a, b) => b.localeCompare(a))
  .map((month) => ({
    month,
    label: monthLabel(month),
    cards: [...cardMap.values()]
      .filter((c) => c.month === month)
      .sort((a, b) => b.bills.length - a.bills.length || b.votes.total - a.votes.total),
  }))
export const months = feed.map((g) => ({ month: g.month, label: g.label, count: g.cards.length }))
export const latestMonth = feed[0]?.month ?? ''

/** 월 단건 뷰 + 좌우(older/newer) 이동 대상 */
export function monthView(month: string) {
  const i = feed.findIndex((g) => g.month === month)
  if (i < 0) return null
  return {
    group: feed[i],
    older: i < feed.length - 1 ? feed[i + 1] : null, // 왼쪽(과거)
    newer: i > 0 ? feed[i - 1] : null, // 오른쪽(최근)
  }
}

/** 의원 상세용: 그 의원의 대표발의 전체(최신순) */
export function billsByMona(mona: string) {
  return bills.filter((b) => b.rstMona === mona).sort((a, b) => b.date.localeCompare(a.date))
}
