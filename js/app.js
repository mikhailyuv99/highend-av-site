/* ============================================================
   OBSCURA — CMS-Compatible Client-Side App
   PostMessage protocol: CMS_READY, CMS_CONTENT,
   CMS_PATCH, CMS_PAGE, CMS_UPLOAD_REQUEST, CMS_SAVE
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
        c.appendChild(img);
      }
    }
    bindMedia("hero-media-zone", "hero");
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
        c.appendChild(v);
        v.play().catch(function () {});
      }
    }
    bindMedia("video-loop-media", "videoLoop-video");
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
        c.appendChild(img);
      }
    }
    bindMedia("about-media-zone", "about");
  }

  /* ── services ───────────────────────────────────── */

  function renderServices(d) {
    show("services");
    setTxt("services-title", d.title);
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

  /* ── inline editing ─────────────────────────────── */

  function wireText(id, section, field) {
    var el = document.getElementById(id);
    if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true";
    el.dataset.cmsInline = "true";
    el.dataset.cmsWired = "true";
    el.spellcheck = false;
    el.style.outline = "none";

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
    wireText("hero-title",      "hero",     "title");
    wireText("hero-subtitle",   "hero",     "subtitle");
    wireText("video-loop-title","videoLoop", "title");
    wireText("video-play-title","videoPlay", "title");
    wireText("about-title",     "about",    "title");
    wireText("about-text",      "about",    "text");
    wireText("services-title",  "services", "title");
    wireText("contact-title",   "contact",  "title");
    wireText("contact-text",    "contact",  "text");
    wireText("contact-email",   "contact",  "email");
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
      var isVideo = e.target.tagName === "VIDEO";
      if (isVideo && !e.shiftKey) return;
      e.preventDefault();
      var key = uploadKey;
      if (e.altKey && e.shiftKey && uploadKey === "videoPlay-video") key = "videoPlay-poster";
      postToParent({ type: "CMS_UPLOAD_REQUEST", source: "cms-site", uploadKey: key });
    });
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

})();
