/**
 * Mosc-tools Presenter View — Google Slides bridge
 * ------------------------------------------------
 * A tiny Apps Script web app that runs AS YOU and hands the presenter view
 * three things it cannot get on its own from a local HTML file:
 *   • the slide list (ids, order, hidden flag) and speaker notes, with their formatting
 *   • slide images (Slides API thumbnails, 1600 px wide, ~30 min URLs)
 *   • the deck's revisionId so the view can notice edits
 *   • (v5) a live-slide relay: the "Presenter View Follow" Chrome extension on the
 *     playback machine reports which slide is on screen; the presenter view waits
 *     on it and follows. Builds/animations run natively in Google Slides.
 *
 * Same pattern as the BenchBoss / Shiftbook sheet bridge: token-protected,
 * deployed from your own Google account, so any deck you can open, it can read.
 *
 * SETUP (once, ~3 minutes)
 *  1. script.google.com → New project → paste this file over Code.gs.
 *  2. Change TOKEN below to a long random string.
 *  3. Left sidebar → Services (+) → "Google Slides API" → Add.
 *     (Adds the advanced `Slides` service used for thumbnails.)
 *  4. Select `test` in the toolbar → Run → approve the permissions prompt.
 *     Paste a deck ID into TEST_DECK_ID first if you want a real check.
 *     DO NOT SKIP THIS. Without it the web app answers a wrong token with
 *     JSON but the right token with Google's "Sorry, unable to open the
 *     file" page (HTTP 404), because the script is not allowed to touch
 *     Slides yet. Same thing after pasting into a NEW project or when
 *     Google asks to re-authorize after new services were added.
 *  5. Deploy → New deployment → type: Web app
 *        Execute as:      Me
 *        Who has access:  Anyone           ← required; the HTML calls it anonymously
 *     Copy the /exec URL into the presenter view along with your TOKEN.
 *
 * After editing this file you must create a NEW deployment (or "Manage
 * deployments → edit → New version") for the change to go live.
 */

