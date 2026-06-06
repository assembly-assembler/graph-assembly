import membersRaw from '../../snapshots/members_22.json'

export type Member = {
  monaCd: string
  name: string
  hanja?: string
  eng?: string
  party: string
  district: string
  electType?: string
  reele?: string
  committees?: string
  leadCommittee?: string
  position?: string
  tel?: string
  email?: string
  homepage?: string
  photo: string
}

const clean = (v: unknown) => {
  const s = (v ?? '').toString().trim()
  return s.length ? s : undefined
}

const raw = membersRaw as Record<string, unknown>[]

export const members: Member[] = raw
  .map((r) => ({
    monaCd: String(r.MONA_CD),
    name: String(r.HG_NM ?? ''),
    hanja: clean(r.HJ_NM),
    eng: clean(r.ENG_NM),
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
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

export function memberByMona(monaCd: string): Member | undefined {
  return members.find((m) => m.monaCd === monaCd)
}

/** 정당별 의석 분포 (내림차순) */
export function partyCounts(): { party: string; count: number }[] {
  const map = new Map<string, number>()
  for (const m of members) map.set(m.party, (map.get(m.party) ?? 0) + 1)
  return [...map.entries()]
    .map(([party, count]) => ({ party, count }))
    .sort((a, b) => b.count - a.count)
}
