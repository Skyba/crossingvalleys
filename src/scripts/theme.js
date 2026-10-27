// The Ascend theme's behaviour without jQuery: sticky shrinking header, transparent header over the home hero,
// fitted titles, the typed home title, dropdown menus, the slide-out mobile menu, the image lightbox (Magnific Popup
// markup, styled by ascend.css), fading sliders, the recent-posts carousel and click-to-load YouTube.
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- sticky header: the theme shrinks it from 100 to 70 px as the page scrolls ----
const header = document.querySelector(".kad-header-menu-outer");
const wrapper = header?.parentElement;
const transparent = document.body.classList.contains("trans-header");
function stick() {
  if (!header) return;
  const desktop = innerWidth >= 992;
  const y = scrollY;
  const h = Math.max(70, 100 - y / 2);
  $$(".kad-header-height").forEach((el) => (el.style.height = (desktop ? h : 100) + "px"));
  header.classList.toggle("kt-item-shrunk", h === 70);
  if (!transparent) wrapper.style.height = desktop ? "100px" : "";
  const on = desktop && y > (transparent ? 0 : wrapper.getBoundingClientRect().top + y);
  wrapper.classList.toggle("is-sticky", on);
  Object.assign(header.style, on ? { position: "fixed", top: "0", width: "100%", zIndex: "1000" } : { position: "", top: "", width: "", zIndex: "" });
}
const mobile = document.getElementById("kad-mobile-banner");
function stickMobile() {
  if (!mobile) return;
  const on = innerWidth < 992 && scrollY > 0;
  mobile.parentElement.classList.toggle("cv-mobile-sticky", on);
  mobile.classList.toggle("is-sticky", on);
}
// On the home page the header floats over the hero: push the hero's text below it.
function heroPadding() {
  const t = document.querySelector(".titleclass");
  if (transparent && t) t.style.paddingTop = (innerWidth >= 992 ? 100 : 60) + "px";
}
// The theme's FitText: title size = width / (k * 10), clamped to data-min-size..data-max-size.
function fit() {
  $$(".titleclass .entry-title, .titleclass .subtitle").forEach((el) => {
    const k = el.classList.contains("subtitle") ? 1.5 : 1.4;
    const w = el.clientWidth, min = Number(el.dataset.minSize), max = Number(el.dataset.maxSize);
    if (!min) return;
    el.style.fontSize = (w < 400 ? min : w > 1140 ? max : Math.max(Math.min(w / (k * 10), max), min)) + "px";
  });
}
addEventListener("scroll", () => { stick(); stickMobile(); }, { passive: true });
addEventListener("resize", () => { stick(); stickMobile(); heroPadding(); fit(); });
stick(); stickMobile(); heroPadding(); fit();

// ---- typed home title (typed.js settings from the theme: type 40 ms/char, wait 3 s, loop) ----
$$(".kt_typed_element").forEach((el) => {
  const strings = JSON.parse(el.dataset.strings);
  if (reduced) return;
  const speed = Number(el.dataset.speed), back = Number(el.dataset.backDelay);
  const cursor = Object.assign(document.createElement("span"), { className: "typed-cursor", textContent: "|" });
  cursor.setAttribute("aria-hidden", "true");
  el.after(cursor);
  el.textContent = "";
  let i = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    await wait(Number(el.dataset.startDelay));
    for (;;) {
      const s = strings[i % strings.length];
      for (let n = 1; n <= s.length; n++) { el.textContent = s.slice(0, n); await wait(speed + Math.random() * speed); }
      await wait(back);
      for (let n = s.length; n >= 0; n--) { el.textContent = s.slice(0, n); await wait(20); }
      await wait(300);
      i++;
    }
  })();
});

// ---- dropdowns (hover handled by CSS; this adds keyboard focus and the theme's 300 ms close delay) ----
$$(".sf-menu-normal > li.sf-dropdown").forEach((li) => {
  let t;
  li.addEventListener("mouseenter", () => { clearTimeout(t); li.classList.add("sfHover"); });
  li.addEventListener("mouseleave", () => { t = setTimeout(() => li.classList.remove("sfHover"), 300); });
  li.addEventListener("focusin", () => li.classList.add("sfHover"));
  li.addEventListener("focusout", (e) => { if (!li.contains(e.relatedTarget)) li.classList.remove("sfHover"); });
});

