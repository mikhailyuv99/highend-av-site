/* ============================================================
   OBSCURA — CMS-Compatible Client-Side App
   Floating toolbar for all CMS controls (no DOM pollution).
   PostMessage: CMS_READY, CMS_CONTENT, CMS_PATCH, CMS_PAGE,
   CMS_UPLOAD_REQUEST, CMS_SAVE
   ============================================================ */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var isCms = params.get("cmsEmbed") === "1";
  var ORIGIN = window.location.origin;
  var cmsParentOrigin = params.get("parentOrigin") || null;

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

  /* ── nav ──────────────────────────────────────── */
  var navEl = document.getElementById("site-nav");
  function activateNav() {
    if (!content || !content.pages) return;
    if (navEl) navEl.hidden = false;
    document.querySelectorAll(".site-nav__link").forEach(function (a) {
      a.classList.toggle("active", a.dataset.page === currentSlug);
    });
  }
  if (navEl) navEl.addEventListener("click", function (e) {
    var link = e.target.closest(".site-nav__link"); if (!link) return; e.preventDefault();
    var slug = link.dataset.page;
    if (slug && slug !== currentSlug) {
      currentSlug = slug;
      renderPage(pageData(slug));
      activateNav();
      window.scrollTo({ top: 0, behavior: "smooth" });
      postToParent({ type: "CMS_PAGE", source: "cms-site", slug: slug });
    }
  });
  window.addEventListener("hashchange", function () {
    var slug = window.location.hash.replace("#", "") || "index";
    if (content && content.pages && content.pages[slug] && slug !== currentSlug) {
      currentSlug = slug;
      renderPage(pageData(slug));
      activateNav();
      postToParent({ type: "CMS_PAGE", source: "cms-site", slug: slug });
    }
  });

  /* ── CMS embed ────────────────────────────────── */
  if (isCms) {
    window.addEventListener("message", function (e) {
      if (!e.data || e.data.source !== "cms-app") return;
      if (!cmsParentOrigin) cmsParentOrigin = e.origin;
      if (!originOk(e.origin)) return;
      if (e.data.type === "CMS_CONTENT" && e.data.content) {
        content = e.data.content;
        if (e.data.pageSlug) currentSlug = e.data.pageSlug;
        renderPage(pageData(currentSlug));
        activateNav();
      }
    });
    postToParent({ type: "CMS_READY", source: "cms-site" });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); postToParent({ type: "CMS_SAVE", source: "cms-site" }); }
    });
  }

  /* ── standalone ───────────────────────────────── */
  if (!isCms) {
    fetch("content.json?v=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        content = data;
        var hash = window.location.hash.replace("#", "");
        if (hash && content.pages && content.pages[hash]) currentSlug = hash;
        renderPage(pageData(currentSlug));
        activateNav();
      })
      .catch(function (err) { console.error("[OBSCURA] content.json load error", err); });
  }

  function pageData(slug) {
    return !content ? {} : content.pages ? (content.pages[slug] || {}) : content;
  }

  /* ============================================================
     FLOATING CMS TOOLBAR
     Single toolbar on <body>, positioned near hovered element.
     No handles/buttons inside DOM elements — zero DOM pollution.
     ============================================================ */
  var cmsControls = new Map();
  var toolbar = null;
  var tbTarget = null;
  var tbHideTimer = null;

  function registerControl(el, config) {
    if (!isCms || !el) return;
    el.setAttribute("data-cms-ctrl", "");
    cmsControls.set(el, config);
  }

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
      if (target) {
        clearTimeout(tbHideTimer);
        if (target !== tbTarget) {
          var cfg = cmsControls.get(target);
          if (cfg) showToolbar(target, cfg);
        }
      } else {
        scheduleTbHide();
      }
    });

    document.addEventListener("touchstart", function (e) {
      if (toolbar.contains(e.target)) return;
      var target = e.target.closest("[data-cms-ctrl]");
      if (target) {
        var cfg = cmsControls.get(target);
        if (cfg) showToolbar(target, cfg);
      } else {
        hideToolbar();
      }
    }, { passive: true });

    window.addEventListener("scroll", function () {
      if (tbTarget && toolbar.style.display !== "none") positionToolbar(tbTarget);
    }, { passive: true });
  }

  function showToolbar(el, config) {
    tbTarget = el;
    toolbar.innerHTML = "";

    if (config.canMove) {
      var grip = document.createElement("button");
      grip.className = "cms-tb-btn cms-tb-grip";
      grip.textContent = "\u2630 D\u00e9placer";
      grip.addEventListener("mousedown", function (e) {
        e.preventDefault(); e.stopPropagation(); hideToolbar();
        if (config.isCard) startCardMove(el, config.cardIdx, e.clientX, e.clientY);
        else startMove(el, config.section, config.posField, e.clientX, e.clientY);
      });
      grip.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return; e.stopPropagation(); hideToolbar();
        if (config.isCard) startCardMove(el, config.cardIdx, e.touches[0].clientX, e.touches[0].clientY);
        else startMove(el, config.section, config.posField, e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      toolbar.appendChild(grip);
    }

    if (config.uploadKey) {
      var btnR = document.createElement("button");
      btnR.className = "cms-tb-btn";
      btnR.textContent = "\uD83D\uDCF7 Remplacer";
      btnR.addEventListener("click", function (e) {
        e.stopPropagation(); e.preventDefault();
        postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: config.uploadKey });
      });
      toolbar.appendChild(btnR);
    }

    if (config.cropContainer) {
      var btnC = document.createElement("button");
      btnC.className = "cms-tb-btn";
      btnC.textContent = "\u2702 Recadrer";
      btnC.addEventListener("mousedown", function (e) {
        e.stopPropagation(); e.preventDefault(); hideToolbar();
        var container = document.getElementById(config.cropContainer);
        if (container) startCrop(container, config.cropSection, config.cropPosField, e.clientX, e.clientY);
      });
      toolbar.appendChild(btnC);
    }

    if (config.hasPoster) {
      var btnP = document.createElement("button");
      btnP.className = "cms-tb-btn";
      btnP.textContent = "\uD83D\uDDBC Miniature";
      btnP.addEventListener("click", function (e) {
        e.stopPropagation(); e.preventDefault();
        postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: "videoPlay-poster" });
      });
      toolbar.appendChild(btnP);
    }

    positionToolbar(el);
    toolbar.style.display = "flex";
  }

  function positionToolbar(el) {
    if (!toolbar || !el) return;
    var rect = el.getBoundingClientRect();
    toolbar.style.display = "flex";
    var tbH = toolbar.offsetHeight || 40;
    var top = rect.top - tbH - 10;
    if (top < 4) top = rect.bottom + 10;
    toolbar.style.top = top + "px";
    toolbar.style.left = (rect.left + rect.width / 2) + "px";
    toolbar.style.transform = "translateX(-50%)";
  }

  function scheduleTbHide() {
    clearTimeout(tbHideTimer);
    tbHideTimer = setTimeout(hideToolbar, 300);
  }

  function hideToolbar() {
    clearTimeout(tbHideTimer);
    if (toolbar) toolbar.style.display = "none";
    tbTarget = null;
  }

  /* ── clear ─────────────────────────────────────── */
  function clearAll() {
    ["hero-title", "hero-subtitle", "hero-media", "video-loop-title",
     "video-loop-media", "video-play-title", "about-title", "about-text",
     "about-media", "services-title", "services-list", "contact-title",
     "contact-text", "contact-email", "contact-cta"
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id === "services-list") { el.innerHTML = ""; return; }
      el.textContent = "";
    });
    var vpm = document.getElementById("video-play-media");
    if (vpm) {
      var glow = vpm.querySelector(".video-play__glow");
      vpm.innerHTML = "";
      if (glow) vpm.appendChild(glow);
    }
    ALL.forEach(function (s) {
      var sec = document.querySelector('[data-section="' + s + '"]');
      if (sec) sec.style.display = "none";
    });
    cmsControls.clear();
    document.querySelectorAll("[data-cms-ctrl]").forEach(function (el) {
      el.removeAttribute("data-cms-ctrl");
    });
    hideToolbar();
  }

  /* ── render ────────────────────────────────────── */
  function renderPage(d) {
    clearAll();
    if (!d) return;
    if (d.hero) renderHero(d.hero);
    if (d.videoLoop) renderVideoLoop(d.videoLoop);
    if (d.videoPlay) renderVideoPlay(d.videoPlay);
    if (d.about) renderAbout(d.about);
    if (d.services) renderServices(d.services);
    if (d.contact) renderContact(d.contact);
    wireEditors();
    requestAnimationFrame(observeAnims);
  }

  function show(s) {
    var el = document.querySelector('[data-section="' + s + '"]');
    if (el) el.style.display = "";
  }
  function setTxt(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val || "";
  }
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }
  function applyPos(el, pos) {
    if (!el || !pos) return;
    if (typeof el === "string") el = document.querySelector(el);
    if (!el) return;
    var t = "translate(" + (pos.x || 0) + "px, " + (pos.y || 0) + "px)";
    el.style.transform = t;
    el.style.setProperty("--cms-translate", t);
    el.dataset.cmsPosX = pos.x || 0;
    el.dataset.cmsPosY = pos.y || 0;
  }

  /* ── hero ───────────────────────────────────────── */
  function renderHero(d) {
    show("hero");
    setTxt("hero-title", d.title);
    setTxt("hero-subtitle", d.subtitle);
    var badge = document.querySelector(".hero__badge");
    if (badge) badge.textContent = d.badge || "Production Audiovisuelle";
    var c = document.getElementById("hero-media");
    if (c) {
      c.innerHTML = "";
      if (d.image) {
        var img = document.createElement("img");
        img.className = "hero__image";
        img.src = resolveUrl(d.image);
        img.alt = "";
        img.loading = "eager";
        if (d.imagePosition) img.style.objectPosition = d.imagePosition.x + "% " + d.imagePosition.y + "%";
        c.appendChild(img);
      }
    }
    applyPos("#hero-title", d.titlePosition);
    applyPos("#hero-subtitle", d.subtitlePosition);
    applyPos(".hero__badge", d.badgePosition);
    applyPos(".hero__content", d.contentPosition);
    registerControl(document.getElementById("hero-media-zone"), {
      uploadKey: "hero", cropContainer: "hero-media",
      cropSection: "hero", cropPosField: "imagePosition"
    });
    registerControl(document.getElementById("hero-title"), { canMove: true, section: "hero", posField: "titlePosition" });
    registerControl(document.getElementById("hero-subtitle"), { canMove: true, section: "hero", posField: "subtitlePosition" });
    registerControl(document.querySelector(".hero__badge"), { canMove: true, section: "hero", posField: "badgePosition" });
  }

  /* ── video loop ──────────────────────────────────── */
  function renderVideoLoop(d) {
    show("videoLoop");
    setTxt("video-loop-title", d.title);
    var c = document.getElementById("video-loop-media");
    if (c) {
      c.innerHTML = "";
      if (d.video) {
        var v = document.createElement("video");
        v.src = resolveUrl(d.video);
        v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
        v.preload = "auto"; v.setAttribute("playsinline", "");
        if (d.videoPosition) v.style.objectPosition = d.videoPosition.x + "% " + d.videoPosition.y + "%";
        c.appendChild(v);
        v.play().catch(function () {});
      }
    }
    applyPos("#video-loop-title", d.titlePosition);
    registerControl(document.getElementById("videoLoop"), {
      uploadKey: "videoLoop-video", cropContainer: "video-loop-media",
      cropSection: "videoLoop", cropPosField: "videoPosition"
    });
    registerControl(document.getElementById("video-loop-title"), { canMove: true, section: "videoLoop", posField: "titlePosition" });
  }

  /* ── video play ──────────────────────────────────── */
  function renderVideoPlay(d) {
    show("videoPlay");
    setTxt("video-play-title", d.title);
    var lbl = document.querySelector(".video-play__label");
    if (lbl) lbl.textContent = d.label || "Showreel";
    var c = document.getElementById("video-play-media");
    if (c) {
      var glow = c.querySelector(".video-play__glow");
      c.innerHTML = "";
      if (glow) c.appendChild(glow);
      if (d.video) {
        var v = document.createElement("video");
        v.src = resolveUrl(d.video);
        v.controls = true; v.playsInline = true;
        v.preload = "auto"; v.setAttribute("playsinline", "");
        if (d.poster) v.poster = resolveUrl(d.poster);
        c.appendChild(v);
      }
    }
    applyPos("#video-play-title", d.titlePosition);
    applyPos(".video-play__label", d.labelPosition);
    registerControl(document.getElementById("video-play-media"), {
      uploadKey: "videoPlay-video", hasPoster: true,
      cropContainer: "video-play-media", cropSection: "videoPlay", cropPosField: "videoPosition"
    });
    registerControl(document.getElementById("video-play-title"), { canMove: true, section: "videoPlay", posField: "titlePosition" });
    registerControl(document.querySelector(".video-play__label"), { canMove: true, section: "videoPlay", posField: "labelPosition" });
  }

  /* ── about ──────────────────────────────────────── */
  function renderAbout(d) {
    show("about");
    setTxt("about-title", d.title);
    setTxt("about-text", d.text);
    var ey = document.querySelector(".about__eyebrow");
    if (ey) ey.textContent = d.eyebrow || "À propos";
    var c = document.getElementById("about-media");
    if (c) {
      c.innerHTML = "";
      if (d.image) {
        var img = document.createElement("img");
        img.className = "about__image";
        img.src = resolveUrl(d.image);
        img.alt = "";
        if (d.imagePosition) img.style.objectPosition = d.imagePosition.x + "% " + d.imagePosition.y + "%";
        c.appendChild(img);
      }
    }
    applyPos("#about-title", d.titlePosition);
    applyPos("#about-text", d.textPosition);
    applyPos(".about__eyebrow", d.eyebrowPosition);
    registerControl(document.getElementById("about-media-zone"), {
      uploadKey: "about", cropContainer: "about-media",
      cropSection: "about", cropPosField: "imagePosition"
    });
    registerControl(document.getElementById("about-title"), { canMove: true, section: "about", posField: "titlePosition" });
    registerControl(document.getElementById("about-text"), { canMove: true, section: "about", posField: "textPosition" });
    registerControl(document.querySelector(".about__eyebrow"), { canMove: true, section: "about", posField: "eyebrowPosition" });
  }

  /* ── services ──────────────────────────────────── */
  function renderServices(d) {
    show("services");
    setTxt("services-title", d.title);
    var ey = document.querySelector(".services__eyebrow");
    if (ey) ey.textContent = d.eyebrow || "Expertise";
    var list = document.getElementById("services-list");
    if (!list || !d.items) return;
    list.innerHTML = "";
    d.items.forEach(function (item, idx) {
      var card = document.createElement("div");
      card.className = "service-card";
      card.dataset.idx = idx;
      card.innerHTML = '<h3 class="service-card__title">' + esc(item.title) + '</h3><p class="service-card__description">' + esc(item.description) + '</p>';
      if (item.position) applyPos(card, item.position);
      list.appendChild(card);
      registerControl(card, { canMove: true, isCard: true, cardIdx: idx });
    });
    applyPos("#services-title", d.titlePosition);
    applyPos(".services__eyebrow", d.eyebrowPosition);
    registerControl(document.getElementById("services-title"), { canMove: true, section: "services", posField: "titlePosition" });
    registerControl(document.querySelector(".services__eyebrow"), { canMove: true, section: "services", posField: "eyebrowPosition" });
  }

  /* ── contact ───────────────────────────────────── */
  function renderContact(d) {
    show("contact");
    setTxt("contact-title", d.title);
    setTxt("contact-text", d.text);
    var emailEl = document.getElementById("contact-email");
    if (emailEl) emailEl.textContent = d.email || "";
    var cta = document.getElementById("contact-cta");
    if (cta) {
      cta.textContent = d.cta || d.buttonLabel || "";
      cta.href = d.email ? "mailto:" + d.email : "#";
    }
    applyPos("#contact-title", d.titlePosition);
    applyPos("#contact-text", d.textPosition);
    applyPos("#contact-cta", d.ctaPosition);
    registerControl(document.getElementById("contact-title"), { canMove: true, section: "contact", posField: "titlePosition" });
    registerControl(document.getElementById("contact-text"), { canMove: true, section: "contact", posField: "textPosition" });
    registerControl(document.getElementById("contact-email"), { canMove: true, section: "contact", posField: "emailPosition" });
    registerControl(document.getElementById("contact-cta"), { canMove: true, section: "contact", posField: "ctaPosition" });
  }

  /* ============================================================
     TEXT EDITING
     ============================================================ */
  function wireText(id, section, field) {
    var el = document.getElementById(id);
    if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true";
    el.dataset.cmsWired = "true";
    el.spellcheck = false;
    el.style.outline = "none";
    el.classList.add("cms-editable");
    var timer;
    function emit() {
      var p = {}; p[section] = {}; p[section][field] = el.textContent;
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
    }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
    el.addEventListener("blur", function () { clearTimeout(timer); emit(); });
  }

  function wireEl(sel, section, field) {
    var el = document.querySelector(sel);
    if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true";
    el.dataset.cmsWired = "true";
    el.spellcheck = false;
    el.style.outline = "none";
    el.classList.add("cms-editable");
    var timer;
    function emit() {
      var p = {}; p[section] = {}; p[section][field] = el.textContent;
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
    }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
    el.addEventListener("blur", function () { clearTimeout(timer); emit(); });
  }

  function wireServiceCards() {
    var list = document.getElementById("services-list");
    if (!list) return;
    list.querySelectorAll(".service-card").forEach(function (card, idx) {
      [{ sel: ".service-card__title", f: "title" }, { sel: ".service-card__description", f: "description" }].forEach(function (cfg) {
        var el = card.querySelector(cfg.sel);
        if (!el || el.dataset.cmsWired) return;
        el.contentEditable = "true";
        el.dataset.cmsWired = "true";
        el.spellcheck = false;
        el.style.outline = "none";
        el.classList.add("cms-editable");
        var timer, field = cfg.f;
        function emit() {
          var d = pageData(currentSlug);
          if (!d || !d.services || !d.services.items || !d.services.items[idx]) return;
          var items = d.services.items.map(function (it) { return Object.assign({}, it); });
          items[idx][field] = el.textContent;
          postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { services: { items: items } } });
        }
        el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
        el.addEventListener("blur", function () { clearTimeout(timer); emit(); });
      });
    });
  }

  function wireCta() {
    var cta = document.getElementById("contact-cta");
    if (!cta || cta.dataset.cmsWired) return;
    cta.contentEditable = "true";
    cta.dataset.cmsWired = "true";
    cta.spellcheck = false;
    cta.style.outline = "none";
    cta.classList.add("cms-editable");
    cta.addEventListener("click", function (e) { e.preventDefault(); });
    var timer;
    function emit() {
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { contact: { cta: cta.textContent } } });
    }
    cta.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
    cta.addEventListener("blur", function () { clearTimeout(timer); emit(); });
  }

  function wireEditors() {
    if (!isCms) return;
    wireText("hero-title", "hero", "title");
    wireText("hero-subtitle", "hero", "subtitle");
    wireText("video-loop-title", "videoLoop", "title");
    wireText("video-play-title", "videoPlay", "title");
    wireText("about-title", "about", "title");
    wireText("about-text", "about", "text");
    wireText("services-title", "services", "title");
    wireText("contact-title", "contact", "title");
    wireText("contact-text", "contact", "text");
    wireText("contact-email", "contact", "email");
    wireCta();
    wireEl(".hero__badge", "hero", "badge");
    wireEl(".video-play__label", "videoPlay", "label");
    wireEl(".about__eyebrow", "about", "eyebrow");
    wireEl(".services__eyebrow", "services", "eyebrow");
    wireServiceCards();
  }

  /* ============================================================
     CROP SYSTEM (object-position)
     ============================================================ */
  var cropState = null;

  function startCrop(container, section, posField, cx, cy) {
    var media = container.querySelector("img, video");
    if (!media) return;
    var style = window.getComputedStyle(media);
    var pos = style.objectPosition || "50% 50%";
    var parts = pos.split(/\s+/);
    cropState = {
      container: container, media: media, section: section, posField: posField,
      sx: cx, sy: cy,
      px: parseFloat(parts[0]) || 50, py: parseFloat(parts[1]) || 50
    };
    container.classList.add("cms-cropping");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    showSnapGrid(container.closest("[data-section]") || container);
  }

  document.addEventListener("mousemove", function (e) {
    if (cropState) handleCropMove(e.clientX, e.clientY);
  });
  document.addEventListener("touchmove", function (e) {
    if (cropState && e.touches.length >= 1) { e.preventDefault(); handleCropMove(e.touches[0].clientX, e.touches[0].clientY); }
  }, { passive: false });

  function handleCropMove(cx, cy) {
    var dx = cx - cropState.sx, dy = cy - cropState.sy;
    var nx = clamp(cropState.px - dx * 0.15, 0, 100);
    var ny = clamp(cropState.py - dy * 0.15, 0, 100);
    var s = snapVal(nx, ny);
    cropState.media.style.objectPosition = s.x + "% " + s.y + "%";
    updateSnapUI(s.x, s.y);
  }

  document.addEventListener("mouseup", endCrop);
  document.addEventListener("touchend", endCrop);

  function endCrop() {
    if (!cropState) return;
    var pos = cropState.media.style.objectPosition || "50% 50%";
    var parts = pos.split(/\s+/);
    cropState.container.classList.remove("cms-cropping");
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    hideSnapGrid();
    var p = {}; p[cropState.section] = {};
    p[cropState.section][cropState.posField] = {
      x: Math.round(parseFloat(parts[0])),
      y: Math.round(parseFloat(parts[1]))
    };
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
    cropState = null;
  }

  /* ============================================================
     MOVE SYSTEM (translate elements)
     ============================================================ */
  var moveState = null;

  function startMove(el, section, posField, cx, cy) {
    moveState = {
      el: el, section: section, posField: posField,
      sx: cx, sy: cy,
      ox: parseFloat(el.dataset.cmsPosX) || 0,
      oy: parseFloat(el.dataset.cmsPosY) || 0
    };
    el.classList.add("cms-moving");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    showSnapGrid(el.closest("[data-section]") || el.parentElement);
  }

  document.addEventListener("mousemove", function (e) {
    if (moveState) handleMove(e.clientX, e.clientY);
  });
  document.addEventListener("touchmove", function (e) {
    if (moveState && e.touches.length === 1) { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); }
  }, { passive: false });

  function handleMove(cx, cy) {
    var nx = moveState.ox + (cx - moveState.sx);
    var ny = moveState.oy + (cy - moveState.sy);
    var t = "translate(" + nx + "px, " + ny + "px)";
    moveState.el.style.transform = t;
    moveState.el.style.setProperty("--cms-translate", t);
    moveState.el.dataset.cmsPosX = nx;
    moveState.el.dataset.cmsPosY = ny;
  }

  document.addEventListener("mouseup", endMove);
  document.addEventListener("touchend", endMove);

  function endMove() {
    if (!moveState) return;
    moveState.el.classList.remove("cms-moving");
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    hideSnapGrid();
    var fx = Math.round(parseFloat(moveState.el.dataset.cmsPosX) || 0);
    var fy = Math.round(parseFloat(moveState.el.dataset.cmsPosY) || 0);
    var p = {}; p[moveState.section] = {};
    p[moveState.section][moveState.posField] = { x: fx, y: fy };
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
    moveState = null;
  }

  /* ── card move ── */
  var cardMoveState = null;

  function startCardMove(card, idx, cx, cy) {
    cardMoveState = {
      card: card, idx: idx, sx: cx, sy: cy,
      ox: parseFloat(card.dataset.cmsPosX) || 0,
      oy: parseFloat(card.dataset.cmsPosY) || 0
    };
    card.classList.add("cms-moving");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    showSnapGrid(card.closest("[data-section]") || card.parentElement);
  }

  document.addEventListener("mousemove", function (e) {
    if (!cardMoveState) return;
    var nx = cardMoveState.ox + (e.clientX - cardMoveState.sx);
    var ny = cardMoveState.oy + (e.clientY - cardMoveState.sy);
    var t = "translate(" + nx + "px, " + ny + "px)";
    cardMoveState.card.style.transform = t;
    cardMoveState.card.style.setProperty("--cms-translate", t);
    cardMoveState.card.dataset.cmsPosX = nx;
    cardMoveState.card.dataset.cmsPosY = ny;
  });
  document.addEventListener("touchmove", function (e) {
    if (!cardMoveState || e.touches.length !== 1) return;
    e.preventDefault();
    var nx = cardMoveState.ox + (e.touches[0].clientX - cardMoveState.sx);
    var ny = cardMoveState.oy + (e.touches[0].clientY - cardMoveState.sy);
    var t = "translate(" + nx + "px, " + ny + "px)";
    cardMoveState.card.style.transform = t;
    cardMoveState.card.style.setProperty("--cms-translate", t);
    cardMoveState.card.dataset.cmsPosX = nx;
    cardMoveState.card.dataset.cmsPosY = ny;
  }, { passive: false });
  document.addEventListener("mouseup", endCardMove);
  document.addEventListener("touchend", endCardMove);

  function endCardMove() {
    if (!cardMoveState) return;
    cardMoveState.card.classList.remove("cms-moving");
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    hideSnapGrid();
    var fx = Math.round(parseFloat(cardMoveState.card.dataset.cmsPosX) || 0);
    var fy = Math.round(parseFloat(cardMoveState.card.dataset.cmsPosY) || 0);
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
  var snapOverlay = null;
  var SNAP_PTS = [0, 25, 50, 75, 100];
  var SNAP_T = 4;

  function snapVal(x, y) {
    var sx = x, sy = y;
    SNAP_PTS.forEach(function (p) {
      if (Math.abs(x - p) < SNAP_T) sx = p;
      if (Math.abs(y - p) < SNAP_T) sy = p;
    });
    return { x: sx, y: sy };
  }

  function createSnapOverlay() {
    if (snapOverlay) return;
    snapOverlay = document.createElement("div");
    snapOverlay.className = "cms-snap-overlay";
    var html = "";
    [0, 25, 50, 75, 100].forEach(function (p) {
      html += '<div class="cms-snap-v" style="left:' + p + '%" data-p="' + p + '"></div>';
      html += '<div class="cms-snap-h" style="top:' + p + '%" data-p="' + p + '"></div>';
    });
    html += '<div class="cms-snap-crosshair"></div><div class="cms-snap-label"></div>';
    snapOverlay.innerHTML = html;
    document.body.appendChild(snapOverlay);
  }

  function showSnapGrid(sec) {
    if (!isCms) return;
    createSnapOverlay();
    var r = sec.getBoundingClientRect();
    var s = snapOverlay.style;
    s.display = "block";
    s.top = (r.top + window.scrollY) + "px";
    s.left = r.left + "px";
    s.width = r.width + "px";
    s.height = r.height + "px";
  }

  function hideSnapGrid() {
    if (snapOverlay) snapOverlay.style.display = "none";
  }

  function updateSnapUI(x, y) {
    if (!snapOverlay) return;
    snapOverlay.querySelectorAll(".cms-snap-v,.cms-snap-h").forEach(function (l) {
      var p = parseFloat(l.dataset.p);
      var val = l.classList.contains("cms-snap-v") ? x : y;
      l.classList.toggle("cms-snap-hit", Math.abs(val - p) < 3);
    });
    var ch = snapOverlay.querySelector(".cms-snap-crosshair");
    if (ch) { ch.style.left = x + "%"; ch.style.top = y + "%"; }
    var lbl = snapOverlay.querySelector(".cms-snap-label");
    if (lbl) lbl.textContent = Math.round(x) + "% , " + Math.round(y) + "%";
  }

  /* ── animations ──────────────────────────────────── */
  var obs = null;
  function observeAnims() {
    if (obs) obs.disconnect();
    obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll("[data-anim]").forEach(function (el) {
      if (!el.classList.contains("is-visible")) obs.observe(el);
    });
  }

  /* ── CMS styles ──────────────────────────────────── */
  if (isCms) {
    initToolbar();

    var css = document.createElement("style");
    css.textContent = [
      '.cms-editable { transition: box-shadow .15s; border-radius: 4px; padding: 2px 4px; cursor: text; }',
      '.cms-editable:hover { box-shadow: inset 0 0 0 1.5px rgba(196,165,90,.4); }',
      '.cms-editable:focus { box-shadow: inset 0 0 0 2px rgba(196,165,90,.7); }',

      '[data-cms-ctrl] { transition: outline-color .2s; }',
      '[data-cms-ctrl]:hover { outline: 1.5px dashed rgba(196,165,90,.4); outline-offset: 4px; }',

      '#cms-toolbar {',
      '  position: fixed; display: none; z-index: 10000;',
      '  gap: 6px; padding: 6px 8px;',
      '  background: rgba(10,10,13,.94);',
      '  border: 1px solid rgba(196,165,90,.35);',
      '  border-radius: 10px;',
      '  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);',
      '  box-shadow: 0 8px 32px rgba(0,0,0,.55), 0 0 0 1px rgba(196,165,90,.08);',
      '  white-space: nowrap;',
      '  pointer-events: auto;',
      '}',

      '.cms-tb-btn {',
      '  display: flex; align-items: center; gap: 5px;',
      '  padding: 7px 14px; font-size: 12px;',
      '  font-family: var(--sans); font-weight: 500;',
      '  color: #fff; background: transparent;',
      '  border: 1px solid rgba(196,165,90,.25);',
      '  border-radius: 7px; cursor: pointer;',
      '  white-space: nowrap;',
      '  transition: background .15s, border-color .15s;',
      '}',
      '.cms-tb-btn:hover { background: rgba(196,165,90,.2); border-color: var(--gold); }',
      '.cms-tb-grip { cursor: grab; border-color: rgba(196,165,90,.5); color: var(--gold); }',
      '.cms-tb-grip:hover { background: rgba(196,165,90,.3); }',
      '.cms-tb-grip:active { cursor: grabbing; }',

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

      '.service-card { position: relative; }',
      '.contact__cta { cursor: text; position: relative; display: inline-block; }',
      '[data-anim].is-visible { transform: var(--cms-translate, none) !important; }',

      '@media (max-width: 680px) {',
      '  .cms-tb-btn { padding: 6px 10px; font-size: 11px; }',
      '  #cms-toolbar { gap: 4px; padding: 4px 6px; }',
      '}',
    ].join('\n');
    document.head.appendChild(css);
  }
})();
