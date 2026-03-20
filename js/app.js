/* ============================================================
   OBSCURA — CMS-Compatible Client-Side App
   Full inline editing: text, media, drag-to-position, snap grid
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

    wiredEls = {};
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
    if (badge) badge.textContent = d.badge || badge.textContent;
    applyPos(".hero__content", d.contentPosition);
    bindMedia("hero-media-zone", "hero");
    if (isCms) bindDragMedia("hero-media", "hero", "imagePosition");
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
    bindMedia("video-loop-media", "videoLoop-video");
    if (isCms) bindDragMedia("video-loop-media", "videoLoop", "videoPosition");
  }

  /* ── video play ─────────────────────────────────── */

  function renderVideoPlay(d) {
    show("videoPlay");
    setTxt("video-play-title", d.title);
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
    bindMedia("video-play-media", "videoPlay-video");
  }

  /* ── about ──────────────────────────────────────── */

  function renderAbout(d) {
    show("about");
    setTxt("about-title", d.title);
    setTxt("about-text", d.text);
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
    applyPos(".about__text", d.contentPosition);
    bindMedia("about-media-zone", "about");
    if (isCms) bindDragMedia("about-media", "about", "imagePosition");
  }

  /* ── services ───────────────────────────────────── */

  function renderServices(d) {
    show("services");
    setTxt("services-title", d.title);
    var list = document.getElementById("services-list");
    if (!list || !d.items) return;
    list.innerHTML = "";
    d.items.forEach(function (item, idx) {
      var card = document.createElement("div");
      card.className = "service-card";
      card.dataset.cardIndex = idx;
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

  /* ── position helper ──────────────────────────── */

  function applyPos(selector, pos) {
    if (!pos) return;
    var el = document.querySelector(selector);
    if (!el) return;
    el.style.transform = "translate(" + (pos.x || 0) + "px, " + (pos.y || 0) + "px)";
  }

  /* ============================================================
     INLINE EDITING SYSTEM
     ============================================================ */

  var wiredEls = {};

  function wireText(id, section, field) {
    if (wiredEls[id]) return;
    var el = document.getElementById(id);
    if (!el) return;
    wiredEls[id] = true;
    el.contentEditable = "true";
    el.dataset.cmsInline = "true";
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
    var cards = list.querySelectorAll(".service-card");
    cards.forEach(function (card, idx) {
      var titleEl = card.querySelector(".service-card__title");
      var descEl = card.querySelector(".service-card__description");
      if (titleEl && !titleEl.dataset.cmsWired) {
        titleEl.contentEditable = "true";
        titleEl.dataset.cmsWired = "true";
        titleEl.spellcheck = false;
        titleEl.style.outline = "none";
        titleEl.classList.add("cms-editable");
        wireCardField(titleEl, idx, "title");
      }
      if (descEl && !descEl.dataset.cmsWired) {
        descEl.contentEditable = "true";
        descEl.dataset.cmsWired = "true";
        descEl.spellcheck = false;
        descEl.style.outline = "none";
        descEl.classList.add("cms-editable");
        wireCardField(descEl, idx, "description");
      }
    });
  }

  function wireCardField(el, cardIndex, field) {
    var timer = null;
    function emitPatch() {
      var d = pageData(currentSlug);
      if (!d || !d.services || !d.services.items) return;
      var items = d.services.items.slice();
      if (!items[cardIndex]) return;
      items[cardIndex] = Object.assign({}, items[cardIndex]);
      items[cardIndex][field] = el.textContent;
      var patch = { services: { items: items } };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });
    }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emitPatch, 350); });
    el.addEventListener("blur", function () { clearTimeout(timer); emitPatch(); });
  }

  function wireCta() {
    var cta = document.getElementById("contact-cta");
    if (!cta || cta.dataset.cmsWired) return;
    cta.contentEditable = "true";
    cta.dataset.cmsWired = "true";
    cta.spellcheck = false;
    cta.style.outline = "none";
    cta.classList.add("cms-editable");
    cta.addEventListener("click", function (e) {
      if (isCms) e.preventDefault();
    });
    var timer = null;
    function emitPatch() {
      var patch = { contact: { cta: cta.textContent } };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });
    }
    cta.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emitPatch, 350); });
    cta.addEventListener("blur", function () { clearTimeout(timer); emitPatch(); });
  }

  function wireBadge() {
    var badge = document.querySelector(".hero__badge");
    if (!badge || badge.dataset.cmsWired) return;
    badge.contentEditable = "true";
    badge.dataset.cmsWired = "true";
    badge.spellcheck = false;
    badge.style.outline = "none";
    badge.classList.add("cms-editable");
    var timer = null;
    function emitPatch() {
      var patch = { hero: { badge: badge.textContent } };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });
    }
    badge.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emitPatch, 350); });
    badge.addEventListener("blur", function () { clearTimeout(timer); emitPatch(); });
  }

  function wireLabel(selector, section, field) {
    var el = document.querySelector(selector);
    if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true";
    el.dataset.cmsWired = "true";
    el.spellcheck = false;
    el.style.outline = "none";
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
    wireBadge();
    wireServiceCards();
    wireLabel(".video-play__label", "videoPlay", "label");
    wireLabel(".about__eyebrow",    "about",     "eyebrow");
    wireLabel(".services__eyebrow", "services",  "eyebrow");
  }

  /* ── media click → upload ───────────────────────── */

  function bindMedia(id, uploadKey) {
    if (!isCms) return;
    var zone = document.getElementById(id);
    if (!zone || zone.dataset.cmsMediaBound) return;
    zone.dataset.cmsMedia = "true";
    zone.dataset.cmsMediaBound = "true";
    zone.style.cursor = "pointer";

    zone.addEventListener("click", function (e) {
      if (activeDrag) return;
      var isVideo = e.target.tagName === "VIDEO";
      if (isVideo && !e.shiftKey) return;
      e.preventDefault();
      var key = uploadKey;
      if (e.shiftKey && uploadKey === "videoPlay-video") key = "videoPlay-poster";
      postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: key });
    });
  }

  /* ============================================================
     DRAG-TO-POSITION SYSTEM (object-position for images/videos)
     ============================================================ */

  var activeDrag = null;

  function bindDragMedia(containerId, section, posField) {
    var container = document.getElementById(containerId);
    if (!container || container.dataset.cmsDragBound) return;
    container.dataset.cmsDragBound = "true";

    function getMediaEl() {
      return container.querySelector("img, video");
    }

    function startDrag(startX, startY, e) {
      var media = getMediaEl();
      if (!media) return;

      if (e && e.target && e.target.tagName === "VIDEO" && e.target.controls) {
        var rect = e.target.getBoundingClientRect();
        var bottomBar = rect.bottom - 40;
        if ((e.clientY || startY) > bottomBar) return;
      }

      e && e.preventDefault && e.preventDefault();

      var style = window.getComputedStyle(media);
      var pos = style.objectPosition || "50% 50%";
      var parts = pos.split(/\s+/);
      var startPx = parseFloat(parts[0]) || 50;
      var startPy = parseFloat(parts[1]) || 50;

      if (pos.indexOf("px") === -1) {
        startPx = parseFloat(parts[0]) || 50;
        startPy = parseFloat(parts[1]) || 50;
      }

      var dragState = { media: media, sx: startX, sy: startY, px: startPx, py: startPy };
      activeDrag = dragState;

      container.classList.add("cms-dragging");
      media.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      showSnapGrid(container.closest("[data-section]") || container);
    }

    function onMove(clientX, clientY) {
      if (!activeDrag) return;
      var dx = clientX - activeDrag.sx;
      var dy = clientY - activeDrag.sy;
      var sens = 0.15;
      var nx = clamp(activeDrag.px - dx * sens, 0, 100);
      var ny = clamp(activeDrag.py - dy * sens, 0, 100);

      var snapped = snapValue(nx, ny);
      activeDrag.media.style.objectPosition = snapped.x + "% " + snapped.y + "%";
      updateSnapIndicators(snapped.x, snapped.y);
    }

    function endDrag() {
      if (!activeDrag) return;
      var media = activeDrag.media;
      var pos = media.style.objectPosition || "50% 50%";
      var parts = pos.split(/\s+/);
      var fx = Math.round(parseFloat(parts[0]));
      var fy = Math.round(parseFloat(parts[1]));

      container.classList.remove("cms-dragging");
      media.style.cursor = "";
      document.body.style.userSelect = "";
      hideSnapGrid();

      var patch = {};
      patch[section] = {};
      patch[section][posField] = { x: fx, y: fy };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });
      activeDrag = null;
    }

    container.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      startDrag(e.clientX, e.clientY, e);
    });
    container.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      startDrag(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: false });

    document.addEventListener("mousemove", function (e) {
      if (activeDrag && activeDrag.media.closest("#" + containerId)) onMove(e.clientX, e.clientY);
    });
    document.addEventListener("touchmove", function (e) {
      if (activeDrag && activeDrag.media.closest("#" + containerId) && e.touches.length === 1) {
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    document.addEventListener("mouseup", function () {
      if (activeDrag && activeDrag.media.closest("#" + containerId)) endDrag();
    });
    document.addEventListener("touchend", function () {
      if (activeDrag && activeDrag.media.closest("#" + containerId)) endDrag();
    });
  }

  /* ============================================================
     DRAG-TO-MOVE SYSTEM (elements within section)
     ============================================================ */

  function bindDragElement(el, section, posField) {
    if (!isCms || !el || el.dataset.cmsDragElBound) return;
    el.dataset.cmsDragElBound = "true";
    el.classList.add("cms-movable");

    var dragEl = null;

    function startDrag(clientX, clientY, e) {
      if (el.contentEditable === "true" && document.activeElement === el) return;
      e && e.preventDefault && e.preventDefault();

      var rect = el.getBoundingClientRect();
      var parentRect = (el.closest("[data-section]") || el.parentElement).getBoundingClientRect();

      dragEl = {
        el: el,
        sx: clientX,
        sy: clientY,
        origX: rect.left - parentRect.left,
        origY: rect.top - parentRect.top,
        pw: parentRect.width,
        ph: parentRect.height,
        tx: parseFloat(el.dataset.cmsOffX) || 0,
        ty: parseFloat(el.dataset.cmsOffY) || 0
      };

      el.classList.add("cms-element-dragging");
      document.body.style.userSelect = "none";
      showSnapGrid(el.closest("[data-section]") || el.parentElement);
    }

    el.addEventListener("mousedown", function (e) {
      if (e.target.contentEditable === "true" && e.detail >= 2) return;
      if (e.button !== 0 || e.target.closest("[contenteditable='true']")) return;
      startDrag(e.clientX, e.clientY, e);
    });

    el.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      var longPress = setTimeout(function () {
        startDrag(e.touches[0].clientX, e.touches[0].clientY, e);
      }, 300);
      el.addEventListener("touchend", function cancel() {
        clearTimeout(longPress);
        el.removeEventListener("touchend", cancel);
      }, { once: true });
      el.addEventListener("touchmove", function cancel() {
        clearTimeout(longPress);
        el.removeEventListener("touchmove", cancel);
      }, { once: true });
    }, { passive: true });

    document.addEventListener("mousemove", function (e) {
      if (!dragEl || dragEl.el !== el) return;
      var dx = e.clientX - dragEl.sx;
      var dy = e.clientY - dragEl.sy;
      var nx = dragEl.tx + dx;
      var ny = dragEl.ty + dy;
      el.style.transform = "translate(" + nx + "px, " + ny + "px)";
      el.dataset.cmsOffX = nx;
      el.dataset.cmsOffY = ny;
    });

    document.addEventListener("touchmove", function (e) {
      if (!dragEl || dragEl.el !== el || e.touches.length !== 1) return;
      e.preventDefault();
      var dx = e.touches[0].clientX - dragEl.sx;
      var dy = e.touches[0].clientY - dragEl.sy;
      var nx = dragEl.tx + dx;
      var ny = dragEl.ty + dy;
      el.style.transform = "translate(" + nx + "px, " + ny + "px)";
      el.dataset.cmsOffX = nx;
      el.dataset.cmsOffY = ny;
    }, { passive: false });

    function endDrag() {
      if (!dragEl || dragEl.el !== el) return;
      el.classList.remove("cms-element-dragging");
      document.body.style.userSelect = "";
      hideSnapGrid();

      var fx = Math.round(parseFloat(el.dataset.cmsOffX) || 0);
      var fy = Math.round(parseFloat(el.dataset.cmsOffY) || 0);

      var patch = {};
      patch[section] = {};
      patch[section][posField] = { x: fx, y: fy };
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentSlug, patch: patch });
      dragEl = null;
    }

    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchend", endDrag);
  }

  /* ============================================================
     SNAP GRID OVERLAY
     ============================================================ */

  var snapOverlay = null;
  var snapLines = {};

  function createSnapOverlay() {
    if (snapOverlay) return;
    snapOverlay = document.createElement("div");
    snapOverlay.className = "cms-snap-overlay";
    snapOverlay.innerHTML =
      '<div class="cms-snap-line cms-snap-v cms-snap-v-left" data-snap="0"></div>' +
      '<div class="cms-snap-line cms-snap-v cms-snap-v-center" data-snap="50"></div>' +
      '<div class="cms-snap-line cms-snap-v cms-snap-v-right" data-snap="100"></div>' +
      '<div class="cms-snap-line cms-snap-h cms-snap-h-top" data-snap="0"></div>' +
      '<div class="cms-snap-line cms-snap-h cms-snap-h-center" data-snap="50"></div>' +
      '<div class="cms-snap-line cms-snap-h cms-snap-h-bottom" data-snap="100"></div>' +
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
    var lines = snapOverlay.querySelectorAll(".cms-snap-line");
    lines.forEach(function (line) {
      var snapVal = parseFloat(line.dataset.snap);
      var isV = line.classList.contains("cms-snap-v");
      var val = isV ? x : y;
      var dist = Math.abs(val - snapVal);
      line.classList.toggle("cms-snap-active", dist < 3);
    });
    var label = snapOverlay.querySelector(".cms-snap-label");
    if (label) label.textContent = Math.round(x) + "%, " + Math.round(y) + "%";
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

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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
    style.textContent =
      /* editable text hover */
      '.cms-editable { transition: box-shadow .15s; border-radius: 4px; }' +
      '.cms-editable:hover { box-shadow: inset 0 0 0 1.5px rgba(196,165,90,.45); }' +
      '.cms-editable:focus { box-shadow: inset 0 0 0 2px rgba(196,165,90,.7); }' +

      /* movable elements */
      '.cms-movable { cursor: grab; }' +
      '.cms-element-dragging { cursor: grabbing !important; opacity: .85; z-index: 50; }' +

      /* dragging media (object-position) */
      '.cms-dragging { cursor: grabbing !important; }' +
      '.cms-dragging img, .cms-dragging video { cursor: grabbing !important; pointer-events: none; }' +

      /* media hover hint */
      '[data-cms-media-bound] { position: relative; }' +
      '[data-cms-drag-bound]::after {' +
        'content: "\\2725 Glisser pour recadrer"; position: absolute; bottom: 8px; left: 50%;' +
        'transform: translateX(-50%); padding: 4px 12px; font-size: 11px; font-family: var(--sans);' +
        'color: #fff; background: rgba(0,0,0,.7); border-radius: 20px; pointer-events: none;' +
        'opacity: 0; transition: opacity .25s; z-index: 10; white-space: nowrap;' +
      '}' +
      '[data-cms-drag-bound]:hover::after { opacity: 1; }' +

      /* snap overlay */
      '.cms-snap-overlay {' +
        'position: absolute; z-index: 9998; pointer-events: none; display: none;' +
      '}' +
      '.cms-snap-line {' +
        'position: absolute; background: rgba(196,165,90,.2); transition: background .1s, box-shadow .1s;' +
      '}' +
      '.cms-snap-v { top: 0; bottom: 0; width: 1px; }' +
      '.cms-snap-h { left: 0; right: 0; height: 1px; }' +
      '.cms-snap-v-left { left: 0; }' +
      '.cms-snap-v-center { left: 50%; }' +
      '.cms-snap-v-right { right: 0; }' +
      '.cms-snap-h-top { top: 0; }' +
      '.cms-snap-h-center { top: 50%; }' +
      '.cms-snap-h-bottom { bottom: 0; }' +
      '.cms-snap-active { background: rgba(196,165,90,.8) !important; box-shadow: 0 0 8px rgba(196,165,90,.5); }' +
      '.cms-snap-label {' +
        'position: absolute; bottom: 12px; right: 12px; padding: 3px 10px;' +
        'font-size: 11px; font-family: monospace; color: #fff; background: rgba(0,0,0,.75);' +
        'border-radius: 6px; z-index: 10;' +
      '}' +

      /* media zones styling in CMS */
      '[data-cms-media="true"] { position: relative; }' +
      '[data-cms-media="true"]::before {' +
        'content: "Clic = remplacer · Shift+Clic sur vidéo = remplacer";' +
        'position: absolute; top: 8px; left: 50%; transform: translateX(-50%);' +
        'padding: 4px 12px; font-size: 11px; font-family: var(--sans);' +
        'color: #fff; background: rgba(0,0,0,.7); border-radius: 20px;' +
        'pointer-events: none; opacity: 0; transition: opacity .25s; z-index: 10; white-space: nowrap;' +
      '}' +
      '[data-cms-media="true"]:hover::before { opacity: 1; }' +

      /* disable hover transforms in CMS edit mode */
      '.service-card:hover { transform: none !important; }';

    document.head.appendChild(style);
  }

})();
