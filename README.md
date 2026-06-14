# TraceDesk

**Interactive Personal Activity Journal** — 인터랙티브 개인 컴퓨터 활동 기록 프로그램

TraceDesk는 PC에서의 앱 사용, 복사·붙여넣기, 캡처, 유휴 시간을 **로컬 SQLite**에 기록하고, **필터·검색·상세 보기·내보내기**로 하루를 되짚어볼 수 있는 Tauri 데스크톱 앱입니다.  
Rust 백엔드(백그라운드 에이전트)와 React UI가 **하나의 앱**으로 통합되어 있으며, 별도 서버나 외부 전송 없이 동작합니다.

## 주요 기능

| 영역 | 내용 |
|------|------|
| **활동 수집** | 앱 포커스 · 유휴 · 복사/붙여넣기 · 스크린샷 (백그라운드, 트레이 상주) |
| **활동 일지** | 타임라인 + 필터 가능한 피드 · 항목 클릭 시 상세 패널 |
| **분석** | 생산성 점수 · 주간 리포트 · 시간별 집중도 · 유휴 분석 |
| **내보내기** | JSON 또는 Excel 호환 CSV (날짜·범위 선택) |
| **메뉴 바** | macOS/Windows 네이티브 상단 메뉴 — 화면 이동 · 새로고침 · 내보내기 · 데이터 폴더 |
| **언어** | 한국어 · English (초기 설정 및 설정 탭에서 변경) |
| **테마** | 밝은 모드 · 다크 모드 (설정 및 헤더 토글) |
| **시스템** | CPU · 메모리 · 포트 모니터 |
| **보관** | 월별 gzip 아카이브 · 보관 기간 설정 |

## 아키텍처

```
┌──────────────────────────────────────────┐
│              TraceDesk (Tauri)             │
│  ┌──────────────┐    invoke / events     │
│  │  React UI    │ ◄────────────────────► │
│  └──────────────┘    Rust Core           │
│       Collector Agent ──► SQLite (로컬)   │
│       시스템 트레이 ──► 창 숨김 시에도 수집 │
└──────────────────────────────────────────┘
```

## 요구 사항

- **Rust** 1.77+
- **Node.js** 18+
- macOS / Windows / Linux

### macOS 권한 (선택)

초기 설정 마법사 또는 **설정** 탭에서 사용 여부를 고릅니다. 거부해도 앱은 실행됩니다.

| 권한 | 용도 |
|------|------|
| 접근성 | 활성 앱/창 추적, 유휴 감지 |
| 화면 녹화 | 창 제목 수집 (접근성과 함께 사용) |
| 입력 모니터링 | 다른 앱에서 ⌘C/V · ⌘⇧3/4/5 감지 |

> TraceDesk 창 안에서만 테스트할 때는 **로컬 키 모니터**로 동작할 수 있습니다.  
> 다른 앱 사용 중 기록을 받으려면 **입력 모니터링** 허용이 필요합니다.  
> `tauri dev`와 배포 `.app`은 TCC(권한) 대상이 다를 수 있습니다.

Windows / Linux는 별도 권한 대화상자 없이 활성 창 · 유휴 · 단축키 감지를 시도합니다.

## 설치 · 실행

### 개발

```bash
# 의존성 (최초 1회)
npm install
cd frontend && npm install && cd ..

# Tauri 개발 모드 — 앱 창 + UI 핫리로드
npm run tauri:dev
# 또는: npx tauri dev
```

### 빌드 (배포)

```bash
npm run tauri:build
```

| OS | 결과물 |
|----|--------|
| macOS | `src-tauri/target/release/bundle/dmg/TraceDesk_*.dmg` (설치용), `bundle/macos/TraceDesk.app` |
| Windows | `src-tauri/target/release/bundle/nsis/*.exe` 또는 `bundle/msi/*.msi` |
| Linux | `src-tauri/target/release/bundle/deb/` 등 |

빌드만 하면 설치 창은 **자동으로 뜨지 않습니다**. 생성된 파일을 직접 열거나:

```bash
npm run tauri:build:open   # 빌드 후 macOS는 DMG, Windows는 설치 exe/msi 자동 실행
open src-tauri/target/release/bundle/dmg/TraceDesk_*.dmg
```

**설치 후 동작**

- macOS **DMG**: 더블클릭 → Applications 폴더로 TraceDesk.app 드래그 → 실행
- Windows **NSIS/MSI**: 설치 마법사 실행 → 설치 완료 후 앱 자동 실행 (설정 시)

### 테스트

```bash
npm test   # Rust 단위 테스트 + 프론트 TypeScript 빌드
```

### 자동 업데이트 (GitHub Releases)

