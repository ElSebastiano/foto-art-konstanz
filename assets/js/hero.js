/* =============================================================================
   FOTO ART Konstanz — interaktive Hero-Section: "Die Kamera fotografiert sie"
   ---------------------------------------------------------------------------
   Der Hero-Bereich bleibt via `position: sticky` im Viewport fixiert, während
   der Nutzer durch einen zusätzlichen Scroll-Bereich scrollt — kein Wheel-/
   Scroll-Hijacking, das Sperren bis zum Abschluss der Sequenz ergibt sich
   allein daraus, dass der Wrapper höher ist als der Viewport. Funktioniert
   unverändert mit Tastatur, Trackpad und Touch.

   Ablauf beim Scrollen: eine Kamera hebt sich von unten ins Bild, ein
   Sucher-Fokusrahmen zieht sich um die Person zusammen, der Verschluss löst
   aus (Blitz-Overlay + Verschluss-Klick-Animation), ein Mini-Polaroid
   bestätigt die Aufnahme, danach senkt sich die Kamera wieder und erst dann
   gibt die sticky-Bühne den nativen Scroll in den nächsten Abschnitt frei.
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
  var focus = wrapper.querySelector("[data-hero-focus]");
  var flash = wrapper.querySelector("[data-hero-flash]");
  var camera = wrapper.querySelector("[data-hero-camera]");
  var cameraGlass = wrapper.querySelector("[data-hero-camera-glass]");
  var polaroid = wrapper.querySelector("[data-hero-polaroid]");
  var content = wrapper.querySelector("[data-hero-content]");
  var cue = wrapper.querySelector("[data-hero-cue]");

  /* ---------- Scroll room: großzügig auf Desktop, kompakter auf Mobile ---------- */
  function setScrollRoom() {
    var vh = window.innerHeight;
    var room = window.innerWidth < 700 ? vh * 1.1 : vh * 1.7;
    wrapper.style.height = vh + room + "px";
  }
  setScrollRoom();

  /* ---------- Bild vorladen, dann sanfter Push-in (zeitbasiert, nicht scrollbasiert) ---------- */
  var loadT = 0; // 0..1
  var preload = new Image();
  preload.onload = function () {
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

  /* ---------- Fokusrahmen: Start (weit) und Ziel (eng um die Person) in % der Bühne ---------- */
  var focusStart = { left: 6, top: 8, width: 88, height: 82 };
  var focusTarget = { left: 29, top: 13, width: 25, height: 70 };

  /* ---------- Auslöse-Moment: einmalig pro Scroll-Durchlauf ---------- */
  var captured = false;
  var CAPTURE_AT = 0.42;
  var CAPTURE_RESET_BELOW = 0.37;
  var polaroidState = "hidden"; // hidden | visible | leaving

  function triggerCapture() {
    flash.classList.remove("is-active");
    void flash.offsetWidth; // reflow, damit die Animation erneut startet
    flash.classList.add("is-active");

    camera.classList.remove("is-clicking");
    void camera.offsetWidth;
    camera.classList.add("is-clicking");

    window.setTimeout(function () {
      if (polaroidState !== "leaving") {
        polaroid.classList.remove("is-leaving");
        polaroid.classList.add("is-visible");
        polaroidState = "visible";
      }
    }, 160);
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

    /* Hintergrund: Ladeanimation + dezente Pointer-Parallaxe + späte Kamerafahrt */
    var pLate = smoothstep(0.86, 1, progress);
    var bgX = pointerSmoothed.x * -6;
    var bgY = pointerSmoothed.y * -3 - pLate * 14;
    var bgScale = loadScale * (1 + pLate * 0.03);
    bg.style.transform =
      "translate3d(" + bgX.toFixed(1) + "px, " + bgY.toFixed(1) + "px, 0) scale(" + bgScale.toFixed(3) + ")";

    /* ---------- Kamera: hebt sich, fotografiert, senkt sich wieder ---------- */
    var pRise = smoothstep(0.05, 0.24, progress);
    var pLower = smoothstep(0.6, 0.82, progress);
    var cameraT = pRise * (1 - pLower);
    var cameraY = lerp(42, 0, easeOutCubic(cameraT));
    var camPX = pointerSmoothed.x * 16;
    var camPY = pointerSmoothed.y * -8;
    camera.style.opacity = String(clamp(cameraT * 1.3, 0, 1));
    camera.style.transform =
      "translate(-50%, " + cameraY.toFixed(1) + "%) translate(" + camPX.toFixed(1) + "px, " + camPY.toFixed(1) + "px)";

    /* Objektivglas: kleine Reflexionsverschiebung, reagiert auf Pointer */
    if (cameraGlass) {
      var glassX = pointerSmoothed.x * 2.4;
      var glassY = pointerSmoothed.y * 2.4;
      cameraGlass.style.transform = "translate(" + glassX.toFixed(2) + "px, " + glassY.toFixed(2) + "px)";
    }

    /* ---------- Fokusrahmen: zieht sich um die Person zusammen ---------- */
    var pFocus = smoothstep(0.16, 0.36, progress);
    var pFocusOut = smoothstep(0.46, 0.62, progress);
    var focusOpacity = clamp(smoothstep(0.1, 0.18, progress) * (1 - pFocusOut), 0, 1);
    var fEase = easeInOutCubic(pFocus);
    var fLeft = lerp(focusStart.left, focusTarget.left, fEase);
    var fTop = lerp(focusStart.top, focusTarget.top, fEase);
    var fWidth = lerp(focusStart.width, focusTarget.width, fEase);
    var fHeight = lerp(focusStart.height, focusTarget.height, fEase);
    focus.style.left = fLeft + "%";
    focus.style.top = fTop + "%";
    focus.style.width = fWidth + "%";
    focus.style.height = fHeight + "%";
    focus.style.opacity = String(focusOpacity);

    /* ---------- Auslöser: einmalig auslösen, wenn der Fokus eingerastet ist ---------- */
    if (!captured && progress >= CAPTURE_AT) {
      captured = true;
      triggerCapture();
    } else if (captured && progress < CAPTURE_RESET_BELOW) {
      captured = false;
      polaroid.classList.remove("is-visible");
      polaroid.classList.add("is-leaving");
      polaroidState = "hidden";
    }

    /* Polaroid nach der Bestätigung wieder ausblenden, bevor die Kamera sinkt */
    if (polaroidState === "visible" && progress > 0.58) {
      polaroid.classList.remove("is-visible");
      polaroid.classList.add("is-leaving");
      polaroidState = "leaving";
    }

    /* Text: während Fokus + Auslösung dezent ausblenden, danach zurück */
    var hideText = progress > 0.14 && progress < 0.56;
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
