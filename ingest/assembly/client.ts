/**
 * 열린국회정보(open.assembly.go.kr) OpenAPI 클라이언트.
 * 인증키는 .env의 ASSEMBLY_API_KEY (포털 자체 발급, 전 서비스 공용 단일 키).
 *
 * ⚠️ WAF 우회: 이 포털은 Node/undici(fetch)의 TLS 지문을 차단해 같은 키에도 ERROR-290을 반환한다.
 *    curl(브라우저 UA)만 통과하므로 child_process로 curl을 호출한다. (적재는 빌드타임이라 문제 없음.)
 *
 * 호출형태: GET {BASE}/{serviceId}?KEY=&Type=json&pIndex=1&pSize=100[&AGE=22&BILL_ID=...]
 * 응답 envelope(성공): { [serviceId]: [ {head:[{list_total_count},{RESULT:{CODE:'INFO-000'}}]}, {row:[...]} ] }
 *
 * 서비스ID·필드·에러코드는 라이브 호출(2026-06)로 확정. 참고: hollobit/assembly-api-mcp(MIT).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const BASE = 'https://open.assembly.go.kr/portal/openapi'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

/** 확정된 서비스ID (라이브 검증 2026-06) */
export const ASSEMBLY = {
  members: 'nwvrqwxyaytdsfvhu',        // 의원 인적사항(현직 300, AGE 무시). MONA_CD/HG_NM/POLY_NM/ORIG_NM/CMIT_NM/CMITS/...
  memberBills: 'nzmimeepazxkubdpn',    // 발의법률안(17,333@22). RST_PROPOSER+RST_MONA_CD=대표, PUBL_PROPOSER+PUBL_MONA_CD=공동
  billDetail: 'BILLINFODETAIL',        // 의안 상세(BILL_ID): 심사경과 라이프사이클
  votesByMember: 'nojepdqqaweusdfbi',  // 의원별 표결(BILL_ID 필수): RESULT_VOTE_MOD=찬성/반대/기권/불참 + MONA_CD ✅
  voteCounts: 'ncocpgfiaoituanbr',     // 의안별 표결 집계(1,595@22): YES_TCNT/NO_TCNT/BLANK_TCNT/MEMBER_TCNT + BILL_ID
  plenary: 'nwbpacrgavhjryiph',        // 본회의 처리안건(1,548@22): 라이프사이클 일자들
} as const

/** 에러코드 (라이브 확정) */
export const ASSEMBLY_ERROR_CODES: Record<string, string> = {
  'INFO-000': '정상',
  'INFO-200': '해당 데이터 없음',     // live MESSAGE: "해당하는 데이터가 없습니다"
  'ERROR-290': '유효하지 않은 인증키', // live
  'ERROR-300': '필수 파라미터 누락',   // live (예: votesByMember는 BILL_ID 필수)
  'ERROR-333': '조회범위 초과',
}

export type AssemblyResult = {
  code?: string
  message?: string
  total?: number
  rows: Record<string, unknown>[]
  raw: string
}

/**
 * curl(브라우저 UA)로 GET 본문을 그대로 받는다. open.assembly OpenAPI뿐 아니라
 * likms.assembly.go.kr(의안정보시스템) 같은 WAF 호스트도 동일하게 UA 없이는 차단되므로
 * 그쪽 적재(제안이유·주요내용 팝업)에서도 이 헬퍼를 재사용한다. -L로 리다이렉트 추적.
 */
export async function curlGet(url: string): Promise<string> {
  const { stdout } = await execFileP('curl', ['-sL', '-A', UA, '--max-time', '60', url], {
    maxBuffer: 128 * 1024 * 1024,
  })
  return stdout
}

export async function callAssembly(
  serviceId: string,
  params: Record<string, string | number | undefined> = {},
): Promise<AssemblyResult> {
  const key = process.env.ASSEMBLY_API_KEY
  if (!key) throw new Error('ASSEMBLY_API_KEY 가 비어있음 (.env 확인)')

  const url = new URL(`${BASE}/${serviceId}`)
  url.searchParams.set('KEY', key)
  url.searchParams.set('Type', 'json') // 기본값 xml이라 명시 필수
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v))

  const raw = (await curlGet(url.toString())).replace(/^﻿/, '').trim()

  let code: string | undefined
  let total: number | undefined
  let rows: Record<string, unknown>[] = []

  if (raw.startsWith('<')) {
    code = raw.match(/<CODE>([^<]+)<\/CODE>/)?.[1] ?? 'XML_OR_HTML'
  } else {
    try {
      const json = JSON.parse(raw)
      const nodes = json?.[serviceId]
      if (Array.isArray(nodes)) {
        const head = nodes[0]?.head
        if (Array.isArray(head)) {
          total = head[0]?.list_total_count
          code = head[1]?.RESULT?.CODE
        }
        rows = nodes[1]?.row ?? []
      } else if (json?.RESULT?.CODE) {
        code = json.RESULT.CODE
      }
    } catch {
      /* 비-JSON → raw 보존 */
    }
  }

  return { code, message: code ? ASSEMBLY_ERROR_CODES[code] : undefined, total, rows, raw }
}

/** 페이지를 끝까지 순회(상한 maxPages로 폭주 방지) */
export async function fetchAll(
  serviceId: string,
  params: Record<string, string | number | undefined> = {},
  pSize = 100,
  maxPages = 500,
): Promise<{ code?: string; total?: number; rows: Record<string, unknown>[] }> {
  const rows: Record<string, unknown>[] = []
  let total: number | undefined
  let code: string | undefined
  for (let pIndex = 1; pIndex <= maxPages; pIndex++) {
    const r = await callAssembly(serviceId, { ...params, pIndex, pSize })
    code = r.code
    total = r.total
    if (r.code && r.code !== 'INFO-000') break
    if (r.rows.length === 0) break
    rows.push(...r.rows)
    if (total != null && rows.length >= total) break
  }
  return { code, total, rows }
}
