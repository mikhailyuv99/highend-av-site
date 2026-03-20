/* ============================================================
   OBSCURA — CMS-Compatible Client-Side App
   Full inline editing: text, media replace, element drag-to-move,
   image crop/reframe, snap grid, mobile touch
   PostMessage: CMS_READY, CMS_CONTENT, CMS_PATCH, CMS_PAGE,
   CMS_UPLOAD_REQUEST, CMS_SAVE
   ============================================================ */

(function () {
  "use strict";

  var params  = new URLSearchParams(window.location.search);
  var isCms   = params.get("cmsEmbed") === "1";
  var ORIGIN  = window.location.origin;
  var cmsParentOrigin = params.get("parentOrigin") || null;

  function resolveUrl(raw) {
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    try { return new URL(raw, ORIGIN + "/").href; } catch (_) { return raw; }
  }

  function normalizeOrigin(o) {
    try {
      var u = new URL(o);
      var h = u.hostname === "127.0.0.1" ? "localhost" : u.hostname;
      return u.protocol + "//" + h + (u.port ? ":" + u.port : "");
    } catch (_) { return o; }
  }

  function originOk(incoming) {
    if (!cmsParentOrigin) return true;
    return normalizeOrigin(incoming) === normalizeOrigin(cmsParentOrigin);
  }

  function postToParent(msg) {
    if (!isCms) return;
    var t = cmsParentOrigin || "*";
    try { window.parent.postMessage(msg, t); } catch (_) {
      try { window.parent.postMessage(msg, "*"); } catch (__) {}
    }
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  var content = null;
  var currentSlug = params.get("page") || "index";
  var ALL = ["hero", "videoLoop", "videoPlay", "about", "services", "contact"];

  /* ── navigation ────────────────────────────────── */

  var navEl = document.getElementById("site-nav");

  function activateNav() {
    if (!content || !content.pages) return;
    if (navEl) navEl.hidden = false;
    document.querySelectorAll(".site-nav__link").forEach(function (a) {
      a.classList.toggle("active", a.dataset.page === currentSlug);
    });
  }

  if (navEl) {
    navEl.addEventListener("click", function (e) {
      var link = e.target.closest(".site-nav__link");
      if (!link) return;
      e.preventDefault();
      var slug = link.dataset.page;
      if (slug && slug !== currentSlug) {
        currentSlug = slug;
        renderPage(pageData(slug));
        activateNav();
        window.scrollTo({ top: 0, behavior: "smooth" });
        postToParent({ type: "CMS_PAGE", source: "cms-site", slug: slug });
      }
    });
  }

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
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        postToParent({ type: "CMS_SAVE", source: "cms-site" });
      }
    });
  }

  /* ── standalone load ──────────────────────────── */

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
    if (!content) return {};
    if (content.pages) return content.pages[slug] || {};
    return content;
  }

  /* ── clear ────────────────────────────────────── */

  function clearAll() {
    ["hero-title", "hero-subtitle", "hero-media",
     "video-loop-title", "video-loop-media",
     "video-play-title",
     "about-title", "about-text", "about-media",
     "services-title", "services-list",
     "contact-title", "contact-text", "contact-email", "contact-cta"
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
  }

  /* ── render ───────────────────────────────────── */

  function renderPage(d) {
    clearAll();
    if (!d) return;
    if (d.hero)      renderHero(d.hero);
    if (d.videoLoop) renderVideoLoop(d.videoLoop);
    if (d.videoPlay) renderVideoPlay(d.videoPlay);
    if (d.about)     renderAbout(d.about);
    if (d.services)  renderServices(d.services);
    if (d.contact)   renderContact(d.contact);
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
  function esc(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

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

  /* ── hero ──────────────────────────────────────── */

  function renderHero(d) {
    show("hero");
    setTxt("hero-title", d.title);
    setTxt("hero-subtitle", d.subtitle);
    var c = document.getElementById("hero-media");
    if (c) {
      c.innerHTML = "";
      if (d.image) {
        var img = document.createElement("img");
        img.className = "hero__image";
        img.src = resolveUrl(d.image);
        img.alt = ""; img.loading = "eager";
        if (d.imagePosition) img.style.objectPosition = d.imagePosition.x + "% " + d.imagePosition.y + "%";
        c.appendChild(img);
      }
    }
    var badge = document.querySelector(".hero__badge");
    if (badge && d.badge) badge.textContent = d.badge;

    applyPos(".hero__content", d.contentPosition);
    bindMediaReplace("hero-media-zone", "hero");
    bindCropDrag("hero-media", "hero", "imagePosition");
    bindMoveDrag(".hero__content", "hero", "contentPosition");
  }

  /* ── video loop ──────────────────────────────── */

  function renderVideoLoop(d) {
    show("videoLoop");
    setTxt("video-loop-title", d.title);
    var c = document.getElementById("video-loop-media");
    if (c) {
      c.innerHTML = "";
      if (d.video) {
        var v = document.createElement("video");
        v.src = resolveUrl(d.video);
        v.autoplay = true; v.muted = true; v.loop = true;
        v.playsInline = true; v.preload = "auto";
        v.setAttribute("playsinline", "");
        if (d.videoPosition) v.style.objectPosition = d.videoPosition.x + "% " + d.videoPosition.y + "%";
        c.appendChild(v);
        v.play().catch(function () {});
      }
    }
    applyPos(".video-loop__inner", d.contentPosition);
    bindMediaReplace("video-loop-media", "videoLoop-video");
    bindCropDrag("video-loop-media", "videoLoop", "videoPosition");
    bindMoveDrag(".video-loop__inner", "videoLoop", "contentPosition");
  }

  /* ── video play ──────────────────────────────── */

  function renderVideoPlay(d) {
    show("videoPlay");
    setTxt("video-play-title", d.title);
    var lbl = document.querySelector(".video-play__label");
    if (lbl && d.label) lbl.textContent = d.label;
    var c = document.getElementById("video-play-media");
    if (c) {
      var glow = c.querySelector(".video-play__glow");
      c.innerHTML = "";
      if (glow) c.appendChild(glow);
      if (d.video) {
        var v = document.createElement("video");
        v.src = resolveUrl(d.video);
        v.controls = true; v.playsInline = true; v.preload = "auto";
        v.setAttribute("playsinline", "");
        if (d.poster) v.poster = resolveUrl(d.poster);
        c.appendChild(v);
      }
    }
    bindMediaReplace("video-play-media", "videoPlay-video");
  }

  /* ── about ────────────────────────────────────── */

  function renderAbout(d) {
    show("about");
    setTxt("about-title", d.title);
    setTxt("about-text", d.text);
    var eyebrow = document.querySelector(".about__eyebrow");
    if (eyebrow && d.eyebrow) eyebrow.textContent = d.eyebrow;
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
    applyPos(".about__text", d.contentPosition);
    bindMediaReplace("about-media-zone", "about");
    bindCropDrag("about-media", "about", "imagePosition");
    bindMoveDrag(".about__text", "about", "contentPosition");
  }

  /* ── services ─────────────────────────────────── */

  function renderServices(d) {
    show("services");
    setTxt("services-title", d.title);
    var eyebrow = document.querySelector(".services__eyebrow");
    if (eyebrow && d.eyebrow) eyebrow.textContent = d.eyebrow;
    var list = document.getElementById("services-list");
    if (!list || !d.items) return;
    list.innerHTML = "";
    d.items.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "service-card";
      card.innerHTML = '<h3 class="service-card__title">' + esc(item.title) + '</h3>' +
                        '<p class="service-card__description">' + esc(item.description) + '</p>';
      list.appendChild(card);
    });
  }

  /* ── contact ──────────────────────────────────── */

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
    applyPos(".contact__inner", d.contentPosition);
    bindMoveDrag(".contact__inner", "contact", "contentPosition");
  }

  /* ============================================================
     TEXT EDITING (dataset.cmsWired prevents duplicate listeners)
     ============================================================ */

  function wireText(id, section, field) {
    var el = document.getElementById(id);
    if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true"; el.dataset.cmsWired = "true";
    el.spellcheck = false; el.style.outline = "none";
    el.classList.add("cms-editable");
    var timer;
    function emit() {
      var p = {}; p[section] = {}; p[section][field] = el.textContent;
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
    }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emit, 350); });
    el.addEventListener("blur", function () { clearTimeout(timer); emit(); });
  }

  function wireEl(selector, section, field) {
    var el = document.querySelector(selector);
    if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true"; el.dataset.cmsWired = "true";
    el.spellcheck = false; el.style.outline = "none";
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
      [{ sel: ".service-card__title", f: "title" }, { sel: ".service-card__description", f: "description" }]
        .forEach(function (cfg) {
          var el = card.querySelector(cfg.sel);
          if (!el || el.dataset.cmsWired) return;
          el.contentEditable = "true"; el.dataset.cmsWired = "true";
          el.spellcheck = false; el.style.outline = "none";
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
    cta.contentEditable = "true"; cta.dataset.cmsWired = "true";
    cta.spellcheck = false; cta.style.outline = "none";
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
    wireText("hero-title",       "hero",      "title");
    wireText("hero-subtitle",    "hero",      "subtitle");
    wireText("video-loop-title", "videoLoop",  "title");
    wireText("video-play-title", "videoPlay",  "title");
    wireText("about-title",      "about",     "title");
    wireText("about-text",       "about",     "text");
    wireText("services-title",   "services",  "title");
    wireText("contact-title",    "contact",   "title");
    wireText("contact-text",     "contact",   "text");
    wireText("contact-email",    "contact",   "email");
    wireCta();
    wireEl(".hero__badge",         "hero",      "badge");
    wireEl(".video-play__label",   "videoPlay", "label");
    wireEl(".about__eyebrow",      "about",     "eyebrow");
    wireEl(".services__eyebrow",   "services",  "eyebrow");
    wireServiceCards();
  }

  /* ============================================================
     MEDIA REPLACE (click on zone = upload)
     Muted/loop videos are treated like images (click = replace).
     Only videos with controls need Shift+Click.
     ============================================================ */

  function bindMediaReplace(zoneId, uploadKey) {
    if (!isCms) return;
    var zone = document.getElementById(zoneId);
    if (!zone || zone.dataset.cmsBound) return;
    zone.dataset.cmsBound = "true";

    zone.addEventListener("click", function (e) {
      if (didDragRecently) return;

      var vid = e.target.closest("video");
      if (vid && vid.controls && !e.shiftKey) return;

      e.preventDefault();
      var key = uploadKey;
      if (e.shiftKey && uploadKey === "videoPlay-video") key = "videoPlay-poster";
      postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: key });
    });
  }

  /* ============================================================
     CROP DRAG (drag on image/video = change object-position)
     Alt+drag on media containers
     ============================================================ */

  var cropState = null;

  function bindCropDrag(containerId, section, posField) {
    if (!isCms) return;
    var container = document.getElementById(containerId);
    if (!container || container.dataset.cmsCropBound) return;
    container.dataset.cmsCropBound = "true";

    container.addEventListener("mousedown", function (e) {
      if (e.button !== 0 || !e.altKey) return;
      e.preventDefault();
      startCrop(container, section, posField, e.clientX, e.clientY);
    });
    container.addEventListener("touchstart", function (e) {
      // two-finger touch = crop
      if (e.touches.length !== 2) return;
      e.preventDefault();
      var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      var my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      startCrop(container, section, posField, mx, my);
    }, { passive: false });
  }

  function startCrop(container, section, posField, cx, cy) {
    var media = container.querySelector("img, video");
    if (!media) return;
    var style = window.getComputedStyle(media);
    var pos = style.objectPosition || "50% 50%";
    var parts = pos.split(/\s+/);
    cropState = {
      container: container, media: media, section: section, posField: posField,
      sx: cx, sy: cy,
      px: parseFloat(parts[0]) || 50,
      py: parseFloat(parts[1]) || 50
    };
    container.classList.add("cms-cropping");
    document.body.style.userSelect = "none";
    showSnapGrid(container.closest("[data-section]") || container);
  }

  document.addEventListener("mousemove", function (e) {
    if (!cropState) return;
    handleCropMove(e.clientX, e.clientY);
  });
  document.addEventListener("touchmove", function (e) {
    if (!cropState) return;
    if (e.touches.length >= 2) {
      e.preventDefault();
      handleCropMove(
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2
      );
    }
  }, { passive: false });

  function handleCropMove(cx, cy) {
    if (!cropState) return;
    var dx = cx - cropState.sx, dy = cy - cropState.sy;
    var nx = clamp(cropState.px - dx * 0.15, 0, 100);
    var ny = clamp(cropState.py - dy * 0.15, 0, 100);
    var s = snap(nx, ny);
    cropState.media.style.objectPosition = s.x + "% " + s.y + "%";
    updateSnapUI(s.x, s.y);
  }

  document.addEventListener("mouseup", endCrop);
  document.addEventListener("touchend", endCrop);
  document.addEventListener("touchcancel", endCrop);

  function endCrop() {
    if (!cropState) return;
    var pos = cropState.media.style.objectPosition || "50% 50%";
    var parts = pos.split(/\s+/);
    var fx = Math.round(parseFloat(parts[0])), fy = Math.round(parseFloat(parts[1]));
    cropState.container.classList.remove("cms-cropping");
    document.body.style.userSelect = "";
    hideSnapGrid();
    var p = {}; p[cropState.section] = {};
    p[cropState.section][cropState.posField] = { x: fx, y: fy };
    postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });
    cropState = null;
  }

  /* ============================================================
     MOVE DRAG (drag element = reposition with translate)
     Regular drag on content blocks
     ============================================================ */

  var moveState = null;
  var didDragRecently = false;
  var DRAG_THRESH = 5;

  function bindMoveDrag(selector, section, posField) {
    if (!isCms) return;
    var el = (typeof selector === "string") ? document.querySelector(selector) : selector;
    if (!el || el.dataset.cmsMoveBound) return;
    el.dataset.cmsMoveBound = "true";
    el.classList.add("cms-movable");

    el.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      if (e.target.closest("[contenteditable='true']") && document.activeElement === e.target.closest("[contenteditable='true']")) return;
      if (e.altKey) return;
      e.preventDefault();
      startMove(el, section, posField, e.clientX, e.clientY);
    });

    el.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      var tx = e.touches[0].clientX, ty = e.touches[0].clientY;
      if (e.target.closest("[contenteditable='true']")) return;
      startMove(el, section, posField, tx, ty);
    }, { passive: true });
  }

  function startMove(el, section, posField, cx, cy) {
    moveState = {
      el: el, section: section, posField: posField,
      sx: cx, sy: cy,
      ox: parseFloat(el.dataset.cmsPosX) || 0,
      oy: parseFloat(el.dataset.cmsPosY) || 0,
      active: false
    };
  }

  document.addEventListener("mousemove", function (e) {
    if (!moveState) return;
    handleMove(e.clientX, e.clientY);
  });
  document.addEventListener("touchmove", function (e) {
    if (!moveState && !cropState) return;
    if (moveState && e.touches.length === 1) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
      if (moveState.active) e.preventDefault();
    }
  }, { passive: false });

  function handleMove(cx, cy) {
    if (!moveState) return;
    var dx = cx - moveState.sx, dy = cy - moveState.sy;

    if (!moveState.active) {
      if (Math.abs(dx) < DRAG_THRESH && Math.abs(dy) < DRAG_THRESH) return;
      moveState.active = true;
      didDragRecently = true;
      moveState.el.classList.add("cms-moving");
      document.body.style.userSelect = "none";
      showSnapGrid(moveState.el.closest("[data-section]") || moveState.el.parentElement);
    }

    var nx = moveState.ox + dx, ny = moveState.oy + dy;
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
    if (moveState.active) {
      moveState.el.classList.remove("cms-moving");
      document.body.style.userSelect = "";
      hideSnapGrid();

      var fx = Math.round(parseFloat(moveState.el.dataset.cmsPosX) || 0);
      var fy = Math.round(parseFloat(moveState.el.dataset.cmsPosY) || 0);
      var p = {}; p[moveState.section] = {};
      p[moveState.section][moveState.posField] = { x: fx, y: fy };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: p });

      setTimeout(function () { didDragRecently = false; }, 80);
    }
    moveState = null;
  }

  /* ============================================================
     SNAP GRID
     ============================================================ */

  var snapOverlay = null;
  var SNAP_PTS = [0, 25, 50, 75, 100];
  var SNAP_T = 4;

  function snap(x, y) {
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
    html += '<div class="cms-snap-crosshair"></div>';
    html += '<div class="cms-snap-label"></div>';
    snapOverlay.innerHTML = html;
    document.body.appendChild(snapOverlay);
  }

  function showSnapGrid(section) {
    if (!isCms) return;
    createSnapOverlay();
    var r = section.getBoundingClientRect();
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
    snapOverlay.querySelectorAll(".cms-snap-v, .cms-snap-h").forEach(function (line) {
      var p = parseFloat(line.dataset.p);
      var isV = line.classList.contains("cms-snap-v");
      line.classList.toggle("cms-snap-hit", Math.abs((isV ? x : y) - p) < 3);
    });
    var ch = snapOverlay.querySelector(".cms-snap-crosshair");
    if (ch) { ch.style.left = x + "%"; ch.style.top = y + "%"; }
    var lbl = snapOverlay.querySelector(".cms-snap-label");
    if (lbl) lbl.textContent = Math.round(x) + "% , " + Math.round(y) + "%";
  }

  /* ── animations ──────────────────────────────── */

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

  /* ── CMS styles ──────────────────────────────── */

  if (isCms) {
    var css = document.createElement("style");
    css.textContent = [
      /* editable text */
      '.cms-editable { transition: box-shadow .15s; border-radius: 4px; padding: 2px 4px; cursor: text; }',
      '.cms-editable:hover { box-shadow: inset 0 0 0 1.5px rgba(196,165,90,.4); }',
      '.cms-editable:focus { box-shadow: inset 0 0 0 2px rgba(196,165,90,.7); }',

      /* movable content blocks */
      '.cms-movable { cursor: grab; position: relative; }',
      '.cms-movable::before {',
        'content: "\\2630 Glisser pour déplacer";',
        'position: absolute; top: -28px; left: 50%; transform: translateX(-50%);',
        'padding: 3px 12px; font-size: 10px; font-family: var(--sans);',
        'color: #fff; background: rgba(0,0,0,.7); border-radius: 12px;',
        'opacity: 0; transition: opacity .2s; pointer-events: none; white-space: nowrap; z-index: 20;',
      '}',
      '.cms-movable:hover::before { opacity: .8; }',
      '.cms-moving { cursor: grabbing !important; opacity: .9; z-index: 50; }',
      '.cms-moving::before { opacity: 0 !important; }',

      /* crop mode */
      '.cms-cropping { cursor: grabbing !important; }',
      '.cms-cropping img, .cms-cropping video { pointer-events: none !important; }',

      /* media zones */
      '[data-cms-crop-bound] { cursor: pointer; }',
      '[data-cms-crop-bound]::after {',
        'content: "Clic = remplacer · Alt+glisser = recadrer";',
        'position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);',
        'padding: 4px 14px; font-size: 11px; font-family: var(--sans);',
        'color: #fff; background: rgba(0,0,0,.75); border-radius: 20px;',
        'pointer-events: none; opacity: 0; transition: opacity .25s; z-index: 10; white-space: nowrap;',
      '}',
      '[data-cms-crop-bound]:hover::after { opacity: 1; }',

      /* snap overlay */
      '.cms-snap-overlay { position: absolute; z-index: 9998; pointer-events: none; display: none; border: 1px solid rgba(196,165,90,.12); }',
      '.cms-snap-v, .cms-snap-h { position: absolute; opacity: .25; transition: opacity .1s; }',
      '.cms-snap-v { top: 0; bottom: 0; width: 1px; background: rgba(196,165,90,.6); }',
      '.cms-snap-h { left: 0; right: 0; height: 1px; background: rgba(196,165,90,.6); }',
      '.cms-snap-hit { opacity: 1 !important; background: var(--gold) !important; box-shadow: 0 0 8px rgba(196,165,90,.5); }',
      '.cms-snap-crosshair { position: absolute; width: 12px; height: 12px; border: 2px solid var(--gold); border-radius: 50%; transform: translate(-50%,-50%); box-shadow: 0 0 0 3px rgba(0,0,0,.4); }',
      '.cms-snap-label { position: absolute; bottom: 8px; right: 8px; padding: 3px 10px; font-size: 11px; font-family: monospace; color: var(--gold); background: rgba(0,0,0,.85); border-radius: 6px; border: 1px solid rgba(196,165,90,.25); }',

      /* disable card hover in CMS */
      '.service-card:hover { transform: none !important; }',
      '.contact__cta { cursor: text; }',

      /* override animation transform for moved elements */
      '[data-cms-move-bound][data-anim].is-visible { transform: var(--cms-translate, none) !important; }',
    ].join('\n');
    document.head.appendChild(css);
  }

})();
