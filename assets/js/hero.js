/* =============================================================================
   FOTO ART Konstanz — interaktive Hero-Section
   ---------------------------------------------------------------------------
   Konzept (siehe Foto_Art_Konstanz.md, Abschnitt 5, und docs/hero-implementation.md):
   Der Hero-Bereich bleibt via `position: sticky` im Viewport fixiert, während
   der Nutzer durch einen zusätzlichen Scroll-Bereich scrollt. Der native
   Scroll-Fortschritt (0 → 1) steuert drei Phasen:
     Phase A (0.00–0.40): die unscharfe Kamera im Vordergrund wird "angehoben"
       und aus dem Bild herausbewegt.
     Phase B (0.35–0.85): ein Kamera-Objektiv/Iris-Reveal öffnet sich und
       zeigt die Frau scharf "durch die Linse", inkl. dezentem Viewfinder-HUD.
     Phase C (0.85–1.00): die Iris füllt den Viewport vollständig, Text kehrt
       zurück, danach übernimmt der native Dokumenten-Scroll in den nächsten
       Abschnitt.
   Es wird bewusst KEIN Scroll-/Wheel-Hijacking verwendet: das Sperren bis zum
   Abschluss der Sequenz ergibt sich allein daraus, dass der Wrapper höher ist
   als der Viewport (sticky "verbraucht" erst den zusätzlichen Scrollweg).
   Das funktioniert unverändert mit Tastatur (Page Down / Leertaste) und
   Touch-Scroll, ohne echte Scroll-Events zu unterdrücken.
   ============================================================================= */
