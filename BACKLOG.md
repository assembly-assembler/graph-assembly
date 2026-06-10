# BACKLOG — graph-assembly

> 지속 개발 루프(`/dev-loop`)의 **단일 작업 출처**. 한 사이클 = ready 작업 **1개** 완료.
> 사이클 규칙은 `.claude/skills/dev-loop/SKILL.md`, 프로젝트 함정·원칙은 `CLAUDE.md`.

상태 표기:
- `ready` — 루프가 바로 실행 가능
- `needs-user` — 사용자 결정·시안 합의 필요. **루프는 목업·조사·제안까지만**, 구현 금지
- `blocked(사유)` — 선행 조건 대기
- `done(YYYY-MM-DD)` — 완료. 결과 한 줄을 같이 남긴다

## P1 — 지금

- `ready` **CI 주간 재적재 완성** — deploy.yml의 주간 cron이 실제로 사이트 데이터를 갱신하게 만든다.
  - 현황: cron은 `npm run snapshot`(의원 300 + 발의 head + 표결 표본)만 실행하고 **snapshots를 커밋백하지 않음** → 신규 법안·표결이 수동 적재에 의존.
  - 할 일: ① cron 경로에서 `ingest:bills` + `ingest:votes` + `ingest:summaries` 실행(증분 가능 여부·소요시간을 사이클에서 실측 후 전량/증분 결정) ② 변경된 `snapshots/`를 main에 커밋백 — `permissions: contents: write`, 커밋백→push 재트리거 무한루프 방지(`[skip ci]` 또는 push paths 필터) ③ 이후 빌드·배포.
  - gist 증분은 GH Actions에서 불가(LLM 필요) → `/bill-gist` 루틴 몫. CI는 **원문까지만** 책임.
  - 완료 기준: 워크플로우 YAML 문법 검증 통과 + 재트리거 루프 없음 논증. 실제 cron 검증은 푸시 후(푸시는 사용자).

- `ready` **gist 품질 점검(표본 검수)** — 17,292건 대부분 Haiku 생성, 검수 이력 없음.
  - 할 일: 무작위 표본 ~100건 + 정치·민감 키워드(탄핵·선거·노동·검찰·언론 등) 표본을 원문 대조 검수 → 위반 유형(추측·평가어·길이 초과·before/after 비대비·제목 반복) 집계 → 이상치는 `/bill-gist` 규칙으로 재생성·merge.
  - 완료 기준: 위반율·유형 요약을 이 항목의 done 노트에 기록, 발견된 이상치 재생성 완료.

## P2 — 다음

- `ready` **데이터 파일 경량화** — bills 18MB + votes 44MB + summaries 26MB가 repo에 커밋되는 중.
  - 후보: 빌드에 안 쓰는 필드를 뺀 파생 JSON(원본 보존 방식 검토), 빈 summary 제외, 압축. **빌드 출력은 동일해야 함.**
  - 완료 기준: 경량화 전후 `npm run build` 산출물 동등성 확인(주요 페이지 diff) + 용량 절감 수치 기록.

- `ready` **GH Actions 정리** — checkout/setup-node/pages 액션 최신 메이저 확인·버전업, actionlint(있으면) 통과.

## P3 — needs-user (시안 합의 전 구현 금지)

- `needs-user` **메인 카드 그리드 아래 추가 섹션** — 월별이 아닌 다른 뷰, 사용자가 결정 예정.
  - 루프 허용 범위: 후보 뷰 2~3개 ASCII 목업 + 필요한 데이터 가용성 조사까지.
- `needs-user` **정당 의석/통계 시각화** — 디자인 합의 필요.
- `needs-user` **검색** — UX(범위·인덱스 크기) 결정 필요. 루프 허용 범위: 정적 사이트 검색 방식 비교 조사까지.

## 장기 / 보류

- `blocked(필요성 미확정)` **Postgres 적재 경로** — 현재 snapshots JSON 직빌드로 충분. `db/schema.ts` 미사용 유지.

## done

- `done(2026-06)` 카드 설명 데이터원 확보 — likms `billSummary.do`로 제안이유·주요내용 원문 17,292건 적재.
- `done(2026-06)` gist 전량 채우기 — `/bill-gist`로 17,292건 before/after 요약 완성, 신규만 증분.
- `done(2026-06)` 미등록 법안 목록 추가 — `feat: add unregistered bill listing`.
