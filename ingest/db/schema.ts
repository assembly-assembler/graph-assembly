/**
 * 데이터 모델 — 국회 의정활동(의석·발의·표결) 위키.
 * 데이터원: 열린국회정보(open.assembly.go.kr) 공식 OpenAPI.
 * 설계 참고: Popolo(Membership) + OpenStates(Bill/BillSponsorship/VoteEvent/PersonVote) + popong-models(Cosponsorship).
 *
 * 원칙
 *  1) 출처추적: 모든 사실 행에 source_id + captured_at. 원본 응답은 raw_snapshot에 불변 보관(ELT).
 *  2) 런타임 LLM 0: 화면 사실은 DB 조회로만. 환각 0.
 *  3) 정규화 키: 표결은 MONA_CD(의원코드)로 결정론 조인. 발의자는 의원명 텍스트라 매칭 실패 시
 *     personId=null로 흡수하고 원본 이름(proposerName/voterName)·monaCd를 보존(OpenStates voter-null 패턴).
 */
import {
  pgTable, serial, text, integer, boolean, jsonb, date, timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core'

/* ===== 출처추적 · ELT 백본 ===== */

/** 모든 API 응답 원본을 그대로 보관(재처리·감사·출처 근거) */
export const rawSnapshot = pgTable('raw_snapshot', {
  id: serial('id').primaryKey(),
  endpoint: text('endpoint').notNull(),        // 예: 'openapi/nzmimeepazxkubdpn'
  params: jsonb('params').notNull(),           // { AGE, pIndex, pSize, BILL_ID, ... }
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb('payload').notNull(),
})

/** 인용 가능한 출처 1건 (OpenStates sources[] 패턴) */
export const source = pgTable('source', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(),                // 'assembly_openapi' | 'assembly_bill_detail' | 'news' | ...
  url: text('url'),                            // 예: DETAIL_LINK
  endpoint: text('endpoint'),
  params: jsonb('params'),
  retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull().defaultNow(),
  rawSnapshotId: integer('raw_snapshot_id').references(() => rawSnapshot.id),
  note: text('note'),
})

/* ===== 인물 ===== */

export const person = pgTable('person', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),                // HG_NM (한글성명)
  nameHanja: text('name_hanja'),               // HJ_NM
  nameEng: text('name_eng'),                   // ENG_NM
  birthDate: date('birth_date'),               // BTH_DATE
  gender: text('gender'),                      // SEX_GBN_NM
  sourceId: integer('source_id').references(() => source.id),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ nameIdx: index('person_name_idx').on(t.name) }))

/** 교차 식별자 — 특히 MONA_CD(의원코드): 발의/표결을 person에 정규화 조인하는 핵심 키 */
export const personIdentifier = pgTable('person_identifier', {
  id: serial('id').primaryKey(),
  personId: integer('person_id').notNull().references(() => person.id),
  scheme: text('scheme').notNull(),            // 'assembly_mona_cd' | 'wikidata' | ...
  identifier: text('identifier').notNull(),
}, (t) => ({ uq: uniqueIndex('person_ident_uq').on(t.scheme, t.identifier) }))

export const party = pgTable('party', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),       // POLY_NM
})

export const area = pgTable('area', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),       // ORIG_NM (지역구명; 비례대표는 '비례대표')
})

/* ===== 임기 · 재임 · 위원회 ===== */

/** 대수 (AGE). 22대 = {age:22, name:'제22대', 2024-05-30~2028-05-29} */
export const legislativeTerm = pgTable('legislative_term', {
  id: serial('id').primaryKey(),
  age: integer('age').notNull().unique(),
  name: text('name').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
})

/** 의원직 재임 (Popolo Membership): person × term × party × area */
export const membership = pgTable('membership', {
  id: serial('id').primaryKey(),
  personId: integer('person_id').notNull().references(() => person.id),
  termId: integer('term_id').notNull().references(() => legislativeTerm.id),
  partyId: integer('party_id').references(() => party.id),
  areaId: integer('area_id').references(() => area.id),
  electGbn: text('elect_gbn'),                 // ELECT_GBN_NM (지역구/비례대표)
  reeleGbn: text('reele_gbn'),                 // REELE_GBN_NM (초선/재선…)
  units: integer('units'),                     // UNITS (당선 대수)
  monaCd: text('mona_cd'),                     // 조인 편의상 비정규화 허용
  sourceId: integer('source_id').references(() => source.id),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uq: uniqueIndex('membership_uq').on(t.termId, t.monaCd) }))

export const committee = pgTable('committee', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
})

