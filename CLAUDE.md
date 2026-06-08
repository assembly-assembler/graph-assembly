# CLAUDE.md — graph-assembly (k-vote-graph)

> 다음 세션은 이 파일을 먼저 읽고 시작. 제22대 국회 **의정활동(발의·표결)** 을 보여주는 정적 사이트.
> 슬로건 "국회의 활동을 한 눈에". GovTrack / TheyWorkForYou 의 한국판.

- **Live**: https://assembly-assembler.github.io/graph-assembly/
- **Repo**: github.com/assembly-assembler/graph-assembly (public, GH Pages)
- 로컬 dir: `/Users/chajinwoo/Dev/k-vote-graph`

## 현재 상태 (2026-06-06)
- Astro 정적 사이트 **배포됨**. 데이터 **적재 완료**: 의원 300 / 발의 17,333 / 표결 473,594행 / **법안 제안이유·주요내용 원문 17,292건**.
- **UI**: 메인 = **이번 달**(가운데 `‹ 2026년 6월 ›` 화살표로 월 이동) + **사람별 카드**(그리드).
  카드 = **내부 카드뉴스**(‹ › 화살표): 1페이지 = 왼쪽 이름·정당·지역구 + 오른쪽 큰 숫자(발의 N건) + 이 달 표결 요약,
  이후 페이지 = 법안 1개씩(제목 + **gist 한 줄 요약** + **"원문 보기"** → 제안이유·주요내용 모달). "이 의원 보기 →" = 의원 상세.
- 의원 상세(`/members/[MONA_CD]`): 프로필 + 표결 집계 + 대표발의 목록.
- **카드 설명 완성됨**(구 핵심 TODO): 법안 제안이유·주요내용을 likms에서 적재 → 카드에 원문 모달 + **개선 전→후 2줄 요약(gist)**. gist는 `/bill-gist` 스킬(Haiku 서브에이전트 병렬)로 **17,292건 전량 채움 완료**. 신규 법안만 증분.

## 스택 & 구조 (TS 단일 언어)
- **Astro 5** 정적 SSG(어댑터 없음 = 백엔드 0). 런타임은 정적 HTML만, 데이터는 빌드타임에 JSON에서 생성.
- `ingest/` — 적재(TS, **curl 우회**). `assembly/client.ts`(`curlGet` export = WAF 우회 curl 재사용), `db/schema.ts`(향후 Postgres용, **현재 사이트는 미사용**), `scripts/{snapshot,ingest-bills,ingest-votes,ingest-summaries,gist}.ts`
- `src/` — Astro 사이트. `pages/`(index, `m/[month]`, `members/[id]`), `layouts/Base.astro`(헤더·전역CSS·캐러셀 JS·**원문 모달**), `components/ActivityCard.astro`, **`lib/data.ts`**(snapshots → 카드/월 뷰 변환 — 핵심 로직)
- `.claude/skills/bill-gist/` — 카드용 한 줄 요약(gist) 부트스트랩 스킬(루틴으로 배치 반복). 원문→gist를 LLM(루틴의 Claude)이 작성, 출처필수·추측금지.
- `snapshots/` — API 원본 JSON(**빌드 입력, repo 커밋됨**): `members_22`, `bills_22`(18MB), `vote_records_22`(44MB, compact `{b,m,v,d}`), `bill_summaries_22`(26MB, `{billId:원문}`), `bill_summaries_llm_22`(`{billId:gist}`), `vote_bills_22`, *_head 등
- `.github/workflows/deploy.yml` — push/주간 cron → (시크릿 있으면 재적재) → Astro 빌드 → Pages 배포

