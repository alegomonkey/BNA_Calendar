// BNA Calendar — Google Apps Script

var CALENDARS = [
  { id: 'c_e0f11e4cdaf686bb79f2f2a4d0ded1bb97a2f3b124f5c28d0e7c54f503b68445@group.calendar.google.com', label: 'BNA',       color: 'main'   },
  { id: 'c_3522f129b97488128b7810f29bc083bcd52de5e37464b11b1a41fa1c2a67fdcc@group.calendar.google.com',  label: 'Community', color: 'second' }
];

var DAYS_AHEAD = 180;

function doGet() {
  var now   = new Date();
  var end   = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  var events = [];

  CALENDARS.forEach(function(cal) {
    try {
      var calendar = CalendarApp.getCalendarById(cal.id);
      if (!calendar) return;
      calendar.getEvents(now, end).forEach(function(ev) {
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
    } catch(e) {
      // skip inaccessible calendar silently
    }
  });

  events.sort(function(a, b) { return new Date(a.start) - new Date(b.start); });

  var output = ContentService
    .createTextOutput(JSON.stringify({ events: events }))
    .setMimeType(ContentService.MimeType.JSON);

  return output;
}
