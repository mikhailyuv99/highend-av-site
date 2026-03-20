/* ============================================================
   OBSCURA — CMS-Compatible Client-Side App
   Click-to-select editing with Notion-style contextual toolbar,
   corner resize handles, double-click to edit text.
   PostMessage: CMS_READY, CMS_CONTENT, CMS_PATCH, CMS_PAGE,
   CMS_UPLOAD_REQUEST, CMS_SAVE
   ============================================================ */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var isCms = params.get("cmsEmbed") === "1";
  var ORIGIN = window.location.origin;
  var cmsParentOrigin = params.get("parentOrigin") || null;

  var ICON_MOVE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>';
  var ICON_UPLOAD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  var ICON_IMAGE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
  var ICON_CROP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v6"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>';

  function resolveUrl(raw) {
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    try { return new URL(raw, ORIGIN + "/").href; } catch (_) { return raw; }
  }
  function normalizeOrigin(o) {
    try { var u = new URL(o); var h = u.hostname === "127.0.0.1" ? "localhost" : u.hostname; return u.protocol + "//" + h + (u.port ? ":" + u.port : ""); } catch (_) { return o; }
  }
  function originOk(i) { return !cmsParentOrigin || normalizeOrigin(i) === normalizeOrigin(cmsParentOrigin); }
  function postToParent(msg) {
    if (!isCms) return;
    var t = cmsParentOrigin || "*";
    try { window.parent.postMessage(msg, t); } catch (_) { try { window.parent.postMessage(msg, "*"); } catch (__) {} }
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  var content = null;
  var currentSlug = params.get("page") || "index";
  var ALL = ["hero", "videoLoop", "videoPlay", "about", "services", "contact"];

  /* ── nav ── */
  var navEl = document.getElementById("site-nav");
  function activateNav() {
    if (!content || !content.pages) return;
    if (navEl) navEl.hidden = false;
    document.querySelectorAll(".site-nav__link").forEach(function (a) { a.classList.toggle("active", a.dataset.page === currentSlug); });
  }
  if (navEl) navEl.addEventListener("click", function (e) {
    var link = e.target.closest(".site-nav__link"); if (!link) return; e.preventDefault();
    var slug = link.dataset.page;
    if (slug && slug !== currentSlug) { currentSlug = slug; renderPage(pageData(slug)); activateNav(); window.scrollTo({ top: 0, behavior: "smooth" }); postToParent({ type: "CMS_PAGE", source: "cms-site", slug: slug }); }
  });
  window.addEventListener("hashchange", function () {
    var slug = window.location.hash.replace("#", "") || "index";
    if (content && content.pages && content.pages[slug] && slug !== currentSlug) { currentSlug = slug; renderPage(pageData(slug)); activateNav(); postToParent({ type: "CMS_PAGE", source: "cms-site", slug: slug }); }
  });

  /* ── CMS embed ── */
  if (isCms) {
    window.addEventListener("message", function (e) {
      if (!e.data || e.data.source !== "cms-app") return;
      if (!cmsParentOrigin) cmsParentOrigin = e.origin;
      if (!originOk(e.origin)) return;
      if (e.data.type === "CMS_CONTENT" && e.data.content) { content = e.data.content; if (e.data.pageSlug) currentSlug = e.data.pageSlug; renderPage(pageData(currentSlug)); activateNav(); }
    });
    postToParent({ type: "CMS_READY", source: "cms-site" });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); postToParent({ type: "CMS_SAVE", source: "cms-site" }); }
      if (e.key === "Escape") deselect();
    });
  }

  /* ── standalone ── */
  if (!isCms) {
    fetch("content.json?v=" + Date.now()).then(function (r) { return r.json(); }).then(function (data) {
      content = data; var hash = window.location.hash.replace("#", ""); if (hash && content.pages && content.pages[hash]) currentSlug = hash;
      renderPage(pageData(currentSlug)); activateNav();
    }).catch(function (err) { console.error("[OBSCURA] content.json load error", err); });
  }

  function pageData(slug) { return !content ? {} : content.pages ? (content.pages[slug] || {}) : content; }

  /* ============================================================
     SELECTION SYSTEM — click to select, Escape to deselect
     ============================================================ */
  var cmsControls = new Map();
  var selectedEl = null;
  var selectedCfg = null;
  var toolbar = null;
  var resizeHandles = [];

  function registerControl(el, config) {
    if (!isCms || !el) return;
    el.setAttribute("data-cms-ctrl", "");
    cmsControls.set(el, config);
  }

  function initCmsUI() {
    toolbar = document.createElement("div");
    toolbar.id = "cms-toolbar";
    document.body.appendChild(toolbar);

    document.addEventListener("click", function (e) {
      if (dragState) return;
      if (toolbar.contains(e.target)) return;
      if (e.target.closest(".cms-sec-bar")) return;
      if (e.target.closest(".cms-handle")) return;

      var target = e.target.closest("[data-cms-ctrl]");
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        select(target);
      } else {
        deselect();
      }
    }, true);

    document.addEventListener("dblclick", function (e) {
      var target = e.target.closest("[data-cms-ctrl]");
      if (!target) return;
      var cfg = cmsControls.get(target);
      if (cfg && !cfg.cropContainer) {
        target.contentEditable = "true";
        target.focus();
        target.classList.add("cms-editing");
      }
    });

    window.addEventListener("scroll", function () {
      if (selectedEl) { positionToolbar(); positionHandles(); }
    }, { passive: true });
    window.addEventListener("resize", function () {
      if (selectedEl) { positionToolbar(); positionHandles(); }
    });
  }

  function select(el) {
    if (selectedEl === el) return;
    deselect();
    var cfg = cmsControls.get(el);
    if (!cfg) return;
    selectedEl = el;
    selectedCfg = cfg;
    el.classList.add("cms-selected");
    buildToolbar(el, cfg);
    if (cfg.canResize) showHandles(el);
    positionToolbar();
    positionHandles();
    toolbar.classList.add("cms-tb-visible");
  }

  function deselect() {
    if (!selectedEl) return;
    selectedEl.classList.remove("cms-selected");
    selectedEl.contentEditable = "false";
    selectedEl.classList.remove("cms-editing");
    selectedEl = null;
    selectedCfg = null;
    toolbar.classList.remove("cms-tb-visible");
    toolbar.innerHTML = "";
    hideHandles();
  }

  /* ── Toolbar ── */
  function buildToolbar(el, cfg) {
    toolbar.innerHTML = "";
    var isMedia = !!cfg.cropContainer;

    if (cfg.canMove) {
      var label = isMedia ? "Recadrer" : "D\u00e9placer";
      var icon = isMedia ? ICON_CROP : ICON_MOVE;
      addTbBtn(icon, label, function (e) {
        e.preventDefault(); deselect();
        if (isMedia) { var ct = document.getElementById(cfg.cropContainer); if (ct) startCrop(ct, cfg.cropSection, cfg.cropPosField, e.clientX, e.clientY); }
        else if (cfg.isCard) startCardMove(el, cfg.cardIdx, e.clientX, e.clientY);
        else startMove(el, cfg.section, cfg.posField, e.clientX, e.clientY);
      }, true);
    }

    if (cfg.uploadKey) {
      addTbBtn(ICON_UPLOAD, "Remplacer", function () {
        postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: cfg.uploadKey });
      });
    }

    if (cfg.hasPoster) {
      addTbBtn(ICON_IMAGE, "Miniature", function () {
        postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: "videoPlay-poster" });
      });
    }

    if (cfg.canResize) {
      addTbBtn(null, "A+", function () { changeSize(el, cfg, 0.1); }, false, "cms-tb-txt");
      addTbBtn(null, "A\u2212", function () { changeSize(el, cfg, -0.1); }, false, "cms-tb-txt");
    }

    if (cfg.isCard) {
      var d = pageData(currentSlug);
      var numItems = d && d.services && d.services.items ? d.services.items.length : 0;
      if (cfg.cardIdx > 0)
        addTbBtn(null, "\u2190", function () { swapCards(cfg.cardIdx, cfg.cardIdx - 1); }, false, "cms-tb-txt");
      if (cfg.cardIdx < numItems - 1)
        addTbBtn(null, "\u2192", function () { swapCards(cfg.cardIdx, cfg.cardIdx + 1); }, false, "cms-tb-txt");
    }
  }

  function addTbBtn(icon, label, handler, isGrip, cls) {
    var btn = document.createElement("button");
    btn.className = "cms-tb-btn" + (cls ? " " + cls : "");
    if (icon) { btn.innerHTML = icon; btn.title = label; }
    else { btn.textContent = label; btn.title = label; }
    if (isGrip) {
      btn.classList.add("cms-tb-grip");
      btn.addEventListener("mousedown", function (e) { e.stopPropagation(); handler(e); });
      btn.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return; e.stopPropagation();
        handler({ preventDefault: function(){}, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
      }, { passive: true });
    } else {
      btn.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); handler(e); });
    }
    toolbar.appendChild(btn);
  }

  function positionToolbar() {
    if (!selectedEl || !toolbar) return;
    var r = selectedEl.getBoundingClientRect();
    var tbW = toolbar.offsetWidth || 140;
    var tbH = toolbar.offsetHeight || 38;
    var x = r.left + r.width / 2 - tbW / 2;
    var y = r.top - tbH - 10;
    if (y < 56) y = r.bottom + 10;
    x = clamp(x, 4, window.innerWidth - tbW - 4);
    y = clamp(y, 4, window.innerHeight - tbH - 4);
    toolbar.style.top = y + "px";
    toolbar.style.left = x + "px";
  }

  /* ── Resize Handles ── */
  function showHandles(el) {
    hideHandles();
    ["nw", "ne", "sw", "se"].forEach(function (pos) {
      var h = document.createElement("div");
      h.className = "cms-handle cms-handle-" + pos;
      h.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); startResize(el, e.clientX, e.clientY); });
      h.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return; e.stopPropagation();
        startResize(el, e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      document.body.appendChild(h);
      resizeHandles.push(h);
    });
    positionHandles();
  }

  function positionHandles() {
    if (!selectedEl || !resizeHandles.length) return;
    var r = selectedEl.getBoundingClientRect();
    var positions = [
      { x: r.left, y: r.top },
      { x: r.right, y: r.top },
      { x: r.left, y: r.bottom },
      { x: r.right, y: r.bottom }
    ];
    resizeHandles.forEach(function (h, i) {
      h.style.left = (positions[i].x - 5) + "px";
      h.style.top = (positions[i].y - 5) + "px";
    });
  }

  function hideHandles() {
    resizeHandles.forEach(function (h) { h.remove(); });
    resizeHandles = [];
  }

  /* ── Resize drag ── */
  var resizeState = null;

  function startResize(el, cx, cy) {
    var cfg = cmsControls.get(el);
    if (!cfg) return;
    var base = parseFloat(el.dataset.cmsBaseSize);
    if (!base) { el.style.fontSize = ""; base = parseFloat(window.getComputedStyle(el).fontSize); el.dataset.cmsBaseSize = base; }
    resizeState = { el: el, cfg: cfg, sy: cy, startSize: parseFloat(el.dataset.cmsSize) || 1, base: base };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
  }

  /* ── card swap ── */
  function swapCards(fromIdx, toIdx) {
    var d = pageData(currentSlug);
    if (!d || !d.services || !d.services.items) return;
    var items = d.services.items.map(function (it) { return Object.assign({}, it); });
    var temp = items[fromIdx];
    items[fromIdx] = items[toIdx];
    items[toIdx] = temp;
    d.services.items = items;
    deselect();
    renderServices(d.services);
    wireServiceCards();
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { services: { items: items } } });
  }

  /* ── size control ── */
  function changeSize(el, config, delta) {
    var base = parseFloat(el.dataset.cmsBaseSize);
    if (!base) { el.style.fontSize = ""; base = parseFloat(window.getComputedStyle(el).fontSize); el.dataset.cmsBaseSize = base; }
    var current = parseFloat(el.dataset.cmsSize) || 1;
    var next = Math.round(clamp(current + delta, 0.5, 2.5) * 10) / 10;
    el.dataset.cmsSize = next;
    el.style.fontSize = (base * next) + "px";
    if (config.isCard) {
      var d = pageData(currentSlug);
      if (d && d.services && d.services.items) { var items = d.services.items.map(function (it) { return Object.assign({}, it); }); items[config.cardIdx].size = next; postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { services: { items: items } } }); }
    } else {
      var p = {}; p[config.section] = {}; p[config.section][config.sizeField] = next;
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
    }
    positionToolbar();
    positionHandles();
  }

  function applySize(el, size) {
    if (!el) return;
    el.style.fontSize = "";
    var base = parseFloat(window.getComputedStyle(el).fontSize);
    el.dataset.cmsBaseSize = base;
    el.dataset.cmsSize = size || 1;
    if (!size || size === 1) return;
    el.style.fontSize = (base * size) + "px";
  }

  /* ── section reorder ── */
  function addSectionBars() {
    var main = document.querySelector("main"); if (!main) return;
    var visible = [];
    main.querySelectorAll("[data-section]").forEach(function (sec) { if (sec.style.display !== "none") visible.push(sec); });
    visible.forEach(function (sec, idx) {
      if (sec.querySelector(".cms-sec-bar")) return;
      var bar = document.createElement("div"); bar.className = "cms-sec-bar";
      if (idx > 0) {
        var up = document.createElement("button"); up.className = "cms-sec-btn"; up.textContent = "\u25B2"; up.title = "Monter";
        up.addEventListener("click", function (e) { e.stopPropagation(); moveSectionUp(sec); });
        bar.appendChild(up);
      }
      if (idx < visible.length - 1) {
        var down = document.createElement("button"); down.className = "cms-sec-btn"; down.textContent = "\u25BC"; down.title = "Descendre";
        down.addEventListener("click", function (e) { e.stopPropagation(); moveSectionDown(sec); });
        bar.appendChild(down);
      }
      sec.insertBefore(bar, sec.firstChild);
    });
  }

  function moveSectionUp(sec) {
    var prev = sec.previousElementSibling;
    if (prev && prev.hasAttribute("data-section")) { sec.parentNode.insertBefore(sec, prev); refreshSectionBars(); saveSectionOrder(); }
  }
  function moveSectionDown(sec) {
    var next = sec.nextElementSibling;
    if (next && next.hasAttribute("data-section")) { sec.parentNode.insertBefore(next, sec); refreshSectionBars(); saveSectionOrder(); }
  }
  function refreshSectionBars() { document.querySelectorAll(".cms-sec-bar").forEach(function (b) { b.remove(); }); addSectionBars(); }
  function saveSectionOrder() {
    var order = [];
    document.querySelector("main").querySelectorAll("[data-section]").forEach(function (sec) { if (sec.style.display !== "none") order.push(sec.getAttribute("data-section")); });
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { sectionOrder: order } });
  }
  function applySectionOrder(order) {
    if (!order || !order.length) return;
    var main = document.querySelector("main"); if (!main) return;
    for (var i = order.length - 1; i >= 0; i--) {
      var sec = document.querySelector('[data-section="' + order[i] + '"]');
      if (sec) main.insertBefore(sec, main.querySelector("[data-section]"));
    }
  }

  /* ── clear & render ── */
  function clearAll() {
    deselect();
    ["hero-title", "hero-subtitle", "hero-media", "video-loop-title", "video-loop-media", "video-play-title", "about-title", "about-text", "about-media", "services-title", "services-list", "contact-title", "contact-text", "contact-email", "contact-cta"].forEach(function (id) {
      var el = document.getElementById(id); if (!el) return; if (id === "services-list") { el.innerHTML = ""; return; } el.textContent = "";
    });
    var vpm = document.getElementById("video-play-media");
    if (vpm) { var glow = vpm.querySelector(".video-play__glow"); vpm.innerHTML = ""; if (glow) vpm.appendChild(glow); }
    ALL.forEach(function (s) { var sec = document.querySelector('[data-section="' + s + '"]'); if (sec) sec.style.display = "none"; });
    cmsControls.clear();
    document.querySelectorAll("[data-cms-ctrl]").forEach(function (el) { el.removeAttribute("data-cms-ctrl"); el.removeAttribute("contenteditable"); });
    document.querySelectorAll(".cms-sec-bar").forEach(function (b) { b.remove(); });
  }

  function renderPage(d) {
    clearAll(); if (!d) return;
    if (d.hero) renderHero(d.hero);
    if (d.videoLoop) renderVideoLoop(d.videoLoop);
    if (d.videoPlay) renderVideoPlay(d.videoPlay);
    if (d.about) renderAbout(d.about);
    if (d.services) renderServices(d.services);
    if (d.contact) renderContact(d.contact);
    if (d.sectionOrder) applySectionOrder(d.sectionOrder);
    wireEditors();
    if (isCms) addSectionBars();
    requestAnimationFrame(observeAnims);
  }

  function show(s) { var el = document.querySelector('[data-section="' + s + '"]'); if (el) el.style.display = ""; }
  function setTxt(id, val) { var el = document.getElementById(id); if (el) el.textContent = val || ""; }
  function esc(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

  function applyPos(el, pos) {
    if (!el || !pos) return;
    if (typeof el === "string") el = document.querySelector(el);
    if (!el) return;
    var t = "translate(" + (pos.x || 0) + "px, " + (pos.y || 0) + "px)";
    el.style.setProperty("--cms-translate", t);
    el.dataset.cmsPosX = pos.x || 0; el.dataset.cmsPosY = pos.y || 0;
    if (isCms || !el.hasAttribute("data-anim")) el.style.transform = t;
  }

  function makeCropReady(el) {
    el.style.width = "130%"; el.style.height = "130%"; el.style.maxWidth = "none";
    el.style.position = "absolute"; el.style.top = "-15%"; el.style.left = "-15%";
    el.style.right = "auto"; el.style.bottom = "auto"; el.style.objectFit = "cover";
  }

  function applyCrop(media, pos) {
    if (!media) return;
    var x = pos ? (pos.x != null ? pos.x : 50) : 50;
    var y = pos ? (pos.y != null ? pos.y : 50) : 50;
    if (x !== 50 || y !== 50) {
      makeCropReady(media); media.style.animation = "none";
      media.style.transform = "translate(" + ((50 - x) * 0.3) + "%, " + ((50 - y) * 0.3) + "%)";
    }
  }

  /* ── hero ── */
  function renderHero(d) {
    show("hero");
    setTxt("hero-title", d.title); setTxt("hero-subtitle", d.subtitle);
    var badge = document.querySelector(".hero__badge"); if (badge) badge.textContent = d.badge || "Production Audiovisuelle";
    var c = document.getElementById("hero-media");
    if (c) { c.innerHTML = ""; if (d.image) { var img = document.createElement("img"); img.className = "hero__image"; img.src = resolveUrl(d.image); img.alt = ""; img.loading = "eager"; applyCrop(img, d.imagePosition); c.appendChild(img); } }
    applyPos("#hero-title", d.titlePosition); applyPos("#hero-subtitle", d.subtitlePosition); applyPos(".hero__badge", d.badgePosition); applyPos(".hero__content", d.contentPosition);
    applySize(document.getElementById("hero-title"), d.titleSize);
    applySize(document.getElementById("hero-subtitle"), d.subtitleSize);
    applySize(document.querySelector(".hero__badge"), d.badgeSize);
    registerControl(document.getElementById("hero-media-zone"), { canMove: true, uploadKey: "hero", cropContainer: "hero-media", cropSection: "hero", cropPosField: "imagePosition" });
    registerControl(document.getElementById("hero-title"), { canMove: true, canResize: true, section: "hero", posField: "titlePosition", sizeField: "titleSize" });
    registerControl(document.getElementById("hero-subtitle"), { canMove: true, canResize: true, section: "hero", posField: "subtitlePosition", sizeField: "subtitleSize" });
    registerControl(document.querySelector(".hero__badge"), { canMove: true, canResize: true, section: "hero", posField: "badgePosition", sizeField: "badgeSize" });
  }

  function renderVideoLoop(d) {
    show("videoLoop"); setTxt("video-loop-title", d.title);
    var c = document.getElementById("video-loop-media");
    if (c) { c.innerHTML = ""; if (d.video) { var v = document.createElement("video"); v.src = resolveUrl(d.video); v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", ""); applyCrop(v, d.videoPosition); c.appendChild(v); v.play().catch(function () {}); } }
    applyPos("#video-loop-title", d.titlePosition);
    applySize(document.getElementById("video-loop-title"), d.titleSize);
    registerControl(document.getElementById("videoLoop"), { canMove: true, uploadKey: "videoLoop-video", cropContainer: "video-loop-media", cropSection: "videoLoop", cropPosField: "videoPosition" });
    registerControl(document.getElementById("video-loop-title"), { canMove: true, canResize: true, section: "videoLoop", posField: "titlePosition", sizeField: "titleSize" });
  }

  function renderVideoPlay(d) {
    show("videoPlay"); setTxt("video-play-title", d.title);
    var lbl = document.querySelector(".video-play__label"); if (lbl) lbl.textContent = d.label || "Showreel";
    var c = document.getElementById("video-play-media");
    if (c) { var glow = c.querySelector(".video-play__glow"); c.innerHTML = ""; if (glow) c.appendChild(glow); if (d.video) { var v = document.createElement("video"); v.src = resolveUrl(d.video); v.controls = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", ""); if (d.poster) v.poster = resolveUrl(d.poster); applyCrop(v, d.videoPosition); c.appendChild(v); } }
    applyPos("#video-play-title", d.titlePosition); applyPos(".video-play__label", d.labelPosition);
    applySize(document.getElementById("video-play-title"), d.titleSize);
    applySize(document.querySelector(".video-play__label"), d.labelSize);
    registerControl(document.getElementById("video-play-media"), { canMove: true, uploadKey: "videoPlay-video", hasPoster: true, cropContainer: "video-play-media", cropSection: "videoPlay", cropPosField: "videoPosition" });
    registerControl(document.getElementById("video-play-title"), { canMove: true, canResize: true, section: "videoPlay", posField: "titlePosition", sizeField: "titleSize" });
    registerControl(document.querySelector(".video-play__label"), { canMove: true, canResize: true, section: "videoPlay", posField: "labelPosition", sizeField: "labelSize" });
  }

  function renderAbout(d) {
    show("about"); setTxt("about-title", d.title); setTxt("about-text", d.text);
    var ey = document.querySelector(".about__eyebrow"); if (ey) ey.textContent = d.eyebrow || "\u00C0 propos";
    var c = document.getElementById("about-media");
    if (c) { c.innerHTML = ""; if (d.image) { var img = document.createElement("img"); img.className = "about__image"; img.src = resolveUrl(d.image); img.alt = ""; applyCrop(img, d.imagePosition); c.appendChild(img); } }
    applyPos("#about-title", d.titlePosition); applyPos("#about-text", d.textPosition); applyPos(".about__eyebrow", d.eyebrowPosition);
    applySize(document.getElementById("about-title"), d.titleSize);
    applySize(document.getElementById("about-text"), d.textSize);
    applySize(document.querySelector(".about__eyebrow"), d.eyebrowSize);
    registerControl(document.getElementById("about-media-zone"), { canMove: true, uploadKey: "about", cropContainer: "about-media", cropSection: "about", cropPosField: "imagePosition" });
    registerControl(document.getElementById("about-title"), { canMove: true, canResize: true, section: "about", posField: "titlePosition", sizeField: "titleSize" });
    registerControl(document.getElementById("about-text"), { canMove: true, canResize: true, section: "about", posField: "textPosition", sizeField: "textSize" });
    registerControl(document.querySelector(".about__eyebrow"), { canMove: true, canResize: true, section: "about", posField: "eyebrowPosition", sizeField: "eyebrowSize" });
  }

  function renderServices(d) {
    show("services"); setTxt("services-title", d.title);
    var ey = document.querySelector(".services__eyebrow"); if (ey) ey.textContent = d.eyebrow || "Expertise";
    var list = document.getElementById("services-list"); if (!list || !d.items) return;
    list.innerHTML = "";
    d.items.forEach(function (item, idx) {
      var card = document.createElement("div"); card.className = "service-card"; card.dataset.idx = idx;
      card.innerHTML = '<h3 class="service-card__title">' + esc(item.title) + '</h3><p class="service-card__description">' + esc(item.description) + '</p>';
      if (item.position) applyPos(card, item.position);
      list.appendChild(card);
      applySize(card, item.size);
      registerControl(card, { canMove: true, canResize: true, isCard: true, cardIdx: idx });
    });
    applyPos("#services-title", d.titlePosition); applyPos(".services__eyebrow", d.eyebrowPosition);
    applySize(document.getElementById("services-title"), d.titleSize);
    applySize(document.querySelector(".services__eyebrow"), d.eyebrowSize);
    registerControl(document.getElementById("services-title"), { canMove: true, canResize: true, section: "services", posField: "titlePosition", sizeField: "titleSize" });
    registerControl(document.querySelector(".services__eyebrow"), { canMove: true, canResize: true, section: "services", posField: "eyebrowPosition", sizeField: "eyebrowSize" });
  }

  function renderContact(d) {
    show("contact"); setTxt("contact-title", d.title); setTxt("contact-text", d.text);
    var emailEl = document.getElementById("contact-email"); if (emailEl) emailEl.textContent = d.email || "";
    var cta = document.getElementById("contact-cta"); if (cta) { cta.textContent = d.cta || d.buttonLabel || ""; cta.href = d.email ? "mailto:" + d.email : "#"; }
    applyPos("#contact-title", d.titlePosition); applyPos("#contact-text", d.textPosition); applyPos("#contact-cta", d.ctaPosition);
    applySize(document.getElementById("contact-title"), d.titleSize);
    applySize(document.getElementById("contact-text"), d.textSize);
    applySize(document.getElementById("contact-cta"), d.ctaSize);
    registerControl(document.getElementById("contact-title"), { canMove: true, canResize: true, section: "contact", posField: "titlePosition", sizeField: "titleSize" });
    registerControl(document.getElementById("contact-text"), { canMove: true, canResize: true, section: "contact", posField: "textPosition", sizeField: "textSize" });
    registerControl(document.getElementById("contact-email"), { canMove: true, canResize: true, section: "contact", posField: "emailPosition", sizeField: "emailSize" });
    registerControl(document.getElementById("contact-cta"), { canMove: true, canResize: true, section: "contact", posField: "ctaPosition", sizeField: "ctaSize" });
  }

  /* ============================================================
     TEXT EDITING — wired on render, contentEditable toggled on dblclick
     ============================================================ */
  function wireText(id, section, field) {
    var el = document.getElementById(id); if (!el || el.dataset.cmsWired) return;
    el.dataset.cmsWired = "true"; el.spellcheck = false; el.style.outline = "none";
    var timer;
    function emit() { var p = {}; p[section] = {}; p[section][field] = el.textContent; postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p }); }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
    el.addEventListener("blur", function () { clearTimeout(timer); emit(); el.contentEditable = "false"; el.classList.remove("cms-editing"); });
  }
  function wireEl(sel, section, field) {
    var el = document.querySelector(sel); if (!el || el.dataset.cmsWired) return;
    el.dataset.cmsWired = "true"; el.spellcheck = false; el.style.outline = "none";
    var timer;
    function emit() { var p = {}; p[section] = {}; p[section][field] = el.textContent; postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p }); }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
    el.addEventListener("blur", function () { clearTimeout(timer); emit(); el.contentEditable = "false"; el.classList.remove("cms-editing"); });
  }
  function wireServiceCards() {
    var list = document.getElementById("services-list"); if (!list) return;
    list.querySelectorAll(".service-card").forEach(function (card, idx) {
      [{ sel: ".service-card__title", f: "title" }, { sel: ".service-card__description", f: "description" }].forEach(function (cfg) {
        var el = card.querySelector(cfg.sel); if (!el || el.dataset.cmsWired) return;
        el.dataset.cmsWired = "true"; el.spellcheck = false; el.style.outline = "none";
        var timer, field = cfg.f;
        function emit() { var d = pageData(currentSlug); if (!d || !d.services || !d.services.items || !d.services.items[idx]) return; var items = d.services.items.map(function (it) { return Object.assign({}, it); }); items[idx][field] = el.textContent; postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { services: { items: items } } }); }
        el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
        el.addEventListener("blur", function () { clearTimeout(timer); emit(); el.contentEditable = "false"; el.classList.remove("cms-editing"); });
      });
    });
  }
  function wireCta() {
    var cta = document.getElementById("contact-cta"); if (!cta || cta.dataset.cmsWired) return;
    cta.dataset.cmsWired = "true"; cta.spellcheck = false; cta.style.outline = "none";
    cta.addEventListener("click", function (e) { e.preventDefault(); });
    var timer;
    function emit() { postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { contact: { cta: cta.textContent } } }); }
    cta.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
    cta.addEventListener("blur", function () { clearTimeout(timer); emit(); cta.contentEditable = "false"; cta.classList.remove("cms-editing"); });
  }
  function wireEditors() {
    if (!isCms) return;
    wireText("hero-title", "hero", "title"); wireText("hero-subtitle", "hero", "subtitle");
    wireText("video-loop-title", "videoLoop", "title"); wireText("video-play-title", "videoPlay", "title");
    wireText("about-title", "about", "title"); wireText("about-text", "about", "text");
    wireText("services-title", "services", "title");
    wireText("contact-title", "contact", "title"); wireText("contact-text", "contact", "text"); wireText("contact-email", "contact", "email");
    wireCta();
    wireEl(".hero__badge", "hero", "badge"); wireEl(".video-play__label", "videoPlay", "label");
    wireEl(".about__eyebrow", "about", "eyebrow"); wireEl(".services__eyebrow", "services", "eyebrow");
    wireServiceCards();
  }

  /* ============================================================
     UNIFIED DRAG SYSTEM — single set of listeners
     dragState.type: "crop" | "move" | "card" | "resize"
     ============================================================ */
  var dragState = null;

  function startCrop(container, section, posField, cx, cy) {
    var media = container.querySelector("img, video"); if (!media) return;
    var wasCropReady = media.style.width === "130%";
    makeCropReady(media); media.style.animation = "none";
    if (!wasCropReady) media.style.transform = "translate(0%, 0%)";
    var match = (media.style.transform || "").match(/translate\(\s*([-\d.]+)%\s*,\s*([-\d.]+)%/);
    var curTx = match ? parseFloat(match[1]) : 0, curTy = match ? parseFloat(match[2]) : 0;
    var px = clamp(50 - curTx / 0.3, 0, 100), py = clamp(50 - curTy / 0.3, 0, 100);
    dragState = { type: "crop", container: container, media: media, section: section, posField: posField, sx: cx, sy: cy, px: px, py: py, lastX: px, lastY: py };
    container.classList.add("cms-cropping");
    document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing";
    showSnapGrid(container.closest("[data-section]") || container);
  }

  function startMove(el, section, posField, cx, cy) {
    var parent = el.closest("[data-section]") || el.parentElement;
    dragState = { type: "move", el: el, section: section, posField: posField, sx: cx, sy: cy, ox: parseFloat(el.dataset.cmsPosX) || 0, oy: parseFloat(el.dataset.cmsPosY) || 0, elRect: el.getBoundingClientRect(), parentRect: parent ? parent.getBoundingClientRect() : null };
    el.classList.add("cms-moving"); document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing";
    showSnapGrid(parent || el.parentElement);
  }

  function startCardMove(card, idx, cx, cy) {
    var parent = card.closest("[data-section]") || card.parentElement;
    dragState = { type: "card", card: card, idx: idx, sx: cx, sy: cy, ox: parseFloat(card.dataset.cmsPosX) || 0, oy: parseFloat(card.dataset.cmsPosY) || 0, elRect: card.getBoundingClientRect(), parentRect: parent ? parent.getBoundingClientRect() : null };
    card.classList.add("cms-moving"); document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing";
    showSnapGrid(parent || card.parentElement);
  }

  document.addEventListener("mousemove", function (e) { if (dragState) onDragMove(e.clientX, e.clientY); if (resizeState) onResizeMove(e.clientY); });
  document.addEventListener("touchmove", function (e) {
    if (!dragState && !resizeState) return;
    if (e.touches.length !== 1) return; e.preventDefault();
    if (dragState) onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    if (resizeState) onResizeMove(e.touches[0].clientY);
  }, { passive: false });
  document.addEventListener("mouseup", onDragEnd);
  document.addEventListener("touchend", onDragEnd);

  function onDragMove(cx, cy) {
    if (!dragState) return;
    if (dragState.type === "crop") {
      var dx = cx - dragState.sx, dy = cy - dragState.sy;
      var nx = clamp(dragState.px - dx * 0.15, 0, 100), ny = clamp(dragState.py - dy * 0.15, 0, 100);
      var s = snapVal(nx, ny);
      dragState.lastX = s.x; dragState.lastY = s.y;
      dragState.media.style.transform = "translate(" + ((50 - s.x) * 0.3) + "%, " + ((50 - s.y) * 0.3) + "%)";
      updateSnapUI(s.x, s.y);
    } else if (dragState.type === "move") {
      var rawX = dragState.ox + (cx - dragState.sx), rawY = dragState.oy + (cy - dragState.sy);
      var snap = computeTranslateSnap(rawX, rawY, dragState.elRect, dragState.parentRect, dragState.ox, dragState.oy);
      updateSnapUI(snap.sx, snap.sy);
      var t = "translate(" + snap.x + "px, " + snap.y + "px)";
      dragState.el.style.transform = t; dragState.el.style.setProperty("--cms-translate", t);
      dragState.el.dataset.cmsPosX = snap.x; dragState.el.dataset.cmsPosY = snap.y;
    } else if (dragState.type === "card") {
      var rawX2 = dragState.ox + (cx - dragState.sx), rawY2 = dragState.oy + (cy - dragState.sy);
      var snap2 = computeTranslateSnap(rawX2, rawY2, dragState.elRect, dragState.parentRect, dragState.ox, dragState.oy);
      updateSnapUI(snap2.sx, snap2.sy);
      var t2 = "translate(" + snap2.x + "px, " + snap2.y + "px)";
      dragState.card.style.transform = t2; dragState.card.style.setProperty("--cms-translate", t2);
      dragState.card.dataset.cmsPosX = snap2.x; dragState.card.dataset.cmsPosY = snap2.y;
    }
  }

  function onResizeMove(cy) {
    if (!resizeState) return;
    var dy = resizeState.sy - cy;
    var next = Math.round(clamp(resizeState.startSize + dy * 0.005, 0.5, 2.5) * 10) / 10;
    resizeState.el.dataset.cmsSize = next;
    resizeState.el.style.fontSize = (resizeState.base * next) + "px";
    positionToolbar(); positionHandles();
  }

  function onDragEnd() {
    if (resizeState) {
      var sz = parseFloat(resizeState.el.dataset.cmsSize) || 1;
      var cfg = resizeState.cfg;
      if (cfg.isCard) {
        var d = pageData(currentSlug);
        if (d && d.services && d.services.items) { var items = d.services.items.map(function (it) { return Object.assign({}, it); }); items[cfg.cardIdx].size = sz; postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { services: { items: items } } }); }
      } else if (cfg.section && cfg.sizeField) {
        var p = {}; p[cfg.section] = {}; p[cfg.section][cfg.sizeField] = sz;
        postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
      }
      document.body.style.userSelect = ""; document.body.style.cursor = "";
      resizeState = null;
      return;
    }

    if (!dragState) return;
    document.body.style.userSelect = ""; document.body.style.cursor = "";
    hideSnapGrid();

    if (dragState.type === "crop") {
      dragState.container.classList.remove("cms-cropping");
      var pc = {}; pc[dragState.section] = {}; pc[dragState.section][dragState.posField] = { x: Math.round(dragState.lastX), y: Math.round(dragState.lastY) };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: pc });
    } else if (dragState.type === "move") {
      dragState.el.classList.remove("cms-moving");
      var fx = Math.round(parseFloat(dragState.el.dataset.cmsPosX) || 0), fy = Math.round(parseFloat(dragState.el.dataset.cmsPosY) || 0);
      var pm = {}; pm[dragState.section] = {}; pm[dragState.section][dragState.posField] = { x: fx, y: fy };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: pm });
    } else if (dragState.type === "card") {
      dragState.card.classList.remove("cms-moving");
      var fcx = Math.round(parseFloat(dragState.card.dataset.cmsPosX) || 0), fcy = Math.round(parseFloat(dragState.card.dataset.cmsPosY) || 0);
      var dc = pageData(currentSlug);
      if (dc && dc.services && dc.services.items && dc.services.items[dragState.idx]) {
        var items2 = dc.services.items.map(function (it) { return Object.assign({}, it); });
        items2[dragState.idx].position = { x: fcx, y: fcy };
        postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { services: { items: items2 } } });
      }
    }
    dragState = null;
  }

  /* ── snap helpers ── */
  function computeTranslateSnap(nx, ny, elRect, parentRect, ox, oy) {
    if (!parentRect || !elRect) return { x: nx, y: ny, sx: -1, sy: -1 };
    var baseCX = elRect.left + elRect.width / 2 - ox - parentRect.left;
    var baseCY = elRect.top + elRect.height / 2 - oy - parentRect.top;
    var ecx = (baseCX + nx) / parentRect.width * 100, ecy = (baseCY + ny) / parentRect.height * 100;
    var s = snapVal(ecx, ecy);
    var rx = nx, ry = ny;
    if (Math.abs(s.x - ecx) > 0.01) rx = s.x / 100 * parentRect.width - baseCX;
    if (Math.abs(s.y - ecy) > 0.01) ry = s.y / 100 * parentRect.height - baseCY;
    return { x: rx, y: ry, sx: s.x, sy: s.y };
  }

  var snapOverlay = null, SNAP_PTS = [0, 25, 50, 75, 100], SNAP_T = 4;
  function snapVal(x, y) { var sx = x, sy = y; SNAP_PTS.forEach(function (p) { if (Math.abs(x - p) < SNAP_T) sx = p; if (Math.abs(y - p) < SNAP_T) sy = p; }); return { x: sx, y: sy }; }
  function createSnapOverlay() {
    if (snapOverlay) return; snapOverlay = document.createElement("div"); snapOverlay.className = "cms-snap-overlay";
    var html = ""; [0, 25, 50, 75, 100].forEach(function (p) { html += '<div class="cms-snap-v" style="left:' + p + '%" data-p="' + p + '"></div><div class="cms-snap-h" style="top:' + p + '%" data-p="' + p + '"></div>'; });
    html += '<div class="cms-snap-crosshair"></div><div class="cms-snap-label"></div>';
    snapOverlay.innerHTML = html; document.body.appendChild(snapOverlay);
  }
  function showSnapGrid(sec) { if (!isCms) return; createSnapOverlay(); var r = sec.getBoundingClientRect(); var s = snapOverlay.style; s.display = "block"; s.top = (r.top + window.scrollY) + "px"; s.left = r.left + "px"; s.width = r.width + "px"; s.height = r.height + "px"; }
  function hideSnapGrid() { if (snapOverlay) snapOverlay.style.display = "none"; }
  function updateSnapUI(x, y) {
    if (!snapOverlay || x < 0) return;
    snapOverlay.querySelectorAll(".cms-snap-v,.cms-snap-h").forEach(function (l) { var p = parseFloat(l.dataset.p); l.classList.toggle("cms-snap-hit", Math.abs((l.classList.contains("cms-snap-v") ? x : y) - p) < 3); });
    var ch = snapOverlay.querySelector(".cms-snap-crosshair"); if (ch) { ch.style.left = x + "%"; ch.style.top = y + "%"; }
    var lbl = snapOverlay.querySelector(".cms-snap-label"); if (lbl) lbl.textContent = Math.round(x) + "% , " + Math.round(y) + "%";
  }

  /* ── animations ── */
  var obs = null;
  function observeAnims() {
    if (obs) obs.disconnect();
    obs = new IntersectionObserver(function (entries) { entries.forEach(function (entry) { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); obs.unobserve(entry.target); } }); }, { threshold: 0.12 });
    document.querySelectorAll("[data-anim]").forEach(function (el) { if (!el.classList.contains("is-visible")) obs.observe(el); });
  }

  /* ============================================================
     CMS STYLES — injected only in CMS mode
     ============================================================ */
  if (isCms) {
    initCmsUI();
    var css = document.createElement("style");
    css.textContent = [
      '[data-anim] { opacity: 1 !important; transition: none !important; }',
      '.hero__image { animation: none !important; }',

      '[data-cms-ctrl] { cursor: pointer; }',
      '[data-cms-ctrl]:hover { outline: 1.5px dashed rgba(196,165,90,.3); outline-offset: 2px; }',

      '.cms-selected { outline: 2px solid var(--gold) !important; outline-offset: 3px; }',
      '.cms-editing { outline: 2px solid rgba(196,165,90,.6) !important; outline-offset: 3px; cursor: text !important; }',

      '#cms-toolbar {',
      '  position: fixed; z-index: 10000;',
      '  display: flex; gap: 2px; padding: 4px 6px;',
      '  background: rgba(15,15,18,.92);',
      '  border: 1px solid rgba(255,255,255,.1);',
      '  border-radius: 10px;',
      '  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);',
      '  box-shadow: 0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04);',
      '  pointer-events: auto;',
      '  opacity: 0; transform: translateY(6px); transition: opacity .15s, transform .15s;',
      '}',
      '#cms-toolbar.cms-tb-visible { opacity: 1; transform: translateY(0); }',

      '.cms-tb-btn {',
      '  display: flex; align-items: center; justify-content: center;',
      '  height: 30px; min-width: 30px; padding: 0 6px;',
      '  font-size: 12px; font-weight: 500; line-height: 1;',
      '  color: rgba(255,255,255,.8); background: transparent;',
      '  border: none; border-radius: 6px; cursor: pointer;',
      '  transition: background .12s, color .12s;',
      '  white-space: nowrap;',
      '}',
      '.cms-tb-btn:hover { background: rgba(255,255,255,.1); color: #fff; }',
      '.cms-tb-btn svg { flex-shrink: 0; }',
      '.cms-tb-grip { color: var(--gold, #c4a55a); }',
      '.cms-tb-grip:hover { background: rgba(196,165,90,.2); }',
      '.cms-tb-grip:active { cursor: grabbing; }',
      '.cms-tb-txt { font-family: var(--sans, system-ui); font-size: 13px; font-weight: 600; color: rgba(255,255,255,.6); min-width: 26px; padding: 0; }',
      '.cms-tb-txt:hover { color: #fff; background: rgba(255,255,255,.08); }',

      '.cms-tb-btn + .cms-tb-btn { border-left: 1px solid rgba(255,255,255,.08); }',

      '.cms-handle {',
      '  position: fixed; z-index: 9999;',
      '  width: 10px; height: 10px;',
      '  background: var(--gold, #c4a55a);',
      '  border: 2px solid rgba(15,15,18,.9);',
      '  border-radius: 3px;',
      '  cursor: nwse-resize;',
      '  pointer-events: auto;',
      '  box-shadow: 0 2px 8px rgba(0,0,0,.4);',
      '}',
      '.cms-handle-ne, .cms-handle-sw { cursor: nesw-resize; }',

      '.cms-moving { opacity: .85; z-index: 50 !important; }',
      '.cms-cropping { cursor: grabbing !important; }',
      '.cms-cropping img, .cms-cropping video { pointer-events: none !important; }',

      '.cms-snap-overlay { position: absolute; z-index: 9998; pointer-events: none; display: none; border: 1px solid rgba(196,165,90,.12); }',
      '.cms-snap-v, .cms-snap-h { position: absolute; opacity: .15; transition: opacity .1s; }',
      '.cms-snap-v { top: 0; bottom: 0; width: 1px; background: rgba(196,165,90,.6); }',
      '.cms-snap-h { left: 0; right: 0; height: 1px; background: rgba(196,165,90,.6); }',
      '.cms-snap-hit { opacity: 1 !important; background: var(--gold, #c4a55a) !important; box-shadow: 0 0 8px rgba(196,165,90,.5); }',
      '.cms-snap-crosshair { position: absolute; width: 10px; height: 10px; border: 2px solid var(--gold, #c4a55a); border-radius: 50%; transform: translate(-50%,-50%); }',
      '.cms-snap-label { position: absolute; bottom: 8px; right: 8px; padding: 2px 8px; font-size: 10px; font-family: monospace; color: var(--gold, #c4a55a); background: rgba(0,0,0,.8); border-radius: 4px; }',

      '.cms-sec-bar { position: absolute; top: 10px; right: 10px; z-index: 95; display: flex; gap: 3px; }',
      '.cms-sec-btn {',
      '  display: flex; align-items: center; justify-content: center;',
      '  width: 26px; height: 26px; padding: 0;',
      '  font-size: 10px; color: rgba(255,255,255,.5);',
      '  background: rgba(15,15,18,.85);',
      '  border: 1px solid rgba(255,255,255,.1);',
      '  border-radius: 6px; cursor: pointer;',
      '  backdrop-filter: blur(8px);',
      '  transition: background .12s, color .12s;',
      '}',
      '.cms-sec-btn:hover { background: rgba(255,255,255,.12); color: #fff; }',

      '.service-card { position: relative; }',
      '.service-card:hover { transform: none !important; }',
      '.contact__cta { cursor: pointer; position: relative; display: inline-block; }',
      '.contact__cta:hover { transform: none !important; }',
      '[data-anim].is-visible { transform: var(--cms-translate, none) !important; }',

      '@media (max-width: 680px) {',
      '  .cms-tb-btn { height: 26px; min-width: 26px; }',
      '  #cms-toolbar { padding: 3px 4px; }',
      '}',
    ].join('\n');
    document.head.appendChild(css);
  }
})();