## 명령
```
npm run dev        # 개발서버 (단, dev는 CSS 깜빡임=FOUC 있음. 사용자가 싫어함 → preview로 보여줄 것)
npm run build      # 정적 빌드 dist/
npm run preview    # 빌드본 서빙(깜빡임 없음). 보여줄 땐 이걸로.
npm run ingest     # 발의+표결 전량 적재 (= ingest:bills + ingest:votes)
npm run ingest:summaries  # 법안 제안이유·주요내용 원문 적재(likms). 재개가능, 신규만 증분
npm run gist <next [N]|merge <file>|stats>  # gist 부트스트랩 헬퍼(LLM 호출 X). 보통 /bill-gist 스킬이 사용
npm run snapshot   # 의원300 + 발의 head + 표결 표본
```
`.env`: `ASSEMBLY_API_KEY`(적재용, open.assembly 발급), `DATABASE_URL`(선택, Postgres)

## 데이터원 — 열린국회정보 OpenAPI (라이브 검증 2026-06)
공통: `GET https://open.assembly.go.kr/portal/openapi/{서비스ID}?KEY=&Type=json&pIndex=&pSize=&AGE=22`
응답: `{ [서비스ID]: [ {head:[{list_total_count},{RESULT:{CODE}}]}, {row:[...]} ] }`

| 서비스ID | 데이터 | 핵심 필드 |
|---|---|---|
| `nwvrqwxyaytdsfvhu` | 의원(현직 300, AGE 무시) | **MONA_CD**(조인키), HG_NM, POLY_NM, ORIG_NM, CMIT_NM/CMITS |
| `nzmimeepazxkubdpn` | 발의법률안(AGE=22, 17,333) | BILL_ID, BILL_NAME, **PROPOSE_DT("YYYY-MM-DD")**, PROC_RESULT(null=계류), **RST_MONA_CD**(대표)·**PUBL_MONA_CD**(공동, 콤마분리), DETAIL_LINK |
| `nojepdqqaweusdfbi` | 의원별 표결(**BILL_ID 필수**) | **RESULT_VOTE_MOD**(찬성/반대/기권/불참), MONA_CD, **VOTE_DATE("YYYYMMDD HHMMSS")** |
| `ncocpgfiaoituanbr` | 의안별 표결 집계(AGE=22, 1,595) | BILL_ID, YES_TCNT/NO_TCNT/BLANK_TCNT/MEMBER_TCNT |
| `nwbpacrgavhjryiph` | 본회의 처리안건(1,548) | 라이프사이클 일자 |
| `BILLINFODETAIL` | 의안 상세(BILL_ID) | 심사경과 메타만 — **제안이유/주요내용 없음** |

- 에러코드: `INFO-000` 정상 / `ERROR-290` 키무효 / `INFO-200` 데이터없음 / `ERROR-300` 파라미터누락
- 키는 open.assembly **자체 발급**(전 서비스 공용). data.go.kr/선관위 키와 별개.
- API 스펙 참고: `github.com/hollobit/assembly-api-mcp` (MIT, 287 API). **서버 의존 X, 참고만.**

### 제안이유·주요내용 — likms 의안정보시스템 (OpenAPI엔 없음, 라이브 검증 2026-06)
- `GET http://likms.assembly.go.kr/bill/bi/popup/billSummary.do?billId={BILL_ID}` → **제안이유·주요내용 본문**.
  - **billId만 필요**(우리가 보유). 쿠키/세션/리퍼러 **불필요**. ⚠️ **브라우저 UA 필수**(없으면 12바이트 차단).
  - 본문은 `<pre class="print_pre">` 안. 첫 줄 "제안이유 및 주요내용" 헤더만 제거(`ingest-summaries.ts`가 처리).
  - 원천에 데이터 없으면 "해당 의안 정보를 찾을 수 없습니다"(전체 17,333 중 41건) → 빈 문자열로 저장(추측 금지).
  - (역설계 경로) `billDetailPage.do` → JS가 탭/팝업을 AJAX로 로드. 본문 팝업이 위 `billSummary.do`. PDF/AJAX-세션 경로는 불필요.

