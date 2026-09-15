/**
 * Mosc-tools Presenter View — Google Slides bridge
 * ------------------------------------------------
 * A tiny Apps Script web app that runs AS YOU and hands the presenter view
 * three things it cannot get on its own from a local HTML file:
 *   • the slide list (ids, order, hidden flag) and speaker notes
 *   • slide images (Slides API thumbnails, 1600 px wide, ~30 min URLs)
 *   • the deck's revisionId so the view can notice edits
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
var MAX_THUMBS_PER_CALL = 8;    // keeps each request well under the 6-minute script limit

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (!TOKEN || TOKEN.indexOf('CHANGE-ME') === 0) throw new Error('Set TOKEN in Code.gs before deploying');
    if (p.token !== TOKEN) throw new Error('Bad token');
    switch (p.action) {
      case 'ping':
        return json_({ ok: true, user: Session.getEffectiveUser().getEmail(), version: 2, slidesApi: typeof Slides !== 'undefined' });
      case 'deck':
        return json_(getDeck_(p.id));
      case 'thumbs':
        return json_(getThumbs_(p.id, String(p.pages || '').split(',').filter(String), p.size || 'LARGE'));
      default:
        throw new Error('Unknown action "' + p.action + '"');
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Slide list + speaker notes.
 *  Fast path: ONE Slides API call for the whole deck (title, notes, hidden flags, revision).
 *  Fallback: SlidesApp, which needs ~3 round-trips per slide and can take 30 s+ on a big deck. */
function getDeck_(id) {
  if (!id) throw new Error('Missing deck id');
  if (typeof Slides !== 'undefined') {
    try { return getDeckFast_(id); } catch (err) { Logger.log('fast path failed, falling back: ' + err); }
  }
  return getDeckSlow_(id);
}

function getDeckFast_(id) {
  var fields = 'title,revisionId,pageSize,slides(objectId,slideProperties(isSkipped,notesPage(pageElements(shape(placeholder(type),text(textElements(textRun(content))))))))';
  var j = Slides.Presentations.get(id, { fields: fields });
  var slides = (j.slides || []).map(function (s, i) {
    var sp = s.slideProperties || {};
    var notes = '';
    var els = (sp.notesPage && sp.notesPage.pageElements) || [];
    els.forEach(function (el) {
      var sh = el.shape;
      if (sh && sh.placeholder && sh.placeholder.type === 'BODY') {
        notes = ((sh.text && sh.text.textElements) || []).map(function (t) { return (t.textRun && t.textRun.content) || ''; }).join('');
      }
    });
    return { id: s.objectId, index: i + 1, notes: notes.replace(/\s+$/, ''), skipped: !!sp.isSkipped };
  });
  var w = j.pageSize && j.pageSize.width && j.pageSize.width.magnitude;
  var h = j.pageSize && j.pageSize.height && j.pageSize.height.magnitude;
  return { ok: true, id: id, title: j.title || 'Untitled', width: w || 16, height: h || 9, revisionId: j.revisionId || null, slides: slides, via: 'api' };
}

function getDeckSlow_(id) {
  var pres = SlidesApp.openById(id);
  var slides = pres.getSlides().map(function (s, i) {
    var notes = '';
    try {
      var shape = s.getNotesPage().getSpeakerNotesShape();
      if (shape) notes = shape.getText().asString();
    } catch (ignored) { /* slide without a notes shape */ }
    return { id: s.getObjectId(), index: i + 1, notes: notes.replace(/\s+$/, ''), skipped: s.isSkipped() };
  });
  return { ok: true, id: id, title: pres.getName(), width: pres.getPageWidth(), height: pres.getPageHeight(), revisionId: null, slides: slides, via: 'slidesapp' };
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
