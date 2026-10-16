# 1016 강의

강의 자료와 실습 내용을 정리하는 저장소입니다.

## 공유 재고관리

- 로컬 실행: `python -m http.server 8000 --bind 127.0.0.1` 실행 후 `http://127.0.0.1:8000/inventory.html`에 접속합니다.
- Vercel 배포: 프로젝트 루트의 `vercel.json`이 `/`를 `/inventory.html`로 연결합니다. Framework Preset은 **Other**, 별도 빌드 명령은 없으며 앱 파일이 있는 저장소 루트를 배포합니다.
- 로그인 없이 모든 방문자가 같은 재고를 조회·편집합니다. Realtime과 5초 간격 조회로 변경을 자동 반영하며, 동시 품목 수정 시 충돌을 감지합니다.
- Supabase 최초 설정 및 기존 로그인 방식에서의 전환은 [SUPABASE.md](SUPABASE.md)를 참고하세요.