export const committeeMembership = pgTable('committee_membership', {
  id: serial('id').primaryKey(),
  membershipId: integer('membership_id').notNull().references(() => membership.id),
  committeeName: text('committee_name').notNull(), // CMIT_NM(대표위) / CMITS(소속위 목록 분해)
  role: text('role'),                          // JOB_RES_NM (직책) / '대표위원회' / '소속'
  sourceId: integer('source_id').references(() => source.id),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ===== 의안 · 발의 ===== */

/** 발의법률안 (nzmimeepazxkubdpn) */
export const bill = pgTable('bill', {
  id: text('id').primaryKey(),                 // BILL_ID
  billNo: text('bill_no'),                     // BILL_NO
  name: text('name').notNull(),                // BILL_NAME
  committee: text('committee'),                // COMMITTEE
  committeeId: text('committee_id'),           // COMMITTEE_ID
  proposeDate: date('propose_date'),           // PROPOSE_DT
  procResult: text('proc_result'),             // PROC_RESULT (원안가결/수정가결/대안반영폐기/임기만료폐기/철회…)
  procResultCd: text('proc_result_cd'),        // PROC_RESULT_CD (BILLINFODETAIL)
  procDate: date('proc_date'),                 // PROC_DT (본회의 의결일)
  currCommittee: text('curr_committee'),       // CURR_COMMITTEE (현재 소관위)
  termId: integer('term_id').references(() => legislativeTerm.id),
  detailLink: text('detail_link'),             // DETAIL_LINK (출처 URL)
  proposerText: text('proposer_text'),         // PROPOSER ('○○○의원 등 N인' 표시용)
  sourceId: integer('source_id').references(() => source.id),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ procIdx: index('bill_proc_idx').on(t.procResult) }))

/** 발의자 (대표/공동) — OpenStates BillSponsorship / popong Cosponsorship */
export const billSponsorship = pgTable('bill_sponsorship', {
  id: serial('id').primaryKey(),
  billId: text('bill_id').notNull().references(() => bill.id, { onDelete: 'cascade' }),
  personId: integer('person_id').references(() => person.id), // NULL 허용(미매칭 흡수)
  monaCd: text('mona_cd'),                     // RST_MONA_CD/PUBL_MONA_CD → person 결정론 조인(이름 매칭 불필요)
  role: text('role').notNull(),                // 'sponsor'(대표발의=RST_PROPOSER) | 'cosponsor'(공동=PUBL_PROPOSER)
  proposerName: text('proposer_name'),         // RST_PROPOSER/PUBL_PROPOSER 원본 의원명(표시·검증용)
  sourceId: integer('source_id').references(() => source.id),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ billIdx: index('sponsorship_bill_idx').on(t.billId), personIdx: index('sponsorship_person_idx').on(t.personId) }))

/* ===== 표결 ===== */

/** 의안 단위 표결 헤더 (OpenStates VoteEvent) — 집계는 ncocpgfiaoituanbr 보강 */
export const voteEvent = pgTable('vote_event', {
  id: serial('id').primaryKey(),
  billId: text('bill_id').references(() => bill.id),
  voteDate: date('vote_date'),                 // PROC_DT (의결일)
  result: text('result'),                      // PROC_RESULT_CD (가결/부결)
  memberTcnt: integer('member_tcnt'),          // MEMBER_TCNT (재적/대상)
  yesTcnt: integer('yes_tcnt'),                // YES_TCNT (찬성)
  noTcnt: integer('no_tcnt'),                  // NO_TCNT (반대)
  blankTcnt: integer('blank_tcnt'),            // BLANK_TCNT (기권)
  sessionCd: text('session_cd'),               // SESSION_CD (회기)
  currentsCd: text('currents_cd'),             // CURRENTS_CD (차수)
  termId: integer('term_id').references(() => legislativeTerm.id),
  sourceId: integer('source_id').references(() => source.id),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
})

/** 의원별 표결 (OpenStates PersonVote) — nojepdqqaweusdfbi, 1행 = 1의원×1의안 */
export const voteRecord = pgTable('vote_record', {
  id: serial('id').primaryKey(),
  billId: text('bill_id').notNull().references(() => bill.id),
  voteEventId: integer('vote_event_id').references(() => voteEvent.id),
  personId: integer('person_id').references(() => person.id), // NULL 허용(미매칭 흡수)
  monaCd: text('mona_cd'),                     // MONA_CD (미매칭 보존 + 조인)
  voterName: text('voter_name'),               // HG_NM
  partyName: text('party_name'),               // POLY_NM
  option: text('option'),                      // RESULT_VOTE_MOD (찬성/반대/기권/불참) ✅라이브 확정
  voteDate: date('vote_date'),                 // VOTE_DATE
  sourceId: integer('source_id').references(() => source.id),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ uq: uniqueIndex('vote_record_uq').on(t.billId, t.monaCd), personIdx: index('vote_person_idx').on(t.personId) }))
