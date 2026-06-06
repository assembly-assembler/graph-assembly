# k-vote-graph

**국회 의정활동 위키** — 제22대 국회의 의석·의원과 *그 의원이 실제로 뭘 했는지*(발의 법안·표결)를 출처와 함께 보기 쉽게 정리.
미국 [GovTrack](https://www.govtrack.us/) / 영국 [TheyWorkForYou](https://www.theyworkforyou.com/)의 한국판. (한국 선례 pokr.kr/popong은 2018 종료 → 빈자리.)

## 원칙
- **런타임 LLM 0**: 화면의 모든 사실은 DB 조회로만. 환각 0.
- **출처 필수**: 모든 사실 행에 `source_id` + `captured_at`. 원본 응답은 `raw_snapshot`에 불변 보관(ELT).
- **결정론 지표**: 리포트카드·표결 요약은 원자료로 계산(LLM 불필요).
- **사실/의견 분리**: 발의·표결(사실)과 외부 평가(의견)를 명시 구분, 둘 다 출처 부착.

## 데이터원 (열린국회정보 공식 OpenAPI, 검증됨)
공통: `GET https://open.assembly.go.kr/portal/openapi/{서비스ID}?KEY=&Type=json&pIndex=1&pSize=100&AGE=22`

| 서비스ID | 데이터 | 핵심 필드 | 22대 |
|---|---|---|---|
| `nwvrqwxyaytdsfvhu` | 의원 인적사항(현직) | **MONA_CD**(조인키), POLY_NM, ORIG_NM, CMIT_NM/CMITS | 300명 ✅ |
| `nzmimeepazxkubdpn` | 발의법률안 | RST_PROPOSER+**RST_MONA_CD**(대표), PUBL_PROPOSER+**PUBL_MONA_CD**(공동), PROC_RESULT, DETAIL_LINK | 17,333건 ✅ |
| `nojepdqqaweusdfbi` | 본회의 표결(의원별) | **RESULT_VOTE_MOD**(찬성/반대/기권/불참), MONA_CD — BILL_ID 필수 | roll-call ✅ |
| `ncocpgfiaoituanbr` | 의안별 표결 집계 | YES/NO/BLANK/MEMBER_TCNT, BILL_ID(표결의안 모집단) | 1,595건 ✅ |
| `nwbpacrgavhjryiph` | 본회의 처리안건 | 라이프사이클 일자(LAW/RGS_PROC_DT) | 1,548건 ✅ |
| `BILLINFODETAIL` | 의안 상세 | 심사경과(CMT/LAW/RGS_PROC_DT), PROC_RESULT_CD, CURR_COMMITTEE | BILL_ID별 |

> 조인 핵심: 발의자·표결 **모두 `MONA_CD`로 결정론 조인**(이름 텍스트 매칭 불필요 — 라이브 확인). 표결 적재는 집계(1,595)에서 BILL_ID를 받아 의원별(`nojepdqqaweusdfbi`)로 순회 → ~1,595 호출(rate limit 안전).
> ⚠️ 포털 WAF가 Node `fetch`(undici)를 차단(ERROR-290) → 클라이언트는 **curl 우회**(브라우저 UA). 적재는 빌드타임이라 무방.

## 인증키 발급 (네가 할 일)
1. `open.assembly.go.kr` 접속 → **회원가입 → 로그인**(국회 통합 SSO).
2. **마이페이지 → 인증키 발급**(무료, 즉시). 전 서비스 공용 단일 키.
3. 발급키를 `.env`의 `ASSEMBLY_API_KEY`에 넣기.
4. 확인(라이브): 정상 `INFO-000` / 키무효 `ERROR-290` / 데이터없음 `INFO-200` / 파라미터누락 `ERROR-300`.

> Rate limit: 개발계정 ≈10,000 요청/월(확인 필요) — 의안별 표결 대량 호출 시 주의(표결된 의안만 좁혀서 적재).
> data.go.kr의 국회 항목(15125946 등)은 전부 LINK형 래퍼라 결국 open.assembly.go.kr로 연결됨 → **포털 직접 발급이 정석.**

## 구조
- `ingest/` — TS 적재(열린국회정보 → snapshots). `assembly/client.ts`(curl 우회), `db/schema.ts`, `scripts/snapshot.ts`
- `src/` — **Astro** 정적 사이트(의원 프로필·검색). `pages/`, `layouts/`, `lib/data.ts`
- `snapshots/` — API 원본 덤프(빌드 입력, repo 커밋)
- `.github/workflows/deploy.yml` — GitHub Pages 빌드·배포(+주간 cron 재적재)

## 데이터 모델 (`ingest/db/schema.ts`, Postgres 적재용)
출처추적 백본 `raw_snapshot`·`source`·`person`·`party`·`area`·`person_identifier` +
`legislative_term`(대수) · `membership`(재임) · `committee(_membership)` ·
**`bill`** · **`bill_sponsorship`**(대표/공동) · `vote_event` · **`vote_record`**(의원별 찬반).
설계 참고: Popolo(Membership), OpenStates(Bill/PersonVote), popong-models(Cosponsorship).
API 스펙·서비스ID·필드·에러코드는 [hollobit/assembly-api-mcp](https://github.com/hollobit/assembly-api-mcp)(MIT, 2026-04 실측) 대조로 확정. *서버 의존 없이 참고만.*

## 셋업 / 실행
```bash
npm install
cp .env.example .env        # ASSEMBLY_API_KEY (적재용)
npm run snapshot            # 22대 원본 → snapshots/ (CI에서도 동작)
npm run dev                 # Astro 개발서버 (의원 프로필·검색)
npm run build               # 정적 빌드 → dist/
```

## 배포 — GitHub Pages (백엔드 0)
- `.github/workflows/deploy.yml`: push / 주간 cron → (시크릿 `ASSEMBLY_API_KEY` 있으면 재적재) → Astro 빌드 → Pages 배포.
- **프로젝트 사이트**면 base가 `/<repo>`(워크플로우가 `github.event.repository.name`로 자동 주입). **사용자/조직 사이트**(`assembly-assembler.github.io` repo)면 base `/`.
- 데이터는 읽기전용·배치갱신이라 런타임 서버 불필요(SSG). curl 우회 적재는 Actions 러너에서 동작.
- 활성화: 리포 Settings → Pages → Source = **GitHub Actions**.

## MVP 범위 (단계별)
- **1차**: 의원 프로필(정당·지역구·위원회) + 의원별 **발의 법안 목록·처리결과** + 검색. 모든 행에 DETAIL_LINK 출처.
- **2차**: 본회의 **표결 기록**(의안별 nojepdqqaweusdfbi 순회 → 의원별 찬/반/기권/불참).
- **3차**: GovTrack식 리포트카드(대표발의·공동발의·가결·결석률·초당적 비율, 동료그룹 순위, 표본 부족 시 비표시), TheyWorkForYou식 정책영역 표결 요약.

## 다음 작업
- [x] 라이브 확정(키·필드·표결 서비스·MONA_CD 결정론 조인)
- [x] 의원 프로필 300 + 검색 (Astro SSG, `snapshots/` 기반)
- [ ] GitHub Pages 첫 배포 (리포 생성 → Settings/Pages = GitHub Actions, 시크릿 `ASSEMBLY_API_KEY`)
- [ ] 발의 전량 적재(AGE=22 순회) → `bill` + `bill_sponsorship`(RST/PUBL_MONA_CD)
- [ ] 표결 적재(집계 1,595 → 의원별 `nojepdqqaweusdfbi`) → `vote_record`
- [ ] 의원 페이지에 발의·표결 연결 + 정당별 의석 차트
- [ ] (3차) GovTrack식 리포트카드 지표
