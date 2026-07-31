/* FOTO ART Konstanz — global site behaviour (nav, footer, filters) */
(function () {
  "use strict";

  /* Header: solid background after scrolling past hero start */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* Mobile nav toggle */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      });
    });
  }

  /* Current-page nav highlighting */
  var here = (window.location.pathname.split("/").pop() || "index.html");
  document.querySelectorAll(".main-nav a").forEach(function (a) {
    var href = a.getAttribute("href");
    if (href === here || (here === "" && href === "index.html")) {
      a.setAttribute("aria-current", "page");
    }
  });

  /* Portfolio filter (portfolio.html) */
  var filterBar = document.querySelector(".filter-bar");
  var portfolioItems = document.querySelectorAll(".portfolio-item");
  if (filterBar && portfolioItems.length) {
    filterBar.addEventListener("click", function (e) {
      var btn = e.target.closest(".filter-btn");
      if (!btn) return;
      filterBar.querySelectorAll(".filter-btn").forEach(function (b) {
        b.setAttribute("aria-pressed", "false");
      });
      btn.setAttribute("aria-pressed", "true");
      var filter = btn.dataset.filter;
      portfolioItems.forEach(function (item) {
        var match = filter === "alle" || item.dataset.category === filter;
        item.hidden = !match;
      });
    });
  }

  /* Anfrageformular: vorbelegte Leistungsart via ?leistung=... */
  var form = document.querySelector("#anfrage-form");
  if (form) {
    var params = new URLSearchParams(window.location.search);
    var leistung = params.get("leistung");
    var select = form.querySelector("#leistungsart");
    if (leistung && select) {
      var opt = select.querySelector('option[value="' + CSS.escape(leistung) + '"]');
      if (opt) select.value = leistung;
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = form.querySelector(".form-status");
      if (status) {
        status.textContent =
          "Formular-Versand ist im Entwurf noch nicht angebunden. Bitte kontaktieren Sie uns bis zur finalen Freischaltung direkt per E-Mail oder Telefon (siehe Kontaktbereich).";
      }
    });
  }
})();
