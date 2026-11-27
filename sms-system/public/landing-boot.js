// Runs first on the public landing page (landing.html), before anything is painted. Plain ES5-style JavaScript with no
// imports: it is served as-is from public/, so it must work in every supported browser without a build step.
// Tested by src/landing/__tests__/landingBoot.test.ts, which runs this file against stand-in browser objects.
//
// 1. Adds the `js` class to <html>. The page is complete without JavaScript (it is prerendered); CSS turns on the
//    enhancements (header that splits at the top, sticky feature story, theme switch, bottom bar) only under `.js`.
// 2. Applies the visitor's theme before paint, so there is no flash: 'system' (default), 'light' or 'dark', stored
//    under its own key, never the dashboard's 'theme' key (src/lib/theme.ts).
// 3. Sends a visitor who is already signed in to /login, where the app's login gate forwards them to their dashboard
//    (components/PostLoginInstitutionGate.tsx). The app keeps sign-in in this tab's sessionStorage
//    (browserSessionPersistence, src/lib/firebase.ts), under a key that starts with "firebase:authUser:". Only the key
//    is checked; nothing is read from it and no Firebase code loads here. If Firebase ever changes that key, this
//    check quietly stops redirecting and the visitor simply sees the landing page.
(function (win, doc) {
  var THEME_KEY = "landing-theme";
  var SIGNED_IN_PREFIX = "firebase:authUser:";
  var root = doc.documentElement;
  var media = win.matchMedia
    ? win.matchMedia("(prefers-color-scheme: dark)")
    : null;

  function storage(kind) {
    try {
      return win[kind] || null;
    } catch (e) {
      return null; // storage blocked by the browser's privacy settings
    }
  }

  function readTheme() {
    var store = storage("localStorage");
    var value = null;
    try {
      value = store ? store.getItem(THEME_KEY) : null;
    } catch (e) {
      value = null;
    }
    return value === "light" || value === "dark" ? value : "system";
  }

  function applyTheme(pref) {
    var dark =
      pref === "dark" || (pref === "system" && !!media && media.matches);
    root.classList.toggle("dark", dark);
    root.setAttribute("data-theme-pref", pref);
  }

  function setTheme(pref) {
    var store = storage("localStorage");
    try {
      if (store) {
        if (pref === "system") store.removeItem(THEME_KEY);
        else store.setItem(THEME_KEY, pref);
      }
    } catch (e) {
      /* the choice then lasts for this page only */
    }
    applyTheme(pref);
    if (typeof win.CustomEvent === "function")
      win.dispatchEvent(new win.CustomEvent("landing-theme-change"));
  }

  function isSignedIn() {
    var store = storage("sessionStorage");
    if (!store) return false;
    try {
      for (var i = 0; i < store.length; i++) {
        var key = store.key(i);
        if (key && key.indexOf(SIGNED_IN_PREFIX) === 0) return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  // The page's React code reads and changes the theme through this object (src/landing/theme.ts).
  win.landingTheme = { read: readTheme, set: setTheme };

  if (isSignedIn()) {
    win.location.replace("/login");
    return;
  }

  root.classList.add("js");
  applyTheme(readTheme());
  if (media) {
    var follow = function () {
      if (readTheme() === "system") applyTheme("system");
    };
    if (media.addEventListener) media.addEventListener("change", follow);
    else if (media.addListener) media.addListener(follow); // Safari before 14
  }
})(window, document);
