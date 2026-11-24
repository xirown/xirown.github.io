# 🌊 Pureripple

맑은 물결처럼, 마음에 남은 것들을 천천히 적어 두는 개인 블로그입니다.
서버 없이 돌아가는 **정적 사이트**라서 GitHub Pages 에 올리면 **평생 무료**로 운영할 수 있어요.

- 글은 `posts/` 폴더의 **마크다운 파일**로 쌓입니다.
- 새 글을 추가하려면 파일 하나 만들고 `python3 add-post.py` 한 번만 실행하면 끝입니다.
- 컴퓨터 없이도 **`/admin` 관리자 페이지**에서 바로 쓰고 고칠 수 있습니다(아래 4번).
- 검색엔진 공개/비공개, 구글·네이버 인증 코드, 방문자 통계(GoatCounter)는 **`/admin` → 사이트 설정**에서 관리합니다(아래 4-⑤).
- 글마다 공유 카드(`p/글주소.html`), RSS(`feed.xml`), 검색엔진 지도(`sitemap.xml`)가 자동으로 함께 갱신됩니다.
- **KO / EN** 버튼으로 한글·영문 화면을 오갈 수 있고, 관리자에서 글마다 영문 버전을 넣을 수 있습니다(아래 4-⑥).
- 글꼴·사진·스타일이 모두 이 폴더 안에 있어서, 다른 곳에서 끌어오는 것이 없습니다(글꼴만 Google Fonts).

---

## 1. 내 컴퓨터에서 미리 보기

이 폴더에서 아래를 실행하고 브라우저에서 <http://localhost:8000> 을 열면 됩니다.

```bash
cd pureripple-blog
python3 -m http.server 8000
```

> ⚠️ `index.html` 파일을 더블클릭해서 열면(`file://`) 브라우저 보안 때문에 글 목록이 나타나지 않습니다.
> 꼭 위처럼 **로컬 서버**로 열어 주세요. (GitHub Pages 에 올린 뒤에는 그냥 주소로 열면 됩니다.)

---

## 2. GitHub Pages 에 올리기 (무료, 5분)

### ① 저장소 만들기

1. <https://github.com/new> 접속
2. **Repository name** 에 `xirown.github.io` 라고 입력 (아이디가 `xirown` 일 때)
3. **Public** 선택 → **Create repository**

> `아이디.github.io` 라는 이름으로 만들면 주소가 `https://xirown.github.io` 가 되어 가장 깔끔합니다.
> 다른 이름(예: `pureripple`)으로 만들면 주소는 `https://xirown.github.io/pureripple/` 이 됩니다.

### ② 파일 올리기

**방법 A — 명령어로 (한 번만 하면 됨)**

```bash
cd pureripple-blog
git init
git add .
git commit -m "Pureripple 첫 배포"
git branch -M main
git remote add origin https://github.com/xirown/xirown.github.io.git
git push -u origin main
```

**방법 B — 웹사이트에서 끌어다 놓기**

1. 새로 만든 저장소 화면에서 **uploading an existing file** 클릭
2. `pureripple-blog` 폴더 **안의 파일들**(index.html, post.html, admin.html, admin/, style.css, admin.css, admin.js, app.js, posts.json, posts/, assets/ …)을 전부 끌어다 놓기
3. 아래 **Commit changes** 클릭

### ③ 페이지 켜기

1. 저장소 → **Settings** → 왼쪽 메뉴 **Pages**
2. **Source**: `Deploy from a branch`
3. **Branch**: `main` / 폴더는 `/ (root)` → **Save**
4. 1~2분 뒤 위쪽에 뜨는 주소(`https://xirown.github.io`)로 접속하면 끝!

이후에는 글을 고치거나 추가해서 `push` 할 때마다 1분 안에 자동으로 반영됩니다.

---

## 3. 새 글 쓰는 방법

### ① `posts/` 안에 마크다운 파일 만들기

예: `posts/my-first-rain.md`

```markdown
---
title: 첫 비가 온 날
category: 일상
date: 2026-12-01
summary: 카드에 보여 줄 한두 문장 요약.
cover: assets/covers/night-books.jpg
tags: 비, 산책
featured: false
---

여기부터 본문입니다. 마크다운으로 자유롭게 쓰면 됩니다.

## 소제목

문단을 쓰고, **굵게**나 *기울임*, [링크](https://example.com)도 됩니다.

> 인용문은 이렇게.

- 목록
- 목록
```

