/* ==========================================================================
   Pureripple — admin.js
   GitHub Contents API 로 posts/*.md 와 posts.json 을 직접 커밋하는
   비밀 관리자 · 글쓰기 화면. 외부 라이브러리 없이 동작합니다.
   ========================================================================== */

(function () {
  "use strict";

  var API = "https://api.github.com";
  var LS_KEY = "pureripple.admin.v1";
  var SS_PREVIEW = "pureripple.admin.preview";
  var CATEGORIES = ["일상", "생각", "작업·공부"];
  var DEFAULT_COVER = "assets/hero.jpg";
  var IMAGE_EXT = /^(jpe?g|png|webp|gif|avif|svg)$/i;

  /* ---------------------------------------------------------------------
     상태
     --------------------------------------------------------------------- */
  var state = {
    mode: null, // 'live' | 'preview' | null
    cfg: null, // { owner, repo, token }
    repo: null,
    posts: [],
    site: { title: "Pureripple", author: "양갱" },
    covers: [],
    current: null, // { originalSlug, isNew, dirty, loading }
    coverFile: null,
    pendingDelete: null,
    busy: false,
    slugTouched: false,
    previewTimer: null,
    toastTimer: null,
    seo: emptySeo(),
    shareCount: null,
    analyticsTimer: null
  };

  var el = {};

  /* ---------------------------------------------------------------------
     작은 도우미
     --------------------------------------------------------------------- */
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function trim(value) {
    return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function todayValue() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function nowIso() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      "T" +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes()) +
      ":" +
      pad(d.getSeconds())
    );
  }

  function formatDate(value) {
    var parts = String(value || "").split("-");
    if (parts.length === 3) return parts[0] + "." + parts[1] + "." + parts[2];
    return String(value || "");
  }

  function toDate(value) {
    var parts = String(value || "").split("-");
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    return new Date(value);
  }

  function readingTime(text) {
    var chars = String(text || "").replace(/\s+/g, "").length;
    return Math.max(1, Math.round(chars / 400));
  }

  function unique(list) {
    var out = [];
    list.forEach(function (item) {
      if (item && out.indexOf(item) === -1) out.push(item);
    });
    return out;
  }

  /* ---------------------------------------------------------------------
     한글 → 로마자 (주소 자동 생성용, 국어의 로마자 표기법 간단 버전)
     --------------------------------------------------------------------- */
  var INITIAL = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
  var MEDIAL = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
  var FINAL = ["", "k", "k", "ks", "n", "nj", "nh", "t", "l", "lk", "lm", "lb", "ls", "lt", "lp", "lh", "m", "p", "ps", "t", "t", "ng", "t", "t", "k", "t", "p", "h"];

  function romanizeSyllable(code) {
    var index = code - 0xac00;
    return (
      INITIAL[Math.floor(index / 588)] +
      MEDIAL[Math.floor((index % 588) / 28)] +
      FINAL[index % 28]
    );
  }

  function slugify(value) {
    var text = String(value || "");
    // 한글은 음절 단위로 이어 붙여 로마자로 (단어 경계는 원문의 띄어쓰기를 따름)
    text = text.replace(/[\uac00-\ud7a3]+/g, function (run) {
      var out = "";
      for (var i = 0; i < run.length; i++) out += romanizeSyllable(run.charCodeAt(i));
      return out;
    });
    text = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    text = text
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64)
      .replace(/-$/, "");
    return text;
  }

  function normalizeSlugInput(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+/, "");
  }

  function validSlug(value) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    var d = toDate(value);
    if (isNaN(d.getTime())) return false;
    return (
      d.getFullYear() === Number(value.slice(0, 4)) &&
      d.getMonth() + 1 === Number(value.slice(5, 7)) &&
      d.getDate() === Number(value.slice(8, 10))
    );
  }

  function fallbackSlug() {
    return "post-" + (el.dateInput && el.dateInput.value ? el.dateInput.value.replace(/-/g, "") : todayValue().replace(/-/g, ""));
  }

  /* ---------------------------------------------------------------------
     localStorage / sessionStorage
     --------------------------------------------------------------------- */
  function readConfig() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var cfg = JSON.parse(raw);
      if (!cfg || !cfg.owner || !cfg.repo) return null;
      return cfg;
    } catch (error) {
      return null;
    }
  }

  function writeConfig(cfg) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    } catch (error) {
      toast("브라우저에 토큰을 저장하지 못했어요. 시크릿 모드인지 확인해 주세요.", "error");
    }
  }

  function clearConfig() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch (error) {
      /* 무시 */
    }
  }

  function previewWanted() {
    try {
      return sessionStorage.getItem(SS_PREVIEW) === "1";
    } catch (error) {
      return false;
    }
  }

  function setPreviewWanted(on) {
    try {
      if (on) sessionStorage.setItem(SS_PREVIEW, "1");
      else sessionStorage.removeItem(SS_PREVIEW);
    } catch (error) {
      /* 무시 */
    }
  }

  /* ---------------------------------------------------------------------
     GitHub API
     --------------------------------------------------------------------- */
  function repoPath(cfg, path) {
    var base = API + "/repos/" + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo);
    if (!path) return base;
    return (
      base +
      "/" +
      String(path)
        .split("/")
        .map(function (part) {
          return encodeURIComponent(part);
        })
        .join("/")
    );
  }

  function api(cfg, method, path, body) {
    var headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (cfg.token) headers.Authorization = "Bearer " + cfg.token;
    if (body) headers["Content-Type"] = "application/json";

    return fetch(repoPath(cfg, path), {
      method: method,
      headers: headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            data = { message: text };
          }
        }
        if (!res.ok) {
          var err = new Error((data && data.message) || "GitHub 요청이 실패했어요 (" + res.status + ")");
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function b64encodeUtf8(text) {
    var bytes = new TextEncoder().encode(String(text));
    var binary = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function b64decodeUtf8(base64) {
    var binary = atob(String(base64).replace(/\s/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function getFile(cfg, path) {
    return api(cfg, "GET", "contents/" + path).catch(function (error) {
      if (error.status === 404) return null;
      throw error;
    }).then(function (data) {
      if (!data) return null;
      if (Array.isArray(data)) return { dir: data };
      return {
        path: data.path,
        sha: data.sha,
        text: data.content ? b64decodeUtf8(data.content) : ""
      };
    });
  }

  function listDir(cfg, path) {
    return api(cfg, "GET", "contents/" + path)
      .then(function (data) {
        return Array.isArray(data) ? data : [];
      })
      .catch(function (error) {
        if (error.status === 404) return [];
        throw error;
      });
  }

  function putFile(cfg, path, text, message, sha) {
    var body = {
      message: message,
      content: b64encodeUtf8(text)
    };
    if (sha) body.sha = sha;
    return api(cfg, "PUT", "contents/" + path, body);
  }

  function deleteFile(cfg, path, sha, message) {
    return api(cfg, "DELETE", "contents/" + path, { message: message, sha: sha });
  }

  /* 글 파일은 다른 곳에서 먼저 바뀌었을 때(409) 최신 SHA로 한 번 더 시도합니다. */
  function putTextWithRetry(cfg, path, text, message, sha) {
    var attempt = 0;

    function run() {
      attempt++;
      return putFile(cfg, path, text, message, sha).catch(function (error) {
        if (error.status === 409 && attempt < 3) {
          return getFile(cfg, path).then(function (file) {
            sha = file ? file.sha : null;
            return run();
          });
        }
        throw error;
      });
    }

    return run();
  }

  function verifyRepo(cfg) {
    return api(cfg, "GET", "").then(function (repo) {
      if (repo && repo.permissions && repo.permissions.push === false) {
        var err = new Error("이 토큰은 읽기만 할 수 있어요.");
        err.code = "no-push";
        throw err;
      }
      return repo;
    });
  }

  /* ---------------------------------------------------------------------
     화면 전환 · 라우팅
     --------------------------------------------------------------------- */
  function showView(name) {
    document.body.dataset.view = name;
    if (name !== "editor") document.title = "관리자 — Pureripple";
  }

  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function route() {
    if (!state.mode) {
      showLogin();
      return;
    }
    var hash = location.hash.replace(/^#/, "");
    if (!hash || hash === "/") {
      navigate("#/posts");
      return;
    }
    if (hash === "/posts") {
      showDashboard();
      return;
    }
    if (hash === "/settings") {
      showSettings();
      return;
    }
    if (hash === "/analytics") {
      showAnalytics();
      return;
    }
    if (hash === "/new") {
      openEditor(null);
      return;
    }
    var match = /^\/edit\/(.+)$/.exec(hash);
    if (match) {
      openEditor(decodeURIComponent(match[1]));
      return;
    }
    navigate("#/posts");
  }

  function showLogin(notice) {
    state.mode = null;
    showView("login");
    if (el.connChip) el.connChip.hidden = true;
    if (el.logoutBtn) el.logoutBtn.hidden = true;
    if (el.loginNotice) {
      el.loginNotice.textContent = notice || "";
      el.loginNotice.hidden = !notice;
    }
    document.title = "관리자 로그인 — Pureripple";
  }

  function enterApp() {
    updateConn();
    var hash = location.hash.replace(/^#/, "");
    if (hash && hash !== "/" && hash !== "/posts") route();
    else navigate("#/posts");
  }

  function updateConn() {
    if (!el.connChip) return;
    if (state.mode === "live") {
      el.connChip.hidden = false;
      el.connChip.classList.add("is-live");
      el.connText.textContent = state.cfg.owner + "/" + state.cfg.repo;
      el.connChip.title = "GitHub에 연결됨 — " + state.cfg.owner + "/" + state.cfg.repo;
      if (el.logoutBtn) {
        el.logoutBtn.hidden = false;
        el.logoutBtn.textContent = "로그아웃";
        el.logoutBtn.title = "저장된 토큰을 지우고 나갑니다";
      }
    } else if (state.mode === "preview") {
      el.connChip.hidden = false;
      el.connChip.classList.remove("is-live");
      el.connText.textContent = "미리보기 모드";
      el.connChip.title = "저장은 되지 않는 둘러보기 모드";
      if (el.logoutBtn) {
        el.logoutBtn.hidden = false;
        el.logoutBtn.textContent = "나가기";
        el.logoutBtn.title = "미리보기를 끝냅니다";
      }
    } else {
      el.connChip.hidden = true;
      if (el.logoutBtn) el.logoutBtn.hidden = true;
    }
  }

  /* ---------------------------------------------------------------------
     로그인
     --------------------------------------------------------------------- */
  function setLoginBusy(busy) {
    state.busy = busy;
    if (el.loginBtn) {
      el.loginBtn.disabled = busy;
      el.loginBtn.textContent = busy ? "확인 중…" : "로그인";
    }
  }

  function describeError(error) {
    if (!error) return "알 수 없는 문제가 생겼어요.";
    if (error.code === "no-push") {
      return "이 토큰은 읽기만 할 수 있어요. Contents 권한을 Read and write로 다시 만들어 주세요.";
    }
    if (error.status === 401) {
      return "토큰이 올바르지 않거나 만료됐어요. 새 토큰으로 다시 로그인해 주세요.";
    }
    if (error.status === 404) {
      return "저장소를 찾을 수 없어요. Owner·Repo 이름과 토큰의 저장소 접근 권한을 확인해 주세요.";
    }
    if (error.status === 403) {
      var msg = (error.data && error.data.message) || "";
      if (/rate limit/i.test(msg)) return "GitHub 요청 한도를 잠시 넘었어요. 1시간 뒤에 다시 시도해 주세요.";
      return "권한이 없어요. 토큰의 Contents 권한(Read and write)을 확인해 주세요.";
    }
    if (error.status === 409 || error.status === 422) {
      return "다른 곳에서 먼저 바뀌었어요. 잠시 뒤 다시 시도해 주세요.";
    }
    if (error.name === "TypeError" || /Failed to fetch|NetworkError/i.test(error.message || "")) {
      return "GitHub에 연결하지 못했어요. 인터넷 연결이나 방화벽을 확인해 주세요.";
    }
    return error.message || "문제가 생겼어요.";
  }

  function handleLogin(event) {
    event.preventDefault();
    if (state.busy) return;

    var owner = trim(el.ownerInput.value);
    var repo = trim(el.repoInput.value);
    var token = trim(el.tokenInput.value);
    var notice = "";

    if (!owner || !/^[A-Za-z0-9_.-]+$/.test(owner)) notice = "Owner 이름을 확인해 주세요.";
    else if (!repo || !/^[A-Za-z0-9_.-]+$/.test(repo)) notice = "Repo 이름을 확인해 주세요.";
    else if (!token) notice = "GitHub 토큰을 붙여 넣어 주세요.";

    if (notice) {
      el.loginNotice.textContent = notice;
      el.loginNotice.hidden = false;
      return;
    }

    setLoginBusy(true);
    el.loginNotice.hidden = true;

    var cfg = { owner: owner, repo: repo, token: token };

    verifyRepo(cfg)
      .then(function (repoData) {
        writeConfig(cfg);
        setPreviewWanted(false);
        state.cfg = cfg;
        state.repo = repoData;
        state.mode = "live";
        updateConn();
        el.loginNotice.hidden = true;
        el.tokenInput.value = "";
        toast("GitHub에 연결됐어요.", "success");
        enterApp();
      })
      .catch(function (error) {
        el.loginNotice.textContent = describeError(error);
        el.loginNotice.hidden = false;
        if (error.status === 401) {
          el.tokenInput.select();
        }
      })
      .then(function () {
        setLoginBusy(false);
      });
  }

  function enterPreview() {
    state.mode = "preview";
    state.cfg = {
      owner: trim(el.ownerInput.value) || "xirown",
      repo: trim(el.repoInput.value) || "xirown.github.io",
      token: ""
    };
    setPreviewWanted(true);
    enterApp();
  }

  function logout() {
    var wasLive = state.mode === "live";
    clearConfig();
    setPreviewWanted(false);
    state.mode = null;
    state.cfg = null;
    state.posts = [];
    state.site = { title: "Pureripple", author: "양갱" };
    state.current = null;
    state.coverFile = null;
    state.seo = emptySeo();
    state.shareCount = null;
    reloadChrome();
    updateConn();
    history.replaceState(null, "", location.pathname + location.search);
    showLogin();
    toast(wasLive ? "나왔어요. 저장된 토큰도 지웠습니다." : "미리보기를 끝냈어요.");
  }

  /* ---------------------------------------------------------------------
     토스트 · 대화상자
     --------------------------------------------------------------------- */
  function toast(message, type) {
    if (!el.toast) return;
    clearTimeout(state.toastTimer);
    el.toastText.textContent = message;
    el.toast.hidden = false;
    el.toast.className = "ad-toast" + (type ? " is-" + type : "");
    requestAnimationFrame(function () {
      el.toast.classList.add("is-on");
    });
    state.toastTimer = setTimeout(function () {
      el.toast.classList.remove("is-on");
      state.toastTimer = setTimeout(function () {
        el.toast.hidden = true;
      }, 260);
    }, type === "error" ? 7000 : 3800);
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  function openDemo(kind, form) {
    if (!el.demoDialog) return;
    var slug = form && form.slug ? form.slug : (state.current && state.current.originalSlug) || "새-글";
    var titleEl = el.demoDialog.querySelector("#demoTitle");
    var bodyEl = el.demoBody;
    var paths = el.demoPaths;

    if (kind === "settings") {
      titleEl.textContent = "미리보기 모드예요";
      bodyEl.textContent =
        "설정 화면은 그대로 만질 수 있지만, 저장은 되지 않아요. 토큰으로 로그인하면 아래 파일들이 GitHub에 커밋됩니다.";
      paths.innerHTML =
        "저장될 파일: <code>robots.txt</code> · <code>index.html</code> · <code>post.html</code> · <code>404.html</code> · " +
        (form && form.isPublic ? "<code>sitemap.xml</code>" : "<code>sitemap.xml</code> 삭제");
    } else if (kind === "delete") {
      titleEl.textContent = "지금은 지울 수 없어요";
      bodyEl.textContent =
        "미리보기 모드에서는 삭제가 실제로 이뤄지지 않아요. 토큰으로 로그인하면 이 글과 GitHub의 posts 파일이 함께 지워집니다.";
      paths.innerHTML = "삭제될 파일: <code>posts/" + escapeHtml((state.pendingDelete && state.pendingDelete.slug) || "") + ".md</code>";
    } else {
      titleEl.textContent = "미리보기 모드예요";
      bodyEl.textContent =
        "화면과 편집은 그대로 쓸 수 있지만, 저장은 되지 않아요. 토큰으로 로그인하면 이 글이 GitHub에 바로 커밋됩니다.";
      paths.innerHTML =
        "저장될 위치: <code>posts/" +
        escapeHtml(slug) +
        ".md</code> · <code>posts.json</code>";
    }
    openDialog(el.demoDialog);
  }

  /* ---------------------------------------------------------------------
     대시보드
     --------------------------------------------------------------------- */
  function loadDashboard(silent) {
    if (!state.mode) return;
    if (!silent) {
      if (el.dashLoading) el.dashLoading.hidden = false;
      if (el.postList) el.postList.innerHTML = "";
      if (el.dashEmpty) el.dashEmpty.hidden = true;
      if (el.dashError) el.dashError.hidden = true;
    }

    var promise;
    if (state.mode === "preview") {
      promise = fetch("posts.json", { cache: "no-cache" }).then(function (res) {
        if (!res.ok) throw new Error("posts.json 을 읽지 못했어요 (" + res.status + ")");
        return res.json();
      });
    } else {
      promise = getFile(state.cfg, "posts.json").then(function (file) {
        if (!file) return { site: state.site, posts: [] };
        try {
          return JSON.parse(file.text);
        } catch (error) {
          throw new Error("posts.json 형식이 올바르지 않아요. 파일을 확인해 주세요.");
        }
      });
    }

    return promise
      .then(function (data) {
        var posts = (data && data.posts) || [];
        state.site = (data && data.site) || state.site;
        state.posts = posts
          .filter(function (post) {
            return post && post.slug && post.title;
          })
          .sort(function (a, b) {
            return toDate(b.date) - toDate(a.date);
          });
        renderDashboard();
        loadCovers();
      })
      .catch(function (error) {
        if (el.dashLoading) el.dashLoading.hidden = true;
        if (el.dashError) {
          el.dashErrorText.textContent = describeError(error);
          el.dashError.hidden = false;
        }
      });
  }

  function showDashboard() {
    if (!state.mode) {
      showLogin();
      return;
    }
    showView("dashboard");
    updateConn();
    scrollToTop();
    document.title = "글 관리 — Pureripple";
    if (el.dashLede) {
      el.dashLede.textContent =
        state.mode === "preview"
          ? "미리보기 모드예요. 글을 열어 보고 편집 화면을 둘러볼 수 있지만, 저장은 되지 않아요."
          : "지금까지 남긴 글을 여기서 고치고 지울 수 있어요.";
    }
    if (el.dashFootnote) {
      el.dashFootnote.textContent =
        state.mode === "preview"
          ? "미리보기 모드 — 저장·삭제·이미지 업로드는 실제로 이뤄지지 않아요."
          : "저장하면 GitHub 저장소에 바로 커밋돼요. 사이트에 반영되기까지 1분쯤 걸릴 수 있어요.";
    }
    if (el.repoLabel) {
      el.repoLabel.textContent = state.mode === "live" ? state.cfg.owner + "/" + state.cfg.repo : "preview · 로컬 posts.json";
    }
    loadDashboard();
  }

  function showSettings() {
    if (!state.mode) {
      showLogin();
      return;
    }
    showView("settings");
    updateConn();
    scrollToTop();
    document.title = "사이트 설정 — Pureripple";
    if (el.settingsLede) {
      el.settingsLede.textContent =
        state.mode === "preview"
          ? "미리보기 모드예요. 토글과 인증 코드를 그대로 만져 보고, 저장하면 어떤 파일이 바뀔지 미리 볼 수 있어요(저장은 되지 않아요)."
          : "검색엔진에 이 블로그를 보여 줄지 정하고, 구글·네이버 인증 코드와 방문자 통계(GoatCounter)를 넣어 둘 수 있어요.";
    }
    if (el.seoSaveHint) {
      el.seoSaveHint.textContent =
        state.mode === "preview" ? "미리보기 모드 — 저장되지 않아요." : "저장하면 GitHub에 바로 커밋돼요. 사이트 반영까지 1분쯤 걸려요.";
    }
    ensurePosts().then(function () {
      loadSeo(true).catch(function () {
        /* 안내는 화면에 표시됩니다. */
      });
    });
  }

  function showAnalytics() {
    if (!state.mode) {
      showLogin();
      return;
    }
    showView("analytics");
    updateConn();
    scrollToTop();
    document.title = "통계 — Pureripple";
    if (el.analyticsLede) {
      el.analyticsLede.textContent =
        state.mode === "preview"
          ? "미리보기 모드예요. 블로그 콘텐츠 통계는 실제 값으로, 방문자 통계는 샘플 차트로 보여 드려요."
          : "블로그에 쌓인 글과 검색·구독 상태, 그리고 GoatCounter 방문자 통계를 한 화면에서 봐요.";
    }
    loadAnalytics();
  }

  function renderDashboard() {
    if (el.dashLoading) el.dashLoading.hidden = true;
    if (el.dashError) el.dashError.hidden = true;

    var total = state.posts.length;
    var featured = state.posts.filter(function (post) {
      return post.featured;
    }).length;
    var thisMonth = todayValue().slice(0, 7);
    var monthly = state.posts.filter(function (post) {
      return String(post.date || "").slice(0, 7) === thisMonth;
    }).length;

    if (el.dashStats) {
      el.dashStats.innerHTML = [
        { n: total, label: "전체 글" },
        { n: featured, label: "추천 글" },
        { n: monthly, label: "이번 달" }
      ]
        .map(function (item) {
          return (
            '<div class="ad-stat"><span class="ad-stat-num">' +
            item.n +
            '</span><span class="ad-stat-label">' +
            item.label +
            "</span></div>"
          );
        })
        .join("");
    }

    if (el.postCount) el.postCount.textContent = total ? total + "편" : "";

    if (!total) {
      if (el.postList) el.postList.innerHTML = "";
      if (el.dashEmpty) el.dashEmpty.hidden = false;
      return;
    }
    if (el.dashEmpty) el.dashEmpty.hidden = true;
    if (el.postList) el.postList.innerHTML = state.posts.map(postRowHtml).join("");
  }

  function postRowHtml(post) {
    var slug = String(post.slug);
    var cover = post.cover || DEFAULT_COVER;
    var featured = post.featured
      ? '<span class="ad-badge-featured"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6 6.9 19.3l1-5.7-4.1-4 5.7-.8z"></path></svg>추천</span>'
      : "";

    return (
      '<article class="ad-post" data-slug="' +
      escapeHtml(slug) +
      '">' +
      '<a class="ad-post-thumb" href="post.html?slug=' +
      encodeURIComponent(slug) +
      '" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">' +
      '<img src="' +
      escapeHtml(cover) +
      '" alt="" loading="lazy">' +
      "</a>" +
      '<div class="ad-post-main">' +
      '<div class="ad-post-top"><h3 class="ad-post-title">' +
      escapeHtml(post.title) +
      "</h3>" +
      featured +
      "</div>" +
      '<p class="ad-post-slug">posts/' +
      escapeHtml(slug) +
      ".md</p>" +
      '<div class="ad-post-meta"><span class="ad-cat">' +
      escapeHtml(post.category || "기록") +
      "</span><span>" +
      escapeHtml(formatDate(post.date)) +
      "</span>" +
      (post.minutes ? "<span>" + Number(post.minutes) + "분</span>" : "") +
      "</div></div>" +
      '<div class="ad-post-actions">' +
      '<a class="ad-act" href="post.html?slug=' +
      encodeURIComponent(slug) +
      '" target="_blank" rel="noopener">보기</a>' +
      '<button class="ad-act" type="button" data-act="edit">수정</button>' +
      '<button class="ad-act ad-act--danger" type="button" data-act="delete">삭제</button>' +
      "</div></article>"
    );
  }

  function postBySlug(slug) {
    for (var i = 0; i < state.posts.length; i++) {
      if (state.posts[i].slug === slug) return state.posts[i];
    }
    return null;
  }

  function askDelete(slug) {
    var post = postBySlug(slug);
    if (!post) return;
    state.pendingDelete = post;
    if (el.deletePostTitle) el.deletePostTitle.textContent = post.title;
    if (el.deletePath) el.deletePath.textContent = "posts/" + post.slug + ".md";
    openDialog(el.deleteDialog);
  }

  function deletePost(post) {
    if (!post) return;
    setBusy(true);

    var path = post.file || "posts/" + post.slug + ".md";

    getFile(state.cfg, path)
      .then(function (file) {
        if (!file) return null;
        return deleteFile(state.cfg, path, file.sha, "글 삭제: " + post.title);
      })
      .then(function () {
        // 영문 본문·공유 카드도 함께 정리합니다.
        return getFile(state.cfg, "posts/" + post.slug + ".en.md").then(function (file) {
          if (!file) return null;
          return deleteFile(state.cfg, "posts/" + post.slug + ".en.md", file.sha, "영문 본문 삭제: " + post.title);
        });
      })
      .then(function () {
        return getFile(state.cfg, "p/" + post.slug + ".html").then(function (file) {
          if (!file) return null;
          return deleteFile(state.cfg, "p/" + post.slug + ".html", file.sha, "공유 카드 삭제: " + post.title);
        });
      })
      .then(function () {
        return mutatePosts(
          function (data) {
            data.posts = data.posts.filter(function (item) {
              return item.slug !== post.slug;
            });
          },
          "posts.json — 글 삭제: " + post.title
        );
      })
      .then(function () {
        toast("글을 지웠어요. GitHub에 커밋했습니다.", "success");
        state.pendingDelete = null;
        return loadDashboard();
      })
      .then(function () {
        return syncSitemap();
      })
      .then(function () {
        return syncFeed();
      })
      .catch(function (error) {
        toast(describeError(error), "error");
      })
      .then(function () {
        setBusy(false);
      });
  }

  /* ---------------------------------------------------------------------
     표지 목록
     --------------------------------------------------------------------- */
  function coverLabel(path) {
    for (var i = 0; i < state.posts.length; i++) {
      if (state.posts[i].cover === path) return state.posts[i].title;
    }
    var base = String(path).split("/").pop() || path;
    return base.replace(/\.[a-z0-9]+$/i, "").replace(/-/g, " ");
  }

  function isCoverPath(path) {
    return typeof path === "string" && /^assets\/(covers\/)?[^/]+\.(jpe?g|png|webp|gif|avif|svg)$/i.test(path);
  }

  function loadCovers() {
    var fromPosts = state.posts
      .map(function (post) {
        return post.cover;
      })
      .filter(isCoverPath);

    if (state.mode === "preview") {
      state.covers = unique([DEFAULT_COVER].concat(fromPosts));
      refreshCoverOptions();
      return Promise.resolve();
    }

    return api(state.cfg, "GET", "contents/assets/covers")
      .then(function (data) {
        var list = Array.isArray(data)
          ? data
              .filter(function (item) {
                return item.type === "file" && IMAGE_EXT.test(item.name);
              })
              .map(function (item) {
                return item.path;
              })
          : [];
        state.covers = unique([DEFAULT_COVER].concat(list.length ? list : fromPosts));
        refreshCoverOptions();
      })
      .catch(function () {
        state.covers = unique([DEFAULT_COVER].concat(fromPosts));
        refreshCoverOptions();
      });
  }

  function refreshCoverOptions(selected) {
    if (!el.coverSelect) return;
    var current = selected !== undefined ? selected : el.coverSelect.value || DEFAULT_COVER;
    var list = unique([DEFAULT_COVER].concat(state.covers || []));
    if (current && list.indexOf(current) === -1) list.push(current);

    el.coverSelect.innerHTML = list
      .map(function (path) {
        var label = path === DEFAULT_COVER ? "기본 표지 · 바다" : coverLabel(path);
        return '<option value="' + escapeHtml(path) + '">' + escapeHtml(label) + "</option>";
      })
      .join("");
    el.coverSelect.value = list.indexOf(current) !== -1 ? current : DEFAULT_COVER;
    updateCoverPreview();
  }

  function updateCoverPreview() {
    if (!el.coverPreview) return;
    if (state.coverFile && state.coverFile.url) {
      el.coverPreview.src = state.coverFile.url;
      el.coverPreview.hidden = false;
      return;
    }
    var value = el.coverSelect ? el.coverSelect.value : "";
    if (!value) {
      el.coverPreview.hidden = true;
      el.coverPreview.removeAttribute("src");
      return;
    }
    el.coverPreview.src = value;
    el.coverPreview.hidden = false;
  }

  /* ---------------------------------------------------------------------
     에디터
     --------------------------------------------------------------------- */
  function reloadChrome() {
    document.body.classList.remove("is-busy");
  }

  function setBusy(busy, label) {
    state.busy = busy;
    document.body.classList.toggle("is-busy", busy);
    [el.saveBtn, el.saveBtnMobile].forEach(function (button) {
      if (!button) return;
      button.disabled = busy;
      if (button === el.saveBtn || button === el.saveBtnMobile) {
        var isNew = !state.current || state.current.isNew;
        button.textContent = busy ? "저장 중…" : isNew ? "발행하기" : "수정 저장";
      }
    });
    if (el.deleteConfirm) el.deleteConfirm.disabled = busy;
    if (busy && label) el.saveBtn.textContent = label;
  }

  function markDirty() {
    if (!state.current) return;
    if (!state.current.dirty) {
      state.current.dirty = true;
      if (el.dirtyFlag) el.dirtyFlag.hidden = false;
    }
  }

  function clearDirty() {
    if (!state.current) return;
    state.current.dirty = false;
    if (el.dirtyFlag) el.dirtyFlag.hidden = true;
  }

  function showFormError(message) {
    if (!el.formError) return;
    if (!message) {
      el.formError.hidden = true;
      el.formError.textContent = "";
      return;
    }
    el.formError.textContent = message;
    el.formError.hidden = false;
  }

  function parseFrontMatter(text) {
    var source = String(text || "").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
    var meta = {};
    var body = source;

    if (source.slice(0, 3) === "---") {
      var lines = source.split("\n");
      var end = -1;
      for (var i = 1; i < lines.length; i++) {
        if (trim(lines[i]) === "---" || trim(lines[i]) === "...") {
          end = i;
          break;
        }
      }
      if (end !== -1) {
        for (var j = 1; j < end; j++) {
          var line = lines[j];
          var at = line.indexOf(":");
          if (at === -1) continue;
          var key = trim(line.slice(0, at)).toLowerCase();
          var value = trim(line.slice(at + 1));
          if (key) meta[key] = value;
        }
        body = lines.slice(end + 1).join("\n").replace(/^\n+/, "");
      }
    }

    return { meta: meta, body: body };
  }

  function splitTags(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value || "")
      .split(/[,，\n]/)
      .map(function (tag) {
        return trim(tag).replace(/^#/, "");
      })
      .filter(Boolean);
  }

  function setEditorMode(isNew) {
    if (el.editorMode) el.editorMode.textContent = isNew ? "새 글" : "글 수정";
    if (el.saveBtn) el.saveBtn.textContent = isNew ? "발행하기" : "수정 저장";
    if (el.saveBtnMobile) el.saveBtnMobile.textContent = isNew ? "발행하기" : "수정 저장";
    if (el.editorFootNote) {
      el.editorFootNote.textContent =
        state.mode === "preview"
          ? "미리보기 모드 — 저장 버튼을 누르면 안내만 보여요."
          : "저장하면 posts/" + (el.slugInput && el.slugInput.value ? el.slugInput.value : "…") + ".md 와 posts.json에 함께 기록돼요.";
    }
    document.title = (isNew ? "새 글" : "글 수정") + " — Pureripple";
  }

  function resetEditor() {
    state.coverFile = null;
    state.slugTouched = false;
    state.current = { originalSlug: null, isNew: true, dirty: false, loading: true };
    showFormError("");
    if (el.titleInput) el.titleInput.value = "";
    if (el.slugInput) el.slugInput.value = "";
    if (el.categoryInput) el.categoryInput.value = "일상";
    if (el.dateInput) el.dateInput.value = todayValue();
    if (el.summaryInput) el.summaryInput.value = "";
    if (el.tagsInput) el.tagsInput.value = "";
    if (el.featuredInput) el.featuredInput.checked = false;
    if (el.bodyInput) el.bodyInput.value = "";
    if (el.titleEnInput) el.titleEnInput.value = "";
    if (el.summaryEnInput) el.summaryEnInput.value = "";
    if (el.bodyEnInput) el.bodyEnInput.value = "";
    if (el.enDetails) el.enDetails.open = false;
    if (el.slugHint) el.slugHint.textContent = "제목을 쓰면 자동으로 채워져요.";
    refreshCoverOptions(DEFAULT_COVER);
    if (el.coverHint) el.coverHint.textContent = "고르거나 새로 올리면 assets/covers/에 저장돼요.";
    setEditorMode(true);
    renderPreview();
    setPane("write");
  }

  function fillEditor(slug, meta, body) {
    state.current = { originalSlug: slug, isNew: false, dirty: false, loading: false };
    state.slugTouched = true;
    state.coverFile = null;

    if (el.titleInput) el.titleInput.value = String(meta.title || "");
    if (el.slugInput) el.slugInput.value = slug;
    if (el.categoryInput) {
      el.categoryInput.value = CATEGORIES.indexOf(meta.category) !== -1 ? meta.category : "일상";
    }
    if (el.dateInput) el.dateInput.value = /^\d{4}-\d{2}-\d{2}$/.test(meta.date) ? meta.date : todayValue();
    if (el.summaryInput) el.summaryInput.value = String(meta.summary || "");
    if (el.tagsInput) el.tagsInput.value = splitTags(meta.tags).join(", ");
    if (el.featuredInput) el.featuredInput.checked = /^(true|yes|1)$/i.test(String(meta.featured || ""));
    if (el.bodyInput) el.bodyInput.value = String(body || "").replace(/\s+$/, "");
    if (el.titleEnInput) el.titleEnInput.value = String(meta.title_en || "");
    if (el.summaryEnInput) el.summaryEnInput.value = String(meta.summary_en || "");
    if (el.bodyEnInput) el.bodyEnInput.value = "";
    if (el.enDetails) el.enDetails.open = !!(meta.title_en || meta.summary_en);
    if (el.slugHint) el.slugHint.textContent = "주소를 바꾸면 기존 파일은 새 주소로 옮겨집니다.";
    refreshCoverOptions(isCoverPath(meta.cover) ? meta.cover : DEFAULT_COVER);
    if (el.coverHint) el.coverHint.textContent = "고르거나 새로 올리면 assets/covers/에 저장돼요.";
    setEditorMode(false);
    renderPreview();
    clearDirty();
    setPane("write");
  }

  function openEditor(slug) {
    if (!state.mode) {
      showLogin();
      return;
    }
    showView("editor");
    updateConn();
    showFormError("");
    closeDialog(el.demoDialog);
    scrollToTop();

    refreshCoverOptions();

    if (!slug) {
      resetEditor();
      state.current.loading = false;
      if (!state.posts.length) loadDashboard(true);
      if (el.titleInput) {
        setTimeout(function () {
          el.titleInput.focus({ preventScroll: true });
        }, 60);
      }
      return;
    }

    state.current = { originalSlug: slug, isNew: false, dirty: false, loading: true };
    setEditorMode(false);
    if (el.bodyInput) el.bodyInput.value = "";
    renderPreview();

    var promise;
    if (state.mode === "preview") {
      promise = fetch("posts/" + encodeURIComponent(slug) + ".md", { cache: "no-cache" }).then(function (res) {
        if (!res.ok) throw new Error("글 파일을 읽지 못했어요 (" + res.status + ")");
        return res.text();
      });
    } else {
      promise = getFile(state.cfg, "posts/" + slug + ".md").then(function (file) {
        if (!file) {
          var err = new Error("글 파일을 찾을 수 없어요: posts/" + slug + ".md");
          err.status = 404;
          throw err;
        }
        return file.text;
      });
    }

    promise
      .then(function (raw) {
        var parsed = parseFrontMatter(raw);
        fillEditor(slug, parsed.meta, parsed.body);
        state.current.loading = false;
        if (!state.posts.length) loadDashboard(true);
        return loadEnglishBody(slug).then(function (text) {
          if (!state.current || state.current.originalSlug !== slug || state.current.isNew) return;
          if (el.bodyEnInput) el.bodyEnInput.value = text ? String(text).replace(/\s+$/, "") : "";
          if (text && el.enDetails) el.enDetails.open = true;
        });
      })
      .catch(function (error) {
        state.current.loading = false;
        toast(describeError(error), "error");
        navigate("#/posts");
      });
  }

  /* 영문 본문(posts/{slug}.en.md)은 있을 때만 읽습니다. */
  function loadEnglishBody(slug) {
    if (state.mode === "preview") {
      return fetch("posts/" + encodeURIComponent(slug) + ".en.md", { cache: "no-cache" })
        .then(function (res) {
          return res.ok ? res.text() : "";
        })
        .catch(function () {
          return "";
        });
    }
    return getFile(state.cfg, "posts/" + slug + ".en.md")
      .then(function (file) {
        return file ? file.text : "";
      })
      .catch(function () {
        return "";
      });
  }

  function readForm() {
    return {
      title: trim(el.titleInput.value).replace(/\s+/g, " "),
      slug: normalizeSlugInput(el.slugInput.value).replace(/-+$/, ""),
      category: el.categoryInput.value,
      date: el.dateInput.value,
      summary: trim(el.summaryInput.value).replace(/\s+/g, " "),
      tags: unique(splitTags(el.tagsInput.value)).slice(0, 10),
      featured: !!el.featuredInput.checked,
      cover: el.coverSelect.value || DEFAULT_COVER,
      titleEn: trim(el.titleEnInput ? el.titleEnInput.value : "").replace(/\s+/g, " "),
      summaryEn: trim(el.summaryEnInput ? el.summaryEnInput.value : "").replace(/\s+/g, " "),
      bodyEn: (el.bodyEnInput ? el.bodyEnInput.value : "")
        .replace(/\r\n/g, "\n")
        .replace(/^\n+/, "")
        .replace(/\s+$/, ""),
      body: el.bodyInput.value.replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "")
    };
  }

  function validate(form) {
    var errors = [];

    if (!form.title) errors.push({ field: "titleInput", message: "제목을 적어 주세요." });
    else if (form.title.length > 120) errors.push({ field: "titleInput", message: "제목은 120자까지 쓸 수 있어요." });

    if (!form.slug) errors.push({ field: "slugInput", message: "주소(slug)를 적어 주세요." });
    else if (!validSlug(form.slug)) {
      errors.push({ field: "slugInput", message: "주소는 영문 소문자·숫자·하이픈만 쓸 수 있어요. 예: a-day-by-the-sea" });
    }

    if (CATEGORIES.indexOf(form.category) === -1) {
      errors.push({ field: "categoryInput", message: "카테고리를 골라 주세요." });
    }

    if (!validDate(form.date)) {
      errors.push({ field: "dateInput", message: "날짜를 골라 주세요." });
    }

    if (!form.body) errors.push({ field: "bodyInput", message: "본문이 비어 있어요. 한 줄이라도 적어 주세요." });

    return errors;
  }

  function showValidation(errors) {
    if (!errors.length) {
      showFormError("");
      return;
    }
    showFormError(errors[0].message);
    $$(".ad-input, #bodyInput").forEach(function (input) {
      input.removeAttribute("aria-invalid");
    });
    var target = document.getElementById(errors[0].field);
    if (target) {
      target.setAttribute("aria-invalid", "true");
      target.focus({ preventScroll: false });
    }
  }

  function buildMarkdown(form) {
    var lines = [
      "---",
      "title: " + form.title,
      "category: " + form.category,
      "date: " + form.date,
      "summary: " + form.summary
    ];
    if (form.titleEn) lines.push("title_en: " + form.titleEn);
    if (form.summaryEn) lines.push("summary_en: " + form.summaryEn);
    lines.push("cover: " + form.cover);
    lines.push("tags: " + form.tags.join(", "));
    lines.push("featured: " + (form.featured ? "true" : "false"));
    lines.push("---", "", form.body, "");
    return lines.join("\n");
  }

  function buildEntry(form) {
    var author = (state.site && state.site.author) || "양갱";
    var entry = {
      slug: form.slug,
      title: form.title,
      category: form.category,
      date: form.date,
      summary: form.summary,
      cover: form.cover,
      tags: form.tags,
      author: author,
      featured: form.featured,
      minutes: readingTime(form.body),
      file: "posts/" + form.slug + ".md"
    };
    if (form.titleEn) entry.title_en = form.titleEn;
    if (form.summaryEn) entry.summary_en = form.summaryEn;
    if (form.bodyEn) entry.hasEnBody = true;
    return entry;
  }

  function sortPosts(list) {
    return list.sort(function (a, b) {
      if (String(a.date) === String(b.date)) return String(a.title).localeCompare(String(b.title), "ko");
      return String(a.date) < String(b.date) ? 1 : -1;
    });
  }

  function mutatePosts(mutator, message) {
    var attempt = 0;

    function run() {
      attempt++;
      return getFile(state.cfg, "posts.json").then(function (file) {
        var data;
        if (file) {
          try {
            data = JSON.parse(file.text);
          } catch (error) {
            throw new Error("posts.json 형식이 올바르지 않아요. 파일을 확인해 주세요.");
          }
        } else {
          data = {
            site: {
              title: "Pureripple",
              description: "일상과 생각, 작업의 기록을 천천히 쌓아 두는 개인 블로그.",
              author: (state.site && state.site.author) || "양갱",
              url: ""
            },
            posts: []
          };
        }
        if (!data.site) data.site = { title: "Pureripple", author: "양갱", description: "", url: "" };
        if (!Array.isArray(data.posts)) data.posts = [];

        mutator(data);
        sortPosts(data.posts);
        data.generatedAt = nowIso();

        var text = JSON.stringify(data, null, 2) + "\n";
        return putFile(state.cfg, "posts.json", text, message, file ? file.sha : null).then(function () {
          state.site = data.site;
          return data;
        }).catch(function (error) {
          if (error.status === 409 && attempt < 3) return run();
          throw error;
        });
      });
    }

    return run();
  }

  function savePost() {
    if (state.busy) return;
    if (state.current && state.current.loading) {
      toast("글을 불러오는 중이에요. 잠시만 기다려 주세요.");
      return;
    }
    if (!state.current) return;

    var form = readForm();
    el.slugInput.value = form.slug;
    var errors = validate(form);
    showValidation(errors);
    if (errors.length) return;

    if (state.mode !== "live") {
      openDemo("save", form);
      return;
    }

    setBusy(true);
    showFormError("");

    var previousSlug = state.current.originalSlug;
    var isNew = state.current.isNew;
    var newPath = "posts/" + form.slug + ".md";
    var oldPath = previousSlug ? "posts/" + previousSlug + ".md" : null;
    var savedEntry = null;

    var pendingCover = Promise.resolve(form.cover);
    if (state.coverFile) {
      var coverName = state.coverFile.uploadName || makeImageName(state.coverFile.name);
      pendingCover = uploadImage("assets/covers", coverName, state.coverFile.file).then(function (actualPath) {
        form.cover = actualPath;
        if (state.coverFile && state.coverFile.url) URL.revokeObjectURL(state.coverFile.url);
        state.coverFile = null;
        state.covers = unique((state.covers || []).concat([actualPath]));
        refreshCoverOptions(actualPath);
        return actualPath;
      });
    }

    pendingCover
      .then(function (coverPath) {
        form.cover = coverPath || form.cover;
        var samePath = !isNew && previousSlug === form.slug;
        if (samePath) return getFile(state.cfg, newPath).then(function (file) {
          return { existing: file, oldFile: null };
        });
        // 새 글·주소 변경: 파일을 찔러 보지 않고 posts/ 목록으로 겹침을 확인합니다.
        return listDir(state.cfg, "posts").then(function (items) {
          var taken = items.some(function (item) {
            return item.name === form.slug + ".md";
          });
          if (taken) {
            var err = new Error("이미 같은 주소의 글이 있어요. 주소(slug)를 바꿔 주세요.");
            err.code = "slug-taken";
            throw err;
          }
          if (!isNew && oldPath && oldPath !== newPath) {
            return getFile(state.cfg, oldPath).then(function (file) {
              return { existing: null, oldFile: file };
            });
          }
          return { existing: null, oldFile: null };
        });
      })
      .then(function (ctx) {
        var markdown = buildMarkdown(form);
        return putTextWithRetry(
          state.cfg,
          newPath,
          markdown,
          (isNew ? "새 글: " : "글 수정: ") + form.title,
          ctx.existing ? ctx.existing.sha : null
        )
          .then(function () {
            if (!isNew && oldPath && oldPath !== newPath && ctx.oldFile) {
              return deleteFile(state.cfg, oldPath, ctx.oldFile.sha, "글 주소 변경: " + previousSlug + " → " + form.slug);
            }
            return null;
          })
          .then(function () {
            return syncEnglishBody(form, previousSlug);
          });
      })
      .then(function () {
        var entry = buildEntry(form);
        savedEntry = entry;
        return mutatePosts(
          function (data) {
            data.posts = data.posts.filter(function (post) {
              return post.slug !== entry.slug && post.slug !== previousSlug;
            });
            data.posts.push(entry);
          },
          (isNew ? "posts.json — 새 글: " : "posts.json — 글 수정: ") + form.title
        ).then(function (data) {
          if (data && data.posts) state.posts = data.posts;
          return entry;
        });
      })
      .then(function () {
        state.current.originalSlug = form.slug;
        state.current.isNew = false;
        clearDirty();
        if (state.coverFile && state.coverFile.url) URL.revokeObjectURL(state.coverFile.url);
        state.coverFile = null;
        toast((isNew ? "발행했어요" : "수정했어요") + " — GitHub에 커밋했습니다.", "success");
        return syncSharePage(savedEntry, previousSlug)
          .then(syncSitemap)
          .then(syncFeed);
      })
      .then(function () {
        navigate("#/posts");
      })
      .catch(function (error) {
        if (error.code === "slug-taken") showFormError(error.message);
        toast(describeError(error), "error");
      })
      .then(function () {
        setBusy(false);
      });
  }

  /* ---------------------------------------------------------------------
     이미지
     --------------------------------------------------------------------- */
  function makeImageName(original) {
    var name = String(original || "image");
    var dot = name.lastIndexOf(".");
    var base = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "jpg";
    if (!IMAGE_EXT.test(ext)) ext = "jpg";
    var slug = slugify(base).slice(0, 40) || "image";
    var stamp = nowIso().replace(/[-:T]/g, "").slice(0, 14);
    return slug + "-" + stamp + "." + ext;
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || "");
        var comma = result.indexOf(",");
        resolve(comma === -1 ? "" : result.slice(comma + 1));
      };
      reader.onerror = function () {
        reject(new Error("이미지 파일을 읽지 못했어요."));
      };
      reader.readAsDataURL(file);
    });
  }

  function uploadImage(dir, name, file) {
    return fileToBase64(file).then(function (base64) {
      var path = dir + "/" + name;
      return api(state.cfg, "PUT", "contents/" + path, {
        message: "이미지 올리기: " + name,
        content: base64
      }).then(function () {
        return path;
      }).catch(function (error) {
        if (error.status !== 422) throw error;
        var suffixed = dir + "/" + name.replace(/(\.[a-z0-9]+)$/i, "-" + Math.random().toString(36).slice(2, 6) + "$1");
        return api(state.cfg, "PUT", "contents/" + suffixed, {
          message: "이미지 올리기: " + suffixed.split("/").pop(),
          content: base64
        }).then(function () {
          return suffixed;
        });
      });
    });
  }

  function handleCoverPick(file) {
    if (!file) return;
    if (!/^image\//i.test(file.type)) {
      toast("이미지 파일만 올릴 수 있어요.", "error");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast("이미지는 6MB까지 올릴 수 있어요. 조금 줄여 주세요.", "error");
      return;
    }
    if (state.coverFile && state.coverFile.url) URL.revokeObjectURL(state.coverFile.url);
    state.coverFile = {
      file: file,
      url: URL.createObjectURL(file),
      name: file.name,
      uploadName: makeImageName(file.name)
    };
    if (el.coverSelect) el.coverSelect.value = DEFAULT_COVER;
    updateCoverPreview();
    if (el.coverHint) {
      el.coverHint.textContent =
        (state.mode === "live" ? "저장하면 " : "미리보기 — 실제로는 올라가지 않아요. ") +
        "assets/covers/" + state.coverFile.name.replace(/\.[^.]+$/, "") +
        " 이미지로 올라가요.";
    }
    markDirty();
  }

  function insertBodyImage() {
    var picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.addEventListener("change", function () {
      var file = picker.files && picker.files[0];
      if (!file) return;
      if (!/^image\//i.test(file.type)) {
        toast("이미지 파일만 올릴 수 있어요.", "error");
        return;
      }
      if (file.size > 6 * 1024 * 1024) {
        toast("이미지는 6MB까지 올릴 수 있어요.", "error");
        return;
      }

      var alt = file.name.replace(/\.[^.]+$/, "");
      var token = "![" + alt + "](";

      function insert(url) {
        var ta = el.bodyInput;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var snippet = "\n\n" + token + url + ")\n\n";
        ta.setRangeText(snippet, start, end, "end");
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.focus();
      }

      if (state.mode === "preview") {
        var url = URL.createObjectURL(file);
        insert(url);
        toast("미리보기 모드라 이 화면에서만 보여요. 로그인하면 assets/images/에 올라갑니다.");
        return;
      }

      toast("이미지를 올리는 중…");
      var name = makeImageName(file.name);
      uploadImage("assets/images", name, file)
        .then(function (path) {
          insert(path);
          toast("이미지를 올렸어요 — assets/images/" + name, "success");
        })
        .catch(function (error) {
          toast(describeError(error), "error");
        });
    });
    picker.click();
  }

  /* ---------------------------------------------------------------------
     마크다운 미리보기 (사이트와 같은 규칙)
     --------------------------------------------------------------------- */
  function sanitizeUrl(url) {
    var value = String(url || "").trim();
    if (/^javascript:/i.test(value)) return "#";
    if (/^(https?:|mailto:|blob:|#|\/|\.\/|\.\.\/|[a-z0-9._-]+\.(html|jpe?g|png|webp|svg|gif|avif))/i.test(value)) {
      return value;
    }
    if (/^[a-z0-9._-]+\//i.test(value)) return value;
    return "#";
  }

  function inlineFormat(text) {
    var codes = [];
    var source = String(text || "");

    source = source.replace(/`([^`]+)`/g, function (match, code) {
      codes.push(code);
      return "\u0000C" + (codes.length - 1) + "\u0000";
    });

    var html = escapeHtml(source);

    html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (match, alt, src) {
      return '<img src="' + sanitizeUrl(src) + '" alt="' + alt + '" loading="lazy">';
    });

    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (match, label, href) {
      var url = sanitizeUrl(href);
      var external = /^https?:/i.test(url);
      return '<a href="' + url + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + label + "</a>";
    });

    html = html.replace(/\u0000C(\d+)\u0000/g, function (match, index) {
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
      var trimmed = trim(line);

      if (!trimmed) {
        flush();
        i++;
        continue;
      }

      if (/^```/.test(trimmed)) {
        flush();
        var lang = trimmed.slice(3).trim();
        i++;
        var code = [];
        while (i < lines.length && !/^```/.test(trim(lines[i]))) {
          code.push(lines[i]);
          i++;
        }
        i++;
        out.push(
          "<pre><code" +
            (lang ? ' class="language-' + escapeHtml(lang) + '"' : "") +
            ">" +
            escapeHtml(code.join("\n")) +
            "</code></pre>"
        );
        continue;
      }

      var heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (heading) {
        flush();
        var level = Math.min(heading[1].length, 6);
        out.push("<h" + level + ">" + inlineFormat(trim(heading[2])) + "</h" + level + ">");
        i++;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flush();
        out.push("<hr>");
        i++;
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        flush();
        var quotes = [];
        while (i < lines.length && /^>\s?/.test(trim(lines[i]))) {
          quotes.push(trim(lines[i]).replace(/^>\s?/, ""));
          i++;
        }
        out.push("<blockquote><p>" + inlineFormat(quotes.join(" ")) + "</p></blockquote>");
        continue;
      }

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

      if (/^[-*]\s+/.test(trimmed)) {
        flush();
        var items = [];
        while (i < lines.length && /^[-*]\s+/.test(trim(lines[i]))) {
          items.push(trim(lines[i]).replace(/^[-*]\s+/, ""));
          i++;
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^[-*]\s+/.test(trim(lines[i]))) {
            items[items.length - 1] += " " + trim(lines[i]);
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

      if (/^\d+\.\s+/.test(trimmed)) {
        flush();
        var ordered = [];
        while (i < lines.length && /^\d+\.\s+/.test(trim(lines[i]))) {
          ordered.push(trim(lines[i]).replace(/^\d+\.\s+/, ""));
          i++;
        }
        out.push(
          "<ol>" +
            ordered
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

  function renderPreview() {
    if (!el.previewPane || !el.bodyInput) return;
    var html = renderMarkdown(el.bodyInput.value);
    el.previewPane.innerHTML = html || '<p class="ad-preview-empty">여기에 본문이 그대로 보여요.</p>';
    updateHints();
  }

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(renderPreview, 130);
  }

  function updateHints() {
    var body = el.bodyInput ? el.bodyInput.value : "";
    var chars = body.replace(/\s+/g, "").length;
    var minutes = Math.max(1, Math.round(chars / 400));
    if (el.readHint) el.readHint.textContent = minutes + "분 읽기";
    if (el.charHint) el.charHint.textContent = chars ? chars.toLocaleString("ko-KR") + "자" : "0자";
  }

  function setPane(pane) {
    if (!el.editorSplit) return;
    el.editorSplit.dataset.pane = pane;
    if (el.compose) el.compose.dataset.pane = pane;
    $$(".ad-tab", el.compose).forEach(function (tab) {
      var active = tab.dataset.pane === pane;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (pane === "preview") renderPreview();
  }

  /* ---------------------------------------------------------------------
     서식 도구
     --------------------------------------------------------------------- */
  function applyToSelection(before, after, placeholder) {
    var ta = el.bodyInput;
    if (!ta) return;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var selected = ta.value.slice(start, end) || placeholder || "";
    var inserted = before + selected + after;
    ta.setRangeText(inserted, start, end, "end");
    ta.focus();
    if (!ta.value.slice(start, end) || selected === placeholder) {
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    } else {
      ta.setSelectionRange(start + inserted.length, start + inserted.length);
    }
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applyLinePrefix(prefix) {
    var ta = el.bodyInput;
    if (!ta) return;
    var value = ta.value;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var lineStart = value.lastIndexOf("\n", start - 1) + 1;
    var lineEnd = value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = value.length;

    var block = value.slice(lineStart, lineEnd);
    var changed = block
      .split("\n")
      .map(function (line) {
        var clean = line.replace(/^(\s*)(#{1,6}\s+|>\s?)/, "$1");
        return prefix + clean;
      })
      .join("\n");

    ta.setRangeText(changed, lineStart, lineEnd, "end");
    ta.setSelectionRange(lineStart + changed.length, lineStart + changed.length);
    ta.focus();
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function handleToolbar(action) {
    if (action === "bold") applyToSelection("**", "**", "굵은 글씨");
    else if (action === "italic") applyToSelection("*", "*", "기울인 글씨");
    else if (action === "heading") applyLinePrefix("## ");
    else if (action === "quote") applyLinePrefix("> ");
    else if (action === "link") applyToSelection("[", "](https://example.com)", "링크 글자");
    else if (action === "image") insertBodyImage();
  }

  /* ---------------------------------------------------------------------
     사이트 파일 — robots.txt · sitemap.xml · feed.xml · p/{slug}.html
     검색엔진 설정과 공유 카드, RSS 는 모두 같은 GitHub Contents API 로 커밋합니다.
     --------------------------------------------------------------------- */
  var SITE_URL = "https://xirown.github.io";
  var SEO_PAGES = ["index.html", "post.html", "404.html"];
  var WEEKDAYS_RSS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS_RSS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var GOAT_SIGNUP = "https://www.goatcounter.com/signup";

  function siteBase() {
    var url = trim((state.site && state.site.url) || "");
    if (/^https?:\/\//i.test(url)) return url.replace(/\/+$/, "");
    return SITE_URL;
  }

  function xmlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function robotsFor(isPublic) {
    if (!isPublic) return "User-agent: *\nDisallow: /\n";
    return (
      "User-agent: *\n" +
      "Allow: /\n" +
      "Disallow: /admin\n" +
      "Disallow: /admin.html\n" +
      "Sitemap: " +
      siteBase() +
      "/sitemap.xml\n"
    );
  }

  function sitemapFor(posts) {
    var base = siteBase();
    var list = (posts || []).filter(function (post) {
      return post && post.slug;
    });
    var newest = "";
    list.forEach(function (post) {
      if (post.date && String(post.date) > newest) newest = String(post.date);
    });
    var out = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
    out.push("  <url>");
    out.push("    <loc>" + xmlEscape(base + "/") + "</loc>");
    if (newest) out.push("    <lastmod>" + xmlEscape(newest) + "</lastmod>");
    out.push("    <changefreq>weekly</changefreq>");
    out.push("    <priority>1.0</priority>");
    out.push("  </url>");
    list.forEach(function (post) {
      out.push("  <url>");
      out.push("    <loc>" + xmlEscape(base + "/post.html?slug=" + encodeURIComponent(post.slug)) + "</loc>");
      if (post.date) out.push("    <lastmod>" + xmlEscape(post.date) + "</lastmod>");
      out.push("    <changefreq>monthly</changefreq>");
      out.push("    <priority>0.7</priority>");
      out.push("  </url>");
    });
    out.push("</urlset>");
    return out.join("\n") + "\n";
  }

  function sitemapUrlCount(xml) {
    return (String(xml || "").match(/<loc>/g) || []).length;
  }

  function rssDate(value) {
    var d = toDate(value);
    if (isNaN(d.getTime())) return "";
    return (
      WEEKDAYS_RSS[d.getDay()] +
      ", " +
      pad(d.getDate()) +
      " " +
      MONTHS_RSS[d.getMonth()] +
      " " +
      d.getFullYear() +
      " 09:00:00 +0900"
    );
  }

  function feedFor(posts) {
    var base = siteBase();
    var list = (posts || []).filter(function (post) {
      return post && post.slug && post.title;
    });
    var newest = "";
    list.forEach(function (post) {
      if (post.date && String(post.date) > newest) newest = String(post.date);
    });
    var out = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      "  <channel>",
      "    <title>" + xmlEscape((state.site && state.site.title) || "Pureripple") + "</title>",
      "    <link>" + xmlEscape(base + "/") + "</link>",
      "    <description>" +
        xmlEscape((state.site && state.site.description) || "일상과 생각, 작업의 기록을 천천히 쌓아 두는 개인 블로그.") +
        "</description>",
      "    <language>ko</language>",
      "    <lastBuildDate>" + xmlEscape(rssDate(newest)) + "</lastBuildDate>",
      '    <atom:link href="' + xmlEscape(base + "/feed.xml") + '" rel="self" type="application/rss+xml" />'
    ];
    list.forEach(function (post) {
      var url = base + "/post.html?slug=" + encodeURIComponent(post.slug);
      out.push("    <item>");
      out.push("      <title>" + xmlEscape(post.title) + "</title>");
      out.push("      <link>" + xmlEscape(url) + "</link>");
      out.push('      <guid isPermaLink="true">' + xmlEscape(url) + "</guid>");
      out.push("      <pubDate>" + xmlEscape(rssDate(post.date || newest)) + "</pubDate>");
      out.push("      <category>" + xmlEscape(post.category || "기록") + "</category>");
      out.push("      <description>" + xmlEscape(post.summary || "") + "</description>");
      out.push("    </item>");
    });
    out.push("  </channel>");
    out.push("</rss>");
    return out.join("\n") + "\n";
  }

  function feedItemCount(xml) {
    return (String(xml || "").match(/<item>/g) || []).length;
  }

  function sharePageHtml(post) {
    var base = siteBase();
    var slug = String(post.slug);
    var title = String(post.title || slug);
    var summary = String(post.summary || "");
    var cover = String(post.cover || "assets/hero.jpg").replace(/^\//, "");
    var next = "    ";
    return [
      "<!DOCTYPE html>",
      '<html lang="ko">',
      "  <head>",
      '    <meta charset="utf-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
      "    <title>" + escapeHtml(title) + " — Pureripple</title>",
      '    <meta name="description" content="' + escapeHtml(summary) + '" />',
      '    <link rel="canonical" href="' + escapeHtml(base + "/post.html?slug=" + encodeURIComponent(slug)) + '" />',
      '    <meta name="robots" content="noindex, follow" />',
      '    <meta name="theme-color" content="#fdf1f7" />',
      "",
      '    <meta property="og:type" content="article" />',
      '    <meta property="og:site_name" content="Pureripple" />',
      '    <meta property="og:title" content="' + escapeHtml(title + " — Pureripple") + '" />',
      '    <meta property="og:description" content="' + escapeHtml(summary) + '" />',
      '    <meta property="og:image" content="' + escapeHtml(base + "/" + cover) + '" />',
      '    <meta property="og:url" content="' + escapeHtml(base + "/p/" + slug + ".html") + '" />',
      '    <meta property="og:locale" content="ko_KR" />',
      '    <meta name="twitter:card" content="summary_large_image" />',
      '    <meta name="twitter:title" content="' + escapeHtml(title + " — Pureripple") + '" />',
      '    <meta name="twitter:description" content="' + escapeHtml(summary) + '" />',
      '    <meta name="twitter:image" content="' + escapeHtml(base + "/" + cover) + '" />',
      "",
      '    <meta http-equiv="refresh" content="0; url=../post.html?slug=' + escapeHtml(encodeURIComponent(slug)) + '" />',
      '    <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml" />',
      '    <link rel="stylesheet" href="../style.css" />',
      "    <script>",
      '      location.replace("../post.html?slug=' + slug + '" + location.hash);',
      "    </script>",
      "  </head>",
      '  <body class="share-page">',
      '    <main class="container share-fallback">',
      '      <p class="eyebrow">Pureripple</p>',
      '      <h1 class="share-title">' + escapeHtml(title) + "</h1>",
      '      <p class="share-summary">' + escapeHtml(summary) + "</p>",
      '      <p><a class="link-arrow" href="../post.html?slug=' + escapeHtml(encodeURIComponent(slug)) + '">글로 이동하기</a></p>',
      "    </main>",
      "  </body>",
      "</html>",
      ""
    ].join("\n");
  }

  /* head 안의 <meta name="..."> 를 넣고 · 고치고 · 지웁니다. */
  function applyHeadMetas(html, metas) {
    var source = String(html == null ? "" : html);
    if (!source) return source;
    var pending = [];

    metas.forEach(function (meta) {
      var name = meta.name;
      var value = trim(meta.content);
      var re = new RegExp("<meta\\s+name=[\"']" + name + "[\"'][^>]*>", "i");
      var hit = re.exec(source);

      if (value) {
        var tag = '<meta name="' + name + '" content="' + escapeHtml(value) + '" />';
        if (hit) {
          source = source.slice(0, hit.index) + tag + source.slice(hit.index + hit[0].length);
        } else {
          pending.push(tag);
        }
        return;
      }

      if (!hit) return;
      var lineStart = source.lastIndexOf("\n", hit.index) + 1;
      var lineEnd = source.indexOf("\n", hit.index);
      if (lineEnd === -1) lineEnd = source.length;
      var line = source.slice(lineStart, lineEnd);
      if (trim(line.replace(re, "")) === "") {
        source = source.slice(0, lineStart) + source.slice(lineEnd + 1 <= source.length ? lineEnd + 1 : source.length);
      } else {
        source = source.slice(0, hit.index) + source.slice(hit.index + hit[0].length);
      }
    });

    if (!pending.length) return source;

    var anchor = -1;
    var indent = "    ";
    metas.forEach(function (meta) {
      var re = new RegExp("^([ \\t]*)<meta\\s+name=[\"']" + meta.name + "[\"'][^>]*>[ \\t]*$", "im");
      var m = re.exec(source);
      if (m && m.index + m[0].length > anchor) {
        anchor = m.index + m[0].length;
        indent = m[1] || indent;
      }
    });
    if (anchor === -1) {
      var viewport = /^([ \t]*)<meta\s+name=["']viewport["'][^>]*>[ \t]*$/im.exec(source);
      if (viewport) {
        anchor = viewport.index + viewport[0].length;
        indent = viewport[1] || indent;
      }
    }

    var block = pending
      .map(function (tag) {
        return "\n" + indent + tag;
      })
      .join("");

    if (anchor === -1) {
      return source.replace(/<head([^>]*)>/i, function (match, attrs) {
        return "<head" + attrs + ">" + block;
      });
    }
    return source.slice(0, anchor) + block + source.slice(anchor);
  }

  function metaContent(html, name) {
    var tag = new RegExp("<meta\\s+name=[\"']" + name + "[\"'][^>]*>", "i").exec(String(html || ""));
    if (!tag) return null;
    var content = /content=["']([^"']*)["']/i.exec(tag[0]);
    return content ? content[1] : "";
  }

  function robotsFileIsPublic(text) {
    if (!text) return null;
    var allow = false;
    var deny = false;
    String(text)
      .split("\n")
      .forEach(function (line) {
        var value = trim(line.replace(/#.*$/, "")).toLowerCase();
        if (value === "allow: /") allow = true;
        else if (value === "disallow: /") deny = true;
      });
    if (allow && !deny) return true;
    if (deny) return false;
    return null;
  }

  function goatCodeFrom(html) {
    var m = /data-goatcounter=["']https:\/\/([a-z0-9-]+)\.goatcounter\.com\/count["']/i.exec(String(html || ""));
    return m ? m[1] : "";
  }

  function applyGoatCounter(html, code) {
    var source = String(html || "");
    source = source.replace(/^[ \t]*<script[^>]*data-goatcounter[^>]*>[ \t]*<\/script>[ \t]*\n?/gim, "");
    if (!code) return source;
    var tag =
      '    <script data-goatcounter="https://' +
      code +
      '.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>\n';
    if (/<\/body>/i.test(source)) return source.replace(/<\/body>/i, tag + "  </body>");
    return source + tag;
  }

  /* ---------------------------------------------------------------------
     검색엔진 설정 화면
     --------------------------------------------------------------------- */
  function emptySeo() {
    return {
      loaded: false,
      loading: null,
      saving: false,
      isPublic: true,
      hasRobots: false,
      hasSitemap: false,
      hasFeed: false,
      robots: "",
      sitemap: "",
      feed: "",
      index: "",
      post: "",
      notFound: "",
      indexMeta: null,
      google: "",
      naver: "",
      goat: "",
      sitemapUrls: 0,
      feedItems: 0
    };
  }

  function readSiteFile(path) {
    if (state.mode === "preview") {
      return fetch(path, { cache: "no-cache" }).then(function (res) {
        if (!res.ok) return null;
        return res.text().then(function (text) {
          return { path: path, sha: null, text: text };
        });
      });
    }
    return getFile(state.cfg, path);
  }

  function ensurePosts() {
    if (state.posts && state.posts.length) return Promise.resolve(state.posts);
    var promise;
    if (state.mode === "preview") {
      promise = fetch("posts.json", { cache: "no-cache" }).then(function (res) {
        if (!res.ok) throw new Error("posts.json 을 읽지 못했어요 (" + res.status + ")");
        return res.json();
      });
    } else {
      promise = getFile(state.cfg, "posts.json").then(function (file) {
        if (!file) return { site: state.site, posts: [] };
        return JSON.parse(file.text);
      });
    }
    return promise
      .then(function (data) {
        var posts = ((data && data.posts) || []).filter(function (post) {
          return post && post.slug && post.title;
        });
        state.posts = posts.sort(function (a, b) {
          return toDate(b.date) - toDate(a.date);
        });
        if (data && data.site) state.site = data.site;
        return state.posts;
      })
      .catch(function () {
        return state.posts;
      });
  }

  function loadSeo(force) {
    if (state.mode !== "live" && state.mode !== "preview") return Promise.resolve(state.seo);
    if (state.seo.saving && !force) return Promise.resolve(state.seo);
    if (state.seo.loaded && !force) return Promise.resolve(state.seo);
    if (state.seo.loading) return state.seo.loading;

    if (el.seoBadge) {
      el.seoBadge.textContent = "확인 중";
      el.seoBadge.className = "ad-seo-badge";
    }
    showSeoError("");

    var paths = ["robots.txt", "sitemap.xml", "feed.xml", "index.html", "post.html", "404.html"];
    var promise = Promise.all(
      paths.map(function (path) {
        return readSiteFile(path).catch(function () {
          return null;
        });
      })
    )
      .then(function (files) {
        var seo = emptySeo();
        seo.loaded = true;
        seo.hasRobots = !!files[0];
        seo.hasSitemap = !!files[1];
        seo.hasFeed = !!files[2];
        seo.robots = files[0] ? files[0].text : "";
        seo.sitemap = files[1] ? files[1].text : "";
        seo.feed = files[2] ? files[2].text : "";
        seo.index = files[3] ? files[3].text : "";
        seo.post = files[4] ? files[4].text : "";
        seo.notFound = files[5] ? files[5].text : "";
        seo.sitemapUrls = sitemapUrlCount(seo.sitemap);
        seo.feedItems = feedItemCount(seo.feed);
        seo.indexMeta = metaContent(seo.index, "robots");
        seo.google = metaContent(seo.index, "google-site-verification") || "";
        seo.naver = metaContent(seo.index, "naver-site-verification") || "";
        seo.goat = goatCodeFrom(seo.index) || goatCodeFrom(seo.post);

        var byRobots = robotsFileIsPublic(seo.robots);
        var blocked = seo.indexMeta ? /noindex/i.test(seo.indexMeta) : false;
        seo.isPublic = byRobots === null ? !blocked : byRobots;

        state.seo = seo;
        renderSeoState();
        return seo;
      })
      .catch(function (error) {
        if (el.seoBadge) {
          el.seoBadge.textContent = "확인 실패";
          el.seoBadge.className = "ad-seo-badge is-private";
        }
        showSeoError(describeError(error));
        throw error;
      });

    var guarded = promise.then(
      function (value) {
        state.seo.loading = null;
        return value;
      },
      function (error) {
        state.seo.loading = null;
        throw error;
      }
    );
    state.seo.loading = guarded;
    return guarded;
  }

  function ensureSeo() {
    if (state.seo.loaded) return Promise.resolve(state.seo);
    return loadSeo(false).catch(function () {
      return state.seo;
    });
  }

  function seoIsPublicNow() {
    return !!(el.seoPublicInput && el.seoPublicInput.checked);
  }

  function seoDraft() {
    var isPublic = seoIsPublicNow();
    var google = trim(el.googleVerifyInput ? el.googleVerifyInput.value : "").replace(/\s+/g, "");
    var naver = trim(el.naverVerifyInput ? el.naverVerifyInput.value : "").replace(/\s+/g, "");
    var goat = trim(el.goatInput ? el.goatInput.value : "").toLowerCase();
    var robotsMeta = isPublic ? "index, follow" : "noindex, nofollow";
    var sources = {
      "index.html": state.seo.index,
      "post.html": state.seo.post,
      "404.html": state.seo.notFound
    };
    var pages = {};
    SEO_PAGES.forEach(function (path) {
      var metas = [{ name: "robots", content: robotsMeta }];
      if (path === "index.html") {
        metas.push({ name: "google-site-verification", content: google });
        metas.push({ name: "naver-site-verification", content: naver });
      }
      var html = applyHeadMetas(sources[path], metas);
      if (path === "index.html" || path === "post.html") html = applyGoatCounter(html, goat);
      pages[path] = html;
    });

    return {
      isPublic: isPublic,
      google: google,
      naver: naver,
      goat: goat,
      robots: robotsFor(isPublic),
      sitemap: isPublic ? sitemapFor(state.posts) : "",
      pages: pages
    };
  }

  function seoFactsHtml() {
    var seo = state.seo;
    var facts = [
      {
        label: "robots.txt",
        value: seo.hasRobots ? (robotsFileIsPublic(seo.robots) === false ? "비공개 (Disallow: /)" : "공개 (Allow: /)") : "파일 없음",
        note: seo.hasRobots ? "Sitemap 줄 " + (/sitemap:/i.test(seo.robots) ? "있음" : "없음") : "저장하면 만들어져요"
      },
      {
        label: "index.html meta",
        value: seo.indexMeta || "없음",
        note: seo.indexMeta ? "robots 메타" : "저장하면 noindex/index 로 맞춰요"
      },
      {
        label: "sitemap.xml",
        value: seo.hasSitemap ? seo.sitemapUrls + "개 URL" : "파일 없음",
        note: "홈 + 글 " + state.posts.length + "편"
      },
      {
        label: "feed.xml",
        value: seo.hasFeed ? seo.feedItems + "편" : "파일 없음",
        note: "RSS 피드"
      },
      {
        label: "Google 인증",
        value: seo.google ? "등록됨" : "없음",
        note: "google-site-verification"
      },
      {
        label: "네이버 인증",
        value: seo.naver ? "등록됨" : "없음",
        note: "naver-site-verification"
      },
      {
        label: "GoatCounter",
        value: seo.goat ? seo.goat : "연결 안 됨",
        note: seo.goat ? "방문자 통계 연결됨" : "사이트 코드를 넣어 주세요"
      }
    ];
    return facts
      .map(function (fact) {
        return (
          '<div class="ad-seo-fact">' +
          '<span class="ad-seo-fact-label">' +
          escapeHtml(fact.label) +
          "</span>" +
          '<span class="ad-seo-fact-value">' +
          escapeHtml(fact.value) +
          "</span>" +
          '<span class="ad-seo-fact-note">' +
          escapeHtml(fact.note) +
          "</span></div>"
        );
      })
      .join("");
  }

  function renderSeoState() {
    var seo = state.seo;
    if (el.seoRepoLabel) {
      el.seoRepoLabel.textContent =
        state.mode === "live" ? state.cfg.owner + "/" + state.cfg.repo : "preview · 로컬 파일";
    }
    if (el.seoBadge) {
      el.seoBadge.textContent = seo.loaded ? (seo.isPublic ? "공개" : "비공개") : "확인 중";
      el.seoBadge.className = "ad-seo-badge " + (seo.isPublic ? "is-public" : "is-private");
    }
    if (el.seoStatusText) {
      if (!seo.loaded) {
        el.seoStatusText.textContent = "저장소의 robots.txt 와 index.html 을 읽어 오는 중이에요.";
      } else if (seo.isPublic) {
        el.seoStatusText.textContent =
          "검색엔진에 공개되어 있어요. robots.txt 가 /admin·/admin.html 만 막고, 홈과 글 " +
          state.posts.length +
          "편이 sitemap.xml 에 들어 있어요." +
          (seo.hasSitemap ? "" : " sitemap.xml 은 저장할 때 만들어집니다.");
      } else {
        el.seoStatusText.textContent =
          "검색엔진에 공개하지 않고 있어요. robots.txt 가 모든 페이지를 막고, 공개 페이지의 meta 도 noindex, nofollow 로 맞춰져 있어요.";
      }
    }
    if (el.seoFacts) el.seoFacts.innerHTML = seo.loaded ? seoFactsHtml() : "";
    if (el.seoPublicInput) el.seoPublicInput.checked = !!seo.isPublic;
    if (el.googleVerifyInput) el.googleVerifyInput.value = seo.google || "";
    if (el.naverVerifyInput) el.naverVerifyInput.value = seo.naver || "";
    if (el.goatInput) el.goatInput.value = seo.goat || "";
    updateSeoPreview();
  }

  function seoFileBlock(path, content, note) {
    return (
      '<article class="ad-seo-file">' +
      '<div class="ad-seo-file-head"><span class="ad-seo-file-path">' +
      escapeHtml(path) +
      "</span>" +
      (note ? '<span class="ad-seo-file-note">' + escapeHtml(note) + "</span>" : "") +
      '</div><pre class="ad-seo-code">' +
      escapeHtml(content) +
      "</pre></article>"
    );
  }

  function headTagsFor(path, draft) {
    var tags = [
      '<meta name="robots" content="' + (draft.isPublic ? "index, follow" : "noindex, nofollow") + '" />'
    ];
    if (path === "index.html") {
      if (draft.google) tags.push('<meta name="google-site-verification" content="' + draft.google + '" />');
      if (draft.naver) tags.push('<meta name="naver-site-verification" content="' + draft.naver + '" />');
    }
    if (draft.goat && (path === "index.html" || path === "post.html")) {
      tags.push('<script data-goatcounter="https://' + draft.goat + '.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>');
    }
    return tags.join("\n");
  }

  function updateSeoPreview() {
    var draft = seoDraft();

    if (el.seoModeFlag) {
      var changed =
        draft.isPublic !== !!state.seo.isPublic ||
        draft.google !== (state.seo.google || "") ||
        draft.naver !== (state.seo.naver || "") ||
        draft.goat !== (state.seo.goat || "");
      el.seoModeFlag.textContent = (draft.isPublic ? "공개" : "비공개") + (changed ? " · 저장 전" : "");
      el.seoModeFlag.className = "ad-seo-flag " + (draft.isPublic ? "is-public" : "is-private");
    }
    if (el.seoPublicHint) {
      el.seoPublicHint.textContent = draft.isPublic
        ? "검색엔진이 이 블로그와 모든 글을 찾을 수 있어요. 대신 /admin 과 /admin.html 은 언제나 막혀 있어요."
        : "검색엔진이 이 블로그를 찾지 못하게 해요. 이미 등록된 페이지도 noindex 로 빠지고, sitemap.xml 은 지워집니다.";
    }
    if (el.seoChanges) {
      var changes = draft.isPublic
        ? [
            "robots.txt — Allow: /, /admin 만 차단, Sitemap 줄 추가",
            "index.html · post.html · 404.html — robots meta → index, follow",
            "sitemap.xml — 홈 + 글 " + state.posts.length + "편 URL",
            "feed.xml · 공유 카드 — 글을 저장할 때 함께 갱신"
          ]
        : [
            "robots.txt — Disallow: /",
            "index.html · post.html · 404.html — robots meta → noindex, nofollow",
            "sitemap.xml — 지우기",
            "feed.xml · 공유 카드 — 그대로 둠"
          ];
      if (draft.google || draft.naver) changes.push("index.html — 검색 등록 인증 meta 반영");
      if (draft.goat) changes.push("index.html · post.html — GoatCounter 스크립트 삽입");
      el.seoChanges.innerHTML = changes
        .map(function (item) {
          return "<li>" + escapeHtml(item) + "</li>";
        })
        .join("");
    }
    if (el.seoFiles) {
      var blocks = [seoFileBlock("robots.txt", draft.robots, draft.isPublic ? "검색 허용" : "전체 차단")];
      SEO_PAGES.forEach(function (path) {
        var source = path === "index.html" ? state.seo.index : path === "post.html" ? state.seo.post : state.seo.notFound;
        blocks.push(
          seoFileBlock(
            path,
            source ? headTagsFor(path, draft) : "(파일을 읽지 못했어요)",
            source
              ? "<head> 태그" + (draft.goat && path !== "404.html" ? " · 방문자 스크립트" : "")
              : "건너뜀"
          )
        );
      });
      blocks.push(
        seoFileBlock(
          "sitemap.xml",
          draft.isPublic ? draft.sitemap : "(비공개 — sitemap.xml 을 지웁니다)",
          draft.isPublic ? sitemapUrlCount(draft.sitemap) + "개 URL" : "삭제"
        )
      );
      blocks.push(
        seoFileBlock(
          "feed.xml",
          "(글을 저장할 때 자동으로 다시 만들어져요)",
          state.seo.feedItems + "편"
        )
      );
      el.seoFiles.innerHTML = blocks.join("");
    }
    if (el.seoPreviewNote) {
      el.seoPreviewNote.textContent = draft.isPublic
        ? "robots.txt · meta · sitemap.xml"
        : "robots.txt · noindex meta · sitemap.xml 삭제";
    }
  }

  function showSeoError(message) {
    if (!el.seoError) return;
    el.seoError.textContent = message || "";
    el.seoError.hidden = !message;
  }

  function setSeoBusy(busy) {
    state.seo.saving = busy;
    if (el.seoSaveBtn) {
      el.seoSaveBtn.disabled = busy;
      el.seoSaveBtn.textContent = busy ? "저장 중…" : "설정 저장";
    }
    if (el.seoReloadBtn) el.seoReloadBtn.disabled = busy;
  }

  function saveSeo() {
    if (state.seo.saving) return;
    if (!state.seo.loaded) {
      toast("사이트 설정을 아직 읽는 중이에요. 잠시만 기다려 주세요.");
      loadSeo(true);
      return;
    }

    var draft = seoDraft();
    if (/["<>]/.test(draft.google + draft.naver)) {
      showSeoError("인증 코드에는 따옴표나 꺾쇠 같은 문자를 쓸 수 없어요. 코드만 붙여 넣어 주세요.");
      return;
    }
    if (draft.goat && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(draft.goat)) {
      showSeoError("GoatCounter 사이트 코드는 영문 소문자·숫자·하이픈만 쓸 수 있어요. 예: pureripple");
      return;
    }
    showSeoError("");

    if (state.mode !== "live") {
      openDemo("settings", draft);
      return;
    }

    setSeoBusy(true);

    var plan = draft;
    var jobs = [
      {
        path: "robots.txt",
        transform: function () {
          return plan.robots;
        },
        message: "검색엔진 설정: " + (plan.isPublic ? "공개" : "비공개")
      }
    ];
    SEO_PAGES.forEach(function (path) {
      jobs.push({
        path: path,
        transform: function (text) {
          var metas = [{ name: "robots", content: plan.isPublic ? "index, follow" : "noindex, nofollow" }];
          if (path === "index.html") {
            metas.push({ name: "google-site-verification", content: plan.google });
            metas.push({ name: "naver-site-verification", content: plan.naver });
          }
          var html = applyHeadMetas(text, metas);
          if (path === "index.html" || path === "post.html") html = applyGoatCounter(html, plan.goat);
          return html;
        },
        message: "검색엔진 meta: " + path + " → " + (plan.isPublic ? "index, follow" : "noindex, nofollow")
      });
    });

    var written = 0;

    function run(index) {
      if (index >= jobs.length) return Promise.resolve(written);
      var job = jobs[index];
      return getFile(state.cfg, job.path).then(function (file) {
        if (!file) return false;
        var content = job.transform(file.text);
        if (content === file.text) return false;
        return putTextWithRetry(state.cfg, job.path, content, job.message, file.sha).then(function () {
          return true;
        });
      }).then(function (did) {
        if (did) written++;
        return run(index + 1);
      });
    }

    run(0)
      .then(function () {
        return syncSitemapFile(plan.isPublic ? sitemapFor(state.posts) : null);
      })
      .then(function (did) {
        if (did) written++;
        return syncFeed();
      })
      .then(function () {
        return loadSeo(true);
      })
      .then(function () {
        toast(
          written
            ? "설정을 저장했어요 — " + written + "개 파일을 GitHub에 커밋했습니다."
            : "이미 저장된 내용과 같아요. 바뀐 파일이 없습니다.",
          written ? "success" : undefined
        );
      })
      .catch(function (error) {
        showSeoError(describeError(error));
        toast(describeError(error), "error");
      })
      .then(function () {
        setSeoBusy(false);
      });
  }

  function syncSitemapFile(xml) {
    if (state.mode !== "live") return Promise.resolve(false);
    var path = "sitemap.xml";
    return getFile(state.cfg, path).then(function (file) {
      if (xml == null) {
        if (!file) return false;
        return deleteFile(state.cfg, path, file.sha, "검색엔진 설정: sitemap.xml 삭제").then(function () {
          return true;
        });
      }
      if (file && file.text === xml) return false;
      return putTextWithRetry(
        state.cfg,
        path,
        xml,
        "sitemap.xml 갱신 (" + sitemapUrlCount(xml) + "개 URL)",
        file ? file.sha : null
      ).then(function () {
        return true;
      });
    });
  }

  function syncFeed() {
    if (state.mode !== "live") return Promise.resolve();
    return ensurePosts()
      .then(function (posts) {
        var xml = feedFor(posts);
        return getFile(state.cfg, "feed.xml").then(function (file) {
          if (file && file.text === xml) return null;
          return putTextWithRetry(
            state.cfg,
            "feed.xml",
            xml,
            "feed.xml 갱신 (" + feedItemCount(xml) + "편)",
            file ? file.sha : null
          );
        });
      })
      .catch(function () {
        /* 피드 갱신 실패는 글 저장을 막지 않습니다. */
      });
  }

  function syncSitemap() {
    if (state.mode !== "live") return Promise.resolve();
    return ensurePosts()
      .then(function () {
        return ensureSeo();
      })
      .then(function (seo) {
        if (!seo || !seo.isPublic) return null;
        return syncSitemapFile(sitemapFor(state.posts));
      })
      .catch(function () {
        /* 사이트맵 갱신 실패는 글 저장을 막지 않습니다. */
      });
  }

  function syncSharePage(post, previousSlug) {
    if (state.mode !== "live" || !post || !post.slug) return Promise.resolve();
    var path = "p/" + post.slug + ".html";
    var html = sharePageHtml(post);
    return getFile(state.cfg, path)
      .then(function (file) {
        if (file && file.text === html) return null;
        return putTextWithRetry(state.cfg, path, html, "공유 카드: " + post.title, file ? file.sha : null);
      })
      .then(function () {
        if (!previousSlug || previousSlug === post.slug) return null;
        var oldPath = "p/" + previousSlug + ".html";
        return getFile(state.cfg, oldPath).then(function (file) {
          if (!file) return null;
          return deleteFile(state.cfg, oldPath, file.sha, "공유 카드 주소 이동: " + previousSlug + " → " + post.slug);
        });
      })
      .catch(function () {
        /* 공유 카드 실패는 글 저장을 막지 않습니다. */
      });
  }

  function syncEnglishBody(form, previousSlug) {
    var path = "posts/" + form.slug + ".en.md";
    var text = form.bodyEn ? form.bodyEn + "\n" : "";
    var oldPath = previousSlug && previousSlug !== form.slug ? "posts/" + previousSlug + ".en.md" : null;

    return getFile(state.cfg, path)
      .then(function (file) {
        if (!text) {
          if (!file) return null;
          return deleteFile(state.cfg, path, file.sha, "영문 본문 지우기: " + form.title);
        }
        if (file && file.text === text) return null;
        return putTextWithRetry(state.cfg, path, text, "영문 본문: " + form.title, file ? file.sha : null);
      })
      .then(function () {
        if (!oldPath) return null;
        return getFile(state.cfg, oldPath).then(function (file) {
          if (!file) return null;
          return deleteFile(state.cfg, oldPath, file.sha, "영문 본문 주소 이동: " + previousSlug + " → " + form.slug);
        });
      });
  }

  /* ---------------------------------------------------------------------
     통계 화면
     --------------------------------------------------------------------- */
  function topTags(limit) {
    var counts = {};
    state.posts.forEach(function (post) {
      (post.tags || []).forEach(function (tag) {
        var key = trim(tag);
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .map(function (tag) {
        return { tag: tag, count: counts[tag] };
      })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.tag.localeCompare(b.tag, "ko");
      })
      .slice(0, limit || 8);
  }

  function barRowHtml(label, count, max, extra) {
    var width = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 4;
    return (
      '<div class="ad-bar-row' +
      (extra ? " " + extra : "") +
      '"><span class="ad-bar-label">' +
      escapeHtml(label) +
      '</span><span class="ad-bar"><i style="width:' +
      width +
      '%"></i></span><span class="ad-bar-value">' +
      count +
      "</span></div>"
    );
  }

  function sampleVisitorHtml() {
    var values = [3, 5, 4, 8, 6, 9, 7, 12, 10, 14, 9, 16, 12, 18];
    var max = Math.max.apply(null, values);
    var bars = values
      .map(function (value, index) {
        var height = Math.max(8, Math.round((value / max) * 100));
        var label = index % 2 === 0 ? "D-" + (values.length - index) : "";
        return (
          '<span class="ad-chart-bar" title="' +
          value +
          '"><i style="height:' +
          height +
          '%"></i><em>' +
          label +
          "</em></span>"
        );
      })
      .join("");
    return (
      '<div class="ad-chart-head"><span class="ad-chart-total">샘플 14일</span>' +
      '<span class="ad-seo-badge">샘플 데이터</span></div>' +
      '<div class="ad-chart" aria-hidden="true">' +
      bars +
      "</div>" +
      '<p class="ad-seo-lead">GoatCounter 사이트 코드를 넣으면 이 자리에 실제 방문 수와 인기 글이 나타나요. ' +
      '무료 플랜은 1분이면 만들 수 있어요. ' +
      '<a class="link" href="' +
      GOAT_SIGNUP +
      '" target="_blank" rel="noopener">GoatCounter 무료로 시작하기</a></p>'
    );
  }

  function goatTotal(code) {
    var url = "https://" + code + ".goatcounter.com/counter/TOTAL.json";
    return fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("goat " + res.status);
        return res.json();
      })
      .then(function (data) {
        var raw = data && (data.count != null ? data.count : data.count_unique);
        var n = Number(String(raw).replace(/[^0-9]/g, ""));
        if (!isFinite(n) || !n) throw new Error("goat empty");
        return n;
      });
  }

  function renderVisitors() {
    if (!el.anVisitors) return;
    var code = state.seo.goat;
    if (el.anGoatBadge) {
      el.anGoatBadge.textContent = code ? "연결됨" : "미연결";
      el.anGoatBadge.className = "ad-seo-badge " + (code ? "is-public" : "is-private");
    }
    if (el.anGoatNote) el.anGoatNote.textContent = code ? code + ".goatcounter.com" : "사이트 설정에서 코드 입력";

    if (!code || state.mode !== "live") {
      el.anVisitors.innerHTML = sampleVisitorHtml();
      return;
    }

    el.anVisitors.innerHTML =
      '<p class="ad-seo-lead">GoatCounter 에서 방문 수를 읽는 중이에요…</p>';
    goatTotal(code)
      .then(function (total) {
        if (!el.anVisitors) return;
        el.anVisitors.innerHTML =
          '<div class="ad-chart-head"><span class="ad-chart-total">' +
          total.toLocaleString("ko-KR") +
          ' <em>총 방문</em></span><span class="ad-seo-badge is-public">GoatCounter</span></div>' +
          '<p class="ad-seo-lead">글별 방문 순위와 기간별 그래프는 GoatCounter 대시보드에서 볼 수 있어요. ' +
          '<a class="link" href="https://' +
          escapeHtml(code) +
          '.goatcounter.com" target="_blank" rel="noopener">대시보드 열기</a></p>';
      })
      .catch(function () {
        if (!el.anVisitors) return;
        el.anVisitors.innerHTML =
          '<p class="ad-seo-lead">GoatCounter 에 연결하지 못했어요. 사이트 코드(<strong>' +
          escapeHtml(code) +
          "</strong>)와 주소를 확인해 주세요. " +
          '<a class="link" href="https://' +
          escapeHtml(code) +
          '.goatcounter.com" target="_blank" rel="noopener">대시보드 열기</a></p>' +
          sampleVisitorHtml();
      });
  }

  function renderAnalytics() {
    var posts = state.posts || [];
    var seo = state.seo;
    var month = todayValue().slice(0, 7);
    var featured = posts.filter(function (post) {
      return post.featured;
    }).length;
    var monthly = posts.filter(function (post) {
      return String(post.date || "").slice(0, 7) === month;
    }).length;
    var enCount = posts.filter(function (post) {
      return post.title_en || post.summary_en || post.hasEnBody;
    }).length;
    var tags = topTags(8);

    if (el.anStats) {
      el.anStats.innerHTML = [
        { n: posts.length, label: "전체 글" },
        { n: monthly, label: "이번 달" },
        { n: featured, label: "추천 글" },
        { n: tags.length ? Object.keys(
            posts.reduce(function (acc, post) {
              (post.tags || []).forEach(function (tag) {
                acc[tag] = true;
              });
              return acc;
            }, {})
          ).length : 0, label: "태그" }
      ]
        .map(function (item) {
          return (
            '<div class="ad-stat"><span class="ad-stat-num">' +
            item.n +
            '</span><span class="ad-stat-label">' +
            item.label +
            "</span></div>"
          );
        })
        .join("");
    }

    var cats = CATEGORIES.map(function (cat) {
      return {
        name: cat,
        count: posts.filter(function (post) {
          return (post.category || "기록") === cat;
        }).length
      };
    });
    var other = posts.filter(function (post) {
      return CATEGORIES.indexOf(post.category) === -1;
    }).length;
    if (other) cats.push({ name: "기타", count: other });
    var catMax = Math.max.apply(
      null,
      [1].concat(
        cats.map(function (cat) {
          return cat.count;
        })
      )
    );
    if (el.anCategories) {
      el.anCategories.innerHTML =
        cats.map(function (cat) {
          return barRowHtml(cat.name, cat.count, catMax);
        }).join("") +
        '<p class="ad-seo-lead">' +
        (posts.length ? "가장 많은 카테고리는 " + cats.slice().sort(function (a, b) { return b.count - a.count; })[0].name + "이에요." : "아직 글이 없어요.") +
        "</p>";
    }
    if (el.anCatNote) el.anCatNote.textContent = posts.length + "편";

    if (el.anTags) {
      el.anTags.innerHTML = tags.length
        ? tags
            .map(function (item) {
              return barRowHtml("#" + item.tag, item.count, tags[0].count);
            })
            .join("")
        : '<p class="ad-seo-lead">태그가 붙은 글을 쓰면 여기에 순위가 쌓여요.</p>';
    }

    if (el.anChecks) {
      var checks = [
        {
          ok: seo.isPublic,
          label: "검색엔진",
          value: seo.isPublic ? "공개" : "비공개",
          note: seo.isPublic ? "robots.txt · meta 허용" : "robots.txt · meta 차단"
        },
        {
          ok: seo.hasSitemap && seo.sitemapUrls > 0,
          label: "sitemap.xml",
          value: seo.hasSitemap ? seo.sitemapUrls + "개 URL" : "없음",
          note: "홈 + 글 " + posts.length + "편"
        },
        {
          ok: seo.hasFeed && seo.feedItems > 0,
          label: "RSS feed.xml",
          value: seo.hasFeed ? seo.feedItems + "편" : "없음",
          note: "index.html · post.html 에 링크"
        },
        {
          ok: state.shareCount > 0,
          label: "공유 카드 p/",
          value: state.shareCount == null ? "확인 중" : state.shareCount + "개",
          note: "og:image · twitter:card"
        },
        {
          ok: enCount > 0,
          label: "영문 버전",
          value: enCount + "편",
          note: "EN 모드에서 보여 줄 글"
        },
        {
          ok: !!seo.goat,
          label: "GoatCounter",
          value: seo.goat || "미연결",
          note: seo.goat ? "방문자 통계" : "사이트 설정에서 연결"
        }
      ];
      el.anChecks.innerHTML = checks
        .map(function (check) {
          return (
            '<div class="ad-check' +
            (check.ok ? " is-ok" : "") +
            '"><span class="ad-check-dot" aria-hidden="true"></span>' +
            '<span class="ad-check-label">' +
            escapeHtml(check.label) +
            '</span><span class="ad-check-value">' +
            escapeHtml(check.value) +
            '</span><span class="ad-check-note">' +
            escapeHtml(check.note) +
            "</span></div>"
          );
        })
        .join("");
    }

    if (el.anSiteNote) {
      el.anSiteNote.textContent = seo.isPublic ? "검색 공개 중" : "검색 비공개";
    }

    renderVisitors();
  }

  function countSharePages() {
    if (state.mode === "live") {
      return listDir(state.cfg, "p")
        .then(function (items) {
          return items.filter(function (item) {
            return item.type === "file" && /\.html$/i.test(item.name);
          }).length;
        })
        .catch(function () {
          return null;
        });
    }
    return Promise.all(
      state.posts.map(function (post) {
        return fetch("p/" + encodeURIComponent(post.slug) + ".html", { method: "HEAD" })
          .then(function (res) {
            return res.ok;
          })
          .catch(function () {
            return false;
          });
      })
    ).then(function (results) {
      return results.filter(Boolean).length;
    });
  }

  function loadAnalytics() {
    if (!state.mode) return;
    if (el.anChecks) el.anChecks.innerHTML = '<p class="ad-seo-lead">통계를 모으는 중이에요…</p>';

    ensurePosts()
      .then(function () {
        return ensureSeo();
      })
      .then(function () {
        return countSharePages();
      })
      .then(function (count) {
        state.shareCount = count;
        renderAnalytics();
      })
      .catch(function (error) {
        toast(describeError(error), "error");
        renderAnalytics();
      });
  }

  /* ---------------------------------------------------------------------
     이벤트 연결
     --------------------------------------------------------------------- */
  function bindLogin() {
    if (el.loginForm) el.loginForm.addEventListener("submit", handleLogin);
    if (el.previewBtn) el.previewBtn.addEventListener("click", enterPreview);

    if (el.tokenToggle) {
      el.tokenToggle.addEventListener("click", function () {
        var show = el.tokenInput.type === "password";
        el.tokenInput.type = show ? "text" : "password";
        el.tokenToggle.setAttribute("aria-pressed", show ? "true" : "false");
        el.tokenToggle.setAttribute("aria-label", show ? "토큰 가리기" : "토큰 보기");
        el.tokenInput.focus({ preventScroll: true });
      });
    }

    if (el.tokenInput) {
      el.tokenInput.addEventListener("input", function () {
        if (el.loginNotice && !el.loginNotice.hidden) el.loginNotice.hidden = true;
      });
    }
  }

  function bindHeader() {
    if (el.logoutBtn) el.logoutBtn.addEventListener("click", logout);
  }

  function bindDashboard() {
    if (el.newPostBtn) el.newPostBtn.addEventListener("click", function () {
      navigate("#/new");
    });
    if (el.emptyNewBtn) el.emptyNewBtn.addEventListener("click", function () {
      navigate("#/new");
    });
    if (el.dashRetry) el.dashRetry.addEventListener("click", function () {
      loadDashboard();
    });

    if (el.postList) {
      el.postList.addEventListener("click", function (event) {
        var button = event.target.closest("[data-act]");
        if (!button) return;
        var row = button.closest(".ad-post");
        if (!row) return;
        var slug = row.getAttribute("data-slug");
        if (button.getAttribute("data-act") === "edit") navigate("#/edit/" + encodeURIComponent(slug));
        else if (button.getAttribute("data-act") === "delete") askDelete(slug);
      });
    }
  }

  function bindEditor() {
    if (el.titleInput) {
      el.titleInput.addEventListener("input", function () {
        markDirty();
        if (!state.slugTouched && el.slugInput) {
          var slug = slugify(el.titleInput.value);
          el.slugInput.value = slug || "";
          updateSlugHint();
        }
      });
    }

    if (el.slugInput) {
      el.slugInput.addEventListener("input", function () {
        state.slugTouched = true;
        markDirty();
        var normalized = normalizeSlugInput(el.slugInput.value);
        if (normalized !== el.slugInput.value) {
          var at = el.slugInput.selectionStart;
          el.slugInput.value = normalized;
          try {
            el.slugInput.setSelectionRange(at, at);
          } catch (error) {
            /* 무시 */
          }
        }
        updateSlugHint();
      });
    }

    if (el.slugAgain) {
      el.slugAgain.addEventListener("click", function () {
        state.slugTouched = false;
        var slug = slugify(el.titleInput.value) || fallbackSlug();
        el.slugInput.value = slug;
        el.slugHint.textContent = "제목으로 주소를 다시 만들었어요.";
        markDirty();
      });
    }

    [el.categoryInput, el.dateInput, el.summaryInput, el.tagsInput, el.featuredInput].forEach(function (input) {
      if (!input) return;
      input.addEventListener("input", markDirty);
      input.addEventListener("change", markDirty);
    });

    if (el.coverSelect) {
      el.coverSelect.addEventListener("change", function () {
        if (state.coverFile && state.coverFile.url) URL.revokeObjectURL(state.coverFile.url);
        state.coverFile = null;
        updateCoverPreview();
        if (el.coverHint) el.coverHint.textContent = "고르거나 새로 올리면 assets/covers/에 저장돼요.";
        markDirty();
      });
    }

    if (el.coverUploadBtn) {
      el.coverUploadBtn.addEventListener("click", function () {
        el.coverFileInput.click();
      });
    }
    if (el.coverFileInput) {
      el.coverFileInput.addEventListener("change", function () {
        handleCoverPick(el.coverFileInput.files && el.coverFileInput.files[0]);
        el.coverFileInput.value = "";
      });
    }

    if (el.bodyInput) {
      el.bodyInput.addEventListener("input", function () {
        markDirty();
        schedulePreview();
        updateHints();
      });
      el.bodyInput.addEventListener("keydown", function (event) {
        var meta = event.metaKey || event.ctrlKey;
        if (!meta) return;
        if (event.key.toLowerCase() === "b") {
          event.preventDefault();
          handleToolbar("bold");
        } else if (event.key.toLowerCase() === "i") {
          event.preventDefault();
          handleToolbar("italic");
        }
      });
      el.bodyInput.addEventListener("keyup", updateHints);
      el.bodyInput.addEventListener("click", updateHints);
    }

    if (el.toolbar) {
      el.toolbar.addEventListener("click", function (event) {
        var button = event.target.closest("[data-action]");
        if (!button) return;
        handleToolbar(button.getAttribute("data-action"));
      });
    }

    $$(".ad-tab", el.compose).forEach(function (tab) {
      tab.addEventListener("click", function () {
        setPane(tab.dataset.pane);
      });
    });

    if (el.saveBtn) el.saveBtn.addEventListener("click", savePost);
    if (el.saveBtnMobile) el.saveBtnMobile.addEventListener("click", savePost);

    function leaveEditor() {
      if (state.current && state.current.dirty && !window.confirm("저장하지 않은 내용이 있어요. 나갈까요?")) return;
      clearDirty();
      navigate("#/posts");
    }

    if (el.editorCancel) el.editorCancel.addEventListener("click", leaveEditor);
    if (el.editorBack) el.editorBack.addEventListener("click", leaveEditor);

    if (el.titleInput) {
      el.titleInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          el.bodyInput.focus();
        }
      });
    }
  }

  function updateSlugHint() {
    if (!el.slugHint) return;
    var slug = el.slugInput.value;
    if (!slug) {
      el.slugHint.textContent = "제목을 쓰면 자동으로 채워져요.";
      return;
    }
    if (!validSlug(slug)) {
      el.slugHint.textContent = "영문 소문자·숫자·하이픈만 쓸 수 있어요.";
      return;
    }
    el.slugHint.textContent = "주소: post.html?slug=" + slug;
  }

  function bindSettings() {
    if (el.settingsBtn) {
      el.settingsBtn.addEventListener("click", function () {
        navigate("#/settings");
      });
    }
    if (el.settingsBack) {
      el.settingsBack.addEventListener("click", function () {
        navigate("#/posts");
      });
    }
    if (el.seoPublicInput) {
      el.seoPublicInput.addEventListener("change", function () {
        showSeoError("");
        updateSeoPreview();
      });
    }
    [el.googleVerifyInput, el.naverVerifyInput, el.goatInput].forEach(function (input) {
      if (!input) return;
      input.addEventListener("input", function () {
        showSeoError("");
        updateSeoPreview();
      });
    });
    if (el.seoSaveBtn) el.seoSaveBtn.addEventListener("click", saveSeo);
    if (el.seoReloadBtn) {
      el.seoReloadBtn.addEventListener("click", function () {
        loadSeo(true)
          .then(function () {
            toast("저장소에서 다시 읽었어요.");
          })
          .catch(function () {
            /* 안내는 화면에 표시됩니다. */
          });
      });
    }
  }

  function bindAnalytics() {
    if (el.analyticsBtn) {
      el.analyticsBtn.addEventListener("click", function () {
        navigate("#/analytics");
      });
    }
    if (el.analyticsBack) {
      el.analyticsBack.addEventListener("click", function () {
        navigate("#/posts");
      });
    }
    if (el.analyticsRefresh) {
      el.analyticsRefresh.addEventListener("click", function () {
        loadAnalytics();
        toast("통계를 다시 읽었어요.");
      });
    }
  }

  function bindDialogs() {
    if (el.deleteCancel) {
      el.deleteCancel.addEventListener("click", function () {
        state.pendingDelete = null;
        closeDialog(el.deleteDialog);
      });
    }
    if (el.deleteConfirm) {
      el.deleteConfirm.addEventListener("click", function () {
        var post = state.pendingDelete;
        closeDialog(el.deleteDialog);
        if (!post) return;
        if (state.mode !== "live") {
          openDemo("delete");
          return;
        }
        deletePost(post);
      });
    }

    if (el.demoClose) el.demoClose.addEventListener("click", function () {
      closeDialog(el.demoDialog);
    });
    if (el.demoLogin) {
      el.demoLogin.addEventListener("click", function () {
        closeDialog(el.demoDialog);
        setPreviewWanted(false);
        state.mode = null;
        state.cfg = null;
        updateConn();
        history.replaceState(null, "", location.pathname + location.search);
        showLogin();
      });
    }

    [el.deleteDialog, el.demoDialog].forEach(function (dialog) {
      if (!dialog) return;
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) {
          if (dialog === el.deleteDialog) state.pendingDelete = null;
          closeDialog(dialog);
        }
      });
    });
  }

  function bindWindow() {
    window.addEventListener("hashchange", route);
    window.addEventListener("beforeunload", function (event) {
      if (state.current && state.current.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  function scrollToTop() {
    try {
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (error) {
      window.scrollTo(0, 0);
    }
  }

  /* ---------------------------------------------------------------------
     시작
     --------------------------------------------------------------------- */
  function collectElements() {
    el = {
      connChip: $("#connChip"),
      connText: $("#connText"),
      logoutBtn: $("#logoutBtn"),

      loginForm: $("#loginForm"),
      ownerInput: $("#ownerInput"),
      repoInput: $("#repoInput"),
      tokenInput: $("#tokenInput"),
      tokenToggle: $("#tokenToggle"),
      loginBtn: $("#loginBtn"),
      previewBtn: $("#previewBtn"),
      loginNotice: $("#loginNotice"),

      dashLede: $("#dashLede"),
      dashStats: $("#dashStats"),
      dashLoading: $("#dashLoading"),
      dashEmpty: $("#dashEmpty"),
      dashError: $("#dashError"),
      dashErrorText: $("#dashErrorText"),
      dashRetry: $("#dashRetry"),
      dashFootnote: $("#dashFootnote"),
      postList: $("#postList"),
      postCount: $("#postCount"),
      repoLabel: $("#repoLabel"),
      newPostBtn: $("#newPostBtn"),
      emptyNewBtn: $("#emptyNewBtn"),
      settingsBtn: $("#settingsBtn"),
      analyticsBtn: $("#analyticsBtn"),

      settingsLede: $("#settingsLede"),
      settingsBack: $("#settingsBack"),
      seoBadge: $("#seoBadge"),
      seoRepoLabel: $("#seoRepoLabel"),
      seoStatusText: $("#seoStatusText"),
      seoFacts: $("#seoFacts"),
      seoModeFlag: $("#seoModeFlag"),
      seoPublicInput: $("#seoPublicInput"),
      seoPublicHint: $("#seoPublicHint"),
      seoChanges: $("#seoChanges"),
      googleVerifyInput: $("#googleVerifyInput"),
      naverVerifyInput: $("#naverVerifyInput"),
      goatInput: $("#goatInput"),
      seoFiles: $("#seoFiles"),
      seoPreviewNote: $("#seoPreviewNote"),
      seoSaveBtn: $("#seoSaveBtn"),
      seoReloadBtn: $("#seoReloadBtn"),
      seoSaveHint: $("#seoSaveHint"),
      seoError: $("#seoError"),

      analyticsLede: $("#analyticsLede"),
      analyticsBack: $("#analyticsBack"),
      analyticsRefresh: $("#analyticsRefresh"),
      anStats: $("#anStats"),
      anCategories: $("#anCategories"),
      anCatNote: $("#anCatNote"),
      anTags: $("#anTags"),
      anChecks: $("#anChecks"),
      anSiteNote: $("#anSiteNote"),
      anVisitors: $("#anVisitors"),
      anGoatBadge: $("#anGoatBadge"),
      anGoatNote: $("#anGoatNote"),

      editorMode: $("#editorMode"),
      dirtyFlag: $("#dirtyFlag"),
      titleInput: $("#titleInput"),
      slugInput: $("#slugInput"),
      slugHint: $("#slugHint"),
      slugAgain: $("#slugAgain"),
      categoryInput: $("#categoryInput"),
      dateInput: $("#dateInput"),
      summaryInput: $("#summaryInput"),
      tagsInput: $("#tagsInput"),
      featuredInput: $("#featuredInput"),
      coverSelect: $("#coverSelect"),
      coverPreview: $("#coverPreview"),
      coverHint: $("#coverHint"),
      coverUploadBtn: $("#coverUploadBtn"),
      coverFileInput: $("#coverFile"),
      bodyInput: $("#bodyInput"),
      titleEnInput: $("#titleEnInput"),
      summaryEnInput: $("#summaryEnInput"),
      bodyEnInput: $("#bodyEnInput"),
      enDetails: $("#enDetails"),
      previewPane: $("#previewPane"),
      editorSplit: $("#editorSplit"),
      compose: $("#compose"),
      toolbar: $(".ad-toolbar"),
      readHint: $("#readHint"),
      charHint: $("#charHint"),
      editorFootNote: $("#editorFootNote"),
      formError: $("#formError"),
      saveBtn: $("#saveBtn"),
      saveBtnMobile: $("#saveBtnMobile"),
      editorCancel: $("#editorCancel"),
      editorBack: $("#editorBack"),

      toast: $("#toast"),
      toastText: $("#toastText"),

      deleteDialog: $("#deleteDialog"),
      deletePostTitle: $("#deletePostTitle"),
      deletePath: $("#deletePath"),
      deleteCancel: $("#deleteCancel"),
      deleteConfirm: $("#deleteConfirm"),

      demoDialog: $("#demoDialog"),
      demoBody: $("#demoBody"),
      demoPaths: $("#demoPaths"),
      demoClose: $("#demoClose"),
      demoLogin: $("#demoLogin")
    };
  }

  function restoreSession() {
    var cfg = readConfig();
    if (cfg && cfg.token) {
      document.body.dataset.view = "boot";
      state.cfg = cfg;
      if (el.ownerInput) el.ownerInput.value = cfg.owner;
      if (el.repoInput) el.repoInput.value = cfg.repo;
      verifyRepo(cfg)
        .then(function (repo) {
          state.repo = repo;
          state.mode = "live";
          enterApp();
        })
        .catch(function (error) {
          if (error.status === 401) {
            clearConfig();
            showLogin("저장된 토큰이 만료됐어요. 새 토큰으로 다시 로그인해 주세요.");
          } else {
            showLogin(describeError(error));
          }
        });
      return;
    }
    if (previewWanted()) {
      state.mode = "preview";
      state.cfg = { owner: "xirown", repo: "xirown.github.io", token: "" };
      state.repo = null;
      enterApp();
      return;
    }
    showLogin();
  }

  function boot() {
    collectElements();
    bindLogin();
    bindHeader();
    bindDashboard();
    bindSettings();
    bindAnalytics();
    bindEditor();
    bindDialogs();
    bindWindow();
    updateConn();
    restoreSession();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
