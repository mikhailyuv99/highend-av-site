/* ============================================================
   OBSCURA — CMS-Compatible Client-Side App
   Full inline editing: text, media replace, media reposition,
   snap grid, mobile touch support
   PostMessage: CMS_READY, CMS_CONTENT, CMS_PATCH, CMS_PAGE,
   CMS_UPLOAD_REQUEST, CMS_SAVE
   ============================================================ */

(function () {
  "use strict";

  var params  = new URLSearchParams(window.location.search);
  var isCms   = params.get("cmsEmbed") === "1";
  var ORIGIN  = window.location.origin;
  var cmsParentOrigin = params.get("parentOrigin") || null;

  /* ── helpers ────────────────────────────────────── */

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

  /* ── state ─────────────────────────────────────── */

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

  /* ── CMS embed listener ────────────────────────── */

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

  /* ── standalone load ───────────────────────────── */

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

  /* ── data helpers ──────────────────────────────── */

  function pageData(slug) {
    if (!content) return {};
    if (content.pages) return content.pages[slug] || {};
    return content;
  }

  /* ── clear ─────────────────────────────────────── */

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

  /* ── render orchestrator ───────────────────────── */

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

  /* ── hero ───────────────────────────────────────── */

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
        img.alt = "";
        img.loading = "eager";
        if (d.imagePosition) {
          img.style.objectPosition = d.imagePosition.x + "% " + d.imagePosition.y + "%";
        }
        c.appendChild(img);
      }
    }
    var badge = document.querySelector(".hero__badge");
    if (badge && d.badge) badge.textContent = d.badge;
    setupMediaZone("hero-media-zone", "hero", "hero-media", "hero", "imagePosition");
  }

  /* ── video loop ─────────────────────────────────── */

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
        if (d.videoPosition) {
          v.style.objectPosition = d.videoPosition.x + "% " + d.videoPosition.y + "%";
        }
        c.appendChild(v);
        v.play().catch(function () {});
      }
    }
    setupMediaZone("video-loop-media", "videoLoop-video", "video-loop-media", "videoLoop", "videoPosition");
  }

  /* ── video play ─────────────────────────────────── */

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
    setupMediaZone("video-play-media", "videoPlay-video", null, null, null);
  }

  /* ── about ──────────────────────────────────────── */

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
        if (d.imagePosition) {
          img.style.objectPosition = d.imagePosition.x + "% " + d.imagePosition.y + "%";
        }
        c.appendChild(img);
      }
    }
    setupMediaZone("about-media-zone", "about", "about-media", "about", "imagePosition");
  }

  /* ── services ───────────────────────────────────── */

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

  /* ── contact ────────────────────────────────────── */

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
  }

  /* ============================================================
     INLINE TEXT EDITING
     Uses el.dataset.cmsWired to prevent duplicate listeners
     ============================================================ */

  function wireText(id, section, field) {
    var el = document.getElementById(id);
    if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true";
    el.dataset.cmsWired = "true";
    el.spellcheck = false;
    el.style.outline = "none";
    el.style.cursor = "text";
    el.classList.add("cms-editable");

    var timer = null;
    function emitPatch() {
      var patch = {};
      patch[section] = {};
      patch[section][field] = el.textContent;
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });
    }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emitPatch, 350); });
    el.addEventListener("blur", function () { clearTimeout(timer); emitPatch(); });
  }

  function wireEl(selector, section, field) {
    var el = document.querySelector(selector);
    if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true";
    el.dataset.cmsWired = "true";
    el.spellcheck = false;
    el.style.outline = "none";
    el.style.cursor = "text";
    el.classList.add("cms-editable");

    var timer = null;
    function emitPatch() {
      var patch = {};
      patch[section] = {};
      patch[section][field] = el.textContent;
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });
    }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emitPatch, 350); });
    el.addEventListener("blur", function () { clearTimeout(timer); emitPatch(); });
  }

  function wireServiceCards() {
    var list = document.getElementById("services-list");
    if (!list) return;
    list.querySelectorAll(".service-card").forEach(function (card, idx) {
      var titleEl = card.querySelector(".service-card__title");
      var descEl = card.querySelector(".service-card__description");

      [{ el: titleEl, field: "title" }, { el: descEl, field: "description" }].forEach(function (item) {
        if (!item.el || item.el.dataset.cmsWired) return;
        item.el.contentEditable = "true";
        item.el.dataset.cmsWired = "true";
        item.el.spellcheck = false;
        item.el.style.outline = "none";
        item.el.classList.add("cms-editable");

        var timer = null;
        var f = item.field;
        function emitPatch() {
          var d = pageData(currentSlug);
          if (!d || !d.services || !d.services.items || !d.services.items[idx]) return;
          var items = d.services.items.map(function (it) { return Object.assign({}, it); });
          items[idx][f] = item.el.textContent;
          postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { services: { items: items } } });
        }
        item.el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emitPatch, 350); });
        item.el.addEventListener("blur", function () { clearTimeout(timer); emitPatch(); });
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
    var timer = null;
    function emitPatch() {
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: { contact: { cta: cta.textContent } } });
    }
    cta.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emitPatch, 350); });
    cta.addEventListener("blur", function () { clearTimeout(timer); emitPatch(); });
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
     UNIFIED MEDIA ZONE: click = replace, drag = reposition
     Drag threshold prevents conflict between click and drag.
     ============================================================ */

  var DRAG_THRESHOLD = 6;
  var dragState = null;
  var didDrag = false;

  function setupMediaZone(zoneId, uploadKey, dragContainerId, section, posField) {
    if (!isCms) return;
    var zone = document.getElementById(zoneId);
    if (!zone) return;

    if (!zone.dataset.cmsClickBound) {
      zone.dataset.cmsClickBound = "true";
      zone.style.cursor = "pointer";

      zone.addEventListener("click", function (e) {
        if (didDrag) { didDrag = false; return; }

        var isVideo = e.target.tagName === "VIDEO";
        if (isVideo && !e.shiftKey) return;
        e.preventDefault();

        var key = uploadKey;
        if (e.shiftKey && uploadKey === "videoPlay-video") key = "videoPlay-poster";
        postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: key });
      });
    }

    if (dragContainerId && section && posField) {
      var dragContainer = document.getElementById(dragContainerId);
      if (dragContainer && !dragContainer.dataset.cmsDragBound) {
        dragContainer.dataset.cmsDragBound = "true";
        bindDragReposition(dragContainer, section, posField);
      }
    }
  }

  function bindDragReposition(container, section, posField) {
    function getMedia() { return container.querySelector("img, video"); }

    function onPointerDown(clientX, clientY, e) {
      var media = getMedia();
      if (!media) return;

      if (e && e.target && e.target.tagName === "VIDEO" && e.target.controls) {
        var rect = e.target.getBoundingClientRect();
        if (clientY > rect.bottom - 44) return;
      }

      var style = window.getComputedStyle(media);
      var pos = style.objectPosition || "50% 50%";
      var parts = pos.split(/\s+/);

      dragState = {
        container: container,
        media: media,
        section: section,
        posField: posField,
        sx: clientX,
        sy: clientY,
        px: parseFloat(parts[0]) || 50,
        py: parseFloat(parts[1]) || 50,
        active: false
      };
    }

    container.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      onPointerDown(e.clientX, e.clientY, e);
    });

    container.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      onPointerDown(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: true });
  }

  document.addEventListener("mousemove", function (e) {
    if (!dragState) return;
    handleDragMove(e.clientX, e.clientY);
  });

  document.addEventListener("touchmove", function (e) {
    if (!dragState || e.touches.length !== 1) return;
    if (dragState.active) e.preventDefault();
    handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  document.addEventListener("mouseup", handleDragEnd);
  document.addEventListener("touchend", handleDragEnd);
  document.addEventListener("touchcancel", handleDragEnd);

  function handleDragMove(clientX, clientY) {
    if (!dragState) return;
    var dx = clientX - dragState.sx;
    var dy = clientY - dragState.sy;

    if (!dragState.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      dragState.active = true;
      didDrag = true;
      dragState.container.classList.add("cms-dragging");
      dragState.media.style.pointerEvents = "none";
      document.body.style.userSelect = "none";
      showSnapGrid(dragState.container.closest("[data-section]") || dragState.container);
    }

    var sens = 0.15;
    var nx = clamp(dragState.px - dx * sens, 0, 100);
    var ny = clamp(dragState.py - dy * sens, 0, 100);
    var snapped = snapValue(nx, ny);
    dragState.media.style.objectPosition = snapped.x + "% " + snapped.y + "%";
    updateSnapIndicators(snapped.x, snapped.y);
  }

  function handleDragEnd() {
    if (!dragState) return;

    if (dragState.active) {
      var pos = dragState.media.style.objectPosition || "50% 50%";
      var parts = pos.split(/\s+/);
      var fx = Math.round(parseFloat(parts[0]));
      var fy = Math.round(parseFloat(parts[1]));

      dragState.container.classList.remove("cms-dragging");
      dragState.media.style.pointerEvents = "";
      document.body.style.userSelect = "";
      hideSnapGrid();

      var patch = {};
      patch[dragState.section] = {};
      patch[dragState.section][dragState.posField] = { x: fx, y: fy };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });

      setTimeout(function () { didDrag = false; }, 50);
    }

    dragState = null;
  }

  /* ============================================================
     SNAP GRID OVERLAY
     ============================================================ */

  var snapOverlay = null;

  function createSnapOverlay() {
    if (snapOverlay) return;
    snapOverlay = document.createElement("div");
    snapOverlay.className = "cms-snap-overlay";
    snapOverlay.innerHTML =
      '<div class="cms-snap-line cms-snap-v" style="left:0"></div>' +
      '<div class="cms-snap-line cms-snap-v" style="left:25%"></div>' +
      '<div class="cms-snap-line cms-snap-v" style="left:50%"></div>' +
      '<div class="cms-snap-line cms-snap-v" style="left:75%"></div>' +
      '<div class="cms-snap-line cms-snap-v" style="left:100%"></div>' +
      '<div class="cms-snap-line cms-snap-h" style="top:0"></div>' +
      '<div class="cms-snap-line cms-snap-h" style="top:25%"></div>' +
      '<div class="cms-snap-line cms-snap-h" style="top:50%"></div>' +
      '<div class="cms-snap-line cms-snap-h" style="top:75%"></div>' +
      '<div class="cms-snap-line cms-snap-h" style="top:100%"></div>' +
      '<div class="cms-snap-crosshair"></div>' +
      '<div class="cms-snap-label"></div>';
    document.body.appendChild(snapOverlay);
  }

  function showSnapGrid(parentSection) {
    if (!isCms) return;
    createSnapOverlay();
    var rect = parentSection.getBoundingClientRect();
    snapOverlay.style.display = "block";
    snapOverlay.style.top = rect.top + window.scrollY + "px";
    snapOverlay.style.left = rect.left + "px";
    snapOverlay.style.width = rect.width + "px";
    snapOverlay.style.height = rect.height + "px";
  }

  function hideSnapGrid() {
    if (snapOverlay) snapOverlay.style.display = "none";
  }

  function updateSnapIndicators(x, y) {
    if (!snapOverlay) return;

    var crosshair = snapOverlay.querySelector(".cms-snap-crosshair");
    if (crosshair) {
      crosshair.style.left = x + "%";
      crosshair.style.top = y + "%";
    }

    var lines = snapOverlay.querySelectorAll(".cms-snap-line");
    lines.forEach(function (line) {
      var isV = line.classList.contains("cms-snap-v");
      var linePos;
      if (isV) {
        linePos = parseFloat(line.style.left);
      } else {
        linePos = parseFloat(line.style.top);
      }
      var val = isV ? x : y;
      line.classList.toggle("cms-snap-active", Math.abs(val - linePos) < 3);
    });

    var label = snapOverlay.querySelector(".cms-snap-label");
    if (label) label.textContent = Math.round(x) + "% , " + Math.round(y) + "%";
  }

  var SNAP_POINTS = [0, 25, 50, 75, 100];
  var SNAP_THRESH = 4;

  function snapValue(x, y) {
    var sx = x, sy = y;
    SNAP_POINTS.forEach(function (p) {
      if (Math.abs(x - p) < SNAP_THRESH) sx = p;
      if (Math.abs(y - p) < SNAP_THRESH) sy = p;
    });
    return { x: sx, y: sy };
  }

  /* ── intersection observer for animations ───────── */

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

  /* ── inject CMS editing styles ──────────────────── */

  if (isCms) {
    var style = document.createElement("style");
    style.textContent = [
      '.cms-editable { transition: box-shadow .15s; border-radius: 4px; padding: 2px 4px; }',
      '.cms-editable:hover { box-shadow: inset 0 0 0 1.5px rgba(196,165,90,.4); }',
      '.cms-editable:focus { box-shadow: inset 0 0 0 2px rgba(196,165,90,.7); }',

      '.cms-dragging { cursor: grabbing !important; }',
      '.cms-dragging img, .cms-dragging video { pointer-events: none !important; }',

      '[data-cms-drag-bound] { cursor: grab; }',
      '[data-cms-drag-bound]::after {',
        'content: "\\2725 Glisser pour recadrer · Clic pour remplacer";',
        'position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);',
        'padding: 5px 14px; font-size: 11px; font-family: var(--sans);',
        'color: #fff; background: rgba(0,0,0,.75); border-radius: 20px;',
        'pointer-events: none; opacity: 0; transition: opacity .25s; z-index: 10; white-space: nowrap;',
      '}',
      '[data-cms-drag-bound]:hover::after { opacity: 1; }',
      '.cms-dragging::after { opacity: 0 !important; }',

      '.cms-snap-overlay {',
        'position: absolute; z-index: 9998; pointer-events: none; display: none;',
        'border: 1px solid rgba(196,165,90,.15);',
      '}',
      '.cms-snap-line { position: absolute; transition: opacity .1s; opacity: .3; }',
      '.cms-snap-v { top: 0; bottom: 0; width: 1px; background: rgba(196,165,90,.5); }',
      '.cms-snap-h { left: 0; right: 0; height: 1px; background: rgba(196,165,90,.5); }',
      '.cms-snap-active { opacity: 1 !important; background: rgba(196,165,90,1) !important; box-shadow: 0 0 6px rgba(196,165,90,.6); }',

      '.cms-snap-crosshair {',
        'position: absolute; width: 12px; height: 12px; border: 2px solid var(--gold);',
        'border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none;',
        'box-shadow: 0 0 0 3px rgba(0,0,0,.4);',
      '}',
      '.cms-snap-label {',
        'position: absolute; bottom: 8px; right: 8px; padding: 3px 10px;',
        'font-size: 11px; font-family: monospace; color: var(--gold); background: rgba(0,0,0,.8);',
        'border-radius: 6px; border: 1px solid rgba(196,165,90,.3);',
      '}',

      '.service-card:hover { transform: none !important; }',
      '.contact__cta { cursor: text; }',
    ].join('\n');
    document.head.appendChild(style);
  }

})();
