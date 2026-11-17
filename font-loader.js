// font-loader.js: intentionally does nothing.
// The site used to download three web fonts from Google here. It now uses the
// visitor's own system font (see --font-body in shared.css), so no font request
// is made. The file is kept only so older cached pages that still include
// <script src="/font-loader.js"> do not get a 404. It can be deleted once the
// service worker cache from before this change has aged out.