TraceDesk는 **Tauri Updater** + [GitHub Releases](https://github.com/toris-dev/TraceDesk/releases)의 `latest.json`으로 업데이트합니다. 별도 업데이트 서버는 필요 없습니다.

**앱에서 확인**

- **설정 → 앱 업데이트 → 업데이트 확인**
- macOS: **TraceDesk → 업데이트 확인…** / Windows·Linux: **도움말 → 업데이트 확인…**

**릴리스 방법 (메aintainer)**

1. 서명 키 생성 (최초 1회, 비밀키는 Git에 올리지 않음):

```bash
npm run tauri signer generate -- -w src-tauri/.tauri/tracedesk.key -f
```

2. GitHub 저장소 **Settings → Secrets → Actions**에 `TAURI_SIGNING_PRIVATE_KEY` 등록  
   (`.key` 파일 내용 전체를 붙여넣기)

3. `src-tauri/tauri.conf.json`의 `plugins.updater.pubkey`에 `.key.pub` 내용이 들어가 있는지 확인

4. 버전 올린 뒤 태그 푸시:

```bash
# Cargo.toml · tauri.conf.json · package.json 버전을 맞춘 후
git tag v0.1.1
git push origin v0.1.1
```

`.github/workflows/release.yml`이 DMG·업데이트 번들·`latest.json`을 Release에 올립니다.

로컬 서명 빌드:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat src-tauri/.tauri/tracedesk.key)"
npm run tauri:build
```

> **참고:** v0.1.0 이전에 설치한 앱에는 업데이터가 없습니다. 업데이트 기능이 포함된 버전을 한 번 수동 설치한 뒤부터 자동 업데이트가 동작합니다.

## UI 구성

### 사이드바

| 화면 | 설명 |
|------|------|
| **활동 일지** | 기본 화면 — 타임라인 · 활동 피드 · 상세 패널 |
| **요약** | KPI · 차트 · 타임라인 미리보기 |
| **행동 기록** | 복사 · 붙여넣기 · 캡처 전용 목록 |
| **타임라인** | Gantt / 목록 · 시간대 필터 |
| **분석** | 생산성 · 주간 리포트 · 앱 · 유휴 |
| **시스템** | CPU · 메모리 · 포트 |
| **설정** | 권한 · 보관 · 미리보기 옵션 |

- **데스크톱**: 왼쪽 사이드바 고정, 오른쪽 콘텐츠만 스크롤
- **좁은 창**: 상단 가로 탭으로 전환

### 상단 툴바 (활동 화면)

| 컨트롤 | 설명 |
|--------|------|
| `‹` `›` | 이전/다음 날 |
| 날짜 버튼 | 팝오버 — 달력 · 최근 7일 |
| **오늘** | 오늘 날짜로 이동 |
| **내보내기 ▾** | JSON / Excel(CSV) 저장 |
| `↻` | 데이터 새로고침 |

### 활동 일지 — 인터랙션

- **시간대 필터**: 타임라인 24칸 클릭 → 해당 시간 기록만 피드에 표시
- **카테고리 필터**: 전체 · 앱 · 행동 · 유휴
- **검색**: 앱 이름 · 클립보드 미리보기 · 파일명
- **상세 보기**: 피드 항목 클릭 → 메타데이터 · 썸네일 · 지속 시간

## 데이터 내보내기

활동 화면 상단 **내보내기**에서 **선택한 날짜** 기준으로 저장 대화상자가 열립니다.

| 메뉴 | scope | 설명 |
|------|-------|------|
| JSON · 활동 일지 | `journal` | 앱 · 행동 · 유휴 (시스템 시작/종료 제외) |
| JSON · 행동 기록 | `actions` | 복사 · 붙여넣기 · 캡처 |
| Excel · 활동 일지 | `journal` | CSV, UTF-8 BOM (Excel 한글 호환) |
| Excel · 행동 기록 | `actions` | CSV |
| JSON · 전체 원본 | `all` | DB 이벤트 전체 |

포함 컬럼 예: `id`, `date`, `time`, `event_type`, `type_label`, `application`, `duration_seconds`, `clipboard_preview`, `filename`, `shortcut` …

클립보드 미리보기 설정이 **ON**이면 `clipboard_preview`가 포함됩니다.

## 복사 · 붙여넣기 · 캡처

### 수집 조건

1. **설정 → 입력 모니터링** ON (저장 즉시 리스너 반영, 재시작 불필요)
2. macOS: **입력 모니터링** 권한 허용 (다른 앱 사용 시)
3. **새로고침(`↻`)** 으로 UI 반영 (실시간 동기화에 의존하지 않음)

### macOS 입력 감지

- **글로벌 NSEvent 모니터**: 다른 앱에서 ⌘C/V · ⌘⇧3/4/5
- **로컬 NSEvent 모니터**: TraceDesk 창 포커스 중 동일 단축키
- 물리 **keyCode** 기반 감지 (한국어 키보드 레이아웃 호환)
- 스크린샷 파일명: `Screenshot …`, `스크린샷 …`, `화면 캡처 …` 등 인식

### 클립보드 미리보기 (선택, 기본 OFF)

- 설정 → **클립보드 내용 미리보기 저장**
- 복사·붙여넣기 시 텍스트 **앞 400자**를 로컬 DB에 저장
- 이미지 클립보드는 `(클립보드 이미지)`로만 표시
- **입력 모니터링** 필요

### 스크린샷 썸네일 (선택, 기본 OFF)

- Desktop · `Pictures/Screenshots` 등 폴더 감시
- **320px** JPEG 썸네일 생성
- ⌘⇧3/4/5 키 이벤트와 파일 자동 연결 (중복 기록 방지)
- 저장 위치: `…/tracedesk/thumbnails/`

## 시스템 트레이

- 창 닫기(×) → **숨기기** (수집 계속)
- **Mac** 메뉴 막대 / **Windows** 알림 영역 아이콘
- 트레이 클릭 또는 **「TraceDesk 열기」** → 창 표시
- **「종료」** → 완전 종료 · 수집 중단
- **Mac Dock** 클릭 → 숨긴 창 복원

## 데이터 저장

### DB 위치

| OS | 경로 |
|----|------|
| macOS | `~/Library/Application Support/tracedesk/tracedesk.db` |
| Windows | `%APPDATA%\tracedesk\tracedesk.db` |
| Linux | `~/.local/share/tracedesk/tracedesk.db` |

이벤트 시각은 **로컬 타임존** 기준으로 저장·조회됩니다.

### 아카이브

| 항목 | 기본값 |
|------|--------|
| 활성 DB 보관 기간 | 90일 |
| 자동 아카이브 | DB ≥ 40MB **또는** 7일 경과 + 보관 기간 초과 데이터 |
| 형식 | `archives/YYYY-MM.db.gz` |

설정 탭에서 보관 기간(60/90/180/365일) · DB 용량 확인 · 수동 아카이브가 가능합니다.

### 자동 실행

- 초기 설정 마법사에서 로그인 자동 실행 · 권한 선택
- `tauri-plugin-autostart` (macOS LaunchAgent / Windows 시작 프로그램)
- 설정 탭에서 언제든 토글

## 프로젝트 구조

```
tracedesk/
├── package.json              # Tauri CLI · test 스크립트
├── frontend/
│   └── src/
│       ├── api/client.ts     # invoke · 이벤트 구독 · 내보내기
│       ├── layout/           # DashboardLayout (사이드바)
│       ├── views/            # ActivityJournalView · OverviewView
│       ├── components/       # ActivityFeed · ActivityToolbar · …
│       └── utils/            # activityFeed · date · platform
└── src-tauri/
    ├── tauri.conf.json
    └── src/
        ├── lib.rs            # Tauri 진입 · 트레이 · collector spawn
        ├── commands.rs       # IPC (통계 · 타임라인 · …)
        ├── export.rs         # JSON / CSV 내보내기
        ├── activity_emit.rs  # copy/paste/screenshot 실시간 emit
        ├── collector/        # agent · clipboard · screenshot · input
        │   └── input_macos.rs  # NSEvent 글로벌·로컬 모니터
        ├── database/         # SQLite · repository
        ├── analytics/        # 생산성 · 주간 · 타임라인
        ├── os/               # 권한 · 플랫폼별 모니터
        └── settings.rs
