# 로그인 및 관리자 설정

## Supabase 적용

Supabase 프로젝트의 **SQL Editor**에서 최신 `supabase/schema.sql` 전체를 실행합니다. 기존 로그인 방식으로 설정한 프로젝트도 같은 파일을 다시 실행하면 됩니다. 기존 재고는 유지됩니다.

SQL은 공개 재고 권한을 제거하고, 관리자가 허용한 활성 계정만 재고를 사용하도록 RLS를 변경합니다. 버전 관리 및 Realtime은 유지합니다. 기존 공개 버전을 사용했다면 화면 배포와 별도로 이 SQL을 반드시 다시 적용하세요.

최초 관리자 UUID는 `1a5b77e2-e8b2-4f7f-980d-e1974834be5c`로 지정되어 있습니다. Supabase Authentication의 해당 계정이 실제로 존재하고 이메일과 비밀번호가 설정되어 있어야 합니다. SQL은 해당 계정에 재고 접근용 `app_metadata.inventory_access`를 부여합니다. 비밀번호는 SQL에 적지 않습니다.

## 입고일자 추가

입고일자 기능만 기존 DB에 추가하려면 SQL Editor에서 `supabase/received-date.sql`을 실행합니다. 기존 재고의 입고일자는 빈 값으로 보존되며, 품목을 수정할 때 날짜를 입력할 수 있습니다. 전체 초기 설정 SQL에도 동일한 열이 포함되어 있습니다.

## Vercel 환경변수

Vercel 프로젝트 → **Settings → Environment Variables**에 다음 값을 등록하고 **Redeploy**합니다. 실제 사용할 Production / Preview 환경을 선택하세요.

| 이름 | 값 |
| --- | --- |
| `SUPABASE_URL` | `https://qizreakxgbtlmsxzkzog.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase 프로젝트 Settings → API Keys의 서버용 secret 키 |
| `ADMIN_USER_IDS` | `1a5b77e2-e8b2-4f7f-980d-e1974834be5c` |

서버용 secret 키는 브라우저 설정 파일, Git, 채팅에 넣지 마세요. 기존 프로젝트의 `SUPABASE_SERVICE_ROLE_KEY`도 서버 대체 변수로 지원합니다. 일반 publishable key는 관리자 권한을 갖지 않으므로 서버용 키 대신 사용할 수 없습니다. 여러 관리자는 UUID를 쉼표로 구분합니다.

Supabase Authentication 설정에서 신규 회원가입 허용을 끄는 것을 권장합니다. 이 앱은 자체 회원가입 화면을 제공하지 않으며, 재고 DB는 서버에서 부여하는 `app_metadata.inventory_access`도 검사하므로 임의로 가입한 계정은 재고에 접근할 수 없습니다.

## 관리자 사용

1. `/admin.html`에서 최초 관리자 이메일과 비밀번호로 로그인합니다.
2. 이메일 아이디와 12~128자 비밀번호로 사용자 계정을 만듭니다. 관리자 생성 계정은 이메일 확인 완료 상태입니다.
3. 사용자 목록의 **정보 수정**에서 이메일과 새 비밀번호를 설정합니다. 비밀번호를 비워두면 기존 비밀번호를 유지합니다. 기존 비밀번호는 표시하거나 복구하지 않습니다.
4. **사용 중지 / 재활성화**로 접근을 관리합니다. 기존에 Supabase에서 직접 만든 일반 계정은 이 목록에서 재활성화해야 재고 접근 권한이 생깁니다.

관리자 화면은 사용자 삭제 대신 비활성화를 제공합니다. 관리자 계정 비활성화는 차단합니다. 서버는 액세스 토큰을 검증하고 `ADMIN_USER_IDS`의 UUID와 비교하므로 일반 사용자는 관리자 API를 호출할 수 없습니다.

## 실행

- Vercel: 저장소에 연결된 배포가 완료되면 첫 주소(`/`)에서 재고 화면을 엽니다.
- 로컬 화면 확인: `python -m http.server 8000 --bind 127.0.0.1` 실행 후 `http://127.0.0.1:8000/inventory.html` 또는 `/admin.html`을 엽니다. Python 정적 서버에서는 `/api/admin-users`가 실행되지 않습니다. 관리자 기능은 Vercel 배포 또는 환경변수를 주입한 Vercel 개발 환경에서 확인합니다.
- 재고 화면과 관리자 화면은 각각 로그인합니다. 페이지를 새로 열면 다시 로그인하며 비밀번호와 세션을 브라우저 저장소에 보관하지 않습니다.

## 동시 작업

- Realtime 이벤트를 받으면 목록을 자동 조회합니다. 연결이 끊기거나 이벤트가 지연되어도 5초마다 조회합니다.
- 자동 조회는 작성 중인 입력값을 바꾸지 않습니다.
- + / − 입출고는 DB에서 수량을 원자적으로 가감합니다. 동시 요청도 각각 반영하고 음수 재고를 차단합니다.
- 품목 수정 및 삭제는 읽었던 버전이 현재 버전과 일치할 때만 적용합니다. 그 사이 누군가 수정했다면 충돌을 알리고 덮어쓰지 않습니다. 수정 초안은 유지되므로 최신 목록을 확인한 뒤 수정 취소 후 다시 수정하세요.
- 계정을 사용 중지하면 DB가 기존 토큰의 재고 접근도 차단합니다. 열린 화면은 다음 자동 조회 시 접근을 종료합니다.

## 연결 및 검증

`supabase-config.js`에는 브라우저용 공개 URL과 publishable key만 사용합니다. secret / service_role 키는 넣지 않습니다. 기존 브라우저 로컬 재고는 자동으로 업로드하지 않습니다.

자동 테스트는 `node --test tests/inventory.test.cjs tests/admin.test.cjs`로 실행합니다. 관리자 API는 Vercel Node.js Function이며 Supabase SDK를 서버에서 사용합니다. 실제 계정 생성·비밀번호 변경·비활성화 검증에는 SQL 적용, 최초 관리자 로그인, 서버 환경변수 등록이 필요합니다.
