/* ============================================================
   OBSCURA — CMS-Compatible Client-Side App
   Floating toolbar, 2D media crop via oversized translate,
   section reorder, card swap, per-element sizing.
   PostMessage: CMS_READY, CMS_CONTENT, CMS_PATCH, CMS_PAGE,
   CMS_UPLOAD_REQUEST, CMS_SAVE
   ============================================================ */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var isCms = params.get("cmsEmbed") === "1";
  var ORIGIN = window.location.origin;
  var cmsParentOrigin = params.get("parentOrigin") || null;

  var HAND = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v6"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>';
  var UPLOAD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  var POSTER = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';

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
    document.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); postToParent({ type: "CMS_SAVE", source: "cms-site" }); } });
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
     FLOATING TOOLBAR — no background box, just floating buttons
     ============================================================ */
  var cmsControls = new Map();
  var toolbar = null;
  var tbTarget = null;
  var tbHideTimer = null;

  function registerControl(el, config) { if (!isCms || !el) return; el.setAttribute("data-cms-ctrl", ""); cmsControls.set(el, config); }

  function initToolbar() {
    if (toolbar) return;
    toolbar = document.createElement("div");
    toolbar.id = "cms-toolbar";
    document.body.appendChild(toolbar);
    toolbar.addEventListener("mouseenter", function () { clearTimeout(tbHideTimer); });
    toolbar.addEventListener("mouseleave", function () { scheduleTbHide(); });

    document.addEventListener("mouseover", function (e) {
      if (toolbar.contains(e.target)) { clearTimeout(tbHideTimer); return; }
      var target = e.target.closest("[data-cms-ctrl]");
      if (target) { clearTimeout(tbHideTimer); if (target !== tbTarget) { var cfg = cmsControls.get(target); if (cfg) showToolbar(target, cfg); } }
      else { scheduleTbHide(); }
    });
    document.addEventListener("touchstart", function (e) {
      if (toolbar.contains(e.target)) return;
      var target = e.target.closest("[data-cms-ctrl]");
      if (target) { var cfg = cmsControls.get(target); if (cfg) showToolbar(target, cfg); } else { hideToolbar(); }
    }, { passive: true });
    window.addEventListener("scroll", function () { if (tbTarget && toolbar.style.display !== "none") positionToolbar(tbTarget); }, { passive: true });
  }

  function showToolbar(el, config) {
    tbTarget = el;
    toolbar.innerHTML = "";
    var isMedia = !!config.cropContainer;

    if (config.canMove) {
      var grip = document.createElement("button"); grip.className = "cms-tb-btn cms-tb-grip"; grip.innerHTML = HAND; grip.title = "D\u00e9placer";
      grip.addEventListener("mousedown", function (e) {
        e.preventDefault(); e.stopPropagation(); hideToolbar();
        if (isMedia) { var ct = document.getElementById(config.cropContainer); if (ct) startCrop(ct, config.cropSection, config.cropPosField, e.clientX, e.clientY); }
        else if (config.isCard) startCardMove(el, config.cardIdx, e.clientX, e.clientY);
        else startMove(el, config.section, config.posField, e.clientX, e.clientY);
      });
      grip.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return; e.stopPropagation(); hideToolbar();
        var tx = e.touches[0].clientX, ty = e.touches[0].clientY;
        if (isMedia) { var ct = document.getElementById(config.cropContainer); if (ct) startCrop(ct, config.cropSection, config.cropPosField, tx, ty); }
        else if (config.isCard) startCardMove(el, config.cardIdx, tx, ty);
        else startMove(el, config.section, config.posField, tx, ty);
      }, { passive: true });
      toolbar.appendChild(grip);
    }

    if (config.uploadKey) {
      var btnR = document.createElement("button"); btnR.className = "cms-tb-btn"; btnR.innerHTML = UPLOAD; btnR.title = "Remplacer";
      btnR.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: config.uploadKey }); });
      toolbar.appendChild(btnR);
    }

    if (config.hasPoster) {
      var btnP = document.createElement("button"); btnP.className = "cms-tb-btn"; btnP.innerHTML = POSTER; btnP.title = "Miniature";
      btnP.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: "videoPlay-poster" }); });
      toolbar.appendChild(btnP);
    }

    if (config.canResize) {
      var btnPlus = document.createElement("button"); btnPlus.className = "cms-tb-btn cms-tb-size"; btnPlus.textContent = "+"; btnPlus.title = "Agrandir";
      btnPlus.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); changeSize(el, config, 0.1); });
      toolbar.appendChild(btnPlus);
      var btnMinus = document.createElement("button"); btnMinus.className = "cms-tb-btn cms-tb-size"; btnMinus.textContent = "\u2212"; btnMinus.title = "R\u00e9duire";
      btnMinus.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); changeSize(el, config, -0.1); });
      toolbar.appendChild(btnMinus);
    }

    if (config.isCard) {
      var d = pageData(currentSlug);
      var numItems = d && d.services && d.services.items ? d.services.items.length : 0;
      if (config.cardIdx > 0) {
        var btnL = document.createElement("button"); btnL.className = "cms-tb-btn cms-tb-swap"; btnL.textContent = "\u2190"; btnL.title = "D\u00e9placer \u00e0 gauche";
        btnL.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); swapCards(config.cardIdx, config.cardIdx - 1); });
        toolbar.appendChild(btnL);
      }
      if (config.cardIdx < numItems - 1) {
        var btnRi = document.createElement("button"); btnRi.className = "cms-tb-btn cms-tb-swap"; btnRi.textContent = "\u2192"; btnRi.title = "D\u00e9placer \u00e0 droite";
        btnRi.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); swapCards(config.cardIdx, config.cardIdx + 1); });
        toolbar.appendChild(btnRi);
      }
    }

    positionToolbar(el);
    toolbar.style.display = "flex";
  }

  function positionToolbar(el) {
    if (!toolbar || !el) return;
    var rect = el.getBoundingClientRect();
    toolbar.style.display = "flex";
    var tbW = toolbar.offsetWidth || 120;
    var tbH = toolbar.offsetHeight || 34;
    var x = rect.left + rect.width / 2 - tbW / 2;
    var y = rect.top + 8;
    x = clamp(x, 4, window.innerWidth - tbW - 4);
    y = clamp(y, 56, window.innerHeight - tbH - 4);
    toolbar.style.top = y + "px";
    toolbar.style.left = x + "px";
    toolbar.style.transform = "none";
  }

  function scheduleTbHide() { clearTimeout(tbHideTimer); tbHideTimer = setTimeout(hideToolbar, 200); }
  function hideToolbar() { clearTimeout(tbHideTimer); if (toolbar) toolbar.style.display = "none"; tbTarget = null; }

  /* ── card swap ── */
  function swapCards(fromIdx, toIdx) {
    var d = pageData(currentSlug);
    if (!d || !d.services || !d.services.items) return;
    var items = d.services.items.map(function (it) { return Object.assign({}, it); });
    var temp = items[fromIdx];
    items[fromIdx] = items[toIdx];
    items[toIdx] = temp;
    hideToolbar();
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { services: { items: items } } });
  }

  /* ── size control ── */
  function changeSize(el, config, delta) {
    var base = parseFloat(el.dataset.cmsBaseSize);
    if (!base) {
      el.style.fontSize = "";
      base = parseFloat(window.getComputedStyle(el).fontSize);
      el.dataset.cmsBaseSize = base;
    }
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
    var main = document.querySelector("main");
    if (!main) return;
    var secs = main.querySelectorAll("[data-section]");
    var visible = [];
    secs.forEach(function (sec) {
      if (sec.style.display !== "none") visible.push(sec);
    });
    visible.forEach(function (sec, idx) {
      if (sec.querySelector(".cms-sec-bar")) return;
      var bar = document.createElement("div");
      bar.className = "cms-sec-bar";
      if (idx > 0) {
        var up = document.createElement("button"); up.className = "cms-sec-btn"; up.textContent = "\u25B2"; up.title = "Monter la section";
        up.addEventListener("click", function (e) { e.stopPropagation(); moveSectionUp(sec); });
        bar.appendChild(up);
      }
      if (idx < visible.length - 1) {
        var down = document.createElement("button"); down.className = "cms-sec-btn"; down.textContent = "\u25BC"; down.title = "Descendre la section";
        down.addEventListener("click", function (e) { e.stopPropagation(); moveSectionDown(sec); });
        bar.appendChild(down);
      }
      sec.insertBefore(bar, sec.firstChild);
    });
  }

  function moveSectionUp(sec) {
    var prev = sec.previousElementSibling;
    if (prev && prev.hasAttribute("data-section")) {
      sec.parentNode.insertBefore(sec, prev);
      refreshSectionBars();
      saveSectionOrder();
    }
  }

  function moveSectionDown(sec) {
    var next = sec.nextElementSibling;
    if (next && next.hasAttribute("data-section")) {
      sec.parentNode.insertBefore(next, sec);
      refreshSectionBars();
      saveSectionOrder();
    }
  }

  function refreshSectionBars() {
    document.querySelectorAll(".cms-sec-bar").forEach(function (b) { b.remove(); });
    addSectionBars();
  }

  function saveSectionOrder() {
    var main = document.querySelector("main");
    if (!main) return;
    var order = [];
    main.querySelectorAll("[data-section]").forEach(function (sec) {
      if (sec.style.display !== "none") order.push(sec.getAttribute("data-section"));
    });
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { sectionOrder: order } });
  }

  function applySectionOrder(order) {
    if (!order || !order.length) return;
    var main = document.querySelector("main");
    if (!main) return;
    for (var i = order.length - 1; i >= 0; i--) {
      var sec = document.querySelector('[data-section="' + order[i] + '"]');
      if (sec) main.insertBefore(sec, main.querySelector("[data-section]"));
    }
  }

  /* ── clear ── */
  function clearAll() {
    ["hero-title", "hero-subtitle", "hero-media", "video-loop-title", "video-loop-media", "video-play-title", "about-title", "about-text", "about-media", "services-title", "services-list", "contact-title", "contact-text", "contact-email", "contact-cta"].forEach(function (id) {
      var el = document.getElementById(id); if (!el) return; if (id === "services-list") { el.innerHTML = ""; return; } el.textContent = "";
    });
    var vpm = document.getElementById("video-play-media");
    if (vpm) { var glow = vpm.querySelector(".video-play__glow"); vpm.innerHTML = ""; if (glow) vpm.appendChild(glow); }
    ALL.forEach(function (s) { var sec = document.querySelector('[data-section="' + s + '"]'); if (sec) sec.style.display = "none"; });
    cmsControls.clear();
    document.querySelectorAll("[data-cms-ctrl]").forEach(function (el) { el.removeAttribute("data-cms-ctrl"); });
    document.querySelectorAll(".cms-sec-bar").forEach(function (b) { b.remove(); });
    hideToolbar();
  }

  /* ── render ── */
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
    el.dataset.cmsPosX = pos.x || 0;
    el.dataset.cmsPosY = pos.y || 0;
    if (isCms || !el.hasAttribute("data-anim")) {
      el.style.transform = t;
    }
  }

  /* ── 2D media crop via oversized elements + translate ──
     Media is rendered at 130% w/h, offset -15%.
     translate() repositions within the overflow-hidden container.
     Stored as 0–100 (50=center). Translate: (50-val)*0.3 % */
  function makeCropReady(el) {
    el.style.width = "130%";
    el.style.height = "130%";
    el.style.maxWidth = "none";
    el.style.position = "absolute";
    el.style.top = "-15%";
    el.style.left = "-15%";
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.objectFit = "cover";
  }

  function applyCrop(media, pos) {
    if (!media) return;
    var x = pos ? (pos.x != null ? pos.x : 50) : 50;
    var y = pos ? (pos.y != null ? pos.y : 50) : 50;
    if (isCms || x !== 50 || y !== 50) {
      makeCropReady(media);
      media.style.animation = "none";
      var tx = (50 - x) * 0.3;
      var ty = (50 - y) * 0.3;
      media.style.transform = "translate(" + tx + "%, " + ty + "%)";
    }
  }

  /* ── hero ── */
  function renderHero(d) {
    show("hero");
    setTxt("hero-title", d.title); setTxt("hero-subtitle", d.subtitle);
    var badge = document.querySelector(".hero__badge"); if (badge) badge.textContent = d.badge || "Production Audiovisuelle";
    var c = document.getElementById("hero-media");
    if (c) {
      c.innerHTML = "";
      if (d.image) {
        var img = document.createElement("img"); img.className = "hero__image"; img.src = resolveUrl(d.image); img.alt = ""; img.loading = "eager";
        applyCrop(img, d.imagePosition);
        c.appendChild(img);
      }
    }
    applyPos("#hero-title", d.titlePosition); applyPos("#hero-subtitle", d.subtitlePosition); applyPos(".hero__badge", d.badgePosition); applyPos(".hero__content", d.contentPosition);
    applySize(document.getElementById("hero-title"), d.titleSize);
    applySize(document.getElementById("hero-subtitle"), d.subtitleSize);
    applySize(document.querySelector(".hero__badge"), d.badgeSize);
    registerControl(document.getElementById("hero-media-zone"), { canMove: true, uploadKey: "hero", cropContainer: "hero-media", cropSection: "hero", cropPosField: "imagePosition" });
    registerControl(document.getElementById("hero-title"), { canMove: true, canResize: true, section: "hero", posField: "titlePosition", sizeField: "titleSize" });
    registerControl(document.getElementById("hero-subtitle"), { canMove: true, canResize: true, section: "hero", posField: "subtitlePosition", sizeField: "subtitleSize" });
    registerControl(document.querySelector(".hero__badge"), { canMove: true, canResize: true, section: "hero", posField: "badgePosition", sizeField: "badgeSize" });
  }

  /* ── video loop ── */
  function renderVideoLoop(d) {
    show("videoLoop"); setTxt("video-loop-title", d.title);
    var c = document.getElementById("video-loop-media");
    if (c) {
      c.innerHTML = "";
      if (d.video) {
        var v = document.createElement("video"); v.src = resolveUrl(d.video); v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", "");
        applyCrop(v, d.videoPosition);
        c.appendChild(v); v.play().catch(function () {});
      }
    }
    applyPos("#video-loop-title", d.titlePosition);
    applySize(document.getElementById("video-loop-title"), d.titleSize);
    registerControl(document.getElementById("videoLoop"), { canMove: true, uploadKey: "videoLoop-video", cropContainer: "video-loop-media", cropSection: "videoLoop", cropPosField: "videoPosition" });
    registerControl(document.getElementById("video-loop-title"), { canMove: true, canResize: true, section: "videoLoop", posField: "titlePosition", sizeField: "titleSize" });
  }

  /* ── video play ── */
  function renderVideoPlay(d) {
    show("videoPlay"); setTxt("video-play-title", d.title);
    var lbl = document.querySelector(".video-play__label"); if (lbl) lbl.textContent = d.label || "Showreel";
    var c = document.getElementById("video-play-media");
    if (c) {
      var glow = c.querySelector(".video-play__glow"); c.innerHTML = ""; if (glow) c.appendChild(glow);
      if (d.video) {
        var v = document.createElement("video"); v.src = resolveUrl(d.video); v.controls = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", "");
        if (d.poster) v.poster = resolveUrl(d.poster);
        applyCrop(v, d.videoPosition);
        c.appendChild(v);
      }
    }
    applyPos("#video-play-title", d.titlePosition); applyPos(".video-play__label", d.labelPosition);
    applySize(document.getElementById("video-play-title"), d.titleSize);
    applySize(document.querySelector(".video-play__label"), d.labelSize);
    registerControl(document.getElementById("video-play-media"), { canMove: true, uploadKey: "videoPlay-video", hasPoster: true, cropContainer: "video-play-media", cropSection: "videoPlay", cropPosField: "videoPosition" });
    registerControl(document.getElementById("video-play-title"), { canMove: true, canResize: true, section: "videoPlay", posField: "titlePosition", sizeField: "titleSize" });
    registerControl(document.querySelector(".video-play__label"), { canMove: true, canResize: true, section: "videoPlay", posField: "labelPosition", sizeField: "labelSize" });
  }

  /* ── about ── */
  function renderAbout(d) {
    show("about"); setTxt("about-title", d.title); setTxt("about-text", d.text);
    var ey = document.querySelector(".about__eyebrow"); if (ey) ey.textContent = d.eyebrow || "\u00C0 propos";
    var c = document.getElementById("about-media");
    if (c) {
      c.innerHTML = "";
      if (d.image) {
        var img = document.createElement("img"); img.className = "about__image"; img.src = resolveUrl(d.image); img.alt = "";
        applyCrop(img, d.imagePosition);
        c.appendChild(img);
      }
    }
    applyPos("#about-title", d.titlePosition); applyPos("#about-text", d.textPosition); applyPos(".about__eyebrow", d.eyebrowPosition);
    applySize(document.getElementById("about-title"), d.titleSize);
    applySize(document.getElementById("about-text"), d.textSize);
    applySize(document.querySelector(".about__eyebrow"), d.eyebrowSize);
    registerControl(document.getElementById("about-media-zone"), { canMove: true, uploadKey: "about", cropContainer: "about-media", cropSection: "about", cropPosField: "imagePosition" });
    registerControl(document.getElementById("about-title"), { canMove: true, canResize: true, section: "about", posField: "titlePosition", sizeField: "titleSize" });
    registerControl(document.getElementById("about-text"), { canMove: true, canResize: true, section: "about", posField: "textPosition", sizeField: "textSize" });
    registerControl(document.querySelector(".about__eyebrow"), { canMove: true, canResize: true, section: "about", posField: "eyebrowPosition", sizeField: "eyebrowSize" });
  }

  /* ── services ── */
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

  /* ── contact ── */
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
     TEXT EDITING
     ============================================================ */
  function wireText(id, section, field) {
    var el = document.getElementById(id); if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true"; el.dataset.cmsWired = "true"; el.spellcheck = false; el.style.outline = "none"; el.classList.add("cms-editable");
    var timer;
    function emit() { var p = {}; p[section] = {}; p[section][field] = el.textContent; postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p }); }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
    el.addEventListener("blur", function () { clearTimeout(timer); emit(); });
  }
  function wireEl(sel, section, field) {
    var el = document.querySelector(sel); if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true"; el.dataset.cmsWired = "true"; el.spellcheck = false; el.style.outline = "none"; el.classList.add("cms-editable");
    var timer;
    function emit() { var p = {}; p[section] = {}; p[section][field] = el.textContent; postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p }); }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
    el.addEventListener("blur", function () { clearTimeout(timer); emit(); });
  }
  function wireServiceCards() {
    var list = document.getElementById("services-list"); if (!list) return;
    list.querySelectorAll(".service-card").forEach(function (card, idx) {
      [{ sel: ".service-card__title", f: "title" }, { sel: ".service-card__description", f: "description" }].forEach(function (cfg) {
        var el = card.querySelector(cfg.sel); if (!el || el.dataset.cmsWired) return;
        el.contentEditable = "true"; el.dataset.cmsWired = "true"; el.spellcheck = false; el.style.outline = "none"; el.classList.add("cms-editable");
        var timer, field = cfg.f;
        function emit() { var d = pageData(currentSlug); if (!d || !d.services || !d.services.items || !d.services.items[idx]) return; var items = d.services.items.map(function (it) { return Object.assign({}, it); }); items[idx][field] = el.textContent; postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { services: { items: items } } }); }
        el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
        el.addEventListener("blur", function () { clearTimeout(timer); emit(); });
      });
    });
  }
  function wireCta() {
    var cta = document.getElementById("contact-cta"); if (!cta || cta.dataset.cmsWired) return;
    cta.contentEditable = "true"; cta.dataset.cmsWired = "true"; cta.spellcheck = false; cta.style.outline = "none"; cta.classList.add("cms-editable");
    cta.addEventListener("click", function (e) { e.preventDefault(); });
    var timer;
    function emit() { postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { contact: { cta: cta.textContent } } }); }
    cta.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
    cta.addEventListener("blur", function () { clearTimeout(timer); emit(); });
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
     CROP SYSTEM — 2D via oversized (130%) + translate
     Stored as 0–100 (50 = center).
     translate% = (50 - stored) * 0.3
     ============================================================ */
  var cropState = null;

  function startCrop(container, section, posField, cx, cy) {
    var media = container.querySelector("img, video"); if (!media) return;
    makeCropReady(media);
    media.style.animation = "none";
    var match = (media.style.transform || "").match(/translate\(\s*([-\d.]+)%\s*,\s*([-\d.]+)%/);
    var curTx = match ? parseFloat(match[1]) : 0;
    var curTy = match ? parseFloat(match[2]) : 0;
    var px = clamp(50 - curTx / 0.3, 0, 100);
    var py = clamp(50 - curTy / 0.3, 0, 100);
    cropState = { container: container, media: media, section: section, posField: posField, sx: cx, sy: cy, px: px, py: py, lastX: px, lastY: py };
    container.classList.add("cms-cropping");
    document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing";
    showSnapGrid(container.closest("[data-section]") || container);
  }

  document.addEventListener("mousemove", function (e) { if (cropState) handleCropMove(e.clientX, e.clientY); });
  document.addEventListener("touchmove", function (e) { if (cropState && e.touches.length >= 1) { e.preventDefault(); handleCropMove(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });

  function handleCropMove(cx, cy) {
    var dx = cx - cropState.sx, dy = cy - cropState.sy;
    var nx = clamp(cropState.px - dx * 0.15, 0, 100);
    var ny = clamp(cropState.py - dy * 0.15, 0, 100);
    var s = snapVal(nx, ny);
    cropState.lastX = s.x; cropState.lastY = s.y;
    var tx = (50 - s.x) * 0.3;
    var ty = (50 - s.y) * 0.3;
    cropState.media.style.transform = "translate(" + tx + "%, " + ty + "%)";
    updateSnapUI(s.x, s.y);
  }

  document.addEventListener("mouseup", endCrop); document.addEventListener("touchend", endCrop);
  function endCrop() {
    if (!cropState) return;
    cropState.container.classList.remove("cms-cropping"); document.body.style.userSelect = ""; document.body.style.cursor = "";
    hideSnapGrid();
    var p = {}; p[cropState.section] = {}; p[cropState.section][cropState.posField] = { x: Math.round(cropState.lastX), y: Math.round(cropState.lastY) };
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
    cropState = null;
  }

  /* ============================================================
     MOVE SYSTEM — translate with snap
     ============================================================ */
  var moveState = null;

  function computeTranslateSnap(nx, ny, elRect, parentRect, ox, oy) {
    if (!parentRect || !elRect) return { x: nx, y: ny, sx: -1, sy: -1 };
    var baseCX = elRect.left + elRect.width / 2 - ox - parentRect.left;
    var baseCY = elRect.top + elRect.height / 2 - oy - parentRect.top;
    var ecx = (baseCX + nx) / parentRect.width * 100;
    var ecy = (baseCY + ny) / parentRect.height * 100;
    var s = snapVal(ecx, ecy);
    var rx = nx, ry = ny;
    if (Math.abs(s.x - ecx) > 0.01) rx = s.x / 100 * parentRect.width - baseCX;
    if (Math.abs(s.y - ecy) > 0.01) ry = s.y / 100 * parentRect.height - baseCY;
    return { x: rx, y: ry, sx: s.x, sy: s.y };
  }

  function startMove(el, section, posField, cx, cy) {
    var parent = el.closest("[data-section]") || el.parentElement;
    moveState = { el: el, section: section, posField: posField, sx: cx, sy: cy, ox: parseFloat(el.dataset.cmsPosX) || 0, oy: parseFloat(el.dataset.cmsPosY) || 0, elRect: el.getBoundingClientRect(), parentRect: parent ? parent.getBoundingClientRect() : null };
    el.classList.add("cms-moving"); document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing";
    showSnapGrid(parent || el.parentElement);
  }
  document.addEventListener("mousemove", function (e) { if (moveState) handleMove(e.clientX, e.clientY); });
  document.addEventListener("touchmove", function (e) { if (moveState && e.touches.length === 1) { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });

  function handleMove(cx, cy) {
    var rawX = moveState.ox + (cx - moveState.sx), rawY = moveState.oy + (cy - moveState.sy);
    var snap = computeTranslateSnap(rawX, rawY, moveState.elRect, moveState.parentRect, moveState.ox, moveState.oy);
    updateSnapUI(snap.sx, snap.sy);
    var t = "translate(" + snap.x + "px, " + snap.y + "px)";
    moveState.el.style.transform = t; moveState.el.style.setProperty("--cms-translate", t);
    moveState.el.dataset.cmsPosX = snap.x; moveState.el.dataset.cmsPosY = snap.y;
  }
  document.addEventListener("mouseup", endMove); document.addEventListener("touchend", endMove);
  function endMove() {
    if (!moveState) return;
    moveState.el.classList.remove("cms-moving"); document.body.style.userSelect = ""; document.body.style.cursor = "";
    hideSnapGrid();
    var fx = Math.round(parseFloat(moveState.el.dataset.cmsPosX) || 0), fy = Math.round(parseFloat(moveState.el.dataset.cmsPosY) || 0);
    var p = {}; p[moveState.section] = {}; p[moveState.section][moveState.posField] = { x: fx, y: fy };
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
    moveState = null;
  }

  /* ── card move ── */
  var cardMoveState = null;
  function startCardMove(card, idx, cx, cy) {
    var parent = card.closest("[data-section]") || card.parentElement;
    cardMoveState = { card: card, idx: idx, sx: cx, sy: cy, ox: parseFloat(card.dataset.cmsPosX) || 0, oy: parseFloat(card.dataset.cmsPosY) || 0, elRect: card.getBoundingClientRect(), parentRect: parent ? parent.getBoundingClientRect() : null };
    card.classList.add("cms-moving"); document.body.style.userSelect = "none"; document.body.style.cursor = "grabbing";
    showSnapGrid(parent || card.parentElement);
  }
  function handleCardMove(cx, cy) {
    var rawX = cardMoveState.ox + (cx - cardMoveState.sx), rawY = cardMoveState.oy + (cy - cardMoveState.sy);
    var snap = computeTranslateSnap(rawX, rawY, cardMoveState.elRect, cardMoveState.parentRect, cardMoveState.ox, cardMoveState.oy);
    updateSnapUI(snap.sx, snap.sy);
    var t = "translate(" + snap.x + "px, " + snap.y + "px)";
    cardMoveState.card.style.transform = t; cardMoveState.card.style.setProperty("--cms-translate", t);
    cardMoveState.card.dataset.cmsPosX = snap.x; cardMoveState.card.dataset.cmsPosY = snap.y;
  }
  document.addEventListener("mousemove", function (e) { if (cardMoveState) handleCardMove(e.clientX, e.clientY); });
  document.addEventListener("touchmove", function (e) { if (cardMoveState && e.touches.length === 1) { e.preventDefault(); handleCardMove(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  document.addEventListener("mouseup", endCardMove); document.addEventListener("touchend", endCardMove);
  function endCardMove() {
    if (!cardMoveState) return;
    cardMoveState.card.classList.remove("cms-moving"); document.body.style.userSelect = ""; document.body.style.cursor = "";
    hideSnapGrid();
    var fx = Math.round(parseFloat(cardMoveState.card.dataset.cmsPosX) || 0), fy = Math.round(parseFloat(cardMoveState.card.dataset.cmsPosY) || 0);
    var d = pageData(currentSlug);
    if (d && d.services && d.services.items && d.services.items[cardMoveState.idx]) {
      var items = d.services.items.map(function (it) { return Object.assign({}, it); });
      items[cardMoveState.idx].position = { x: fx, y: fy };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { services: { items: items } } });
    }
    cardMoveState = null;
  }

  /* ============================================================
     SNAP GRID
     ============================================================ */
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

  /* ── CMS styles ── */
  if (isCms) {
    initToolbar();
    var css = document.createElement("style");
    css.textContent = [
      '.cms-editable { transition: box-shadow .15s; border-radius: 4px; padding: 2px 4px; cursor: text; }',
      '.cms-editable:hover { box-shadow: inset 0 0 0 1.5px rgba(196,165,90,.4); }',
      '.cms-editable:focus { box-shadow: inset 0 0 0 2px rgba(196,165,90,.7); }',

      '[data-anim] { opacity: 1 !important; transition: none !important; }',

      '.hero__image { animation: none !important; }',

      '#cms-toolbar {',
      '  position: fixed; display: none; z-index: 10000;',
      '  gap: 3px; padding: 0;',
      '  background: none; border: none; box-shadow: none;',
      '  pointer-events: auto;',
      '}',
      '.cms-tb-btn {',
      '  display: flex; align-items: center; justify-content: center;',
      '  width: 30px; height: 30px; padding: 0;',
      '  font-size: 14px; font-weight: 600; line-height: 1;',
      '  color: #fff; background: rgba(10,10,13,.85);',
      '  border: 1px solid rgba(196,165,90,.35);',
      '  border-radius: 8px; cursor: pointer;',
      '  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);',
      '  transition: background .15s, border-color .15s, transform .1s;',
      '  pointer-events: auto;',
      '}',
      '.cms-tb-btn:hover { background: rgba(196,165,90,.25); border-color: var(--gold); transform: scale(1.1); }',
      '.cms-tb-btn svg { flex-shrink: 0; }',
      '.cms-tb-grip { cursor: grab; color: var(--gold); border-color: rgba(196,165,90,.5); }',
      '.cms-tb-grip:hover { background: rgba(196,165,90,.35); }',
      '.cms-tb-grip:active { cursor: grabbing; }',
      '.cms-tb-size { font-family: var(--sans); font-size: 16px; color: var(--gold); }',
      '.cms-tb-swap { font-family: var(--sans); font-size: 13px; color: var(--gold); }',

      '.cms-moving { opacity: .85; z-index: 50 !important; }',
      '.cms-cropping { cursor: grabbing !important; }',
      '.cms-cropping img, .cms-cropping video { pointer-events: none !important; }',

      '.cms-snap-overlay { position: absolute; z-index: 9998; pointer-events: none; display: none; border: 1px solid rgba(196,165,90,.12); }',
      '.cms-snap-v, .cms-snap-h { position: absolute; opacity: .2; transition: opacity .1s; }',
      '.cms-snap-v { top: 0; bottom: 0; width: 1px; background: rgba(196,165,90,.6); }',
      '.cms-snap-h { left: 0; right: 0; height: 1px; background: rgba(196,165,90,.6); }',
      '.cms-snap-hit { opacity: 1 !important; background: var(--gold) !important; box-shadow: 0 0 8px rgba(196,165,90,.5); }',
      '.cms-snap-crosshair { position: absolute; width: 12px; height: 12px; border: 2px solid var(--gold); border-radius: 50%; transform: translate(-50%,-50%); box-shadow: 0 0 0 3px rgba(0,0,0,.4); }',
      '.cms-snap-label { position: absolute; bottom: 8px; right: 8px; padding: 3px 10px; font-size: 11px; font-family: monospace; color: var(--gold); background: rgba(0,0,0,.85); border-radius: 6px; border: 1px solid rgba(196,165,90,.25); }',

      '.cms-sec-bar {',
      '  position: absolute; top: 8px; left: 50%; transform: translateX(-50%);',
      '  z-index: 90; display: flex; gap: 4px;',
      '  opacity: 0; transition: opacity .2s;',
      '}',
      '[data-section]:hover > .cms-sec-bar { opacity: 1; }',
      '.cms-sec-btn {',
      '  display: flex; align-items: center; justify-content: center;',
      '  width: 28px; height: 28px; padding: 0;',
      '  font-size: 11px; color: var(--gold);',
      '  background: rgba(10,10,13,.85);',
      '  border: 1px solid rgba(196,165,90,.35);',
      '  border-radius: 6px; cursor: pointer;',
      '  backdrop-filter: blur(8px);',
      '  transition: background .15s;',
      '}',
      '.cms-sec-btn:hover { background: rgba(196,165,90,.3); }',

      '.service-card { position: relative; }',
      '.contact__cta { cursor: text; position: relative; display: inline-block; }',
      '[data-anim].is-visible { transform: var(--cms-translate, none) !important; }',

      '@media (max-width: 680px) {',
      '  .cms-tb-btn { width: 26px; height: 26px; }',
      '  #cms-toolbar { gap: 2px; }',
      '}',
    ].join('\n');
    document.head.appendChild(css);
  }
})();
