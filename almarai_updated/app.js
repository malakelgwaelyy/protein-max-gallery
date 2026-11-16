(function () {
  "use strict";

  var CONTENT = window.ALMARAI_CONTENT || { site: {}, branches: [] };
  var BRANCHES = Array.isArray(CONTENT.branches) ? CONTENT.branches : [];
  var DEFAULT_TITLE = document.title;
  var PH_RATIOS = ["4 / 3", "3 / 4", "1 / 1", "4 / 5", "16 / 10", "3 / 4"];
  var ARROW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (sel) { return document.querySelector(sel); };

  var homeView = $("#home");
  var branchView = $("#branch");
  var branchGrid = $("#branchGrid");
  var galleryGrid = $("#galleryGrid");
  var branchTitle = $("#branchTitle");
  var branchDesc = $("#branchDesc");
  var branchCount = $("#branchCount");
  var lightbox = $("#lightbox");
  var lbImg = $("#lbImg");
  var lbCaption = $("#lbCaption");
  var lbCounter = $("#lbCounter");
  var lbPrev = $("#lbPrev");
  var lbNext = $("#lbNext");
  var lbClose = $("#lbClose");

  var current = null;      // branch currently shown in the gallery
  var index = 0;           // image index inside the lightbox
  var lastTrigger = null;  // element to refocus when the lightbox closes
  var loadToken = 0;       // guards against out-of-order image loads
  var touchStartX = null;

  /* ---------- helpers ---------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function placeholder(label, ratio) {
    var box = el("div", "ph");
    if (ratio) box.style.aspectRatio = ratio;
    box.appendChild(el("span", "", label));
    return box;
  }

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (e) { return value; }
  }

  // Scroll-in animation. Stagger delay is cleared afterwards so hover feels instant.
  var io = ("IntersectionObserver" in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var node = entry.target;
          node.classList.add("is-visible");
          io.unobserve(node);
          setTimeout(function () { node.style.transitionDelay = ""; }, 1200);
        });
      }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" })
    : null;

  function reveal(nodes) {
    nodes.forEach(function (node, i) {
      node.classList.add("reveal");
      node.style.transitionDelay = reduceMotion ? "0ms" : (Math.min(i % 6, 5) * 70) + "ms";
      if (io) io.observe(node);
      else node.classList.add("is-visible");
    });
  }

  /* ---------- hero ---------- */

  function renderHero() {
    var src = CONTENT.site && CONTENT.site.heroImage;
    if (!src) return; // keep the placeholder until a hero image is provided
    var frame = $("#heroFrame");
    frame.textContent = "";
    var img = el("img");
    img.src = src;
    img.alt = CONTENT.site.heroAlt || "";
    img.decoding = "async";
    frame.appendChild(img);
  }

  /* ---------- branch selection ---------- */

  function renderBranches() {
    branchGrid.textContent = "";

    if (!BRANCHES.length) {
      branchGrid.appendChild(el("p", "empty-state", "لم تُضف الفروع بعد."));
      return;
    }

    var cards = BRANCHES.map(function (branch) {
      var images = branch.images || [];
      var card = el("a", "branch-card");
      card.href = "#branch/" + encodeURIComponent(branch.id);
      card.setAttribute("aria-label", "عرض صور " + branch.name);

      var thumb = el("div", "branch-thumb");
      if (images[0] && images[0].src) {
        var img = el("img");
        img.src = images[0].src;
        img.alt = images[0].alt || branch.name;
        img.loading = "lazy";
        img.decoding = "async";
        thumb.appendChild(img);
      } else {
        thumb.appendChild(placeholder("صورة الفرع قيد الإضافة"));
      }

      var body = el("div", "branch-body");
      body.appendChild(el("h3", "branch-name", branch.name));
      body.appendChild(el("span", "branch-meta", images.length ? images.length + " صور" : "بانتظار الصور"));

      var cta = el("span", "branch-cta", "عرض الصور");
      cta.insertAdjacentHTML("beforeend", ARROW_SVG);
      body.appendChild(cta);

      card.appendChild(thumb);
      card.appendChild(body);
      return card;
    });

    cards.forEach(function (card) { branchGrid.appendChild(card); });
    reveal(cards);
  }

  /* ---------- branch gallery ---------- */

  function renderGallery(branch) {
    galleryGrid.textContent = "";
    var images = branch.images || [];

    if (!images.length) {
      var placeholders = PH_RATIOS.map(function (ratio) {
        return placeholder("أضف صورة هنا", ratio);
      });
      placeholders.forEach(function (node) { galleryGrid.appendChild(node); });
      reveal(placeholders);
      return;
    }

    // An endlessly moving photo ribbon: duplicate the images for a seamless loop.
    galleryGrid.classList.add("gallery-ribbon");
    var viewport = el("div", "gallery-ribbon-viewport");
    viewport.setAttribute("aria-label", "شريط صور الفرع — اضغط على أي صورة لتكبيرها");
    var track = el("div", "gallery-ribbon-track");

    function makeItem(image, i, isClone) {
      var button = el("button", "g-item gallery-ribbon-item");
      button.type = "button";
      button.setAttribute("aria-label", "تكبير الصورة " + (i + 1) + " من " + images.length);
      if (isClone) button.setAttribute("aria-hidden", "true");

      var img = el("img");
      img.src = image.src;
      img.alt = isClone ? "" : (image.alt || branch.name);
      img.loading = "lazy";
      img.decoding = "async";
      if (image.width && image.height) img.style.aspectRatio = image.width + " / " + image.height;
      button.appendChild(img);
      button.addEventListener("click", function () { openLightbox(i, button); });
      return button;
    }

    // Two identical sets make the CSS translate loop seamless.
    images.forEach(function (image, i) { track.appendChild(makeItem(image, i, false)); });
    images.forEach(function (image, i) { track.appendChild(makeItem(image, i, true)); });
    viewport.appendChild(track);
    galleryGrid.appendChild(viewport);

    var hint = el("p", "gallery-motion-hint", "الصور بتتحرك تلقائيًا — اضغط على أي صورة لتكبيرها");
    galleryGrid.appendChild(hint);

    // Pause motion while the visitor is interacting with the strip.
    viewport.addEventListener("mouseenter", function () { track.classList.add("is-paused"); });
    viewport.addEventListener("mouseleave", function () { track.classList.remove("is-paused"); });
    viewport.addEventListener("focusin", function () { track.classList.add("is-paused"); });
    viewport.addEventListener("focusout", function () { track.classList.remove("is-paused"); });
  }

  /* ---------- views and routing ---------- */

  function showBranch(branch) {
    if (lightbox.open) lightbox.close();
    current = branch;

    homeView.hidden = true;
    branchView.hidden = false;

    branchTitle.textContent = branch.name;
    branchDesc.textContent = branch.description || "";
    branchDesc.hidden = !branch.description;

    var total = (branch.images || []).length;
    branchCount.textContent = total ? total + " صور" : "";

    document.title = branch.name + " | المراعي – بروتين ماكس";
    renderGallery(branch);

    window.scrollTo(0, 0);
    branchTitle.focus({ preventScroll: true });
  }

  function showHome() {
    if (lightbox.open) lightbox.close();
    var cameFromBranch = !branchView.hidden;
    current = null;

    branchView.hidden = true;
    homeView.hidden = false;
    document.title = DEFAULT_TITLE;

    if (cameFromBranch || location.hash === "#branches") {
      var target = document.getElementById("branches");
      if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
  }

  function route() {
    var match = location.hash.match(/^#branch\/(.+)$/);
    var id = match ? safeDecode(match[1]) : null;
    var branch = id ? BRANCHES.find(function (b) { return b.id === id; }) : null;

    if (branch) showBranch(branch);
    else showHome();
  }

  /* ---------- lightbox ---------- */

  function openLightbox(i, trigger) {
    index = i;
    lastTrigger = trigger || null;
    if (!lightbox.open) lightbox.showModal();
    loadLightboxImage();
    lbClose.focus();
  }

  function loadLightboxImage() {
    var list = current.images;
    var item = list[index];
    var total = list.length;
    var token = ++loadToken;

    lbImg.classList.add("is-swapping");

    var loader = new Image();
    var show = function () {
      if (token !== loadToken) return; // a newer request has already taken over
      lbImg.src = item.src;
      lbImg.alt = item.alt || current.name;
      lbImg.classList.remove("is-swapping");
    };
    loader.onload = show;
    loader.onerror = show;
    loader.src = item.src;

    lbCaption.textContent = item.caption || "";
    lbCounter.textContent = (index + 1) + " / " + total;

    var multiple = total > 1;
    lbPrev.hidden = !multiple;
    lbNext.hidden = !multiple;
  }

  function stepLightbox(direction) {
    if (!current || !current.images || current.images.length < 2) return;
    var total = current.images.length;
    index = (index + direction + total) % total;
    loadLightboxImage();
  }

  lbPrev.addEventListener("click", function () { stepLightbox(-1); });
  lbNext.addEventListener("click", function () { stepLightbox(1); });
  lbClose.addEventListener("click", function () { lightbox.close(); });

  // Layout is RTL: "next" sits on the left, so ArrowLeft advances and ArrowRight goes back.
  lightbox.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); stepLightbox(1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stepLightbox(-1); }
  });

  lightbox.addEventListener("touchstart", function (e) {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  lightbox.addEventListener("touchend", function (e) {
    if (touchStartX === null) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
  });

  lightbox.addEventListener("close", function () {
    loadToken++;
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus({ preventScroll: true });
    lastTrigger = null;
  });

  /* ---------- init ---------- */

  function init() {
    $("#year").textContent = new Date().getFullYear();
    renderHero();
    renderBranches();
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
