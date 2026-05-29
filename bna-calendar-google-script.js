// BNA Calendar — Google Apps Script
// Deploy as Web App: Execute as Me, Anyone can access (even anonymous).
// Add a time-based trigger on warmCache() (every 5 hours) to keep the
// cache fresh so visitors never hit a cold start. See setup notes below.

var CALENDARS = [
  { id: 'c_e0f11e4cdaf686bb79f2f2a4d0ded1bb97a2f3b124f5c28d0e7c54f503b68445@group.calendar.google.com', label: 'BNA',       color: 'main'   },
  { id: 'c_3522f129b97488128b7810f29bc083bcd52de5e37464b11b1a41fa1c2a67fdcc@group.calendar.google.com',  label: 'Community', color: 'second' }
];

var DAYS_AHEAD = 180;
var CACHE_TTL  = 21600; // 6 hours (seconds)

/* ── Web app entry point ── */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var start  = params.start ? new Date(params.start) : new Date();
  var end    = params.end   ? new Date(params.end)
                            : new Date(start.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);

  var json = getEventsJSON(start, end, false);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* ── Shared builder: returns cached JSON if present, else reads + caches ──
   forceRefresh=true rebuilds even if a cached copy exists (used by warmCache). */
function getEventsJSON(start, end, forceRefresh) {
  var cacheKey = 'bna_' + start.toDateString() + '_' + end.toDateString();
  var cache    = CacheService.getScriptCache();

  if (!forceRefresh) {
    var cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  var events = [];
  CALENDARS.forEach(function(cal) {
    try {
      var calendar = CalendarApp.getCalendarById(cal.id);
      if (!calendar) return;
      calendar.getEvents(start, end).forEach(function(ev) {
        events.push({
          title:    ev.getTitle(),
          start:    ev.getStartTime().toISOString(),
          end:      ev.getEndTime().toISOString(),
          allDay:   ev.isAllDayEvent(),
          location: ev.getLocation() || '',
          desc:     ev.getDescription() || '',
          color:    cal.color,
          label:    cal.label
        });
      });
    } catch (err) {}
  });

  events.sort(function(a, b) { return new Date(a.start) - new Date(b.start); });

  var output = JSON.stringify({ events: events });

  // CacheService rejects values over 100KB; guard so a large payload
  // never silently fails to cache (it just won't cache that one build).
  if (output.length < 100000) {
    cache.put(cacheKey, output, CACHE_TTL);
  }

  return output;
}

/* ── Background warmer ──
   Set a time-based trigger to run this every 5 hours. It rebuilds the
   default 180-day payload (the same key visitors hit) so the cache is
   always fresh and the runtime stays warm. */
function warmCache() {
  var start = new Date();
  var end   = new Date(start.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  getEventsJSON(start, end, true); // force rebuild
}
