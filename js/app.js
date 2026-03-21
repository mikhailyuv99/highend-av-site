/* ============================================================
   Generic CMS-Compatible Client-Side Loader
   In CMS mode: loads cms-embed.js from the CMS server
   (all editing logic lives there, fixes propagate automatically).
   In standalone mode: renders content.json for the production site.

   Works with ANY section names — discovers editable elements
   via data-cms-field, data-cms-media, data-cms-list attributes.
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
  var META_KEYS = { sectionOrder: 1, sectionSizes: 1, theme: 1, pageOrder: 1, pages: 1 };

  function resolveUrl(raw) {
    if (!raw) return "";
    if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
    try { return new URL(raw, ORIGIN + "/").href; } catch (_) { return raw; }
  }
  function pageData(slug) { return !content ? {} : content.pages ? (content.pages[slug] || {}) : content; }
  function esc(s) { var d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

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

  /* ── helpers ── */
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

  function applyCardTransform(card, pos, size) {
    var px = pos ? (pos.x || 0) : 0, py = pos ? (pos.y || 0) : 0;
    var sz = size || 1;
    var t = "";
    if (px || py) t += "translate(" + px + "px, " + py + "px) ";
    if (sz !== 1) t += "scale(" + sz + ")";
    t = t.trim();
    if (t) { card.style.transform = t; card.style.setProperty("--cms-translate", t); }
  }

  /* ── clear + render ── */
  function clearAll() {
    document.querySelectorAll("[data-cms-field]").forEach(function (el) { el.textContent = ""; });
    document.querySelectorAll("[data-cms-media]").forEach(function (container) {
      var rt = container.querySelector("[data-cms-render]");
      if (rt) { rt.innerHTML = ""; } else { container.innerHTML = ""; }
    });
    document.querySelectorAll("[data-cms-list]").forEach(function (el) { el.innerHTML = ""; });
    document.querySelectorAll("[data-section]").forEach(function (sec) { sec.style.display = "none"; });
  }

  function renderPage(d) {
    clearAll(); if (!d) return;
    var keys = Object.keys(d);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (META_KEYS[key]) continue;
      var val = d[key];
      if (!val || typeof val !== "object" || Array.isArray(val)) continue;
      var sec = document.querySelector('[data-section="' + key + '"]');
      if (sec) renderSection(key, val);
    }
    if (d.sectionOrder) applySectionOrder(d.sectionOrder);
    if (d.sectionSizes) applySectionSizes(d.sectionSizes);
    requestAnimationFrame(observeAnims);
  }

  function renderSection(sectionName, data) {
    var sec = document.querySelector('[data-section="' + sectionName + '"]');
    if (!sec) return;
    sec.style.display = "";

    /* — text fields — */
    sec.querySelectorAll("[data-cms-field]").forEach(function (el) {
      var field = el.getAttribute("data-cms-field");
      if (data[field] != null) el.textContent = data[field];

      var hrefField = el.getAttribute("data-cms-href");
      if (hrefField && data[hrefField] && el.tagName === "A") {
        el.href = "mailto:" + data[hrefField];
      }

      applyPos(el, data[field + "Position"]);
      applySize(el, data[field + "Size"]);
    });

    /* — media containers — */
    sec.querySelectorAll("[data-cms-media]").forEach(function (container) {
      var mediaType = container.getAttribute("data-cms-media");
      var srcField = container.getAttribute("data-cms-src") || (mediaType === "image" ? "image" : "video");
      var posField = srcField === "image" ? "imagePosition" : "videoPosition";
      var posterField = container.getAttribute("data-cms-poster") || null;

      var renderTarget = container.querySelector("[data-cms-render]") || container;
      renderTarget.innerHTML = "";

      var src = data[srcField];
      if (src) {
        var mediaEl;
        if (mediaType === "image") {
          mediaEl = document.createElement("img");
          mediaEl.src = resolveUrl(src);
          mediaEl.alt = "";
          mediaEl.loading = "eager";
        } else if (mediaType === "video") {
          mediaEl = document.createElement("video");
          mediaEl.src = resolveUrl(src);
          mediaEl.controls = true;
          mediaEl.playsInline = true;
          mediaEl.preload = "auto";
          mediaEl.setAttribute("playsinline", "");
          if (posterField && data[posterField]) mediaEl.poster = resolveUrl(data[posterField]);
        } else if (mediaType === "videoLoop") {
          mediaEl = document.createElement("video");
          mediaEl.src = resolveUrl(src);
          mediaEl.autoplay = true;
          mediaEl.muted = true;
          mediaEl.loop = true;
          mediaEl.playsInline = true;
          mediaEl.preload = "auto";
          mediaEl.setAttribute("playsinline", "");
        }

        if (mediaEl) {
          applyCrop(mediaEl, data[posField]);
          renderTarget.appendChild(mediaEl);
          if (mediaType === "videoLoop") mediaEl.play().catch(function () {});
        }
      }

      if (data.mediaSize && data.mediaSize !== 1) {
        container.style.transform = "scale(" + data.mediaSize + ")";
        container.style.transformOrigin = "center center";
      }

      if (!container.getAttribute("data-cms-media").match(/image|videoLoop/) && data.mediaPosition) {
        applyPos(container, data.mediaPosition);
      }
    });

    /* — card lists — */
    sec.querySelectorAll("[data-cms-list]").forEach(function (list) {
      var listField = list.getAttribute("data-cms-list");
      var items = data[listField];
      if (!items || !Array.isArray(items)) return;

      var tmpl = sec.querySelector('template[data-cms-card="' + listField + '"]');
      if (!tmpl) return;

      list.innerHTML = "";
      items.forEach(function (item) {
        var clone = tmpl.content.cloneNode(true);
        var card = clone.firstElementChild;
        if (!card) return;

        card.querySelectorAll("[data-cms-card-field]").forEach(function (el) {
          var f = el.getAttribute("data-cms-card-field");
          if (item[f] != null) el.textContent = item[f];
        });

        list.appendChild(card);
        applyCardTransform(card, item.position, item.size);
      });
    });
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
      if (sec && sizes[name]) {
        sec.style.height = sizes[name] + "px";
        sec.style.minHeight = "0";
        sec.style.overflow = "hidden";
      }
    });
  }

  var obs = null;
  function observeAnims() {
    if (obs) obs.disconnect();
    obs = new IntersectionObserver(function (entries) { entries.forEach(function (entry) { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); obs.unobserve(entry.target); } }); }, { threshold: 0.12 });
    document.querySelectorAll("[data-anim]").forEach(function (el) { if (!el.classList.contains("is-visible")) obs.observe(el); });
  }
})();
