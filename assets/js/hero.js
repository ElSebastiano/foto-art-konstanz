/* =============================================================================
   FOTO ART Konstanz — interaktive Hero-Section
   ---------------------------------------------------------------------------
   Konzept (siehe Foto_Art_Konstanz.md Abschnitt 5, docs/hero-implementation.md):
   Der Hero-Bereich bleibt via `position: sticky` im Viewport fixiert, während
   der Nutzer durch einen zusätzlichen Scroll-Bereich scrollt — kein Wheel-/
   Scroll-Hijacking, das Sperren bis zum Abschluss der Sequenz ergibt sich
   allein daraus, dass der Wrapper höher ist als der Viewport. Funktioniert
   unverändert mit Tastatur, Trackpad und Touch.

   Die Kamera im Vordergrund bleibt durchgehend scharf und unverändert sichtbar
   (kein Wegheben, kein zusätzliches Weichzeichnen). Beim Scrollen zoomt eine
   rechteckige Öffnung — das Kamera-Display — von ihrer kleinen Ausgangsgröße
   auf dem Kamerakörper aus auf Vollbild auf. Da die Öffnung dasselbe Bild in
   derselben Skalierung wie der Hintergrund zeigt, wirkt es, als würde man
   durch das Display in die Szene hineingezoomt, bis wieder das vollständige
   Ausgangsbild zu sehen ist — danach übernimmt der native Scroll in den
   nächsten Abschnitt.
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

    /* Hintergrund (inkl. scharfer Kamera): Ladeanimation + dezente Pointer-
       Parallaxe + späte Kamerafahrt gegen Ende der Sequenz. Die Kamera ist
       Teil desselben Bildes und wird nicht separat animiert oder weichgezeichnet. */
    var pLate = smoothstep(0.6, 1, progress);
    var bgX = pointerSmoothed.x * -6;
    var bgY = pointerSmoothed.y * -3 - pLate * 18;
    var bgScale = loadScale * (1 + pLate * 0.035);
    bg.style.transform =
      "translate3d(" + bgX.toFixed(1) + "px, " + bgY.toFixed(1) + "px, 0) scale(" + bgScale.toFixed(3) + ")";

    /* Display-Zoom (0.12 → 0.88): eine rechteckige Öffnung — das Kamera-
       Display — wächst von ihrer kleinen Ausgangsposition auf dem
       Kamerakörper aus auf Vollbild. */
    var pZ = smoothstep(0.12, 0.88, progress);
    var pZEase = easeInOutCubic(pZ);
    var stageRect = stage.getBoundingClientRect();
    var W = stageRect.width, H = stageRect.height;

    var displayX = 84, displayY = 74; // % — ungefähre Position des Kamera-Displays im Referenzbild
    var halfW = W * 0.05, halfH = H * 0.036;
    var cx = (W * displayX) / 100, cy = (H * displayY) / 100;

    var left0 = cx - halfW, right0 = W - (cx + halfW);
    var top0 = cy - halfH, bottom0 = H - (cy + halfH);

    var left = lerp(left0, 0, pZEase);
    var right = lerp(right0, 0, pZEase);
    var top = lerp(top0, 0, pZEase);
    var bottom = lerp(bottom0, 0, pZEase);
    var cornerR = lerp(9, 0, pZEase);

    lens.style.opacity = String(clamp(smoothstep(0.05, 0.14, progress), 0, 1));

    /* Iris: volle Fläche, nur per clip-path als wachsendes Rechteck freigelegt —
       dadurch bleibt der Bildausschnitt exakt pixelgleich zum Hintergrund. */
    iris.style.clipPath =
      "inset(" + top.toFixed(1) + "px " + right.toFixed(1) + "px " + bottom.toFixed(1) + "px " + left.toFixed(1) + "px round " + cornerR.toFixed(1) + "px)";

    /* Die dezente "Display"-Aufhellung klingt zum Vollbild hin auf neutral ab,
       damit am Ende wieder exakt das unveränderte Ausgangsbild zu sehen ist. */
    var filterT = pZEase;
    iris.style.filter =
      "brightness(" + lerp(1.1, 1, filterT).toFixed(3) + ") contrast(" + lerp(1.04, 1, filterT).toFixed(3) + ") saturate(" + lerp(1.04, 1, filterT).toFixed(3) + ")";

    var rectW = W - left - right, rectH = H - top - bottom;

    /* Dekorativer Rahmen exakt auf der wachsenden Display-Kante */
    ring.style.left = left + "px";
    ring.style.top = top + "px";
    ring.style.width = rectW + "px";
    ring.style.height = rectH + "px";
    ring.style.borderRadius = cornerR + "px";
    ring.style.opacity = String(clamp(1 - smoothstep(0.7, 0.95, pZ), 0, 1));

    /* HUD folgt derselben Fläche, minimal größer */
    var hudPad = Math.max(6, rectW * 0.06);
    hud.style.left = left - hudPad + "px";
    hud.style.top = top - hudPad + "px";
    hud.style.width = rectW + hudPad * 2 + "px";
    hud.style.height = rectH + hudPad * 2 + "px";

    var backdropOpacity = Math.min(smoothstep(0, 0.15, pZ), 1 - smoothstep(0.82, 1, pZ));
    backdrop.style.opacity = String(clamp(backdropOpacity * 0.78, 0, 0.78));

    var hudOpacity = Math.min(smoothstep(0.04, 0.2, pZ), 1 - smoothstep(0.55, 0.82, pZ));
    hud.style.opacity = String(clamp(hudOpacity, 0, 0.9));

    /* Text: während des Zoom-Moments dezent ausblenden, danach zurück */
    var hideText = pZ > 0.16 && pZ < 0.94;
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