(function () {
  "use strict";

  var html = document.documentElement;
  html.classList.remove("no-js");
  html.classList.add("js");

  var reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotionQuery.matches) {
    html.classList.add("reduced-motion");
    return; // Statischer Fallback vollständig über CSS, keine Scroll-Sperre, keine Animation.
  }

  var wrapper = document.querySelector("[data-hero]");
  if (!wrapper) return;

  var stage = wrapper.querySelector(".hero-stage");
  var bg = wrapper.querySelector("[data-hero-bg]");
  var camera = wrapper.querySelector("[data-hero-camera]");
  var lens = wrapper.querySelector("[data-hero-lens]");
  var backdrop = wrapper.querySelector("[data-hero-lens-backdrop]");
  var iris = wrapper.querySelector("[data-hero-lens-iris]");
  var ring = wrapper.querySelector("[data-hero-lens-ring]");
  var hud = wrapper.querySelector("[data-hero-lens-hud]");
  var content = wrapper.querySelector("[data-hero-content]");
  var cue = wrapper.querySelector("[data-hero-cue]");

  /* ---------- Scroll room: großzügig auf Desktop, kompakter auf Mobile ---------- */
  function setScrollRoom() {
    var vh = window.innerHeight;
    var room = window.innerWidth < 700 ? vh * 0.95 : vh * 1.55;
    wrapper.style.height = vh + room + "px";
  }
  setScrollRoom();

  /* ---------- Bild vorladen, dann sanfter Push-in (zeitbasiert, nicht scrollbasiert) ---------- */
  var loadT = 0; // 0..1
  var loaded = false;
  var preload = new Image();
  preload.onload = function () {
    loaded = true;
    bg.classList.add("is-loaded");
    var start = null;
    var DURATION = 1200;
    function tick(ts) {
      if (!start) start = ts;
      loadT = Math.min(1, (ts - start) / DURATION);
      requestFrame();
      if (loadT < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };
  preload.src = "assets/img/hero-foto-art.png";

  /* ---------- Helpers ---------- */
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* ---------- Scroll progress ---------- */
  var progress = 0;

  function computeProgress() {
    var rect = wrapper.getBoundingClientRect();
    var scrollable = wrapper.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    return clamp(-rect.top / scrollable, 0, 1);
  }

  /* ---------- Pointer parallax (geglättet) ---------- */
  var pointer = { x: 0, y: 0 }; // -1..1
  var pointerSmoothed = { x: 0, y: 0 };
  var isTouch = matchMedia("(hover: none), (pointer: coarse)").matches;

  if (!isTouch) {
    stage.addEventListener(
      "pointermove",
      function (e) {
        var r = stage.getBoundingClientRect();
        pointer.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
        pointer.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      },
      { passive: true }
    );
    stage.addEventListener("pointerleave", function () {
      pointer.x = 0;
      pointer.y = 0;
    });
  }

  /* ---------- Frame loop ---------- */
  var frameQueued = false;
  var running = true;

  function requestFrame() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(render);
  }

  function render() {
    frameQueued = false;
    if (!running) return;

    progress = computeProgress();

    /* Pointer smoothing (~ exponential nachlauf) */
    pointerSmoothed.x = lerp(pointerSmoothed.x, pointer.x, 0.08);
    pointerSmoothed.y = lerp(pointerSmoothed.y, pointer.y, 0.08);

    var loadScale = lerp(1.03, 1, easeOutCubic(loadT));
    var loadContentY = lerp(20, 0, easeOutCubic(loadT));

    /* Phase A — Kamera anheben (0 → 0.4): deutlich aus dem Bild heraus, damit
       die Bewegung als "die Kamera wird hochgehoben" lesbar ist. */
    var pA = smoothstep(0, 0.4, progress);
    var camX = pointerSmoothed.x * 16;
    var camY = pointerSmoothed.y * 10 - pA * (stage.clientHeight * 0.62);
    camera.style.transform =
      "translate3d(" + camX.toFixed(1) + "px, " + camY.toFixed(1) + "px, 0) scale(" +
      (1 + pA * 0.1).toFixed(3) + ")";
    camera.style.opacity = String(clamp(1 - pA * 1.15, 0, 1));
    camera.style.filter = "blur(" + (1.5 + pA * 5).toFixed(1) + "px)";

    /* Hintergrund: Ladeanimation + dezente Pointer-Parallaxe + späte Kamerafahrt (Phase C) */
    var pLate = smoothstep(0.55, 1, progress);
    var bgX = pointerSmoothed.x * -6;
    var bgY = pointerSmoothed.y * -3 - pLate * 22;
    var bgScale = loadScale * (1 + pLate * 0.04);
    bg.style.transform =
      "translate3d(" + bgX.toFixed(1) + "px, " + bgY.toFixed(1) + "px, 0) scale(" + bgScale.toFixed(3) + ")";

    /* Phase B — Objektiv-Iris-Reveal (0.35 → 0.85) */
    var pB = smoothstep(0.35, 0.85, progress);
    var pBEase = easeInOutCubic(pB);
    var stageRect = stage.getBoundingClientRect();
    var diagonal = Math.hypot(stageRect.width, stageRect.height);
    var radiusStart = Math.max(46, stageRect.width * 0.03);
    var radius = lerp(radiusStart, diagonal, pBEase);

    var originX = 86, originY = 66; // % — ungefähre Position des Objektivs im Referenzbild
    var targetX = 68, targetY = 30; // % — Fokus auf Gesicht/Augen der Frau
    var centerX = lerp(originX, targetX, pBEase);
    var centerY = lerp(originY, targetY, pBEase);

    lens.style.opacity = String(clamp(smoothstep(0.28, 0.4, progress), 0, 1));

    /* Iris: volle Fläche, nur per clip-path als wachsender Kreis freigelegt —
       dadurch bleibt der Bildausschnitt exakt pixelgleich zum Hintergrund. */
    iris.style.clipPath = "circle(" + radius.toFixed(1) + "px at " + centerX.toFixed(2) + "% " + centerY.toFixed(2) + "%)";

    /* Dekorativer Ring exakt auf dem Kreisrand */
    ring.style.width = radius * 2 + "px";
    ring.style.height = radius * 2 + "px";
    ring.style.left = centerX + "%";
    ring.style.top = centerY + "%";
    ring.style.transform = "translate3d(-50%,-50%,0)";
    ring.style.opacity = String(clamp(1 - smoothstep(0.7, 0.95, pB), 0, 1));

    /* HUD folgt der Iris als kompakter Viewfinder-Rahmen (Eigengröße gedeckelt,
       damit Fadenkreuz/Ecken nicht mit der später riesigen Iris mitwachsen) */
    var hudSize = Math.min(radius * 2 * 1.14, 420);
    hud.style.width = hudSize + "px";
    hud.style.height = hudSize + "px";
    hud.style.left = centerX + "%";
    hud.style.top = centerY + "%";
    hud.style.transform = "translate3d(-50%,-50%,0)";

    var backdropOpacity = Math.min(smoothstep(0, 0.18, pB), 1 - smoothstep(0.82, 1, pB));
    backdrop.style.opacity = String(clamp(backdropOpacity * 0.82, 0, 0.82));

    var hudOpacity = Math.min(smoothstep(0.08, 0.28, pB), 1 - smoothstep(0.6, 0.85, pB));
    hud.style.opacity = String(clamp(hudOpacity, 0, 0.9));

    /* Text: während des Linsen-Moments dezent ausblenden, danach zurück */
    var hideText = pB > 0.18 && pB < 0.92;
    content.classList.toggle("is-hidden", hideText);
    content.style.transform = "translateY(" + (hideText ? 10 : loadContentY) + "px)";

    /* Scroll-Hinweis ausblenden, sobald Bewegung beginnt */
    if (cue) cue.style.opacity = String(clamp(1 - progress * 14, 0, 1));

    if (progress > 0 && progress < 1) requestFrame();
  }

  window.addEventListener("scroll", requestFrame, { passive: true });
  window.addEventListener(
    "resize",
    function () {
      setScrollRoom();
      requestFrame();
    },
    { passive: true }
  );
  if (!isTouch) {
    (function pointerLoop() {
      requestFrame();
      if (running) requestAnimationFrame(pointerLoop);
    })();
  }

  /* Pausieren, sobald Hero weit außerhalb des Viewports ist (Performance) */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        running = entries[0].isIntersecting || entries[0].boundingClientRect.top > 0;
        if (running) requestFrame();
      },
      { rootMargin: "50% 0px 50% 0px" }
    );
    io.observe(wrapper);
  }

  requestFrame();

  /* "Animation überspringen"-Link: springt direkt hinter den Hero-Bereich */
  var skip = wrapper.querySelector(".hero-skip");
  if (skip) {
    skip.addEventListener("click", function (e) {
      e.preventDefault();
      var target = document.querySelector(skip.getAttribute("href"));
      if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }
})();