// ---- Magnific Popup shell, used by the mobile menu and the lightbox ----
function popup({ mainClass, content, onKey, onClose, closeMarkup }) {
  const bg = Object.assign(document.createElement("div"), { className: `mfp-bg ${mainClass}` });
  const wrap = Object.assign(document.createElement("div"), { className: `mfp-wrap mfp-auto-cursor ${mainClass}`, tabIndex: -1 });
  wrap.innerHTML = `<div class="mfp-container mfp-s-ready"><div class="mfp-content"></div></div>${closeMarkup || ""}`;
  wrap.querySelector(".mfp-content").append(content);
  document.body.append(bg, wrap);
  document.documentElement.classList.add("mag-pop-sldr-open");
  requestAnimationFrame(() => { bg.classList.add("mfp-ready"); wrap.classList.add("mfp-ready"); });
  wrap.focus();
  const close = () => {
    bg.classList.add("mfp-removing"); wrap.classList.add("mfp-removing");
    document.removeEventListener("keydown", key);
    setTimeout(() => { bg.remove(); wrap.remove(); document.documentElement.classList.remove("mag-pop-sldr-open"); onClose?.(); }, 200);
  };
  const key = (e) => { if (e.key === "Escape") close(); else onKey?.(e); };
  document.addEventListener("keydown", key);
  wrap.addEventListener("click", (e) => { if (e.target.closest(".mfp-close, .sldr-close") || e.target === wrap || e.target.classList.contains("mfp-container")) close(); });
  bg.addEventListener("click", close);
  return { wrap, close };
}

// ---- mobile slide-out menu ----
const toggle = document.querySelector(".kt-sldr-pop-modal");
const menu = document.getElementById("kt-mobile-menu");
toggle?.addEventListener("click", () => {
  const home = menu.parentElement, next = menu.nextSibling;
  menu.classList.remove("mfp-hide");
  document.body.classList.add("mag-pop-sldr-open-left", "sldr-menu-animi");
  toggle.setAttribute("aria-expanded", "true");
  popup({
    mainClass: "sldr-menu-animi sldr-align-left mfp-slide mfp-inline-holder",
    content: menu,
    closeMarkup: '<div class="sldr-close-container kad-mobile-header-height"><button class="sldr-close" aria-label="Close menu"><span></span><span></span><span></span></button></div>',
    onClose: () => {
      menu.classList.add("mfp-hide"); home.insertBefore(menu, next);
      document.body.classList.remove("mag-pop-sldr-open-left", "sldr-menu-animi");
      toggle.setAttribute("aria-expanded", "false");
    },
  });
});
$$(".kad-submenu-accordion").forEach((b) => {
  const flip = () => { b.classList.toggle("toggle-active"); b.nextElementSibling.classList.toggle("in"); };
  b.addEventListener("click", flip);
  b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
});

// ---- image lightbox: links to images open in place, with the other images of the same gallery or post ----
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  if (!/\.(jpe?g|png|gif|webp)$/i.test(a.getAttribute("href"))) return;
  e.preventDefault();
  const scope = a.closest(".kad-light-gallery, .portfolio-grid-light-gallery, .entry-content, .postfeat") || document.body;
  const group = $$("a[href]", scope).filter((x) => /\.(jpe?g|png|gif|webp)$/i.test(x.getAttribute("href")) && !x.closest(".slick-cloned"));
  const links = [...new Map(group.map((x) => [x.href, x])).values()];
  let i = Math.max(0, links.findIndex((x) => x.href === a.href));
  const fig = document.createElement("div");
  fig.className = "mfp-figure";
  fig.innerHTML = '<button class="mfp-close" aria-label="Close">×</button><figure><img class="mfp-img" alt=""><figcaption><div class="mfp-bottom-bar"><div class="mfp-title"></div><div class="mfp-counter"></div></div></figcaption></figure>';
  const img = fig.querySelector("img");
  const show = () => {
    img.src = links[i].href;
    img.alt = links[i].querySelector("img")?.alt || "";
    fig.querySelector(".mfp-counter").textContent = links.length > 1 ? `${i + 1} of ${links.length}` : "";
  };
  const go = (d) => { i = (i + d + links.length) % links.length; show(); };
  const { wrap } = popup({ mainClass: "mfp-img-mobile mfp-zoom-in", content: fig, onKey: (k) => { if (k.key === "ArrowLeft") go(-1); if (k.key === "ArrowRight") go(1); } });
  wrap.querySelector(".mfp-container").classList.add("mfp-image-holder");
  if (links.length > 1) {
    for (const [d, cls, label] of [[-1, "left", "Previous"], [1, "right", "Next"]]) {
      const b = Object.assign(document.createElement("button"), { className: `mfp-arrow mfp-arrow-${cls} mfp-prevent-close`, title: label });
      b.setAttribute("aria-label", label);
      b.addEventListener("click", (ev) => { ev.stopPropagation(); go(d); });
      wrap.querySelector(".mfp-container").append(b);
    }
  }
  let x0;
  wrap.addEventListener("touchstart", (ev) => (x0 = ev.touches[0].clientX), { passive: true });
  wrap.addEventListener("touchend", (ev) => { const dx = ev.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); });
  show();
});

