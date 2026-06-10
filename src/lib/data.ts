import membersRaw from '../../snapshots/members_22.json'
import billsRaw from '../../snapshots/bills_22.json'
import voteRecordsRaw from '../../snapshots/vote_records_22.json'
import billSummariesRaw from '../../snapshots/bill_summaries_22.json' // { billId: 제안이유·주요내용 원문 }
import billGistsRaw from '../../snapshots/bill_summaries_llm_22.json' // { billId: 카드용 한 줄 요약(빌드타임 부트스트랩) }

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
  gist?: { before: string; after: string } // 개선 전→후 카드 요약(있을 때만). 출처: 빌드타임 부트스트랩(/bill-gist)
  summaryRaw?: string // 제안이유·주요내용 원문(원문 보기 모달). 출처: 의안정보시스템
}
const summaryByBill = billSummariesRaw as Record<string, string>
const gistByBill = billGistsRaw as Record<string, { before: string; after: string }>
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
    gist: gistByBill[b.BILL_ID],
    summaryRaw: clean(summaryByBill[b.BILL_ID]),
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

/* ===== 제안이유·주요내용이 의안정보시스템에 미등록된 발의 =====
 * likms billSummary의 smry 객체가 null → 서버가 "찾을 수 없습니다" 렌더 = 제목만 있고 본문 없음.
 * 원천에 본문이 없어 카드 요약(gist)을 만들 수 없음(추측 금지로 빈칸 유지). 대부분 처리 전(계류) 발의.
 * 투명성 차원에서 따로 모아 노출. 국회가 원문을 등록하면(증분 적재 시) 목록에서 자동으로 빠짐.
 * 출처: 열린국회정보(발의 메타) + 의안정보시스템(원문 유무). */
export type UnregBill = Bill & { member?: Member }
export const unregisteredBills: UnregBill[] = bills
  .filter((b) => !b.summaryRaw)
  .map((b) => ({ ...b, member: byMona.get(b.rstMona) }))
  .sort((a, b) => b.date.localeCompare(a.date))

/** 해당 월에 대표발의 0건인 현직 의원(이름순) */
export function inactiveMembers(month: string): Member[] {
  const g = feed.find((x) => x.month === month)
  const active = new Set((g?.cards ?? []).map((c) => c.monaCd))
  return members.filter((m) => !active.has(m.monaCd))
}

/** 사람별 22대 누적 대표발의 건수 */
const totalByMona = new Map<string, number>()
for (const b of bills) if (b.rstMona) totalByMona.set(b.rstMona, (totalByMona.get(b.rstMona) ?? 0) + 1)
export function totalBills(mona: string): number {
  return totalByMona.get(mona) ?? 0
}

/* ===== 입법 성과 — 처리결과(PROC_RESULT) 분류 =====
 * 성과(법률반영) = 원안가결·수정가결·대안반영폐기·수정안반영폐기  (내용이 법률에 반영)
 * 무산           = 철회·폐기·임기만료폐기·부결
 * 진행           = 계류(null)
 * "낸 것"보다 "된 것" — 출처: 열린국회정보 PROC_RESULT */
export type Outcome = '성과' | '진행' | '무산'
export function billOutcome(result: string): Outcome {
  if (result.includes('가결') || result.includes('반영')) return '성과'
  if (result.includes('폐기') || result.includes('철회') || result.includes('부결')) return '무산'
  return '진행'
}
export type OutcomeAgg = { total: number; 성과: number; 진행: number; 무산: number }
const outcomeMap = new Map<string, OutcomeAgg>()
for (const b of bills) {
  if (!b.rstMona) continue
  let a = outcomeMap.get(b.rstMona)
  if (!a) { a = { total: 0, 성과: 0, 진행: 0, 무산: 0 }; outcomeMap.set(b.rstMona, a) }
  a.total++; a[billOutcome(b.result)]++
}
/** 사람별 대표발의 처리결과 집계 */
export function outcomeByMona(mona: string): OutcomeAgg {
  return outcomeMap.get(mona) ?? { total: 0, 성과: 0, 진행: 0, 무산: 0 }
}

/* ===== 표결 참여율 & 당론 이탈률 (빌드타임, vote_records 기반 — 새 적재 0) =====
 * 참여율 = (찬+반+기권)/전체 표결.  (불참=그 표결에 표를 던지지 않음)
 *   ⚠ 원내지도부·정부직 겸임자는 구조적으로 불참이 많음 → "출석"이 아니라 "표결 참여"로 명명.
 * 당론 이탈률 = 같은 당 다수 입장(찬/반)과 다르게 던진 비율.
 *   - 정당(현직 POLY_NM 기준)이 그 의안에서 찬/반 ≥ MIN_BLOC 명일 때만 당론선 성립(소수·무소속 자동 제외).
 *   - 기권·불참은 입장이 아니므로 분모/분자에서 제외(찬·반만 계산).
 *   - 표본(qual)이 MIN_SAMPLE 미만이면 비율 숨김. */
const POSITION = new Set(['찬성', '반대'])
const MIN_BLOC = 5     // 당론선 성립에 필요한 그 당의 찬/반 최소 표수
const MIN_SAMPLE = 30  // 비율 노출 최소 표본
const partyOf = (mona: string) => byMona.get(mona)?.party

