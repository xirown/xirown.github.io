/* ==========================================================================
   Pureripple — app.js
   - index.html : posts.json 을 읽어 추천 글 / 최근 글 / 필터 / 검색 렌더링
   - post.html  : ?slug=... 에 해당하는 마크다운(posts/*.md)을 읽어 본문 렌더링
   외부 라이브러리 없이 동작합니다. (GitHub Pages 같은 정적 호스팅용)
   ========================================================================== */

(function () {
  "use strict";

  var state = {
    posts: [],
    categories: [],
    category: "전체",
    query: "",
    post: null,
    postBodies: null,
    postsIndex: -1
  };

  /* 카테고리 목록은 categories.json 하나로 관리합니다(관리자 페이지에서 추가·삭제). */
  var CATEGORIES_FILE = "categories.json";
  var DEFAULT_CATEGORIES = ["Main", "Minor", "Edu"];

  /* ---------------------------------------------------------------------
     작은 도우미들
     --------------------------------------------------------------------- */
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function toDate(value) {
    if (!value) return new Date(0);
    var parts = String(value).split("-");
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    return new Date(value);
  }

  function formatDate(value) {
    var d = toDate(value);
    if (isNaN(d.getTime())) return value || "";
    return (
      d.getFullYear() +
      "." +
      String(d.getMonth() + 1).padStart(2, "0") +
      "." +
      String(d.getDate()).padStart(2, "0")
    );
  }

  var MONTHS_EN = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  function longDate(value) {
    var d = toDate(value);
    if (isNaN(d.getTime())) return value || "";
    if (LANG === "en") {
      return MONTHS_EN[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
    }
    return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일";
  }

  /* 한국어 기준 대략적인 읽는 시간 (분) */
  function readingTime(text) {
    var chars = String(text || "").replace(/\s+/g, "").length;
    return Math.max(1, Math.round(chars / 400));
  }

  function postUrl(post) {
    return "post.html?slug=" + encodeURIComponent(post.slug);
  }

  /* 공유용 정적 카드 주소 (p/{slug}.html → post.html 로 이동) */
  function sharePageUrl(post) {
    var path = "p/" + encodeURIComponent(post.slug) + ".html";
    try {
      return new URL(path, location.href).href;
    } catch (error) {
      return path;
    }
  }

  /* ---------------------------------------------------------------------
     한 / 영 (KO · EN)
     - 화면의 글자는 TEXT 사전에서 가져오고, 고른 언어는 localStorage 에 남깁니다.
     - 영문 제목·요약(title_en · summary_en)이 있으면 EN 에서 그것을, 없으면 원문을 씁니다.
     --------------------------------------------------------------------- */
  var LANG_KEY = "pureripple.lang";
  var LANG = (function () {
    try {
      return localStorage.getItem(LANG_KEY) === "en" ? "en" : "ko";
    } catch (error) {
      return "ko";
    }
  })();

  var TEXT = {
    ko: {
      featured: "추천 글",
      featuredNote: "Featured",
      recent: "최근 글",
      all: "전체",
      searchPh: "제목이나 태그로 찾기",
      searchAria: "글 검색",
      clearAria: "검색어 지우기",
      resultAll: "모두 {n}편",
      resultSome: "{total}편 중 {n}편",
      emptyTitle: "아직 이 조건에 맞는 글이 없어요",
      emptyBody: "다른 검색어를 넣거나 카테고리를 바꿔 보세요.",
      showAll: "전체 글 보기",
      minRead: "{n}분 읽기",
      readPost: "글 읽기",
      backAll: "모든 글",
      prev: "← 이전 글",
      next: "다음 글 →",
      prevEmpty: "이전 글",
      nextEmpty: "다음 글",
      noPost: "글이 없습니다",
      related: "연관 추천글",
      relatedNote: "Related posts",
      relatedTagNote: "같은 태그",
      seeAll: "전체 보기",
      contents: "Contents",
      toc: "목차",
      share: "공유",
      copyLink: "링크 복사",
      copied: "복사했어요 ✓",
      copyFail: "주소를 복사하지 못했어요",
      shareX: "X에 공유",
      shareNote: "공유 카드",
      notFoundTitle: "글을 찾을 수 없어요",
      notFoundBody: "주소가 바뀌었거나 지워진 글일 수 있어요.",
      noSlugTitle: "어떤 글인지 알려주지 않았어요",
      backToIndex: "글 목록으로 돌아가기",
      loading: "글을 불러오는 중…",
      categories: "Categories",
      elsewhere: "Elsewhere",
      allPosts: "모든 글",
      aboutMenu: "소개",
      rss: "RSS",
      footerLine: "마음에 남은 것들을 적어 두는 개인 블로그. 읽고, 만들고, 다시 적습니다.",
      footerNote: "Pureripple · 개인 블로그",
      toTop: "맨 위로 ↑",
      mfEyebrow: "Mutual friend",
      mfTitle: "서로이웃 <em>신청</em>",
      mfLede: "Pureripple의 새 글을 가장 먼저 나누고, 서로의 기록에 가끔 들르는 이웃이 되고 싶어요. 이름과 한마디만 남겨 주세요.",
      mfName: "닉네임",
      mfNamePh: "서로 부를 이름",
      mfNote: "한마디",
      mfNotePh: "요즘 마음에 남은 것, 혹은 인사 한 줄",
      mfContact: "연락처",
      mfContactPh: "블로그 주소 · X · 이메일",
      mfRequired: "필수",
      mfOptional: "선택",
      mfError: "닉네임을 적어 주세요.",
      mfPrivacy: "남겨 주신 연락처는 서로이웃 답장에만 쓸게요.",
      mfCancel: "닫기",
      mfSubmit: "신청하기",
      mfDoneTitle: "신청서가 준비됐어요",
      mfDoneTitleName: "{name}님, 신청서가 준비됐어요",
      mfDoneBody: "아래 내용을 복사해서 X DM이나 이메일로 보내 주시면, 확인하고 천천히 답장 드릴게요.",
      mfDoneBodySend: "아래 버튼으로 바로 보내 주시면, 확인하고 천천히 답장 드릴게요.",
      mfCopy: "내용 복사",
      mfCopied: "복사했어요 ✓",
      mfCopyFail: "복사가 어려우면 직접 선택해 주세요",
      mfSendX: "X로 보내기",
      mfSendMail: "이메일로 보내기",
      mfMsgTitle: "안녕하세요, Pureripple 서로이웃 신청합니다.",
      mfMsgName: "닉네임",
      mfMsgNote: "한마디",
      mfMsgContact: "연락처",
      aboutQuote: "“작은 물결도 계속 흐르면<br />해안의 모양을 바꾼다.”",
      aboutBody1:
        "Pureripple은 거창한 이야기보다, 지나가는 마음을 붙잡아 두는 곳입니다. 오늘 읽은 문장, 문득 든 생각, 손으로 만든 것들 — 잘 정리되지 않아도 괜찮으니 천천히 쌓아 두려 합니다.",
      aboutBody2:
        "글은 카테고리(<em>Main · Minor · Edu</em>)로 나뉘고, 위쪽 검색창에서 제목이나 태그로 찾을 수 있습니다.",
      title: "Pureripple — 마음에 남은 것들을 적는 곳"
    },
    en: {
      featured: "Featured",
      featuredNote: "Selected",
      recent: "Recent posts",
      all: "All",
      searchPh: "Search by title or tag",
      searchAria: "Search posts",
      clearAria: "Clear search",
      resultAll: "All {n} posts",
      resultSome: "{n} of {total} posts",
      emptyTitle: "Nothing matches yet",
      emptyBody: "Try another word or a different category.",
      showAll: "Show all posts",
      minRead: "{n} min read",
      readPost: "Read post",
      backAll: "All posts",
      prev: "← Older",
      next: "Newer →",
      prevEmpty: "Older post",
      nextEmpty: "Newer post",
      noPost: "No post",
      related: "Related posts",
      relatedNote: "More to read",
      relatedTagNote: "shared tag",
      seeAll: "See all",
      contents: "Contents",
      toc: "Contents",
      share: "Share",
      copyLink: "Copy link",
      copied: "Copied ✓",
      copyFail: "Could not copy the link",
      shareX: "Share on X",
      shareNote: "share card",
      notFoundTitle: "Post not found",
      notFoundBody: "The address may have changed, or the post was removed.",
      noSlugTitle: "No post was chosen",
      backToIndex: "Back to the archive",
      loading: "Loading…",
      categories: "Categories",
      elsewhere: "Elsewhere",
      allPosts: "All posts",
      aboutMenu: "About",
      rss: "RSS",
      footerLine: "A personal blog for what stays with me — read, make, write again.",
      footerNote: "Pureripple · a personal blog",
      toTop: "Back to top ↑",
      mfEyebrow: "Mutual friend",
      mfTitle: "Become a <em>mutual friend</em>",
      mfLede: "I'd love to share new Pureripple posts with you first, and drop by your own records now and then. Just leave a name and a line.",
      mfName: "Nickname",
      mfNamePh: "What should I call you?",
      mfNote: "A line",
      mfNotePh: "Something on your mind, or just hello",
      mfContact: "Contact",
      mfContactPh: "Blog · X · email",
      mfRequired: "required",
      mfOptional: "optional",
      mfError: "Please leave a nickname.",
      mfPrivacy: "Your contact is used only to reply to this request.",
      mfCancel: "Close",
      mfSubmit: "Send request",
      mfDoneTitle: "Your note is ready",
      mfDoneTitleName: "{name}, your note is ready",
      mfDoneBody: "Copy it below and send it by X DM or email — I'll read it and reply slowly.",
      mfDoneBodySend: "Use the button below to send it — I'll read it and reply slowly.",
      mfCopy: "Copy note",
      mfCopied: "Copied ✓",
      mfCopyFail: "Please select and copy it yourself",
      mfSendX: "Send on X",
      mfSendMail: "Send by email",
      mfMsgTitle: "Hello, I'd like to be a mutual friend of Pureripple.",
      mfMsgName: "Nickname",
      mfMsgNote: "A line",
      mfMsgContact: "Contact",
      aboutQuote: "“A small ripple, kept flowing,<br />changes the shape of the shore.”",
      aboutBody1:
        "Pureripple is less about grand stories and more about catching a passing feeling. A sentence read today, a thought that arrived, something made by hand — none of it has to be tidy. It can just gather, slowly.",
      aboutBody2:
        "Posts are sorted by category (<em>Main · Minor · Edu</em>) and can be found by title or tag in the search box above.",
      title: "Pureripple — a place for what stays with me"
    }
  };

  /* 예전 카테고리 이름은 EN 화면을 위해 영문 표기를 남겨 둡니다.
     categories.json 의 Main · Minor · Edu 는 그대로 보여 줍니다. */
  var CATEGORY_EN = {
    "일상": "Daily",
    "생각": "Thoughts",
    "작업·공부": "Work & Study",
    "기록": "Notes"
  };

  function t(key, vars) {
    var table = TEXT[LANG] || TEXT.ko;
    var text = table[key];
    if (text == null) text = TEXT.ko[key];
    if (text == null) return "";
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = text.replace(new RegExp("\\{" + name + "\\}", "g"), vars[name]);
      });
    }
    return text;
  }

  function normalizeCategories(data) {
    var raw = Array.isArray(data) ? data : data && Array.isArray(data.categories) ? data.categories : [];
    var out = [];
    raw.forEach(function (item) {
      var name = String(item == null ? "" : item).trim();
      if (name && out.indexOf(name) === -1) out.push(name);
    });
    return out.length ? out : DEFAULT_CATEGORIES.slice();
  }

  function loadCategories() {
    return fetch(CATEGORIES_FILE, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("categories.json 을 읽지 못했어요 (" + res.status + ")");
        return res.json();
      })
      .then(normalizeCategories)
      .catch(function () {
        return DEFAULT_CATEGORIES.slice();
      });
  }

  function categoryList() {
    return state.categories.length ? state.categories : DEFAULT_CATEGORIES;
  }

  function defaultCategory() {
    return categoryList()[0];
  }

  /* 글이 가진 카테고리 (비어 있으면 categories.json 의 첫 항목) */
  function catOf(post) {
    var value = post && post.category != null ? String(post.category).trim() : "";
    return value || defaultCategory();
  }

  function catLabel(category) {
    var value = category || defaultCategory();
    if (LANG === "en" && CATEGORY_EN[value]) return CATEGORY_EN[value];
    return value;
  }

  /* 목록에 있는 카테고리를 푸터의 Categories 칸에 그립니다. */
  function paintFooterCategories(posts) {
    var lists = document.querySelectorAll("[data-footer-cats]");
    if (!lists.length) return;
    var cats = categoryList().slice();
    (posts || []).forEach(function (post) {
      var cat = catOf(post);
      if (cats.indexOf(cat) === -1) cats.push(cat);
    });
    Array.prototype.forEach.call(lists, function (list) {
      list.innerHTML = cats
        .map(function (cat) {
          return (
            '<li><a href="index.html?cat=' +
            encodeURIComponent(cat) +
            '#archive" data-cat-link="' +
            escapeHtml(cat) +
            '" data-cat-label="' +
            escapeHtml(cat) +
            '">' +
            escapeHtml(catLabel(cat)) +
            "</a></li>"
          );
        })
        .join("");
    });
  }

  function postTitle(post) {
    if (LANG === "en" && post && post.title_en) return post.title_en;
    return (post && post.title) || "";
  }

  function postSummary(post) {
    if (LANG === "en" && post && post.summary_en) return post.summary_en;
    return (post && post.summary) || "";
  }

  function applyStaticLang() {
    document.documentElement.lang = LANG === "en" ? "en" : "ko";

    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (node) {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-html]"), function (node) {
      node.innerHTML = t(node.getAttribute("data-i18n-html"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-ph]"), function (node) {
      node.setAttribute("placeholder", t(node.getAttribute("data-i18n-ph")));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-aria]"), function (node) {
      node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria")));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-cat-label]"), function (node) {
      node.textContent = catLabel(node.getAttribute("data-cat-label"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-lang]")
      , function (node) {
        var on = node.getAttribute("data-lang") === LANG;
        node.classList.toggle("is-active", on);
        node.setAttribute("aria-pressed", on ? "true" : "false");
      });
  }

  function setLang(next, onChange) {
    LANG = next === "en" ? "en" : "ko";
    try {
      localStorage.setItem(LANG_KEY, LANG);
    } catch (error) {
      /* 무시 */
    }
    applyStaticLang();
    if (onChange) onChange(LANG);
  }

  function initLangSwitch(onChange) {
    var buttons = document.querySelectorAll("[data-lang]");
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        var next = button.getAttribute("data-lang");
        if (next === LANG) return;
        setLang(next, onChange);
      });
    });
  }

  /* 공유 ----------------------------------------------------------------- */
  function copyToClipboard(text) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            resolve(true);
          },
          function () {
            resolve(legacyCopyText(text));
          }
        );
        return;
      }
      resolve(legacyCopyText(text));
    });
  }

  function legacyCopyText(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  function shareXHref(post) {
    return (
      "https://x.com/intent/tweet?text=" +
      encodeURIComponent(postTitle(post) + " — Pureripple") +
      "&url=" +
      encodeURIComponent(sharePageUrl(post))
    );
  }

  function shareRowHtml(post) {
    return (
      '<div class="share-row" data-share-row>' +
      '<span class="share-label">' +
      escapeHtml(t("share")) +
      "</span>" +
      '<button class="share-btn" type="button" data-share="copy" aria-label="' +
      escapeHtml(t("copyLink")) +
      '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.4 1.4"></path><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.4-1.4"></path></svg>' +
      '<span data-share-text>' +
      escapeHtml(t("copyLink")) +
      "</span></button>" +
      '<a class="share-btn" data-share="x" href="' +
      escapeHtml(shareXHref(post)) +
      '" target="_blank" rel="noopener noreferrer" aria-label="' +
      escapeHtml(t("shareX")) +
      '">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1-5.7 6.1H1.6l7.5-8.6L1.2 3h6.6l4.5 5.5zM16.4 19.2h1.8L6.7 4.7H4.8z"></path></svg>' +
      "<span>" +
      escapeHtml(t("shareX")) +
      "</span></a>" +
      '<span class="share-note">p/' +
      escapeHtml(post.slug) +
      ".html</span>" +
      "</div>"
    );
  }

  function bindShare(root, post) {
    if (!root) return;
    var button = root.querySelector('[data-share="copy"]');
    if (!button) return;
    button.addEventListener("click", function () {
      copyToClipboard(sharePageUrl(post)).then(function (ok) {
        var label = button.querySelector("[data-share-text]");
        if (label) label.textContent = ok ? t("copied") : t("copyFail");
        button.classList.toggle("is-copied", ok);
        window.setTimeout(function () {
          if (label) label.textContent = t("copyLink");
          button.classList.remove("is-copied");
        }, 2200);
      });
    });
  }

  function sanitizeUrl(url) {
    var value = String(url || "").trim();
    if (/^(https?:|mailto:|#|\/|\.\/|\.\.\/|[a-z0-9._-]+\.(html|jpg|jpeg|png|webp|svg|gif))/i.test(value)) {
      // javascript: 같은 위험한 스킴은 걸러집니다.
      if (/^javascript:/i.test(value)) return "#";
      return value;
    }
    return "#";
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  /* ---------------------------------------------------------------------
     데이터
     --------------------------------------------------------------------- */
  function loadPosts() {
    return fetch("posts.json", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("posts.json 을 읽지 못했어요 (" + res.status + ")");
        return res.json();
      })
      .then(function (data) {
        var list = (data && data.posts) || [];
        list = list.filter(function (p) {
          return p && p.slug && p.title;
        });
        list.sort(function (a, b) {
          return toDate(b.date) - toDate(a.date);
        });
        return list;
      });
  }

  function fail(target, message) {
    if (!target) return;
    target.innerHTML =
      '<div class="notice"><h2>글을 불러오지 못했어요</h2><p>' +
      escapeHtml(message) +
      "</p><p style=\"margin-top:10px\">로컬에서 확인하신다면 <code>python3 -m http.server</code> 로 띄운 주소(http://…)로 열어 주세요. 파일을 더블클릭해 연 경우에는 목록을 읽을 수 없습니다.</p></div>";
  }

  /* ---------------------------------------------------------------------
     마크다운 → HTML (필요한 문법만 담백하게)
     --------------------------------------------------------------------- */
  function inlineFormat(text) {
    var codes = [];
    var source = String(text || "");

    // 코드 스팬은 먼저 떼어 두어 다른 서식이 건드리지 않게 합니다.
    source = source.replace(/`([^`]+)`/g, function (m, code) {
      codes.push(code);
      return "\u0000C" + (codes.length - 1) + "\u0000";
    });

    var html = escapeHtml(source);

    html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, src) {
      return '<img src="' + sanitizeUrl(src) + '" alt="' + alt + '" loading="lazy">';
    });

    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
      var url = sanitizeUrl(href);
      var external = /^https?:/i.test(url);
      return (
        '<a href="' +
        url +
        '"' +
        (external ? ' target="_blank" rel="noopener noreferrer"' : "") +
        ">" +
        label +
        "</a>"
      );
    });

    html = html.replace(/\u0000C(\d+)\u0000/g, function (m, index) {
      return "<code>" + escapeHtml(codes[Number(index)]) + "</code>";
    });

    return html;
  }

  function renderMarkdown(markdown) {
    var lines = String(markdown || "").replace(/\r\n/g, "\n").replace(/\uFEFF/g, "").split("\n");
    var out = [];
    var paragraph = [];
    var i = 0;

    function flush() {
      if (!paragraph.length) return;
      out.push("<p>" + inlineFormat(paragraph.join(" ")) + "</p>");
      paragraph = [];
    }

    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      // 빈 줄
      if (!trimmed) {
        flush();
        i++;
        continue;
      }

      // 코드 블록
      if (/^```/.test(trimmed)) {
        flush();
        var lang = trimmed.slice(3).trim();
        i++;
        var code = [];
        while (i < lines.length && !/^```/.test(lines[i].trim())) {
          code.push(lines[i]);
          i++;
        }
        i++; // 닫는 ``` 건너뛰기
        out.push(
          '<pre><code' +
            (lang ? ' class="language-' + escapeHtml(lang) + '"' : "") +
            ">" +
            escapeHtml(code.join("\n")) +
            "</code></pre>"
        );
        continue;
      }

      // 제목
      var heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (heading) {
        flush();
        var level = Math.min(heading[1].length, 6);
        out.push("<h" + level + ">" + inlineFormat(heading[2].trim()) + "</h" + level + ">");
        i++;
        continue;
      }

      // 구분선
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flush();
        out.push("<hr>");
        i++;
        continue;
      }

      // 인용
      if (/^>\s?/.test(trimmed)) {
        flush();
        var quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quote.push(lines[i].trim().replace(/^>\s?/, ""));
          i++;
        }
        out.push("<blockquote><p>" + inlineFormat(quote.join(" ")) + "</p></blockquote>");
        continue;
      }

      // 이미지 한 장만 있는 줄 → figure
      var figure = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(trimmed);
      if (figure) {
        flush();
        out.push(
          "<figure><img src=\"" +
            sanitizeUrl(figure[2]) +
            '" alt="' +
            escapeHtml(figure[1]) +
            '" loading="lazy">' +
            (figure[1] ? "<figcaption>" + escapeHtml(figure[1]) + "</figcaption>" : "") +
            "</figure>"
        );
        i++;
        continue;
      }

      // 순서 없는 목록
      if (/^[-*]\s+/.test(trimmed)) {
        flush();
        var items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
          i++;
          // 이어지는 들여쓰기 줄은 같은 항목으로
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^[-*]\s+/.test(lines[i].trim())) {
            items[items.length - 1] += " " + lines[i].trim();
            i++;
          }
        }
        out.push(
          "<ul>" +
            items
              .map(function (item) {
                return "<li>" + inlineFormat(item) + "</li>";
              })
              .join("") +
            "</ul>"
        );
        continue;
      }

      // 순서 있는 목록
      if (/^\d+\.\s+/.test(trimmed)) {
        flush();
        var oItems = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          oItems.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
          i++;
        }
        out.push(
          "<ol>" +
            oItems
              .map(function (item) {
                return "<li>" + inlineFormat(item) + "</li>";
              })
              .join("") +
            "</ol>"
        );
        continue;
      }

      paragraph.push(trimmed);
      i++;
    }

    flush();
    return out.join("\n");
  }

  /* ---------------------------------------------------------------------
     카드 조각들
     --------------------------------------------------------------------- */
  function metaRow(post) {
    var parts = ['<span>' + escapeHtml(formatDate(post.date)) + "</span>"];
    if (post.minutes) {
      parts.push('<span class="dot" aria-hidden="true"></span>');
      parts.push("<span>" + escapeHtml(t("minRead", { n: Number(post.minutes) })) + "</span>");
    }
    if (post.author) {
      parts.push('<span class="dot" aria-hidden="true"></span>');
      parts.push("<span>" + escapeHtml(post.author) + "</span>");
    }
    return '<div class="card-meta">' + parts.join("") + "</div>";
  }

  /* 마크다운 맨 위의 --- 메타 블록은 화면에 그리지 않습니다. */
  function stripFrontMatter(markdown) {
    var text = String(markdown || "").replace(/^\uFEFF/, "");
    var match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    return match ? text.slice(match[0].length) : text;
  }

  function cardHtml(post) {
    return (
      '<a class="post-card" href="' +
      postUrl(post) +
      '">' +
      '<div class="post-card-media">' +
      '<img src="' +
      escapeHtml(post.cover || "assets/hero.jpg") +
      '" alt="" loading="lazy" width="1200" height="800">' +
      "</div>" +
      '<div class="post-card-body">' +
      '<span class="card-cat">' +
      escapeHtml(catLabel(post.category)) +
      "</span>" +
      '<h3 class="post-card-title">' +
      escapeHtml(postTitle(post)) +
      "</h3>" +
      (postSummary(post)
        ? '<p class="post-card-summary">' + escapeHtml(postSummary(post)) + "</p>"
        : "") +
      metaRow(post) +
      "</div></a>"
    );
  }

  function featuredHtml(post) {
    return (
      '<a class="featured-card" href="' +
      postUrl(post) +
      '">' +
      '<span class="featured-glow" aria-hidden="true"></span>' +
      '<span class="eyebrow">' +
      escapeHtml(catLabel(post.category)) +
      "</span>" +
      '<h3 class="featured-title">' +
      escapeHtml(postTitle(post)) +
      "</h3>" +
      (postSummary(post)
        ? '<p class="featured-summary">' + escapeHtml(postSummary(post)) + "</p>"
        : "") +
      '<div class="featured-foot">' +
      '<span class="featured-meta">' +
      escapeHtml(formatDate(post.date)) +
      (post.minutes ? " · " + escapeHtml(t("minRead", { n: Number(post.minutes) })) : "") +
      "</span>" +
      '<span class="read-hint">' +
      escapeHtml(t("readPost")) +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15"></path><path d="m13 6 6 6-6 6"></path></svg>' +
      "</span>" +
      "</div></a>"
    );
  }

  /* ---------------------------------------------------------------------
     서로이웃 신청 모달 (Mutual friend)
     - 정적 사이트라 서버로 보내지 않고, 적은 내용을 그대로 전할 수 있는
       문장으로 만들어 복사하거나 X·이메일로 보내게 합니다.
     - 아래 MF_CONTACT 에 X 아이디·이메일을 채우면 '바로 보내기' 버튼이 나타납니다.
     --------------------------------------------------------------------- */
  var MF_CONTACT = {
    x: "",
    email: ""
  };

  function initMutualFriend() {
    var dialog = $("#mutualFriendDialog");
    var openBtn = $("#mutualFriendOpen");
    if (!dialog || !openBtn) return;

    var form = $("#mfForm", dialog);
    var nameInput = $("#mfName", dialog);
    var noteInput = $("#mfNote", dialog);
    var contactInput = $("#mfContact", dialog);
    var errorEl = $("#mfError", dialog);
    var donePanel = $("#mfDone", dialog);
    var doneTitle = $("#mfDoneTitle", dialog);
    var doneBody = $("#mfDoneBody", dialog);
    var preview = $("#mfPreview", dialog);
    var copyBtn = $("#mfCopy", dialog);
    var sendX = $("#mfSendX", dialog);
    var sendMail = $("#mfSendMail", dialog);
    var message = "";

    function setError(show) {
      if (errorEl) errorEl.hidden = !show;
      nameInput.setAttribute("aria-invalid", show ? "true" : "false");
    }

    function openDialog() {
      form.reset();
      setError(false);
      form.hidden = false;
      donePanel.hidden = true;
      dialog.querySelector(".mf-panel").classList.remove("is-done");
      copyBtn.textContent = t("mfCopy");
      copyBtn.classList.remove("is-copied");

      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      document.body.classList.add("mf-open");
      window.setTimeout(function () {
        nameInput.focus({ preventScroll: true });
      }, 60);
    }

    function closeDialog() {
      if (typeof dialog.close === "function" && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
        document.body.classList.remove("mf-open");
      }
    }

    function composeMessage(name, note, contact) {
      var lines = [t("mfMsgTitle"), t("mfMsgName") + ": " + name];
      if (note) lines.push(t("mfMsgNote") + ": " + note);
      if (contact) lines.push(t("mfMsgContact") + ": " + contact);
      return lines.join("\n");
    }

    function hasSendChannel() {
      return !!(MF_CONTACT.x || MF_CONTACT.email);
    }

    function legacyCopy() {
      var range = document.createRange();
      range.selectNodeContents(preview);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        return document.execCommand("copy");
      } catch (error) {
        return false;
      }
    }

    function copyText(text, done) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            done(true);
          },
          function () {
            done(legacyCopy());
          }
        );
      } else {
        done(legacyCopy());
      }
    }

    openBtn.addEventListener("click", openDialog);
    $("#mfClose", dialog).addEventListener("click", closeDialog);
    $("#mfCancel", dialog).addEventListener("click", closeDialog);
    $("#mfDoneClose", dialog).addEventListener("click", closeDialog);

    // ESC 로 닫혔을 때도 스크롤 잠금을 풀어 줍니다.
    dialog.addEventListener("close", function () {
      document.body.classList.remove("mf-open");
    });

    // 백드롭을 누르면 닫기
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeDialog();
    });

    nameInput.addEventListener("input", function () {
      if (nameInput.value.trim()) setError(false);
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = nameInput.value.trim();
      if (!name) {
        setError(true);
        nameInput.focus();
        return;
      }

      message = composeMessage(name, noteInput.value.trim(), contactInput.value.trim());

      doneTitle.textContent = t("mfDoneTitleName", { name: name });
      preview.textContent = message;
      form.hidden = true;
      donePanel.hidden = false;
      dialog.querySelector(".mf-panel").classList.add("is-done");

      if (sendX) {
        if (MF_CONTACT.x) {
          sendX.href = "https://x.com/" + encodeURIComponent(MF_CONTACT.x.replace(/^@/, ""));
          sendX.hidden = false;
        } else {
          sendX.hidden = true;
        }
      }

      if (sendMail) {
        if (MF_CONTACT.email) {
          sendMail.href =
            "mailto:" +
            MF_CONTACT.email +
            "?subject=" +
            encodeURIComponent("Pureripple 서로이웃 신청") +
            "&body=" +
            encodeURIComponent(message);
          sendMail.hidden = false;
        } else {
          sendMail.hidden = true;
        }
      }

      if (doneBody) {
        doneBody.textContent = hasSendChannel() ? t("mfDoneBodySend") : t("mfDoneBody");
      }

      // 보낼 곳이 정해지기 전에는 복사를 주 동작으로
      if (copyBtn) {
        copyBtn.classList.toggle("btn-primary", !hasSendChannel());
        copyBtn.classList.toggle("btn-ghost", hasSendChannel());
      }

      doneTitle.focus({ preventScroll: true });
    });

    copyBtn.addEventListener("click", function () {
      copyText(message, function (ok) {
        copyBtn.textContent = ok ? t("mfCopied") : t("mfCopyFail");
        copyBtn.classList.toggle("is-copied", ok);
        if (ok) {
          window.setTimeout(function () {
            copyBtn.textContent = t("mfCopy");
            copyBtn.classList.remove("is-copied");
          }, 2200);
        } else {
          legacyCopy();
        }
      });
    });
  }

  /* ---------------------------------------------------------------------
     index.html
     --------------------------------------------------------------------- */
  function initIndex() {
    initMutualFriend();

    document.title = t("title");

    var filterBar = $("#filterBar");
    var grid = $("#postGrid");
    var emptyState = $("#emptyState");
    var resultNote = $("#resultNote");
    var searchInput = $("#searchInput");
    var searchClear = $("#searchClear");
    var featuredWrap = $("#featuredWrap");
    var featuredSection = $("#featuredSection");

    function categoriesOf(list) {
      var seen = categoryList().slice();
      list.forEach(function (post) {
        var cat = catOf(post);
        if (seen.indexOf(cat) === -1) seen.push(cat);
      });
      return seen;
    }

    function renderFilters() {
      if (!filterBar) return;
      var cats = categoriesOf(state.posts);
      var all = ["전체"].concat(cats);
      filterBar.innerHTML = all
        .map(function (cat) {
          var count =
            cat === "전체"
              ? state.posts.length
              : state.posts.filter(function (p) {
                  return catOf(p) === cat;
                }).length;
          var active = state.category === cat;
          return (
            '<button class="chip' +
            (active ? " is-active" : "") +
            '" data-category="' +
            escapeHtml(cat) +
            '" aria-pressed="' +
            active +
            '">' +
            escapeHtml(cat === "전체" ? t("all") : catLabel(cat)) +
            '<span class="chip-count">' +
            count +
            "</span></button>"
          );
        })
        .join("");
    }

    function filtered() {
      var q = state.query.trim().toLowerCase();
      return state.posts.filter(function (post) {
        var cat = catOf(post);
        if (state.category !== "전체" && cat !== state.category) return false;
        if (!q) return true;
        var haystack = [
          post.title,
          post.title_en,
          post.summary,
          post.summary_en,
          cat,
          catLabel(cat),
          (post.tags || []).join(" ")
        ]
          .join(" ")
          .toLowerCase();
        return haystack.indexOf(q) !== -1;
      });
    }

    function renderGrid() {
      var list = filtered();
      if (!grid) return;
      grid.innerHTML = list.map(cardHtml).join("");
      if (emptyState) emptyState.hidden = list.length !== 0;
      if (resultNote) {
        var total = state.posts.length;
        resultNote.textContent =
          list.length === total
            ? t("resultAll", { n: total })
            : t("resultSome", { n: list.length, total: total });
      }
    }

    function renderFeatured() {
      if (!featuredWrap) return;
      var featured =
        state.posts.filter(function (p) {
          return p.featured;
        })[0] || state.posts[0];
      if (!featured) {
        featuredWrap.innerHTML = "";
        if (featuredSection) featuredSection.hidden = true;
        return;
      }
      featuredWrap.innerHTML = featuredHtml(featured);
    }

    function setCategory(cat) {
      state.category = cat;
      renderFilters();
      renderGrid();
    }

    function setQuery(value) {
      state.query = value || "";
      if (searchClear) searchClear.hidden = !state.query;
      renderGrid();
    }

    // 푸터 카테고리 목록도 categories.json 을 따라갑니다(글 페이지에서는 목록으로 이동).
    function renderFooterCategories() {
      paintFooterCategories(state.posts);
    }

    // 이벤트
    if (filterBar) {
      filterBar.addEventListener("click", function (event) {
        var chip = event.target.closest(".chip");
        if (!chip) return;
        setCategory(chip.getAttribute("data-category") || "전체");
      });
    }

    if (searchInput) {
      searchInput.addEventListener(
        "input",
        debounce(function () {
          setQuery(searchInput.value);
        }, 120)
      );

      // "/" 로 검색창으로 바로 이동
      document.addEventListener("keydown", function (event) {
        if (event.key === "/" && document.activeElement !== searchInput) {
          event.preventDefault();
          searchInput.focus();
        }
        if (event.key === "Escape" && document.activeElement === searchInput) {
          searchInput.value = "";
          setQuery("");
          searchInput.blur();
        }
      });
    }

    if (searchClear) {
      searchClear.addEventListener("click", function () {
        if (searchInput) searchInput.value = "";
        setQuery("");
        if (searchInput) searchInput.focus();
      });
    }

    var resetBtn = $("#resetFilters");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (searchInput) searchInput.value = "";
        setQuery("");
        setCategory("전체");
      });
    }

    var searchJump = $("#searchJump");
    if (searchJump) {
      searchJump.addEventListener("click", function () {
        if (!searchInput) return;
        document.getElementById("archive").scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start"
        });
        setTimeout(function () {
          searchInput.focus({ preventScroll: true });
        }, 260);
      });
    }

    // 푸터 카테고리 링크 (동적으로 그려지므로 문서에서 받습니다)
    document.addEventListener("click", function (event) {
      var link = event.target.closest ? event.target.closest("[data-cat-link]") : null;
      if (!link) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
      var cat = link.getAttribute("data-cat-link");
      if (!cat) return;
      event.preventDefault();
      setCategory(cat);
      var archive = document.getElementById("archive");
      if (archive) {
        archive.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start"
        });
      }
    });

    initLangSwitch(function () {
      renderFilters();
      renderFooterCategories();
      renderFeatured();
      renderGrid();
      document.title = t("title");
    });

    Promise.all([loadCategories(), loadPosts()])
      .then(function (results) {
        state.categories = results[0];
        state.posts = results[1];

        // 푸터·공유 링크로 들어온 카테고리(index.html?cat=Minor)를 그대로 열어 줍니다.
        var wanted = null;
        try {
          wanted = new URLSearchParams(location.search).get("cat");
        } catch (error) {
          wanted = null;
        }
        if (wanted && categoriesOf(state.posts).indexOf(wanted) !== -1) state.category = wanted;

        renderFilters();
        renderFooterCategories();
        renderFeatured();
        renderGrid();
      })
      .catch(function (error) {
        fail(featuredWrap, error.message);
        if (grid) grid.innerHTML = "";
        if (resultNote) resultNote.textContent = "";
      });
  }

  /* ---------------------------------------------------------------------
     post.html
     --------------------------------------------------------------------- */
  function initPost() {
    var root = $("#articleRoot");
    var params = new URLSearchParams(window.location.search);
    var slug = params.get("slug") || params.get("p");

    if (!root) return;

    if (!slug) {
      root.innerHTML =
        '<div class="container"><div class="notice"><h2>' +
        escapeHtml(t("noSlugTitle")) +
        '</h2><p><a href="index.html#archive">' +
        escapeHtml(t("backToIndex")) +
        "</a></p></div></div>";
      return;
    }

    function notFound() {
      root.innerHTML =
        '<div class="container"><div class="notice"><h2>' +
        escapeHtml(t("notFoundTitle")) +
        "</h2><p>" +
        escapeHtml(t("notFoundBody")) +
        '</p><p style="margin-top:12px"><a href="index.html#archive">' +
        escapeHtml(t("backToIndex")) +
        "</a></p></div></div>";
    }

    function render() {
      var post = state.post;
      var posts = state.posts;
      var index = state.postsIndex;
      var bodies = state.postBodies || { ko: "", en: "" };
      if (!post) return;

      var prev = posts[index + 1]; // 더 오래된 글
      var next = posts[index - 1]; // 더 새로운 글
      var markdown = LANG === "en" && bodies.en ? bodies.en : bodies.ko;
      var bodyHtml = renderMarkdown(markdown);
      var minutes = readingTime(markdown);
      var summary = postSummary(post);

      root.innerHTML =
        '<div class="container">' +
        '<header class="article-head">' +
        '<a class="back-link" href="index.html#archive">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H5"></path><path d="m11 6-6 6 6 6"></path></svg>' +
        escapeHtml(t("backAll")) +
        "</a>" +
        '<p class="article-cat">' +
        escapeHtml(catLabel(catOf(post))) +
        "</p>" +
        '<h1 class="article-title">' +
        escapeHtml(postTitle(post)) +
        "</h1>" +
        (summary ? '<p class="article-summary">' + escapeHtml(summary) + "</p>" : "") +
        '<div class="article-meta">' +
        "<span>" +
        escapeHtml(longDate(post.date)) +
        "</span>" +
        '<span class="dot" aria-hidden="true" style="width:3px;height:3px;border-radius:50%;background:var(--line-strong);display:inline-block"></span>' +
        "<span>" +
        escapeHtml(t("minRead", { n: minutes })) +
        "</span>" +
        (post.author
          ? '<span class="dot" aria-hidden="true" style="width:3px;height:3px;border-radius:50%;background:var(--line-strong);display:inline-block"></span><span>' +
            escapeHtml(post.author) +
            "</span>"
          : "") +
        "</div></header>" +
        (post.cover
          ? '<div class="article-cover"><img src="' +
            escapeHtml(post.cover) +
            '" alt="' +
            escapeHtml(postTitle(post)) +
            ' 글의 표지 이미지" width="1200" height="675"></div>'
          : "") +
        '<div class="article-layout">' +
        '<article class="article-body" id="articleBody">' +
        '<details class="toc-mobile"><summary>' +
        escapeHtml(t("toc")) +
        '</summary><div data-toc="mobile"></div></details>' +
        bodyHtml +
        "</article>" +
        '<aside class="toc toc-desktop" aria-label="' +
        escapeHtml(t("toc")) +
        '"><p class="toc-title">' +
        escapeHtml(t("contents")) +
        '</p><div data-toc="desktop"></div></aside>' +
        "</div>" +
        shareRowHtml(post) +
        postNavHtml(prev, next) +
        relatedHtml(post, posts, index) +
        "</div>";

      // 문서 정보 갱신
      document.title = postTitle(post) + " — Pureripple";
      setMeta("og:title", postTitle(post) + " — Pureripple");
      if (summary) setMeta("og:description", summary);
      if (post.cover) setMeta("og:image", new URL(post.cover, location.href).href);
      var desc = $('meta[name="description"]');
      if (desc && summary) desc.setAttribute("content", summary);

      bindShare(root, post);
      buildToc();
      setupProgress();
    }

    Promise.all([loadCategories(), loadPosts()])
      .then(function (results) {
        var posts = results[1];
        state.categories = results[0];
        paintFooterCategories(posts);

        var index = -1;
        posts.forEach(function (p, idx) {
          if (p.slug === slug) index = idx;
        });

        if (index === -1) {
          notFound();
          return null;
        }

        state.posts = posts;
        state.postsIndex = index;
        state.post = posts[index];

        var post = state.post;

        return fetch(post.file, { cache: "no-cache" })
          .then(function (res) {
            if (!res.ok) throw new Error("본문 파일을 읽지 못했어요 (" + res.status + ")");
            return res.text();
          })
          .then(function (raw) {
            state.postBodies = { ko: stripFrontMatter(raw), en: "" };
            if (!post.hasEnBody) return null;
            // 영문 본문이 있는 글만 posts/{slug}.en.md 를 읽습니다.
            return fetch("posts/" + encodeURIComponent(post.slug) + ".en.md", { cache: "no-cache" })
              .then(function (res) {
                return res.ok ? res.text() : "";
              })
              .then(function (text) {
                state.postBodies.en = text ? stripFrontMatter(text) : "";
              })
              .catch(function () {
                state.postBodies.en = "";
              });
          })
          .then(render);
      })
      .catch(function (error) {
        fail(root, error.message);
      });

    initLangSwitch(function () {
      paintFooterCategories(state.posts);
      if (!state.post) return;
      render();
    });
  }

  function setMeta(property, content) {
    var el = document.querySelector('meta[property="' + property + '"]');
    if (el) el.setAttribute("content", content);
  }

  function postNavHtml(prev, next) {
    function item(post, kind) {
      if (!post) {
        return (
          '<div class="post-nav-item ' +
          kind +
          ' is-empty"><span class="post-nav-label">' +
          escapeHtml(kind === "prev" ? t("prevEmpty") : t("nextEmpty")) +
          '</span><span class="post-nav-title">' +
          escapeHtml(t("noPost")) +
          "</span></div>"
        );
      }
      return (
        '<a class="post-nav-item ' +
        kind +
        '" href="' +
        postUrl(post) +
        '"><span class="post-nav-label">' +
        escapeHtml(kind === "prev" ? t("prev") : t("next")) +
        '</span><span class="post-nav-title">' +
        escapeHtml(postTitle(post)) +
        "</span></a>"
      );
    }
    return '<nav class="post-nav" aria-label="이전 글과 다음 글">' + item(prev, "prev") + item(next, "next") + "</nav>";
  }

  /* ---------------------------------------------------------------------
     연관 추천글
     - 같은 카테고리(+3)와 겹치는 태그(+2)로 연관도를 계산하고,
       상위 3편을 카드로 보여 줍니다. 모자라면 최신 글로 보충합니다.
     --------------------------------------------------------------------- */
  function relatedScore(base, candidate) {
    var score = 0;
    if (catOf(candidate) === catOf(base)) score += 3;

    var baseTags = (base.tags || [])
      .map(function (tag) {
        return String(tag).trim().toLowerCase();
      })
      .filter(Boolean);
    var shared = [];
    (candidate.tags || []).forEach(function (tag) {
      var name = String(tag).trim();
      if (name && baseTags.indexOf(name.toLowerCase()) !== -1) shared.push(name);
    });

    return { score: score + shared.length * 2, shared: shared };
  }

  function relatedPosts(post, posts, index) {
    var scored = [];
    posts.forEach(function (candidate, idx) {
      if (idx === index) return;
      var rel = relatedScore(post, candidate);
      scored.push({ post: candidate, score: rel.score, shared: rel.shared, idx: idx });
    });

    // 글 목록은 최신순이라 idx 가 작을수록 최신입니다(같은 점수면 최신 먼저).
    var picked = scored
      .filter(function (item) {
        return item.score > 0;
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.idx - b.idx;
      })
      .slice(0, 3);

    if (picked.length < 3) {
      scored.forEach(function (item) {
        if (picked.length >= 3) return;
        if (item.score > 0) return;
        picked.push(item);
      });
    }

    return picked.slice(0, 3);
  }

  function relatedHtml(post, posts, index) {
    var picks = relatedPosts(post, posts, index);
    if (!picks.length) return "";

    return (
      '<section class="related" aria-labelledby="relatedTitle">' +
      '<div class="related-head">' +
      '<div class="related-heading">' +
      '<p class="related-eyebrow">' +
      escapeHtml(t("relatedNote")) +
      "</p>" +
      '<h2 class="related-title" id="relatedTitle">' +
      escapeHtml(t("related")) +
      "</h2></div>" +
      '<a class="link-arrow" href="index.html#archive">' +
      escapeHtml(t("seeAll")) +
      "</a></div>" +
      '<div class="related-grid">' +
      picks
        .map(function (item) {
          var p = item.post;
          return (
            '<a class="related-card" href="' +
            postUrl(p) +
            '">' +
            '<span class="related-thumb"><img src="' +
            escapeHtml(p.cover || "assets/hero.jpg") +
            '" alt="" loading="lazy" width="640" height="400"></span>' +
            '<span class="related-body">' +
            '<span class="related-cat">' +
            escapeHtml(catLabel(catOf(p))) +
            "</span>" +
            '<span class="related-name">' +
            escapeHtml(postTitle(p)) +
            "</span>" +
            (postSummary(p)
              ? '<span class="related-summary">' + escapeHtml(postSummary(p)) + "</span>"
              : "") +
            '<span class="related-meta">' +
            "<span>" +
            escapeHtml(formatDate(p.date)) +
            "</span>" +
            (p.minutes
              ? '<span class="related-dot" aria-hidden="true"></span><span>' +
                escapeHtml(t("minRead", { n: Number(p.minutes) })) +
                "</span>"
              : "") +
            (item.shared.length
              ? '<span class="related-tags">' +
                item.shared
                  .slice(0, 2)
                  .map(function (tag) {
                    return "<em>#" + escapeHtml(tag) + "</em>";
                  })
                  .join("") +
                "</span>"
              : "") +
            "</span></span></a>"
          );
        })
        .join("") +
      "</div></section>"
    );
  }

  /* 목차 --------------------------------------------------------------- */
  function buildToc() {
    var body = $("#articleBody");
    if (!body) return;

    var headings = body.querySelectorAll("h2, h3");
    if (!headings.length) {
      var desktop = document.querySelector(".toc-desktop");
      if (desktop) desktop.hidden = true;
      var mobile = document.querySelector(".toc-mobile");
      if (mobile) mobile.hidden = true;
      return;
    }

    var items = [];
    Array.prototype.forEach.call(headings, function (heading, i) {
      var id = "section-" + (i + 1);
      heading.id = id;
      var level = heading.tagName === "H2" ? 2 : 3;
      items.push({ id: id, text: heading.textContent, level: level });
    });

    var html = items
      .map(function (item) {
        return (
          '<li class="' +
          (item.level === 3 ? "toc-sub" : "") +
          '"><a href="#' +
          item.id +
          '">' +
          escapeHtml(item.text) +
          "</a></li>"
        );
      })
      .join("");

    Array.prototype.forEach.call(document.querySelectorAll("[data-toc]"), function (slot) {
      slot.innerHTML = '<ul class="toc-list">' + html + "</ul>";
    });

    // 스크롤 위치에 따라 목차 항목 강조
    var links = document.querySelectorAll('[data-toc="desktop"] .toc-list a');
    if (!links.length) return;

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            Array.prototype.forEach.call(links, function (link) {
              link.classList.toggle("is-current", link.getAttribute("href") === "#" + entry.target.id);
            });
          });
        },
        { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
      );
      Array.prototype.forEach.call(headings, function (heading) {
        observer.observe(heading);
      });
    }

    // 모바일 목차에서 항목을 누르면 접기
    var mobileToc = document.querySelector(".toc-mobile");
    if (mobileToc) {
      mobileToc.addEventListener("click", function (event) {
        if (event.target.closest("a")) mobileToc.removeAttribute("open");
      });
    }
  }

  /* 읽기 진행률 --------------------------------------------------------- */
  var progressBound = false;

  function setupProgress() {
    var bar = $("#readingProgress");
    if (!bar) return;

    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? window.scrollY / max : 0;
      bar.style.width = Math.min(100, Math.max(0, ratio * 100)) + "%";
    }

    update();
    if (progressBound) return;
    progressBound = true;
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  /* ---------------------------------------------------------------------
     시작
     --------------------------------------------------------------------- */
  function boot() {
    applyStaticLang();
    if (document.body.dataset.page === "post" || document.getElementById("articleRoot")) {
      initPost();
    } else {
      initIndex();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
