(function () {
  var contentPath = 'content.json';
  var cmsEmbed = /[?&]cmsEmbed=1(?:&|$)/.test(window.location.search);
  var embedIsMultiPage = false;
  var embedActivePageSlug = '';
  var parentOriginRuntime = null;
  var wiredHash = false;
  var wiredMediaClicks = false;
  var sectionIds = ['hero', 'videoLoop', 'videoPlay', 'about', 'services', 'contact'];
  var mainEl = document.querySelector('main');
  var sectionEls = {};
  sectionIds.forEach(function (id) { sectionEls[id] = document.getElementById(id); });

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function getTrustedCmsOrigin() {
    try {
      var m = window.location.search.match(/[?&]parentOrigin=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (e1) {}
    try {
      if (document.referrer) return new URL(document.referrer).origin;
    } catch (e2) {}
    return null;
  }
  function normLocalHost(h) { return (h === '127.0.0.1' || h === '[::1]') ? 'localhost' : h; }
  function originAllowed(actual, expected) {
    if (!expected || actual === expected) return true;
    try {
      var a = new URL(actual);
      var b = new URL(expected);
      return a.protocol === b.protocol && a.port === b.port && normLocalHost(a.hostname) === normLocalHost(b.hostname);
    } catch (e) { return false; }
  }
  function postToParent(payload) {
    var target = parentOriginRuntime || getTrustedCmsOrigin() || '*';
    window.parent.postMessage(payload, target);
  }
  function resolveMediaUrl(raw) {
    if (raw == null) return '';
    var s = String(raw).trim();
    if (!s) return '';
    if (/^(https?:|data:|blob:)/i.test(s)) return s;
    if (s.indexOf('//') === 0) {
      try { return new URL('https:' + s).href; } catch (e0) {}
    }
    try {
      var root = window.location.origin;
      var p = s.indexOf('/') === 0 ? s : '/' + s.replace(/^\.\//, '');
      return root + p;
    } catch (e1) {
      return s;
    }
  }
  function uniq(arr) {
    var out = [];
    var seen = {};
    arr.forEach(function (v) { if (v && !seen[v]) { seen[v] = true; out.push(v); } });
    return out;
  }
  function mediaCandidates(raw) {
    if (raw == null) return [];
    var s = String(raw).trim();
    if (!s) return [];
    var c = [s];
    try { c.push(new URL(s, window.location.href).href); } catch (e0) {}
    try { c.push(new URL(s, window.location.origin + '/').href); } catch (e1) {}
    c.push(resolveMediaUrl(s));
    return uniq(c);
  }
  function bindMediaFallback(root) {
    if (!root) return;
    var nodes = root.querySelectorAll('img[data-cms-candidates],video[data-cms-candidates]');
    nodes.forEach(function (el) {
      if (el.getAttribute('data-cms-bound') === '1') return;
      el.setAttribute('data-cms-bound', '1');
      var list = [];
      try { list = JSON.parse(el.getAttribute('data-cms-candidates') || '[]'); } catch (e) {}
      if (!Array.isArray(list) || !list.length) return;
      var i = 0;
      function apply(idx) {
        if (idx >= list.length) return;
        var src = list[idx];
        if (!src) return;
        if (el.tagName === 'VIDEO') { el.src = src; try { el.load(); } catch (e1) {} }
        else el.src = src;
      }
      el.addEventListener('error', function () { i += 1; apply(i); });
      apply(0);
    });
  }
  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value || '';
  }
  function applyTheme(theme) {
    if (!theme) return;
    var t = theme;
    var el;
    if (el = document.getElementById('hero-title')) el.style.color = t.heroTitle || '';
    if (el = document.getElementById('hero-subtitle')) el.style.color = t.heroSubtitle || '';
    if (el = document.getElementById('about-title')) el.style.color = t.aboutTitle || '';
    if (el = document.getElementById('about-text')) el.style.color = t.aboutText || '';
    if (el = document.getElementById('services-title')) el.style.color = t.servicesTitle || '';
    if (el = document.getElementById('contact-title')) el.style.color = t.contactTitle || '';
    if (el = document.getElementById('contact-text')) el.style.color = t.contactText || '';
    if (el = document.getElementById('contact-email')) el.style.color = t.contactText || '';
    if (el = document.getElementById('contact-cta')) {
      if (t.contactButtonBg) el.style.background = t.contactButtonBg;
      if (t.contactButtonText) el.style.color = t.contactButtonText;
    }
  }
  function clearPage() {
    ['hero-title','hero-subtitle','about-title','about-text','services-title','contact-title','contact-text','contact-email','video-loop-title','video-play-title'].forEach(function (id) {
      setText(id, '');
    });
    ['hero-media','about-media','services-list','video-loop-media','video-play-media'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.innerHTML = '';
    });
    var cta = document.getElementById('contact-cta');
    if (cta) { cta.textContent = ''; cta.href = '#'; }
  }
  function renderHero(page) {
    if (!page.hero) return;
    setText('hero-title', page.hero.title || '');
    setText('hero-subtitle', page.hero.subtitle || '');
    var box = document.getElementById('hero-media');
    if (!box) return;
    if (page.hero.video) {
      var vids = mediaCandidates(page.hero.video);
      var poster = resolveMediaUrl(page.hero.image || '');
      box.innerHTML = '<video class="hero__image" muted loop playsinline autoplay preload="auto" poster="' + escapeHtml(poster) + '" data-cms-candidates="' + escapeHtml(JSON.stringify(vids)) + '"></video>';
    } else {
      var imgs = uniq(mediaCandidates(page.hero.imageAvif || '').concat(mediaCandidates(page.hero.imageWebp || '')).concat(mediaCandidates(page.hero.image || '')));
      box.innerHTML = '<img class="hero__image" alt="" loading="eager" fetchpriority="high" data-cms-candidates="' + escapeHtml(JSON.stringify(imgs)) + '">';
    }
    bindMediaFallback(box);
  }
  function renderAbout(page) {
    if (!page.about) return;
    setText('about-title', page.about.title || '');
    setText('about-text', page.about.text || '');
    var box = document.getElementById('about-media');
    if (!box) return;
    if (page.about.video) {
      var vids = mediaCandidates(page.about.video);
      var poster = resolveMediaUrl(page.about.image || '');
      box.innerHTML = '<video class="about__image" muted loop playsinline controls preload="auto" poster="' + escapeHtml(poster) + '" data-cms-candidates="' + escapeHtml(JSON.stringify(vids)) + '"></video>';
    } else {
      var imgs = uniq(mediaCandidates(page.about.imageAvif || '').concat(mediaCandidates(page.about.imageWebp || '')).concat(mediaCandidates(page.about.image || '')));
      box.innerHTML = '<img class="about__image" alt="" data-cms-candidates="' + escapeHtml(JSON.stringify(imgs)) + '">';
    }
    bindMediaFallback(box);
  }
  function renderServices(page) {
    if (!page.services) return;
    setText('services-title', page.services.title || '');
    var list = document.getElementById('services-list');
    if (!list || !Array.isArray(page.services.items)) return;
    list.innerHTML = page.services.items.map(function (item) {
      return '<div class="service-card"><h3 class="service-card__title">' + escapeHtml(item.title || '') + '</h3><p class="service-card__description">' + escapeHtml(item.description || '') + '</p></div>';
    }).join('');
  }
  function renderContact(page) {
    if (!page.contact) return;
    setText('contact-title', page.contact.title || '');
    setText('contact-text', page.contact.text || '');
    setText('contact-email', page.contact.email || '');
    var cta = document.getElementById('contact-cta');
    if (cta) {
      cta.textContent = page.contact.buttonLabel || 'Contact';
      cta.href = page.contact.email ? 'mailto:' + page.contact.email : '#';
    }
  }
  function renderVideoLoop(page) {
    if (!page.videoLoop) return;
    setText('video-loop-title', page.videoLoop.title || '');
    var box = document.getElementById('video-loop-media');
    if (!box) return;
    if (!page.videoLoop.video) return;
    var vids = mediaCandidates(page.videoLoop.video);
    box.innerHTML = '<video muted loop playsinline autoplay preload="auto" data-cms-candidates="' + escapeHtml(JSON.stringify(vids)) + '"></video>';
    bindMediaFallback(box);
  }
  function renderVideoPlay(page) {
    if (!page.videoPlay) return;
    setText('video-play-title', page.videoPlay.title || '');
    var box = document.getElementById('video-play-media');
    if (!box) return;
    if (!page.videoPlay.video) return;
    var vids = mediaCandidates(page.videoPlay.video);
    var poster = page.videoPlay.poster ? ' poster="' + escapeHtml(resolveMediaUrl(page.videoPlay.poster)) + '"' : '';
    box.innerHTML = '<video controls playsinline preload="auto"' + poster + ' data-cms-candidates="' + escapeHtml(JSON.stringify(vids)) + '"></video>';
    bindMediaFallback(box);
  }
  function ensureAllInDom() {
    sectionIds.forEach(function (id) {
      var el = sectionEls[id];
      if (el && el.parentNode !== mainEl) mainEl.appendChild(el);
    });
  }
  function renderPage(page, theme) {
    if (!page) return;
    ensureAllInDom();
    clearPage();
    renderHero(page);
    renderAbout(page);
    renderServices(page);
    renderContact(page);
    renderVideoLoop(page);
    renderVideoPlay(page);
    applyTheme(theme);
    var order = page.sectionOrder && page.sectionOrder.length ? page.sectionOrder : ['hero','about','services','contact'];
    order = order.filter(function (id) { return page[id] != null; });
    sectionIds.forEach(function (id) {
      var el = sectionEls[id];
      if (!el) return;
      if (order.indexOf(id) === -1) el.style.display = 'none';
      else { el.style.display = ''; mainEl.appendChild(el); }
    });
  }

  function markMediaZones() {
    ['hero-media-zone', 'about-media-zone', 'video-loop-media', 'video-play-media'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.setAttribute('data-cms-media', id);
    });
  }
  function resolveUploadKey(zone, ev) {
    var id = zone.getAttribute('data-cms-media');
    if (id === 'hero-media-zone') return zone.querySelector('#hero-media video') ? 'hero-video' : 'hero';
    if (id === 'about-media-zone') return zone.querySelector('#about-media video') ? 'about-video' : 'about';
    if (id === 'video-loop-media') return 'videoLoop-video';
    if (id === 'video-play-media') return ev.altKey ? 'videoPlay-poster' : 'videoPlay-video';
    return null;
  }
  function wireMediaClicks() {
    if (!cmsEmbed || wiredMediaClicks) return;
    wiredMediaClicks = true;
    markMediaZones();
    document.addEventListener('click', function (ev) {
      var zone = ev.target.closest && ev.target.closest('[data-cms-media]');
      if (!zone) return;
      var video = ev.target.closest && ev.target.closest('video');
      if (video && zone.contains(video) && !ev.shiftKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      var key = resolveUploadKey(zone, ev);
      if (key) postToParent({ source: 'cms-site', type: 'CMS_UPLOAD_REQUEST', uploadKey: key });
    }, true);
  }
  function wireText(el, patchBuilder) {
    if (!el || el.getAttribute('data-cms-wired') === '1') return;
    el.setAttribute('data-cms-wired', '1');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-cms-inline', 'true');
    var t;
    function flush() {
      clearTimeout(t);
      var patch = patchBuilder();
      if (patch) postToParent({ source: 'cms-site', type: 'CMS_PATCH', pageSlug: embedIsMultiPage ? (embedActivePageSlug || 'index') : undefined, patch: patch });
    }
    el.addEventListener('input', function () { clearTimeout(t); t = setTimeout(flush, 350); });
    el.addEventListener('blur', flush);
    if (el.tagName === 'A') el.addEventListener('click', function (ev) { if (cmsEmbed) ev.preventDefault(); });
  }
  function wireInlineEditing() {
    if (!cmsEmbed) return;
    wireMediaClicks();
    wireText(document.getElementById('hero-title'), function () { return { hero: { title: document.getElementById('hero-title').textContent || '' } }; });
    wireText(document.getElementById('hero-subtitle'), function () { return { hero: { subtitle: document.getElementById('hero-subtitle').textContent || '' } }; });
    wireText(document.getElementById('about-title'), function () { return { about: { title: document.getElementById('about-title').textContent || '' } }; });
    wireText(document.getElementById('about-text'), function () { return { about: { text: document.getElementById('about-text').textContent || '' } }; });
    wireText(document.getElementById('services-title'), function () {
      var cards = document.querySelectorAll('#services-list .service-card');
      var items = [];
      cards.forEach(function (card) {
        items.push({
          title: (card.querySelector('.service-card__title') || {}).textContent || '',
          description: (card.querySelector('.service-card__description') || {}).textContent || ''
        });
      });
      return { services: { title: document.getElementById('services-title').textContent || '', items: items } };
    });
    document.querySelectorAll('#services-list .service-card__title, #services-list .service-card__description').forEach(function (el) {
      wireText(el, function () {
        var cards = document.querySelectorAll('#services-list .service-card');
        var items = [];
        cards.forEach(function (card) {
          items.push({
            title: (card.querySelector('.service-card__title') || {}).textContent || '',
            description: (card.querySelector('.service-card__description') || {}).textContent || ''
          });
        });
        return { services: { title: (document.getElementById('services-title') || {}).textContent || '', items: items } };
      });
    });
    wireText(document.getElementById('video-loop-title'), function () { return { videoLoop: { title: document.getElementById('video-loop-title').textContent || '' } }; });
    wireText(document.getElementById('video-play-title'), function () { return { videoPlay: { title: document.getElementById('video-play-title').textContent || '' } }; });
    wireText(document.getElementById('contact-title'), function () { return { contact: { title: document.getElementById('contact-title').textContent || '' } }; });
    wireText(document.getElementById('contact-text'), function () { return { contact: { text: document.getElementById('contact-text').textContent || '' } }; });
    wireText(document.getElementById('contact-email'), function () {
      var email = (document.getElementById('contact-email').textContent || '').trim();
      var cta = document.getElementById('contact-cta');
      if (cta) cta.href = email ? 'mailto:' + email : '#';
      return { contact: { email: email } };
    });
    wireText(document.getElementById('contact-cta'), function () { return { contact: { buttonLabel: document.getElementById('contact-cta').textContent || '' } }; });
  }
  function renderContent(data, opts) {
    opts = opts || {};
    if (!data) return;
    var nav = document.getElementById('site-nav');
    var isMulti = data.pages && typeof data.pages === 'object' && Object.keys(data.pages).length > 0;
    embedIsMultiPage = isMulti;
    if (isMulti) {
      if (nav) nav.removeAttribute('hidden');
      var order = data.pageOrder && data.pageOrder.length ? data.pageOrder : Object.keys(data.pages);
      var getSlug = function () {
        var h = (window.location.hash || '').replace(/^#/, '') || order[0] || 'index';
        return order.indexOf(h) >= 0 ? h : (order[0] || 'index');
      };
      var showPage = function (slugOverride) {
        var slug = slugOverride || getSlug();
        if (order.indexOf(slug) < 0) slug = order[0] || 'index';
        embedActivePageSlug = slug;
        renderPage(data.pages[slug], data.theme);
        if (nav) [].forEach.call(nav.querySelectorAll('.site-nav__link'), function (l) { l.classList.toggle('active', l.getAttribute('data-page') === slug); });
        if (cmsEmbed && slugOverride) {
          try { if (window.location.hash !== '#' + slug) history.replaceState(null, '', '#' + slug); } catch (e) {}
        }
      };
      showPage(opts.pageSlug);
      if (!wiredHash) {
        wiredHash = true;
        window.addEventListener('hashchange', function () {
          showPage();
          wireInlineEditing();
          if (cmsEmbed) postToParent({ source: 'cms-site', type: 'CMS_PAGE', slug: getSlug() });
        });
      }
      wireInlineEditing();
      return;
    }
    if (nav) nav.setAttribute('hidden', '');
    renderPage(data, data.theme);
    wireInlineEditing();
  }

  if (cmsEmbed) {
    parentOriginRuntime = getTrustedCmsOrigin();
    postToParent({ source: 'cms-site', type: 'CMS_READY' });
    window.addEventListener('message', function (e) {
      if (e.source !== window.parent) return;
      var expected = parentOriginRuntime || getTrustedCmsOrigin();
      if (expected && !originAllowed(e.origin, expected)) return;
      if (!e.data || e.data.source !== 'cms-app' || e.data.type !== 'CMS_CONTENT') return;
      parentOriginRuntime = e.origin;
      try {
        renderContent(e.data.content, { pageSlug: e.data.pageSlug || undefined });
        postToParent({ source: 'cms-site', type: 'CMS_APPLIED' });
      } catch (err) {
        console.error('CMS embed apply failed:', err);
      }
    });
  } else {
    fetch(contentPath)
      .then(function (r) {
        if (!r.ok) throw new Error('content.json not found');
        return r.json();
      })
      .then(function (data) { renderContent(data); })
      .catch(function (err) {
        console.error('Failed to load content:', err);
        setText('hero-title', 'Contenu non chargé');
        setText('hero-subtitle', 'Vérifiez que content.json existe.');
      });
  }
})();
