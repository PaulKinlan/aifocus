// assets/js/site.js - the two behaviours that used to be inline handler
// attributes on every page.
//
// The site CSP's script-src no longer allows 'unsafe-inline' (aifocus-5wrp): it
// pins each inline <script> by sha256 hash, and inline EVENT HANDLER attributes
// are governed by the same directive, so `onload=` on the font preload and
// `onsubmit=` on the newsletter form were blocked the moment that change
// landed. They are declarative attributes now and this module binds them.
//
// Both are progressive: without JavaScript the font still loads (the <noscript>
// stylesheet in head.html) and the newsletter form still posts to Buttondown in
// its target window, which is what the attribute did.

// Promote the preloaded font stylesheet. The preload starts the fetch without
// blocking first paint; this swaps it to a real stylesheet as soon as the module
// runs, which is the same moment the old onload handler fired.
for (const link of document.querySelectorAll('link[rel="preload"][as="style"][data-promote-stylesheet]')) {
  link.rel = "stylesheet";
  link.removeAttribute("data-promote-stylesheet");
}

// Open the newsletter confirmation page in a popup window rather than navigating
// away, keeping the form's own target="popupwindow" behaviour.
for (const form of document.querySelectorAll("form[data-newsletter-popup]")) {
  form.addEventListener("submit", () => {
    window.open(form.dataset.newsletterPopup, "popupwindow", "noopener,noreferrer");
  });
}