var TOKEN = 'CHANGE-ME-to-a-long-random-string';
var TEST_DECK_ID = '';          // optional: paste a presentation ID here for the test() run
var MAX_THUMBS_PER_CALL = 8;
var LIVE_WAIT_MAX = 25;             // seconds a 'current' request may be held open waiting for a slide change
var MAX_RICH_SLOW = 40;             // SlidesApp fallback only extracts notes formatting for decks up to this many slides    // keeps each request well under the 6-minute script limit

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (!TOKEN || TOKEN.indexOf('CHANGE-ME') === 0) throw new Error('Set TOKEN in Code.gs before deploying');
    if (p.token !== TOKEN) throw new Error('Bad token');
    switch (p.action) {
      case 'ping':
        var who = null; try { who = Session.getEffectiveUser().getEmail(); } catch (ignored) { /* not authorized yet — ping still answers */ }
        return json_({ ok: true, user: who, version: 5, slidesApi: typeof Slides !== 'undefined', authorized: !!who });
      case 'deck':
        return json_(getDeck_(p.id));
      case 'thumbs':
        return json_(getThumbs_(p.id, String(p.pages || '').split(',').filter(String), p.size || 'LARGE'));
      case 'setCurrent':                                   // called by the Follow extension on every slide change
        return json_(setCurrent_(p.deck, p.slide, p.from));
      case 'current':                                      // called by the presenter view; holds until the slide changes
        return json_(getCurrent_(Number(p.since) || 0, Number(p.wait) || 0));
      default:
        throw new Error('Unknown action "' + p.action + '"');
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ---------- Live-slide relay (CacheService, nothing is written to Drive) ---------- */
function setCurrent_(deck, slide, from) {
  if (!slide) throw new Error('Missing slide');
  var state = { deck: deck || null, slide: String(slide), at: Date.now(), from: from || null };
  CacheService.getScriptCache().put('live', JSON.stringify(state), 6 * 3600);
  return { ok: true, at: state.at };
}
function readLive_() {
  var raw = CacheService.getScriptCache().get('live');
  return raw ? JSON.parse(raw) : null;
}
function getCurrent_(since, wait) {
  var until = Date.now() + Math.min(Math.max(wait, 0), LIVE_WAIT_MAX) * 1000;
  var live = readLive_();
  while ((!live || live.at <= since) && Date.now() < until) {
    Utilities.sleep(500);
    live = readLive_();
  }
  return { ok: true, live: live, now: Date.now() };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Slide list + speaker notes.
 *  Fast path: ONE Slides API call for the whole deck (title, notes, hidden flags, revision).
 *  Fallback: SlidesApp, which needs ~3 round-trips per slide and can take 30 s+ on a big deck. */
function getDeck_(id) {
  if (!id) throw new Error('Missing deck id');
  var t0 = Date.now(), fastError = null;
  if (typeof Slides !== 'undefined') {
    try { var d = getDeckFast_(id); d.ms = Date.now() - t0; return d; }
    catch (err) { fastError = String(err && err.message || err); Logger.log('fast path failed, falling back: ' + fastError); }
  } else {
    fastError = 'Google Slides API service is not enabled in this script (Services + → Google Slides API)';
  }
  var out = getDeckSlow_(id);
  out.fastError = fastError; out.ms = Date.now() - t0;
  return out;
}

function getDeckFast_(id) {
  var fields = 'title,revisionId,pageSize,slides(objectId,slideProperties(isSkipped,notesPage(pageElements(shape(placeholder(type),text(textElements(paragraphMarker(bullet(glyph,nestingLevel)),textRun(content,style(bold,italic,underline,strikethrough,fontSize,foregroundColor)),autoText(content,style(bold,italic,fontSize)))))))))';
  var j = Slides.Presentations.get(id, { fields: fields });
  var slides = (j.slides || []).map(function (s, i) {
    var sp = s.slideProperties || {};
    var notes = '', notesEls = null;
    var els = (sp.notesPage && sp.notesPage.pageElements) || [];
    els.forEach(function (el) {
      var sh = el.shape;
      if (sh && sh.placeholder && sh.placeholder.type === 'BODY') {
        notesEls = (sh.text && sh.text.textElements) || [];              // styled runs: sizes, bold, bullets, colours
        notes = notesEls.map(function (t) { return (t.textRun && t.textRun.content) || ''; }).join('');
      }
    });
    return { id: s.objectId, index: i + 1, notes: notes.replace(/\s+$/, ''), notesEls: notesEls, skipped: !!sp.isSkipped };
  });
  var w = j.pageSize && j.pageSize.width && j.pageSize.width.magnitude;
  var h = j.pageSize && j.pageSize.height && j.pageSize.height.magnitude;
  return { ok: true, id: id, title: j.title || 'Untitled', width: w || 16, height: h || 9, revisionId: j.revisionId || null, slides: slides, via: 'api' };
}

function getDeckSlow_(id) {
  var pres = SlidesApp.openById(id);
  var all = pres.getSlides();
  var wantRich = all.length <= MAX_RICH_SLOW;          // per-run formatting is slow via SlidesApp; keep big decks fast
  var slides = all.map(function (s, i) {
    var notes = '', rich = null;
    try {
      var shape = s.getNotesPage().getSpeakerNotesShape();
      if (shape) { notes = shape.getText().asString(); if (wantRich) rich = richFromTextRange_(shape.getText()); }
    } catch (ignored) { /* slide without a notes shape */ }
    return { id: s.getObjectId(), index: i + 1, notes: notes.replace(/\s+$/, ''), rich: rich, skipped: s.isSkipped() };
  });
  return { ok: true, id: id, title: pres.getName(), width: pres.getPageWidth(), height: pres.getPageHeight(), revisionId: null, slides: slides, via: 'slidesapp' };
}

/** SlidesApp fallback: paragraphs of styled runs, same shape the view builds from the API. */
function richFromTextRange_(tr) {
  return tr.getParagraphs().map(function (p) {
    var r = p.getRange(), g = null, lvl = 0;
    try { var ls = r.getListStyle(); if (ls && ls.isInList()) { g = ls.getGlyph() || '•'; lvl = ls.getNestingLevel() || 0; } } catch (ignored) {}
    var runs = r.getRuns().map(function (run) {
      var st = run.getTextStyle(), c = null;
      try { var col = st.getForegroundColor(); if (col && col.getColorType() == SlidesApp.ColorType.RGB) c = col.asRgbColor().asHexString(); } catch (ignored) {}
      return { t: run.asString(), pt: st.getFontSize(), b: !!st.isBold(), i: !!st.isItalic(), u: !!st.isUnderline(), s: !!st.isStrikethrough(), c: c };
    });
    if (runs.length) runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\n$/, '');
    return { g: g, lvl: lvl, runs: runs };
  });
}

/** Thumbnails for a handful of pages. size: SMALL (200px) | MEDIUM (800px) | LARGE (1600px) */
function getThumbs_(id, pages, size) {
  if (!id) throw new Error('Missing deck id');
  if (typeof Slides === 'undefined') throw new Error('Enable "Google Slides API" under Services (+) in the Apps Script editor');
  if (['SMALL', 'MEDIUM', 'LARGE'].indexOf(size) < 0) size = 'LARGE';
  pages = pages.slice(0, MAX_THUMBS_PER_CALL);
  var thumbs = {};
  pages.forEach(function (pageId) {
    var r = Slides.Presentations.Pages.getThumbnail(id, pageId, {
      'thumbnailProperties.thumbnailSize': size,
      'thumbnailProperties.mimeType': 'PNG'
    });
    thumbs[pageId] = r.contentUrl;
  });
  return { ok: true, thumbs: thumbs };
}

/** Run this once from the editor to grant permissions (and sanity-check a deck). */
function test() {
  Logger.log('Running as: ' + Session.getEffectiveUser().getEmail());
  if (!TEST_DECK_ID) { Logger.log('Permissions OK. Set TEST_DECK_ID to also test a deck.'); return; }
  var d = getDeck_(TEST_DECK_ID);
  Logger.log(d.title + ' — ' + d.slides.length + ' slides, revision ' + d.revisionId + ' (via ' + d.via + ')');
  var t = getThumbs_(TEST_DECK_ID, [d.slides[0].id], 'SMALL');
  Logger.log('First thumbnail: ' + t.thumbs[d.slides[0].id]);
}