| 항목 | 설명 |
| --- | --- |
| `title` | 글 제목 (필수) |
| `category` | `일상` / `생각` / `작업·공부` 중 하나 (필수) |
| `date` | `2026-12-01` 형식 (필수) |
| `summary` | 카드와 글 상단에 보이는 요약 |
| `cover` | 카드·글 상단 사진 경로. `assets/covers/` 에 사진을 넣고 경로를 적으면 됨 |
| `tags` | 검색에 걸리는 키워드. 쉼표로 구분 |
| `featured` | `true` 로 적으면 맨 위 **추천 글** 자리로 올라감 (한 편만) |

### ② 목록 갱신하기

```bash
python3 add-post.py
```

`posts.json` 이 자동으로 새로 만들어지고, 읽는 시간(분)도 글자 수로 계산됩니다.
같이 `sitemap.xml`·`feed.xml`·`p/{slug}.html`(공유 카드)도 다시 맞춰집니다(지운 글의 카드는 지워집니다).
실행 결과에 글 목록이 쭉 나오니 확인만 하면 됩니다.

> GitHub 웹사이트에서 글을 쓸 때는: `posts.json` 도 같이 손봐야 해서 조금 번거롭습니다.
> 컴퓨터에서 `add-post.py` 를 돌리거나, 아래 **`/admin` 관리자 페이지**에서 쓰면 이 과정이 자동입니다.
> (`posts.json` 은 손으로 고쳐도 됩니다 — 형식은 파일 안에 그대로 있습니다.)

### ③ 올리기

```bash
git add .
git commit -m "새 글: 첫 비가 온 날"
git push
```

---

## 4. 관리자 페이지에서 글쓰기 — `/admin`

GitHub 에 올린 뒤에는 `https://xirown.github.io/admin` (또는 `/admin.html`)에서
**브라우저로 바로 글을 쓰고 고칠 수 있습니다.** 서버가 없어도 GitHub API 로
`posts/글주소.md` 와 `posts.json` 을 직접 커밋합니다.

### ① 토큰 만들기 (처음 한 번만)

1. <https://github.com/settings/personal-access-tokens/new> 를 엽니다.
2. **Repository access** → *Only select repositories* → `xirown.github.io` 선택
3. **Permissions** → *Repository permissions* → **Contents: Read and write**
4. **Generate token** → `github_pat_…` 값을 복사해 둡니다.
   (클래식 토큰을 쓴다면 **repo** 권한이면 됩니다.)

### ② 로그인

`/admin` 에서 Owner(`xirown`), Repo(`xirown.github.io`), 토큰을 넣고 **로그인**.
연결되면 글 목록이 나오고, **새 글 쓰기**로 바로 쓸 수 있습니다.
토큰은 그 브라우저의 `localStorage` 에만 저장되고 GitHub 외의 곳으로 보내지 않습니다.
공용 컴퓨터에서는 쓰고 나서 **나가기**(토큰 삭제)를 눌러 주세요.

### ③ 화면 둘러보기 (토큰 없이)

로그인 화면의 **미리보기 모드로 둘러보기**를 누르면 기존 `posts.json`·`posts/*.md` 를
읽어 와서 목록·에디터·실시간 미리보기를 그대로 체험할 수 있습니다.
저장·삭제만 되지 않고 안내 창이 뜹니다.

### ④ 할 수 있는 일

| 기능 | 설명 |
| --- | --- |
| 글 관리 | 제목·카테고리·날짜·추천 배지가 보이는 목록, 수정·삭제·글 보기 |
| 글쓰기 | 제목을 쓰면 주소(slug)가 자동 생성(한글은 로마자로), 직접 수정 가능 |
| 본문 | 마크다운 에디터 + 실시간 미리보기(데스크톱 좌우 분할, 모바일 쓰기/미리보기 탭) |
| 서식 | 굵게 · 기울임 · 소제목 · 인용문 · 링크 · 본문 이미지 올리기 |
| 표지 | `assets/covers/` 의 기존 사진 선택 또는 새 이미지 업로드 |
| 발행 | `posts/{slug}.md` 저장 + `posts.json` 자동 갱신(읽는 시간 자동 계산) |
| 삭제 | 확인 창을 거쳐 `.md` 파일과 `posts.json` 항목을 함께 삭제 |
| 영문 버전 | 접이식 **영문 버전(선택)** 에 제목·요약·본문을 넣으면 EN 모드에서 영문으로 보입니다 |