## ⚠️ 핵심 함정 (반드시 기억)
1. **WAF / curl 우회**: open.assembly가 Node `fetch`(undici) TLS 지문을 차단 → **같은 키에도 ERROR-290**. `ingest/assembly/client.ts`는 `child_process`로 **curl(브라우저 UA)** 호출. CI 러너에서도 curl 동작. **likms도 동일**(UA 없으면 차단) → `curlGet` 재사용.
2. **표결일 포맷 함정**: `VOTE_DATE`는 `"YYYYMMDD HHMMSS"`(**대시 없음**). 월 추출 = `slice(0,4)+'-'+slice(4,6)`. 발의일 `PROPOSE_DT`는 `"YYYY-MM-DD"`로 **포맷이 다름** — 한번 이걸로 월 조인 버그 났었음.
3. **GH Pages base**: 프로젝트 사이트라 base = `/graph-assembly`. `astro.config.mjs`가 `PUBLIC_BASE_PATH`(워크플로우가 repo명 주입) trailing slash 정규화. 모든 링크는 `import.meta.env.BASE_URL` 접두 사용.
4. **GH Actions `if`에 secrets 못 씀** → job-level `env`로 매핑 후 `env.X` 체크(deploy.yml 참고).
5. **gh 인증**: 푸시는 `assembly-assembler` 계정 토큰 필요. fine-grained PAT면 Contents+Workflows write 권한 + repo 포함. git이 macOS keychain 낡은 토큰 쓰면 `git config credential.helper`를 gh로 고정.
6. **큰 데이터 커밋**: bills 18MB + votes 44MB + summaries 26MB가 repo에 커밋(빌드 입력). 무거워지는 중 → 빈건 제외·압축·파생 단계 검토 시점.

## 설계 원칙
- **런타임 LLM 0**: 화면 사실은 JSON/DB 조회만. 환각 0. LLM은 **빌드타임 부트스트랩**에만 허용.
- **출처 필수**: 모든 사실은 열린국회정보 근거. **추측 금지**(없는 내용 지어내지 말 것).
- **디자인**: 순백 캔버스, `#171717` 잉크, Inter(+JetBrains Mono), 헤어라인, editorial(Expo 톤). 카드 = **각진(radius 0) 진한 테두리**. UI 텍스트는 **한국어**. 헤더 = "국회의 활동을 한 눈에"(영어 워드마크 금지).

## 다음 작업
- [x] **카드 설명 데이터원 확보**: likms `billSummary.do`로 제안이유·주요내용 원문 전량 적재(`ingest:summaries`). 카드 = 원문 모달 + gist. (PDF/LLM-추출 불필요했음)
- [x] **gist 전량 채우기**: `/bill-gist`(Haiku 서브에이전트 병렬, Workflow)로 17,292건 **개선 전→후** 요약 완성. `bill_summaries_llm_22.json`(4.7MB)에 `{billId:{before,after}}` 객체(한 줄 아님). 신규 법안만 자동 증분.
- [ ] CI(`deploy.yml`)에 `ingest:summaries` + `/bill-gist` 증분 단계 추가(신규 법안 원문·gist 자동 반영).
- [ ] **gist 품질 점검**: 17,292건 중 대부분 Haiku 생성 → 표본 검수(특히 정치·민감 법안 중립성). 이상치만 `/bill-gist`로 재생성.
- [ ] 메인 카드 그리드 **아래에 추가 섹션**(월별 아닌 다른 뷰 — 사용자가 추가 예정).
- [ ] (선택) Node20 액션 버전업, 데이터 파일 경량화, 정당 의석/통계 시각화, 검색.
- [ ] (장기) Postgres 적재 경로 — 현재는 snapshots JSON 직접 사용, `db/schema.ts`는 미사용.

## 사용자 협업 메모
- 디자인 까다롭고 빠르게 반복. **시안은 목업(스샷/ASCII)으로 먼저 합의**, 보여줄 땐 `preview`(깜빡임 없음).
- 빌드 전 **데이터원·필드를 라이브로 검증**할 것(추측 엔드포인트/필드 싫어함).
