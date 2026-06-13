# TraceDesk

**Personal Computer Activity Intelligence System** — Tauri 데스크톱 앱

Rust 백엔드(에이전트 + SQLite)와 React UI가 **하나의 Tauri 앱**으로 통합되어 있습니다.  
별도의 `cargo run` + `npm run dev` 이중 실행이 **필요 없습니다**.

## 아키텍처

```
┌─────────────────────────────────────┐
│           TraceDesk (Tauri)         │
│  ┌─────────────┐   invoke commands  │
│  │ React UI    │ ◄────────────────► │
│  └─────────────┘   Rust Core        │
│        Activity Agent → SQLite      │
└─────────────────────────────────────┘
```

## 요구 사항

- **Rust** 1.77+
- **Node.js** 18+
- macOS / Windows / Linux 지원
- macOS: **접근성**, **화면 녹화**, **입력 모니터링** 권한 (첫 실행 시 요청)
- Windows: 별도 권한 대화상자 없이 활성 창·유휴·단축키 감지

## 실행 (개발)

```bash
# 1. 의존성 설치 (최초 1회)
npm install
cd frontend && npm install && cd ..

# 2. Tauri 개발 모드 — 앱 창 + 핫리로드
npm run tauri:dev
```

또는:

```bash
npx tauri dev
```

## 빌드 (배포)

```bash
npm run tauri:build
```

결과물:
- macOS: `src-tauri/target/release/bundle/macos/TraceDesk.app`, `.dmg`, `.pkg`
- Windows: `src-tauri/target/release/bundle/msi/` (설치 후 자동 실행)
- Linux: `src-tauri/target/release/bundle/deb/` 등

**설치 후 자동 실행**
- macOS **PKG** 설치: `postinstall` 스크립트로 앱 자동 실행
- macOS **DMG**: Applications로 드래그 후 첫 실행 시 **로그인 자동 실행** 등록 (기본 ON)
- Windows **NSIS**: 설치 마법사 완료 후 앱 자동 실행

## 프로젝트 구조

```
tracedesk/
├── package.json          # Tauri CLI 스크립트
├── frontend/             # React + Vite UI
│   └── src/
└── src-tauri/            # Rust (에이전트, DB, Tauri commands)
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── lib.rs        # Tauri 앱 진입점
        ├── commands.rs   # 프론트 ↔ Rust IPC
        ├── collector/    # 활동 수집
        ├── database/     # SQLite
        └── analytics/    # 분석
```

## DB 위치

| OS | 경로 |
|----|------|
| macOS | `~/Library/Application Support/tracedesk/tracedesk.db` |
| Windows | `%APPDATA%\tracedesk\tracedesk.db` |
| Linux | `~/.local/share/tracedesk/tracedesk.db` |

### 데이터 보관 (아카이브)

활성 DB가 커지면 오래된 데이터를 **월별 gzip 압축 SQLite**로 분리 보관합니다.

| 항목 | 기본값 |
|------|--------|
| 활성 DB 보관 기간 | 90일 |
| 자동 아카이브 조건 | DB ≥ 40MB **또는** 7일 경과 + 보관 기간 초과 데이터 존재 |
| 아카이브 형식 | `archives/YYYY-MM.db.gz` |
| 아카이브 경로 | `~/Library/Application Support/tracedesk/archives/` |

설정 탭에서 보관 기간(60/90/180/365일) 변경, DB 용량 확인, 수동 아카이브 실행이 가능합니다.

## 자동 실행

- **초기 설정 마법사**: 설치 후 첫 실행 시 로그인 자동 실행·macOS 권한을 선택
- **로그인 시 자동 실행**: `tauri-plugin-autostart` (macOS LaunchAgent / Windows 시작 프로그램)
- 설정 탭에서 언제든 토글 가능

## 시스템 트레이 (Mac / Windows)

- 창 닫기(×) → **앱 종료가 아니라 숨기기** — 활동 수집은 백그라운드에서 계속됩니다
- **Mac**: 메뉴 막대 · **Windows**: 알림 영역 트레이 아이콘
- 트레이 **왼쪽 클릭** 또는 메뉴 **「TraceDesk 열기」** → 창 다시 표시
- 트레이 메뉴 **「종료」** → 완전히 종료 (수집 중단)
- **Mac Dock** 아이콘 클릭 → 숨겨진 창 다시 열기

## UI — 대시보드

- **왼쪽 사이드바**: 대시보드 · 행동 기록 · 타임라인 · 분석 · 시스템 · 설정
- **대시보드**: KPI 카드(클릭 시 해당 화면 이동) · 행동 피드 · 차트 · 타임라인 미리보기
- **행동 기록**: 복사 · 붙여넣기 · 캡처 전체 내역 (실시간)
- 모바일/좁은 창: 하단 가로 탭으로 전환

## 활동 탭 — 복사 · 붙여넣기 · 캡처

- **활동** 탭 상단(날짜 선택 아래) **「복사 · 붙여넣기 · 캡처」** 패널에서 시간순 내역 확인
- 오늘 날짜면 **실시간** 갱신 (최대 50건)
- **타임라인 Gantt** 하단 **행동** 줄에도 시점 마커(점)로 표시
- **시간별 행동** 차트에서 시간대별 횟수 확인
- 설정에서 **클립보드 미리보기** / **스크린샷 썸네일** ON 시 패널에 내용·이미지 표시

## 클립보드 미리보기 (선택)

- 설정 → **클립보드 내용 미리보기 저장** (기본 OFF)
- 켜면 복사·붙여넣기 시 텍스트 **앞 400자**가 로컬 DB에 저장되고, 활동 탭 **이벤트 기록**에 표시됩니다
- 이미지 클립보드는 `(클립보드 이미지)`로만 표시 (내용 저장 없음)
- **입력 모니터링**이 켜져 있어야 동작합니다

## 스크린샷 썸네일 (선택)

- 설정 → **스크린샷 썸네일 저장** (기본 OFF)
- Desktop / `Pictures/Screenshots` 등에 저장된 캡처 파일을 감지해 **320px 썸네일** 생성
- 단축키 캡처(⌘⇧3 등)는 키보드 이벤트와 파일을 자동 연결해 중복 기록 없이 썸네일 표시
- 썸네일 저장 위치: `~/Library/Application Support/tracedesk/thumbnails/` (Windows: `%APPDATA%\\tracedesk\\thumbnails\\`)

## macOS 권한

초기 설정 또는 **설정 탭**에서 아래 권한 사용 여부를 선택할 수 있습니다.

| 권한 | 용도 |
|------|------|
| 접근성 | 활성 앱/창 추적, 유휴 감지 |
| 입력 모니터링 | 복사, 붙여넣기, 스크린샷 단축키 감지 |

선택한 권한만 시스템 다이얼로그로 요청됩니다. 거부해도 앱은 실행됩니다.

## 권한 (macOS)

앱 실행 시 접근성·입력 모니터링 권한을 요청합니다.  
대시보드 상단 배너에서 **설정 열기** / **권한 요청** 가능.

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `RUST_LOG` | Rust 로그 레vel | `tracedesk=info` |

## 기능

- 활동 수집 (앱 포커스, 유휴, 복사/붙여넣기, 스크린샷)
- 타임라인 · 생산성 분석 · 주간 리포트
- 시스템 모니터 (CPU, 메모리, 포트)
- 로그인 자동 실행 · DB 월별 압축 아카이브
- 로컬 저장 · 외부 전송 없음

## 라이선스

MIT