```

## 성능 · 최적화

- **단일 IPC 조회**: 날짜별 화면 데이터는 `get_activity_bundle` 한 번으로 통계·타임라인·이벤트·분석을 묶어 로드합니다 (기존 9회 invoke 대비).
- **SQLite**: WAL 모드, `synchronous=NORMAL`, 캐시 크기 튜닝, 날짜 범위 쿼리(`>= ? AND < ?`)로 인덱스 활용.
- **Collector**: 입력 이벤트는 `spawn_blocking`으로 처리, 앱 폴링 간격 1초.
- **프론트**: 분석·시스템 화면 `React.lazy`, Vite `manualChunks`(react / recharts), 오늘 날짜는 60초마다 silent refresh.

### 네이티브 메뉴 (macOS / Windows)

| 메뉴 | 항목 |
|------|------|
| **TraceDesk** (mac) / **파일** (Win) | 새로고침 · JSON/CSV 내보내기 · 데이터 폴더 · 설정 · 종료 |
| **편집** | 실행 취소/다시 실행 · 잘라내기/복사/붙여넣기 (웹뷰 표준) |
| **보기** | 오늘로 이동 · 활동 일지~분석 · 시스템 (⌘1–5 단축키) |
| **윈도우** (mac) | 최소화 · 확대/축소 · 창 닫기(트레이로 숨김) |
| **도움말** | 입력 모니터링 권한 · 데이터 폴더 |

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `RUST_LOG` | Rust 로그 레벨 | `tracedesk=info` |

## 개인정보

- 모든 활동 데이터는 **로컬 디스크**에만 저장됩니다.
- 네트워크 전송 · 클라우드 동기화 · 원격 분석 **없음**.

## 라이선스

MIT