- 이미지 업로드는 `assets/covers/`(표지), `assets/images/`(본문)에 저장됩니다.
- 주소(slug)를 바꾸고 저장하면 새 파일을 만들고 예전 파일은 지웁니다.
- 저장은 GitHub 에 커밋되므로 사이트 반영까지 1분쯤 걸릴 수 있습니다.
- 글을 발행·수정·삭제하면 `sitemap.xml`·`feed.xml`·`p/{slug}.html`(공유 카드)이 함께 갱신됩니다.
- 관리자 화면은 `noindex, nofollow` 라서 검색에 나오지 않고, 공개 페이지 어디에도
  관리자 링크를 두지 않았습니다(주소를 아는 사람만 들어옵니다).

### ⑤ 사이트 설정 — 검색엔진 · 공유 · RSS · 통계

`/admin` 위쪽의 **사이트 설정** 버튼(또는 `#/settings`)에서 아래를 한 번에 관리합니다.

| 항목 | 하는 일 |
| --- | --- |
| 검색엔진 공개 / 비공개 | `robots.txt`, `index.html`·`post.html`·`404.html` 의 robots meta, `sitemap.xml` 을 함께 바꿉니다 |
| Google Search Console 인증 | `google-site-verification` content 값을 넣으면 `index.html` `<head>` 에 meta 로 들어갑니다(비우면 삭제) |
| 네이버 서치어드바이저 인증 | `naver-site-verification` 도 같은 방식 |
| GoatCounter 사이트 코드 | `pureripple` 처럼 넣으면 `index.html`·`post.html` 에 방문자 카운터 스크립트가 들어갑니다(비우면 제거) |
| 저장될 파일 미리보기 | 저장했을 때 바뀔 `robots.txt`·meta·`sitemap.xml` 을 그대로 보여 줍니다 |

