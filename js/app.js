/* ============================================================
   OBSCURA — Client-Side Loader
   In CMS mode: loads cms-embed.js from the CMS server
   (all editing logic lives there, fixes propagate automatically).
   In standalone mode: renders content.json for the production site.
   ============================================================ */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var isCms = params.get("cmsEmbed") === "1";
  var parentOrigin = params.get("parentOrigin") || null;

  /* ── CMS mode: delegate everything to the centralized embed ── */
  if (isCms && parentOrigin) {
    var s = document.createElement("script");
    s.src = parentOrigin + "/cms-embed.js";
    s.onerror = function () { console.error("[CMS] Failed to load cms-embed.js from " + parentOrigin); };
    document.body.appendChild(s);
    return;
  }

  /* ============================================================
     STANDALONE MODE — render content.json for production site
     ============================================================ */
  var ORIGIN = window.location.origin;
  var content = null;
  var currentSlug = "index";
  var ALL = ["hero", "videoLoop", "videoPlay", "about", "services", "contact"];

  function resolveUrl(raw) {
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    try { return new URL(raw, ORIGIN + "/").href; } catch (_) { return raw; }
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pageData(slug) { return !content ? {} : content.pages ? (content.pages[slug] || {}) : content; }

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
    if (slug && slug !== currentSlug) { currentSlug = slug; renderPage(pageData(slug)); activateNav(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });
  window.addEventListener("hashchange", function () {
    var slug = window.location.hash.replace("#", "") || "index";
    if (content && content.pages && content.pages[slug] && slug !== currentSlug) { currentSlug = slug; renderPage(pageData(slug)); activateNav(); }
  });

  fetch("content.json?v=" + Date.now()).then(function (r) { return r.json(); }).then(function (data) {
    content = data; var hash = window.location.hash.replace("#", ""); if (hash && content.pages && content.pages[hash]) currentSlug = hash;
    renderPage(pageData(currentSlug)); activateNav();
  }).catch(function (err) { console.error("[OBSCURA] content.json load error", err); });

  /* ── render ── */
  function show(s) { var el = document.querySelector('[data-section="' + s + '"]'); if (el) el.style.display = ""; }
  function setTxt(id, val) { var el = document.getElementById(id); if (el) el.textContent = val || ""; }
  function esc(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

  function applyPos(el, pos) {
    if (!el || !pos) return;
    if (typeof el === "string") el = document.querySelector(el);
    if (!el) return;
    var x = pos.x || 0, y = pos.y || 0;
    if (x === 0 && y === 0) return;
    var t = "translate(" + x + "px, " + y + "px)";
    el.style.setProperty("--cms-translate", t);
    el.style.transform = t;
  }

  function applyCrop(media, pos) {
    if (!media) return;
    var x = pos ? (pos.x != null ? pos.x : 50) : 50;
    var y = pos ? (pos.y != null ? pos.y : 50) : 50;
    if (x !== 50 || y !== 50) {
      if (media.tagName === "VIDEO" && media.controls) {
        media.style.objectFit = "cover";
        media.style.objectPosition = x + "% " + y + "%";
      } else {
        media.style.width = "130%"; media.style.height = "130%"; media.style.maxWidth = "none";
        media.style.position = "absolute"; media.style.top = "-15%"; media.style.left = "-15%";
        media.style.right = "auto"; media.style.bottom = "auto"; media.style.objectFit = "cover";
        media.style.animation = "none";
        media.style.transform = "translate(" + ((50 - x) * 0.3) + "%, " + ((50 - y) * 0.3) + "%)";
      }
    }
  }

  function applySize(el, size) {
    if (!el || !size || size === 1) return;
    var base = parseFloat(window.getComputedStyle(el).fontSize);
    el.style.fontSize = (base * size) + "px";
  }

  function clearAll() {
    ["hero-title", "hero-subtitle", "hero-media", "video-loop-title", "video-loop-media", "video-play-title", "about-title", "about-text", "about-media", "services-title", "services-list", "contact-title", "contact-text", "contact-email", "contact-cta"].forEach(function (id) {
      var el = document.getElementById(id); if (!el) return; if (id === "services-list") { el.innerHTML = ""; return; } el.textContent = "";
    });
    var vpm = document.getElementById("video-play-media");
    if (vpm) { var glow = vpm.querySelector(".video-play__glow"); vpm.innerHTML = ""; if (glow) vpm.appendChild(glow); }
    ALL.forEach(function (s) { var sec = document.querySelector('[data-section="' + s + '"]'); if (sec) sec.style.display = "none"; });
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
    if (d.sectionSizes) applySectionSizes(d.sectionSizes);
    requestAnimationFrame(observeAnims);
  }

  function renderHero(d) {
    show("hero"); setTxt("hero-title", d.title); setTxt("hero-subtitle", d.subtitle);
    var badge = document.querySelector(".hero__badge"); if (badge) badge.textContent = d.badge || "Production Audiovisuelle";
    var c = document.getElementById("hero-media");
    if (c) { c.innerHTML = ""; if (d.image) { var img = document.createElement("img"); img.className = "hero__image"; img.src = resolveUrl(d.image); img.alt = ""; img.loading = "eager"; applyCrop(img, d.imagePosition); c.appendChild(img); } }
    applyPos("#hero-title", d.titlePosition); applyPos("#hero-subtitle", d.subtitlePosition); applyPos(".hero__badge", d.badgePosition); applyPos(".hero__content", d.contentPosition);
    applySize(document.getElementById("hero-title"), d.titleSize); applySize(document.getElementById("hero-subtitle"), d.subtitleSize); applySize(document.querySelector(".hero__badge"), d.badgeSize);
  }

  function renderVideoLoop(d) {
    show("videoLoop"); setTxt("video-loop-title", d.title);
    var c = document.getElementById("video-loop-media");
    if (c) { c.innerHTML = ""; if (d.video) { var v = document.createElement("video"); v.src = resolveUrl(d.video); v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", ""); applyCrop(v, d.videoPosition); c.appendChild(v); v.play().catch(function () {}); } }
    applyPos("#video-loop-title", d.titlePosition); applySize(document.getElementById("video-loop-title"), d.titleSize);
  }

  function renderVideoPlay(d) {
    show("videoPlay"); setTxt("video-play-title", d.title);
    var lbl = document.querySelector(".video-play__label"); if (lbl) lbl.textContent = d.label || "Showreel";
    var c = document.getElementById("video-play-media");
    if (c) { var glow = c.querySelector(".video-play__glow"); c.innerHTML = ""; if (glow) c.appendChild(glow); if (d.video) { var v = document.createElement("video"); v.src = resolveUrl(d.video); v.controls = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", ""); if (d.poster) v.poster = resolveUrl(d.poster); applyCrop(v, d.videoPosition); c.appendChild(v); } }
    applyPos("#video-play-media", d.mediaPosition);
    applyPos("#video-play-title", d.titlePosition); applyPos(".video-play__label", d.labelPosition);
    applySize(document.getElementById("video-play-title"), d.titleSize); applySize(document.querySelector(".video-play__label"), d.labelSize);
  }

  function renderAbout(d) {
    show("about"); setTxt("about-title", d.title); setTxt("about-text", d.text);
    var ey = document.querySelector(".about__eyebrow"); if (ey) ey.textContent = d.eyebrow || "\u00C0 propos";
    var c = document.getElementById("about-media");
    if (c) { c.innerHTML = ""; if (d.image) { var img = document.createElement("img"); img.className = "about__image"; img.src = resolveUrl(d.image); img.alt = ""; applyCrop(img, d.imagePosition); c.appendChild(img); } }
    applyPos("#about-title", d.titlePosition); applyPos("#about-text", d.textPosition); applyPos(".about__eyebrow", d.eyebrowPosition);
    applySize(document.getElementById("about-title"), d.titleSize); applySize(document.getElementById("about-text"), d.textSize); applySize(document.querySelector(".about__eyebrow"), d.eyebrowSize);
  }

  function applyCardTransform(card, pos, size) {
    var px = pos ? (pos.x || 0) : 0, py = pos ? (pos.y || 0) : 0;
    var sz = size || 1;
    var t = "";
    if (px || py) t += "translate(" + px + "px, " + py + "px) ";
    if (sz !== 1) t += "scale(" + sz + ")";
    t = t.trim();
    if (t) { card.style.transform = t; card.style.setProperty("--cms-translate", t); }
  }

  function renderServices(d) {
    show("services"); setTxt("services-title", d.title);
    var ey = document.querySelector(".services__eyebrow"); if (ey) ey.textContent = d.eyebrow || "Expertise";
    var list = document.getElementById("services-list"); if (!list || !d.items) return;
    list.innerHTML = "";
    d.items.forEach(function (item) {
      var card = document.createElement("div"); card.className = "service-card";
      card.innerHTML = '<h3 class="service-card__title">' + esc(item.title) + '</h3><p class="service-card__description">' + esc(item.description) + '</p>';
      list.appendChild(card);
      applyCardTransform(card, item.position, item.size);
    });
    applyPos("#services-title", d.titlePosition); applyPos(".services__eyebrow", d.eyebrowPosition);
    applySize(document.getElementById("services-title"), d.titleSize); applySize(document.querySelector(".services__eyebrow"), d.eyebrowSize);
  }

  function renderContact(d) {
    show("contact"); setTxt("contact-title", d.title); setTxt("contact-text", d.text);
    var emailEl = document.getElementById("contact-email"); if (emailEl) emailEl.textContent = d.email || "";
    var cta = document.getElementById("contact-cta"); if (cta) { cta.textContent = d.cta || d.buttonLabel || ""; cta.href = d.email ? "mailto:" + d.email : "#"; }
    applyPos("#contact-title", d.titlePosition); applyPos("#contact-text", d.textPosition); applyPos("#contact-cta", d.ctaPosition);
    applySize(document.getElementById("contact-title"), d.titleSize); applySize(document.getElementById("contact-text"), d.textSize); applySize(document.getElementById("contact-cta"), d.ctaSize);
  }

  function applySectionOrder(order) {
    if (!order || !order.length) return;
    var main = document.querySelector("main"); if (!main) return;
    for (var i = order.length - 1; i >= 0; i--) {
      var sec = document.querySelector('[data-section="' + order[i] + '"]');
      if (sec) main.insertBefore(sec, main.querySelector("[data-section]"));
    }
  }

  function applySectionSizes(sizes) {
    if (!sizes) return;
    Object.keys(sizes).forEach(function (name) {
      var sec = document.querySelector('[data-section="' + name + '"]');
      if (sec && sizes[name]) sec.style.paddingBottom = sizes[name] + "rem";
    });
  }

  var obs = null;
  function observeAnims() {
    if (obs) obs.disconnect();
    obs = new IntersectionObserver(function (entries) { entries.forEach(function (entry) { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); obs.unobserve(entry.target); } }); }, { threshold: 0.12 });
    document.querySelectorAll("[data-anim]").forEach(function (el) { if (!el.classList.contains("is-visible")) obs.observe(el); });
  }
})();
