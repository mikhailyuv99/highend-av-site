/* ============================================================
   OBSCURA — CMS-Compatible Client-Side App
   Full postMessage protocol: CMS_READY, CMS_CONTENT,
   CMS_PATCH, CMS_PAGE, CMS_UPLOAD_REQUEST
   ============================================================ */

(function () {
  "use strict";

  /* --------------------------------------------------------
     ENV / HELPERS
     -------------------------------------------------------- */
  const params = new URLSearchParams(window.location.search);
  const isCmsEmbed = params.get("cmsEmbed") === "1";
  const parentOriginParam = params.get("parentOrigin") || null;
  const ORIGIN = window.location.origin;
  let cmsParentOrigin = parentOriginParam;

  function resolveUrl(raw) {
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    try { return new URL(raw, ORIGIN + "/").href; } catch (_) { return raw; }
  }

  function normalizeOrigin(o) {
    try {
      const u = new URL(o);
      const host = u.hostname === "127.0.0.1" ? "localhost" : u.hostname;
      return u.protocol + "//" + host + (u.port ? ":" + u.port : "");
    } catch (_) { return o; }
  }

  function isAllowedOrigin(incoming) {
    if (!cmsParentOrigin) return true;
    return normalizeOrigin(incoming) === normalizeOrigin(cmsParentOrigin);
  }

  /* --------------------------------------------------------
     STATE
     -------------------------------------------------------- */
  let content = null;
  let currentPageSlug = params.get("page") || "index";
  const allSections = ["hero", "videoLoop", "videoPlay", "about", "services", "contact"];

  /* --------------------------------------------------------
     NAVIGATION (multi-page hash)
     -------------------------------------------------------- */
  const navEl = document.getElementById("site-nav");

  function activateNav() {
    if (!content || !content.pages) return;
    navEl && (navEl.hidden = false);
    document.querySelectorAll(".site-nav__link").forEach(function (a) {
      a.classList.toggle("active", a.dataset.page === currentPageSlug);
    });
  }

  if (navEl) {
    navEl.addEventListener("click", function (e) {
      var link = e.target.closest(".site-nav__link");
      if (!link) return;
      e.preventDefault();
      var slug = link.dataset.page;
      if (slug && slug !== currentPageSlug) {
        currentPageSlug = slug;
        renderPage(getPageData(slug));
        activateNav();
        window.scrollTo({ top: 0, behavior: "smooth" });
        postToParent({ type: "CMS_PAGE", source: "cms-site", slug: slug });
      }
    });
  }

  window.addEventListener("hashchange", function () {
    var slug = window.location.hash.replace("#", "") || "index";
    if (content && content.pages && content.pages[slug] && slug !== currentPageSlug) {
      currentPageSlug = slug;
      renderPage(getPageData(slug));
      activateNav();
      postToParent({ type: "CMS_PAGE", source: "cms-site", slug: slug });
    }
  });

  /* --------------------------------------------------------
     POST TO PARENT
     -------------------------------------------------------- */
  function postToParent(msg) {
    if (!isCmsEmbed) return;
    var target = cmsParentOrigin || "*";
    try { window.parent.postMessage(msg, target); } catch (_) {
      try { window.parent.postMessage(msg, "*"); } catch (__) { /* noop */ }
    }
  }

  /* --------------------------------------------------------
     CMS EMBED — Listen for CMS_CONTENT
     -------------------------------------------------------- */
  if (isCmsEmbed) {
    window.addEventListener("message", function (e) {
      if (!e.data || e.data.source !== "cms-app") return;
      if (!cmsParentOrigin) cmsParentOrigin = e.origin;
      if (!isAllowedOrigin(e.origin)) return;

      if (e.data.type === "CMS_CONTENT" && e.data.content) {
        content = e.data.content;
        if (e.data.pageSlug) currentPageSlug = e.data.pageSlug;
        renderPage(getPageData(currentPageSlug));
        activateNav();
      }
    });
    postToParent({ type: "CMS_READY", source: "cms-site" });
  }

  /* --------------------------------------------------------
     LOAD CONTENT.JSON (standalone)
     -------------------------------------------------------- */
  if (!isCmsEmbed) {
    fetch("content.json?_=" + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        content = data;
        var hash = window.location.hash.replace("#", "");
        if (hash && content.pages && content.pages[hash]) currentPageSlug = hash;
        renderPage(getPageData(currentPageSlug));
        activateNav();
      })
      .catch(function (err) { console.error("[OBSCURA] content.json load error", err); });
  }

  /* --------------------------------------------------------
     GET PAGE DATA
     -------------------------------------------------------- */
  function getPageData(slug) {
    if (!content) return {};
    if (content.pages) return content.pages[slug] || {};
    return content;
  }

  /* --------------------------------------------------------
     CLEAR ALL SECTIONS
     -------------------------------------------------------- */
  function clearSections() {
    var ids = [
      "hero-title", "hero-subtitle", "hero-media",
      "video-loop-title", "video-loop-media",
      "video-play-title", "video-play-media",
      "about-title", "about-text", "about-media",
      "services-title", "services-list",
      "contact-title", "contact-text", "contact-email", "contact-cta"
    ];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id === "video-play-media") {
        var glow = el.querySelector(".video-play__glow");
        el.innerHTML = "";
        if (glow) el.appendChild(glow);
      } else {
        el.textContent = "";
      }
    });
    allSections.forEach(function (s) {
      var sec = document.querySelector('[data-section="' + s + '"]');
      if (sec) sec.style.display = "none";
    });
  }

  /* --------------------------------------------------------
     RENDER PAGE
     -------------------------------------------------------- */
  function renderPage(data) {
    clearSections();
    if (!data) return;

    if (data.hero) renderHero(data.hero);
    if (data.videoLoop) renderVideoLoop(data.videoLoop);
    if (data.videoPlay) renderVideoPlay(data.videoPlay);
    if (data.about) renderAbout(data.about);
    if (data.services) renderServices(data.services);
    if (data.contact) renderContact(data.contact);

    requestAnimationFrame(observeAnimations);
  }

  /* --------------------------------------------------------
     RENDER FUNCTIONS
     -------------------------------------------------------- */

  function show(section) {
    var el = document.querySelector('[data-section="' + section + '"]');
    if (el) el.style.display = "";
  }

  /* HERO */
  function renderHero(d) {
    show("hero");
    setText("hero-title", d.title);
    setText("hero-subtitle", d.subtitle);
    var container = document.getElementById("hero-media");
    if (!container) return;
    container.innerHTML = "";
    if (d.image) {
      var img = document.createElement("img");
      img.className = "hero__image";
      img.src = resolveUrl(d.image);
      img.alt = "OBSCURA hero";
      img.loading = "eager";
      container.appendChild(img);
    }
    markMedia("hero-media-zone", "hero");
  }

  /* VIDEO LOOP */
  function renderVideoLoop(d) {
    show("videoLoop");
    setText("video-loop-title", d.title);
    var container = document.getElementById("video-loop-media");
    if (!container) return;
    container.innerHTML = "";
    if (d.video) {
      var v = document.createElement("video");
      v.src = resolveUrl(d.video);
      v.autoplay = true;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";
      v.setAttribute("playsinline", "");
      container.appendChild(v);
      v.play().catch(function () {});
    }
    markMedia("video-loop-media", "videoLoop-video");
  }

  /* VIDEO PLAY */
  function renderVideoPlay(d) {
    show("videoPlay");
    setText("video-play-title", d.title);
    var container = document.getElementById("video-play-media");
    if (!container) return;
    var glow = container.querySelector(".video-play__glow");
    container.innerHTML = "";
    if (glow) container.appendChild(glow);
    if (d.video) {
      var v = document.createElement("video");
      v.src = resolveUrl(d.video);
      v.controls = true;
      v.playsInline = true;
      v.preload = "auto";
      v.setAttribute("playsinline", "");
      if (d.poster) v.poster = resolveUrl(d.poster);
      container.appendChild(v);
    }
    markMedia("video-play-media", "videoPlay-video");
  }

  /* ABOUT */
  function renderAbout(d) {
    show("about");
    setText("about-title", d.title);
    setText("about-text", d.text);
    var container = document.getElementById("about-media");
    if (!container) return;
    container.innerHTML = "";
    if (d.image) {
      var img = document.createElement("img");
      img.className = "about__image";
      img.src = resolveUrl(d.image);
      img.alt = "About OBSCURA";
      container.appendChild(img);
    }
    markMedia("about-media-zone", "about");
  }

  /* SERVICES */
  function renderServices(d) {
    show("services");
    setText("services-title", d.title);
    var list = document.getElementById("services-list");
    if (!list || !d.items) return;
    list.innerHTML = "";
    d.items.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "service-card";
      card.innerHTML =
        '<h3 class="service-card__title">' + esc(item.title) + "</h3>" +
        '<p class="service-card__description">' + esc(item.description) + "</p>";
      list.appendChild(card);
    });
  }

  /* CONTACT */
  function renderContact(d) {
    show("contact");
    setText("contact-title", d.title);
    setText("contact-text", d.text);
    var emailEl = document.getElementById("contact-email");
    if (emailEl) emailEl.textContent = d.email || "";
    var cta = document.getElementById("contact-cta");
    if (cta) {
      cta.textContent = d.cta || "";
      cta.href = d.email ? "mailto:" + d.email : "#";
    }
  }

  /* --------------------------------------------------------
     TEXT HELPERS / INLINE EDITING
     -------------------------------------------------------- */
  function setText(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = val || "";
  }
  function esc(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

  function wireText(id, sectionKey, field) {
    var el = document.getElementById(id);
    if (!el || el.dataset.cmsWired) return;
    el.contentEditable = "true";
    el.dataset.cmsInline = "true";
    el.dataset.cmsWired = "true";
    el.spellcheck = false;

    var timer = null;
    function emitPatch() {
      var patch = {};
      patch[sectionKey] = {};
      patch[sectionKey][field] = el.textContent;
      postToParent({ type: "CMS_PATCH", source: "cms-site", pageSlug: currentPageSlug, patch: patch });
    }
    el.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(emitPatch, 400); });
    el.addEventListener("blur", function () { clearTimeout(timer); emitPatch(); });
  }

  /* --------------------------------------------------------
     MEDIA CLICK → CMS_UPLOAD_REQUEST
     -------------------------------------------------------- */
  function markMedia(id, uploadKey) {
    if (!isCmsEmbed) return;
    var zone = document.getElementById(id);
    if (!zone || zone.dataset.cmsMediaWired) return;
    zone.dataset.cmsMedia = "true";
    zone.dataset.cmsMediaWired = "true";
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

  /* --------------------------------------------------------
     WIRE ALL INLINE EDITORS (after each render)
     -------------------------------------------------------- */
  function wireAllEditors() {
    if (!isCmsEmbed) return;
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
  }

  var _origRender = renderPage;
  renderPage = function (data) {
    _origRender(data);
    wireAllEditors();
  };

  /* --------------------------------------------------------
     INTERSECTION OBSERVER — Animations
     -------------------------------------------------------- */
  var observer = null;
  function observeAnimations() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll("[data-anim]").forEach(function (el) {
      if (!el.classList.contains("is-visible")) observer.observe(el);
    });
  }

})();