// pass1: 의안 × 정당 → [찬, 반]
const blocTally = new Map<string, Map<string, [number, number]>>()
for (const vr of voteRecords) {
  if (!POSITION.has(vr.v)) continue
  const p = partyOf(vr.m); if (!p) continue
  let bp = blocTally.get(vr.b); if (!bp) { bp = new Map(); blocTally.set(vr.b, bp) }
  let t = bp.get(p); if (!t) { t = [0, 0]; bp.set(p, t) }
  if (vr.v === '찬성') t[0]++; else t[1]++
}
// 의안 × 정당 → 당론선(찬성|반대)
const partyLine = new Map<string, Map<string, '찬성' | '반대'>>()
for (const [b, bp] of blocTally) {
  const lp = new Map<string, '찬성' | '반대'>()
  for (const [p, [y, n]] of bp) { if (y + n < MIN_BLOC || y === n) continue; lp.set(p, y > n ? '찬성' : '반대') }
  partyLine.set(b, lp)
}
// pass2: 의원별 당론선 표결 수(qual)·이탈 수(def)
const discByMona = new Map<string, { qual: number; def: number }>()
for (const vr of voteRecords) {
  if (!POSITION.has(vr.v)) continue
  const p = partyOf(vr.m); if (!p) continue
  const maj = partyLine.get(vr.b)?.get(p); if (!maj) continue
  let d = discByMona.get(vr.m); if (!d) { d = { qual: 0, def: 0 }; discByMona.set(vr.m, d) }
  d.qual++; if (vr.v !== maj) d.def++
}

export type VoteProfile = {
  total: number
  participation: number | null // (찬+반+기권)/total, 표본부족 시 null
  defection: number | null     // def/qual, 당론선 없음/표본부족 시 null
  qual: number; def: number
}
export function voteProfile(mona: string): VoteProfile {
  const v = voteByMona.get(mona)
  const total = v?.total ?? 0
  const participation = v && total >= MIN_SAMPLE ? (v.찬성 + v.반대 + v.기권) / total : null
  const d = discByMona.get(mona)
  const defection = d && d.qual >= MIN_SAMPLE ? d.def / d.qual : null
  return { total, participation, defection, qual: d?.qual ?? 0, def: d?.def ?? 0 }
}

/* ===== 동료그룹 = 정당 × 선수(초선 / 재선+) ===== */
const MIN_PEER = 10 // 동료 중앙값을 보여줄 최소 그룹 크기
export const termBucket = (m: Member) => (m.reele === '초선' ? '초선' : '재선+')
export const peerKey = (m: Member) => `${m.party} · ${termBucket(m)}`
const median = (xs: number[]): number | null =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null

export type PeerStat = { key: string; party: string; term: string; size: number; partMed: number | null; defMed: number | null }
const peerAcc = new Map<string, { size: number; part: number[]; def: number[] }>()
for (const m of members) {
  const k = peerKey(m)
  let a = peerAcc.get(k); if (!a) { a = { size: 0, part: [], def: [] }; peerAcc.set(k, a) }
  a.size++
  const vp = voteProfile(m.monaCd)
  if (vp.participation != null) a.part.push(vp.participation)
  if (vp.defection != null) a.def.push(vp.defection)
}
const peerStatMap = new Map<string, PeerStat>()
for (const m of members) {
  const k = peerKey(m)
  if (peerStatMap.has(k)) continue
  const a = peerAcc.get(k)!
  peerStatMap.set(k, {
    key: k, party: m.party, term: termBucket(m), size: a.size,
    partMed: a.size >= MIN_PEER ? median(a.part) : null,
    defMed: a.size >= MIN_PEER ? median(a.def) : null,
  })
}
/** 의원의 동료그룹 통계(중앙값). 그룹이 작으면 partMed/defMed = null */
export function peerStat(m: Member): PeerStat {
  return peerStatMap.get(peerKey(m))!
}
/** 메인 섹션용: 표본 충분한 주요 동료그룹(크기순) */
export const peerStats: PeerStat[] = [...peerStatMap.values()]
  .filter((p) => p.size >= MIN_PEER)
  .sort((a, b) => b.size - a.size)

/** 동료그룹 안에서 당론 이탈률 높은 의원 n명(소신표결). 출처: 표결기록 */
export function mostIndependent(key: string, n = 2): { member: Member; defection: number }[] {
  return members
    .filter((m) => peerKey(m) === key)
    .map((m) => ({ member: m, vp: voteProfile(m.monaCd) }))
    .filter((x) => x.vp.defection != null)
    .sort((a, b) => (b.vp.defection! - a.vp.defection!))
    .slice(0, n)
    .map((x) => ({ member: x.member, defection: x.vp.defection! }))
}

/* ===== 메인 분포 띠 — 전체 의원의 참여율·이탈률 히스토그램 ===== */
export type Dist = { bins: number[]; maxBin: number; min: number; max: number; median: number; count: number }
function distOf(values: number[], nBins = 28): Dist | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const min = sorted[0], max = sorted[sorted.length - 1]
  const median = sorted[Math.floor(sorted.length / 2)]
  const span = max - min || 1
  const bins = new Array(nBins).fill(0)
  for (const v of values) {
    let i = Math.floor(((v - min) / span) * nBins)
    if (i >= nBins) i = nBins - 1
    if (i < 0) i = 0
    bins[i]++
  }
  return { bins, maxBin: Math.max(...bins), min, max, median, count: values.length }
}
const allProfiles = members.map((m) => voteProfile(m.monaCd))
export const participationDist = distOf(
  allProfiles.map((p) => p.participation).filter((x): x is number => x != null),
)
export const defectionDist = distOf(
  allProfiles.map((p) => p.defection).filter((x): x is number => x != null),
)
