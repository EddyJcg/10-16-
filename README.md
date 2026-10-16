# 1016 강의

강의 자료와 실습 내용을 정리하는 저장소입니다.

## 공유 재고관리

- 로컬 실행: `python -m http.server 8000 --bind 127.0.0.1` 실행 후 `http://127.0.0.1:8000/inventory.html`에 접속합니다.
- Vercel 배포: 프로젝트 루트의 `vercel.json`이 `/`를 `/inventory.html`로 연결합니다. Framework Preset은 **Other**, 별도 빌드 명령은 없으며 앱 파일이 있는 저장소 루트를 배포합니다.
- 등록된 이메일 계정으로 로그인한 사용자끼리 재고를 공유합니다. 실시간 동기화와 동시 수정 충돌 감지를 지원합니다.
- `/admin.html`에서 관리자 계정으로 로그인하면 사용자 생성, 이메일 및 비밀번호 변경, 사용 중지·재활성화가 가능합니다.
- DB 권한과 Vercel 서버 환경변수 설정은 [SUPABASE.md](SUPABASE.md)를 참고하세요.