// ---- fading image sliders (gallery posts) ----
$$(".cv-slider").forEach((s) => {
  const slides = $$(".kt-slick-slide", s);
  s.classList.add("slick-initialized");
  if (slides.length < 2) return;
  let i = 0, timer;
  slides.forEach((sl, n) => sl.classList.toggle("slick-active", n === 0));
  const go = (d) => { slides[i].classList.remove("slick-active"); i = (i + d + slides.length) % slides.length; slides[i].classList.add("slick-active"); };
  const auto = () => { clearInterval(timer); if (!reduced) timer = setInterval(() => go(1), Number(s.dataset.sliderSpeed) || 7000); };
  for (const [d, cls, label] of [[-1, "prev", "Previous"], [1, "next", "Next"]]) {
    const b = Object.assign(document.createElement("button"), { className: `slick-${cls} slick-arrow`, type: "button", textContent: label });
    b.setAttribute("aria-label", label);
    b.addEventListener("click", (e) => { e.preventDefault(); go(d); auto(); });
    s.append(b);
  }
  auto();
});

// ---- recent-posts carousel under each post: 3 / 2 / 1 visible, one step every 9 s ----
$$(".cv-carousel").forEach((c) => {
  const items = $$(".kt-slick-slide", c);
  const track = document.createElement("div");
  track.className = "slick-track";
  const list = document.createElement("div");
  list.className = "slick-list";
  track.append(...items);
  list.append(track);
  c.append(list);
  c.classList.add("slick-initialized");
  let i = 0, timer;
  const visible = () => (innerWidth >= 768 ? 3 : innerWidth >= 544 ? 2 : 1);
  const render = () => {
    const v = visible(), w = list.clientWidth / v;
    i = Math.min(i, items.length - v);
    items.forEach((it) => (it.style.width = w + "px"));
    track.style.width = w * items.length + "px";
    track.style.transform = `translateX(${-i * w}px)`;
  };
  const go = (d) => { const max = items.length - visible(); i = i + d > max ? 0 : i + d < 0 ? max : i + d; render(); };
  for (const [d, cls, label] of [[-1, "prev", "Previous"], [1, "next", "Next"]]) {
    const b = Object.assign(document.createElement("button"), { className: `slick-${cls} slick-arrow`, type: "button", textContent: label });
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => { go(d); clearInterval(timer); });
    c.append(b);
  }
  addEventListener("resize", render);
  render();
  if (!reduced) timer = setInterval(() => go(1), Number(c.dataset.sliderSpeed) || 9000);
});

// ---- click-to-load YouTube: nothing is requested from YouTube until the visitor presses play ----
document.addEventListener("click", (e) => {
  const b = e.target.closest(".cv-youtube-play");
  if (!b) return;
  const box = b.parentElement;
  const f = document.createElement("iframe");
  f.src = `https://www.youtube-nocookie.com/embed/${box.dataset.youtube}?autoplay=1&rel=0`;
  f.title = b.getAttribute("aria-label")?.replace(/^Play video:?\s*/, "") || "YouTube video";
  f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  f.allowFullscreen = true;
  f.referrerPolicy = "strict-origin-when-cross-origin";
  box.replaceChildren(f);
});