- **공개** 상태의 `robots.txt` 는 `Allow: /` + `/admin`·`/admin.html` 만 막고, `Sitemap:` 줄을 넣습니다.
- **비공개** 로 바꾸면 `User-agent: * / Disallow: /` 로 모든 페이지를 막고, 공개 페이지 meta 를 `noindex, nofollow` 로 바꾸며, `sitemap.xml` 을 지웁니다.
- `admin.html`·`admin/index.html` 은 공개/비공개와 상관없이 **항상 noindex** 입니다.
- 검색 등록 절차: [Google Search Console](https://search.google.com/search-console) · [네이버 서치어드바이저](https://searchadvisor.naver.com) 에서 사이트를 추가하고, 알려 주는 인증 코드를 위 칸에 붙여 넣은 뒤 저장하세요.

**통계** 버튼(또는 `#/analytics`)을 누르면 글 수·카테고리 분포·인기 태그·이번 달 발행 수와
검색/RSS/공유 카드/영문 상태를 한 화면에서 볼 수 있습니다.
GoatCounter 코드를 넣어 두면 방문 수도 함께 나오고, 넣기 전에는 샘플 차트와 함께
[무료 가입 안내](https://www.goatcounter.com/signup)(1분)가 보입니다.

### ⑥ 한 / 영 (KO · EN)

- 공개 페이지 오른쪽 위 **KO / EN** 버튼으로 언어를 바꿉니다. 고른 언어는 브라우저(`localStorage`)에 기억됩니다.
- EN 에서는 추천 글/Featured, 전체/All, 카테고리, 검색어 안내, 서로이웃 모달, 공유 버튼, 푸터가 영문으로 바뀝니다.
- 글마다 영문 제목·요약(`title_en`·`summary_en`)과 영문 본문(`posts/{slug}.en.md`)이 있으면 영문으로,
  없으면 원문으로 보여 줍니다. 관리자 에디터의 **영문 버전(선택)** 에서 넣고 지울 수 있습니다.

### ⑦ 공유 카드 · RSS

- 글마다 `p/{slug}.html` 이 생깁니다. 이 주소는 `og:title`·`og:description`·`og:image`·`twitter:card` 가 들어간
  공유 전용 페이지이고, 사람이 열면 `post.html?slug=...` 로 바로 이동합니다.
- 글 아래 **링크 복사**·**X에 공유** 는 이 `p/{slug}.html` 주소를 씁니다.
- `feed.xml` 은 최신 글 순서의 RSS 피드입니다. `index.html`·`post.html` `<head>` 에 자동 발견 링크가 있고, 푸터에 **RSS** 링크가 있습니다.

---

## 5. 폴더 구조

```
pureripple-blog/
├── index.html          메인 (히어로 · 추천 글 · 필터/검색 · 최근 글)
├── post.html           글 읽기 페이지 (?slug=글주소)
├── 404.html            없는 주소로 들어왔을 때
├── admin.html          관리자 · 글쓰기 화면 (noindex)
├── admin/
│   └── index.html      /admin 으로 들어와도 admin.html 을 열어 줌
├── robots.txt          검색엔진 규칙 (공개 상태 기준)
├── sitemap.xml         검색엔진용 글 주소 목록 (관리자가 자동 갱신)
├── feed.xml            RSS 피드 (관리자가 자동 갱신)
├── p/                  글별 공유 카드 (og 태그 + 글 페이지로 이동)
│   └── start.html      예: p/{slug}.html
├── admin.css           관리자 화면 디자인
├── admin.js            GitHub API 로그인 · 에디터 · 발행 · 삭제
├── style.css           전체 디자인
├── app.js              글 목록 렌더링 · 검색 · 마크다운 변환
├── posts.json          글 목록 데이터 (add-post.py · 관리자 페이지가 갱신)
├── add-post.py         새 글 올릴 때 목록·사이트 파일 갱신 스크립트
├── site_files.py       sitemap.xml · feed.xml · p/ 생성 (add-post.py 가 사용)
├── .nojekyll           GitHub Pages 가 .md 파일을 그대로 내려주도록 함
├── posts/              글 원본 (마크다운)
│   ├── start.md
│   ├── sea-day.md
│   ├── why-record.md
│   ├── handmade-web.md
│   ├── night-books.md
│   └── autumn-notes.md
│   (영문 본문이 있는 글은 start.en.md 처럼 .en.md 가 함께 있습니다)
└── assets/
    ├── hero.jpg        첫 화면 바다 사진
    ├── favicon.svg
    ├── covers/         글 카드 표지 사진
    └── images/         관리자 페이지에서 올린 본문 이미지 (처음엔 없음)
```

---

## 6. 디자인 메모

- **색** — 블러시 핑크 종이 바탕(`#fdf1f7`)에 핑크 포인트(`#e11d74`), 대비가 필요한 곳은 딥 로즈·버건디(`#380d23`). 버튼·활성 필터 칩·추천 글 카드·읽기 진행바·푸터까지 핑크 톤으로 통일했고, 색은 `style.css` 맨 위 `:root` 변수 하나로 관리됩니다.
- **글꼴** — 로고·제목은 `Cormorant Garamond` + `Noto Serif KR`, 작은 라벨은 시스템 산세리프.
- **히어로** — 높이 `clamp(380px, 51vh, 540px)`. 문구는 `What matters to you?` 하나만 남기고, 그 아래에 `mutual friend` 버튼을 두었습니다. 흰 세리프가 묻히지 않게 로즈 톤의 어두운 그라데이션을 깔았습니다.
- **서로이웃 신청** — 히어로의 `mutual friend` 버튼을 누르면 닉네임·한마디·연락처를 적는 모달이 열립니다(닫기·ESC·바깥 클릭으로 닫힘). 정적 사이트라 서버 저장 없이 **신청 문장을 만들어 복사**하게 되어 있고, `app.js` 맨 위 `MF_CONTACT` 에 X 아이디나 이메일을 채우면 `X로 보내기`·`이메일로 보내기` 버튼이 함께 나타납니다.
- **사진** — 히어로와 표지는 Unsplash 무료 사진을 내려받아 `assets/` 에 저장했습니다(외부 링크에 의존하지 않음). 출처는 아래와 같습니다.

| 파일 | Unsplash 원본 |
| --- | --- |
| `assets/hero.jpg` | https://images.unsplash.com/photo-1518837695005-2083093ee35b |
| `assets/covers/start.jpg` | https://images.unsplash.com/photo-1500375592092-40eb2168fd21 |
| `assets/covers/sea-day.jpg` | https://images.unsplash.com/photo-1471922694854-ff1b63b20054 |
| `assets/covers/why-record.jpg` | https://images.unsplash.com/photo-1455390582262-044cdead277a |
| `assets/covers/handmade-web.jpg` | https://images.unsplash.com/photo-1499750310107-5fef28a66643 |
| `assets/covers/night-books.jpg` | https://images.unsplash.com/photo-1481627834876-b7833e8f5570 |
| `assets/covers/autumn-notes.jpg` | https://images.unsplash.com/photo-1505142468610-359e7d316be0 |

Unsplash 사진은 상업적 이용을 포함해 무료로 쓸 수 있습니다(출처 표기 필수 아님).

---

## 7. 자주 하는 수정

| 하고 싶은 것 | 고칠 곳 |
| --- | --- |
| 블로그 소개 문구 | `index.html` 의 `#about` 부분 |
| 히어로 문구(`What matters to you?`) | `index.html` 의 `.hero-inner` |
| 색 바꾸기 | `style.css` 맨 위 `:root` 의 변수만 |
| 서로이웃 신청을 받을 X·이메일 | `app.js` 맨 위 `MF_CONTACT` (`x`·`email`) |
| 글꼴 바꾸기 | `index.html`·`post.html` 의 Google Fonts `<link>` 와 `style.css` 의 `--font-*` |
| 푸터 문구 | `index.html`·`post.html` 의 `<footer>` |
| 글 지우기 | `posts/` 에서 파일 삭제 → `python3 add-post.py` (또는 `/admin` 에서 삭제) |
| 관리자 토큰 바꾸기 | `/admin` 에서 **나가기** → 새 토큰으로 다시 로그인 |
| 검색 공개/차단 | `/admin` → **사이트 설정** 의 검색엔진 공개 토글 |
| 구글·네이버 인증 코드 | `/admin` → **사이트 설정** 의 인증 코드 칸 |
| GoatCounter 사이트 코드 | `/admin` → **사이트 설정** 의 방문자 통계 칸 |
| 영문 버전 넣기 | `/admin` 에디터의 **영문 버전(선택)** |
| 공유 카드 모양 | `/admin` 의 `sharePageHtml()` (또는 `p/` 파일 직접 수정) |

---

## 8. 알아 두면 좋은 것

- **`posts.json` 은 자동 생성 파일**입니다. 손으로 고쳐도 되지만, `add-post.py` 를 다시 돌리면 덮어써집니다.
- **영문 본문**은 `posts/{slug}.en.md` 입니다. 원문과 같은 글의 다른 언어라 목록에는 한 번만 나오고, `add-post.py` 가 알아서 건너뜁니다.
- 관리자 페이지의 토큰은 그 브라우저에만 남습니다. 브라우저 데이터를 지우면 다시 로그인하면 됩니다.
- **`.nojekyll`** 파일은 지우지 마세요. 없으면 GitHub Pages 가 마크다운을 변환해 버려서 글 본문을 읽지 못합니다.
- 검색은 브라우저에서 제목·요약·태그를 대상으로 합니다(서버 검색 아님). 글이 아주 많아지면 `app.js` 의 `filtered()` 를 손보면 됩니다.
- 주소를 외우기 쉽게 하려면 `post.html?slug=why-record` 대신 나중에 글마다 정적 페이지를 만드는 방법도 있습니다. 지금은 이 방식이 글 추가가 가장 간단합니다.
- `p/{slug}.html` 은 공유용이라 `noindex, follow` 입니다(검색에는 원문 `post.html?slug=...` 만 나가도록 canonical 을 둡니다).
- `robots.txt`·`sitemap.xml`·`feed.xml`·`p/` 는 관리자가 커밋합니다. 손으로 고쳐도 되지만, 다음 저장 때 관리자 화면 기준으로 다시 맞춰집니다.
