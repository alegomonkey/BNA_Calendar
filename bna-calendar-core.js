/* ── BNA Community Calendar — Core ──────────────────────────────────────
   Shared state, helpers, popups, toolbar, and lazy module loader.
   Each view module fetches only its own date range and caches it locally.
──────────────────────────────────────────────────────────────────────── */
(function(){

  var B = window._BNA = {

    /* ── Apps Script endpoint ── */
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzEgHIhPfCj4afp83Awaq4oj-oZ7pzkv0Hsath8ZwOIQCNR9-B31uR-WYfyme9xel0leA/exec',

    /* ── CDN URLs for view modules
          Update the version tag here AND in bna-calendar-block-slim.html
          whenever you push changes to any module file.                  ── */
    AGENDA_URL: 'https://cdn.jsdelivr.net/gh/alegomonkey/BNA_Calendar@latest/bna-calendar-agenda.js',
    MONTH_URL:  'https://cdn.jsdelivr.net/gh/alegomonkey/BNA_Calendar@latest/bna-calendar-month.js',
    WEEK_URL:   'https://cdn.jsdelivr.net/gh/alegomonkey/BNA_Calendar@latest/bna-calendar-week.js',

    /* ── config ── */
    PAGE_SIZE:  5,
    HOUR_START: 7,
    HOUR_END:   21,
    MOBILE_BP:  500,

    /* ── runtime state ── */
    container:  null,
    /* allEvents holds the current view's dataset.
       Each view module sets this before rendering so popup index lookups
       always reference the right array.                                 */
    allEvents:  [],
    shownCount: 0,
    curView:    'agenda',
    curDate:    new Date(),
    filterState: {
      text:     '',
      tags:     { main: true, second: true },
      days:     [true,true,true,true,true,true,true],
      location: ''
    },

    /* ── lookup tables ── */
    DOW_SHORT: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
    DOW_ABBR:  ['Su','Mo','Tu','We','Th','Fr','Sa'],
    MON_FULL:  ['January','February','March','April','May','June','July','August','September','October','November','December'],
    MON_SHORT: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],

    /* ── module registry ── */
    _loaded: {},

    /* ── render functions (registered by view modules) ── */
    renderAgenda: null,
    renderMonth:  null,
    renderWeek:   null
  };

  /* ══════════════════════════════════════════════
     DATA FETCH  (used by all view modules)
  ══════════════════════════════════════════════ */
  B.fetchEvents = function(start, end){
    var url = B.SCRIPT_URL
      + '?start=' + encodeURIComponent(start.toISOString())
      + '&end='   + encodeURIComponent(end.toISOString());
    return fetch(url)
      .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(data){ return data.events || []; });
  };

  /* ══════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════ */
  B.isMobile = function(){ return window.innerWidth < B.MOBILE_BP; };
  B.pad = function(n){ return n < 10 ? '0' + n : '' + n; };

  B.stripHtml = function(html){
    if(!html) return '';
    var s = html.replace(/\x3Cbr\s*\/?\x3E/gi,' ').replace(/\x3C\/?(p|div|li|span|tr)[^\x3E]*\x3E/gi,' ');
    var tmp = document.createElement('div');
    tmp.innerHTML = s;
    return (tmp.textContent || tmp.innerText || '').replace(/\s+/g,' ').trim();
  };

  B.truncate = function(str, max){
    str = B.stripHtml(str);
    if(!str) return {text:'', clipped:false};
    if(str.length <= max) return {text:str, clipped:false};
    var cut = str.lastIndexOf(' ', max);
    if(cut < max * 0.6) cut = max;
    return {text:str.slice(0,cut), clipped:true};
  };

  B.esc = function(s){
    return (s||'').replace(/&/g,'&amp;').replace(/\x3C/g,'&lt;').replace(/\x3E/g,'&gt;');
  };

  B.linkify = function(str){
    return str.replace(/(https?:\/\/[^\s\x3C\x3E"]+)/g,
      '<a href="$1" target="_blank" rel="noopener" class="bna-desc-link">$1</a>');
  };

  /* ══════════════════════════════════════════════
     FILTER HELPERS
  ══════════════════════════════════════════════ */
  B.applyFilters = function(events){
    return events.filter(function(ev){
      if(B.filterState.text){
        var q = B.filterState.text.toLowerCase();
        var hay = (ev.title+' '+B.stripHtml(ev.desc)+' '+(ev.location||'')).toLowerCase();
        if(hay.indexOf(q)<0) return false;
      }
      if(!B.filterState.tags[ev.color]) return false;
      var dow = new Date(ev.start).getDay();
      if(!B.filterState.days[dow]) return false;
      if(B.filterState.location && (ev.location||'').trim()!==B.filterState.location) return false;
      return true;
    });
  };

  B.filtersActive = function(){
    if(B.filterState.text) return true;
    if(!B.filterState.tags.main||!B.filterState.tags.second) return true;
    for(var i=0;i<7;i++) if(!B.filterState.days[i]) return true;
    if(B.filterState.location) return true;
    return false;
  };

  /* ══════════════════════════════════════════════
     DATE HELPERS
  ══════════════════════════════════════════════ */
  B.sameDay = function(a,b){
    return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  };
  B.startOfWeek = function(d){
    var s=new Date(d); s.setHours(0,0,0,0); s.setDate(s.getDate()-s.getDay()); return s;
  };
  B.addDays = function(d,n){
    var r=new Date(d); r.setDate(r.getDate()+n); return r;
  };
  B.eventsForDay = function(day){
    return B.allEvents.filter(function(ev){
      var s=new Date(ev.start), e=new Date(ev.end);
      if(ev.allDay){
        var ds=new Date(s.getFullYear(),s.getMonth(),s.getDate());
        var de=new Date(e.getFullYear(),e.getMonth(),e.getDate());
        var dd=new Date(day.getFullYear(),day.getMonth(),day.getDate());
        return dd>=ds && dd<de;
      }
      return B.sameDay(s,day);
    });
  };

  /* ══════════════════════════════════════════════
     TIME FORMATTING
  ══════════════════════════════════════════════ */
  B.formatTime = function(iso){
    var d=new Date(iso), h=d.getHours(), m=d.getMinutes(), ampm=h>=12?'pm':'am';
    h=h%12||12;
    return h+(m?':'+B.pad(m):'')+'\u202f'+ampm;
  };
  B.formatRange = function(ev){
    if(ev.allDay) return 'All day';
    var s=B.formatTime(ev.start), e=B.formatTime(ev.end);
    return (e&&e!==s)?s+' \u2013 '+e:s;
  };

  /* ══════════════════════════════════════════════
     ADD-TO-CALENDAR
  ══════════════════════════════════════════════ */
  B.toGCalUrl = function(ev){
    var fmt=function(iso){return iso.replace(/[-:]/g,'').replace(/\.\d+/,'');};
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      +'&text='+encodeURIComponent(ev.title)
      +'&dates='+fmt(ev.start)+'/'+fmt(ev.end)
      +'&details='+encodeURIComponent(B.stripHtml(ev.desc))
      +'&location='+encodeURIComponent(ev.location||'');
  };

  B.makeICS = function(ev){
    var now=new Date();
    var stamp=now.getUTCFullYear()+B.pad(now.getUTCMonth()+1)+B.pad(now.getUTCDate())
      +'T'+B.pad(now.getUTCHours())+B.pad(now.getUTCMinutes())+B.pad(now.getUTCSeconds())+'Z';
    var fmt=function(iso){return iso.replace(/[-:]/g,'').replace(/\.\d+/,'');};
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BNA//EN',
      'BEGIN:VEVENT','UID:'+stamp+'@bna','DTSTAMP:'+stamp,
      'DTSTART:'+(ev.allDay?fmt(ev.start).slice(0,8):fmt(ev.start)),
      'DTEND:'+(ev.allDay?fmt(ev.end).slice(0,8):fmt(ev.end)),
      'SUMMARY:'+(ev.title||''),
      'DESCRIPTION:'+B.stripHtml(ev.desc||'').replace(/\n/g,'\\n'),
      'LOCATION:'+(ev.location||''),
      'END:VEVENT','END:VCALENDAR'].join('\r\n');
  };

  B.downloadICS = function(ev){
    var blob=new Blob([B.makeICS(ev)],{type:'text/calendar'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(ev.title||'event').replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.ics';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  };

  /* ══════════════════════════════════════════════
     POPUP
  ══════════════════════════════════════════════ */
  B.showPopup = function(ev){
    var old=document.getElementById('bna-popup-overlay'); if(old) old.parentNode.removeChild(old);
    var t=B.truncate(ev.desc,600);
    var tagBg=ev.color==='main'?'#fce8ee':'#e8eaf6', tagCl=ev.color==='main'?'#ad1457':'#3f51b5';
    var overlay=document.createElement('div');
    overlay.className='ev-popup-overlay'; overlay.id='bna-popup-overlay';
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label',ev.title||'Event details');
    overlay.innerHTML='<div class="ev-popup">'
      +'<button class="ev-popup-close" id="bna-popup-close" aria-label="Close">&times;</button>'
      +'<span class="ev-popup-tag" style="background:'+tagBg+';color:'+tagCl+'">'+ev.label+'</span>'
      +'<div class="ev-popup-title">'+B.esc(ev.title)+'</div>'
      +'<div class="ev-popup-meta">&#128336; '+B.formatRange(ev)+'</div>'
      +(ev.location?'<div class="ev-popup-meta">&#128205; '+B.esc(ev.location)+'</div>':'')
      +(t.text?'<div class="ev-popup-desc">'+B.linkify(B.esc(t.text))+(t.clipped?'&hellip;':'')+'</div>':'')
      +'<div class="ev-popup-actions">'
      +'<a class="btn-cal btn-gcal" href="'+B.toGCalUrl(ev)+'" target="_blank" rel="noopener">+ Google Calendar</a>'
      +'<button class="btn-cal btn-ical" id="bna-popup-ical">&#8615; iCal</button>'
      +'</div></div>';
    B.container.appendChild(overlay);
    var closeBtn=document.getElementById('bna-popup-close');
    closeBtn.onclick=B.closePopup;
    document.getElementById('bna-popup-ical').onclick=function(){B.downloadICS(ev);};
    overlay.addEventListener('click',function(e){if(e.target===overlay)B.closePopup();});
    closeBtn.focus();
    document.addEventListener('keydown',B.onPopupKey);
  };

  B.closePopup = function(){
    var o=document.getElementById('bna-popup-overlay');
    if(o) o.parentNode.removeChild(o);
    document.removeEventListener('keydown',B.onPopupKey);
  };
  B.onPopupKey = function(e){ if(e.key==='Escape'||e.keyCode===27) B.closePopup(); };

  B.showDayPopout = function(day){
    var old=document.getElementById('bna-popup-overlay'); if(old) old.parentNode.removeChild(old);
    var evs=B.eventsForDay(day);
    var label=B.DOW_SHORT[day.getDay()]+', '+B.MON_FULL[day.getMonth()]+' '+day.getDate();
    var rows=evs.map(function(ev){
      var tagBg=ev.color==='main'?'#fce8ee':'#e8eaf6', tagCl=ev.color==='main'?'#ad1457':'#3f51b5';
      return '<button class="day-pop-row" data-evidx="'+B.allEvents.indexOf(ev)+'">'
        +'<div class="day-pop-title">'+B.esc(ev.title)
        +'<span class="cal-source-tag" style="background:'+tagBg+';color:'+tagCl+'">'+ev.label+'</span></div>'
        +'<div class="day-pop-time">'+B.formatRange(ev)+'</div>'
        +'</button>';
    }).join('');
    var overlay=document.createElement('div');
    overlay.className='ev-popup-overlay'; overlay.id='bna-popup-overlay';
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Events on '+label);
    overlay.innerHTML='<div class="ev-popup">'
      +'<button class="ev-popup-close" id="bna-popup-close" aria-label="Close">&times;</button>'
      +'<div class="ev-popup-title">'+label+'</div>'
      +'<div class="day-pop-list">'+rows+'</div>'
      +'</div>';
    B.container.appendChild(overlay);
    var closeBtn=document.getElementById('bna-popup-close');
    closeBtn.onclick=B.closePopup;
    overlay.addEventListener('click',function(e){
      if(e.target===overlay){B.closePopup();return;}
      var row=e.target.closest('[data-evidx]');
      if(row){B.closePopup();B.showPopup(B.allEvents[+row.getAttribute('data-evidx')]);}
    });
    closeBtn.focus();
    document.addEventListener('keydown',B.onPopupKey);
  };

  /* ══════════════════════════════════════════════
     MODULE LOADER
  ══════════════════════════════════════════════ */
  B.loadScript = function(url){
    return new Promise(function(resolve,reject){
      var s=document.createElement('script'); s.src=url; s.async=true;
      s.onload=resolve;
      s.onerror=function(){reject(new Error('Failed to load '+url));};
      document.head.appendChild(s);
    });
  };

  B.requireModule = function(key){
    if(B._loaded[key]) return Promise.resolve();
    var urls={agenda:B.AGENDA_URL, month:B.MONTH_URL, week:B.WEEK_URL};
    return B.loadScript(urls[key]).then(function(){ B._loaded[key]=true; });
  };

  /* ══════════════════════════════════════════════
     SPINNER HELPER  (used by view modules for data loading)
  ══════════════════════════════════════════════ */
  B.showSpinner = function(){
    var content=document.getElementById('bna-content');
    if(content) content.innerHTML='<div class="cal-spinner" role="status" aria-label="Loading"><div class="spinner-ring"></div></div>';
  };

  /* ══════════════════════════════════════════════
     TOOLBAR
  ══════════════════════════════════════════════ */
  var VIEW_LABELS={agenda:'Schedule',month:'Month',week:'Week'};

  B.navLabel = function(){
    if(B.curView==='agenda') return 'Upcoming Events';
    if(B.curView==='month')  return B.MON_FULL[B.curDate.getMonth()]+' '+B.curDate.getFullYear();
    if(B.curView==='week'){
      var s=B.startOfWeek(B.curDate), e=B.addDays(s,6);
      if(s.getMonth()===e.getMonth())
        return B.MON_SHORT[s.getMonth()]+' '+s.getDate()+' \u2013 '+e.getDate()+', '+s.getFullYear();
      return B.MON_SHORT[s.getMonth()]+' '+s.getDate()+' \u2013 '+B.MON_SHORT[e.getMonth()]+' '+e.getDate()+', '+s.getFullYear();
    }
  };

  B.buildToolbar = function(){
    var tb=document.createElement('div'); tb.className='cal-toolbar'; tb.id='bna-toolbar';
    var isNav=(B.curView!=='agenda');
    var hideCls=isNav?'':' nav-hidden';
    var leftHTML='<div class="toolbar-left">'
      +'<button class="cal-nav-btn'+hideCls+'" id="bna-prev">&#8249;</button>'
      +'<span class="nav-label">'+B.navLabel()+'</span>'
      +'<button class="cal-nav-btn'+hideCls+'" id="bna-next">&#8250;</button>'
      +(isNav?'<button class="cal-nav-today" id="bna-today">Today</button>':'')
      +'</div>';
    var dropHTML='<div class="view-dropdown" id="bna-view-dropdown">'
      +'<button class="view-dropdown-btn" id="bna-view-btn">'+VIEW_LABELS[B.curView]+'</button>'
      +'<div class="view-dropdown-menu" id="bna-view-menu">'
      +'<button data-view="agenda" class="'+(B.curView==='agenda'?'active':'')+'">Schedule</button>'
      +'<button data-view="month"  class="'+(B.curView==='month' ?'active':'')+'">Month</button>'
      +'<button data-view="week"   class="'+(B.curView==='week'  ?'active':'')+'">Week</button>'
      +'</div></div>';
    tb.innerHTML=leftHTML+dropHTML;
    return tb;
  };

  B.navigate = function(dir){
    if(B.curView==='month') B.curDate=new Date(B.curDate.getFullYear(),B.curDate.getMonth()+dir,1);
    if(B.curView==='week')  B.curDate=B.addDays(B.curDate,dir*7);
    B.drawView();
  };
  B.setView = function(v){ B.curView=v; B.drawView(); };

  /* ══════════════════════════════════════════════
     DRAW VIEW  (lazy-loads module on first access;
                 each module handles its own data fetch)
  ══════════════════════════════════════════════ */
  B.drawView = function(){
    var old=document.getElementById('bna-toolbar'); if(old) old.parentNode.removeChild(old);
    var oldC=document.getElementById('bna-content'); if(oldC) oldC.parentNode.removeChild(oldC);
    B.container.innerHTML='';

    var tb=B.buildToolbar();
    B.container.appendChild(tb);
    var content=document.createElement('div'); content.id='bna-content';
    B.container.appendChild(content);

    var dropBtn=tb.querySelector('#bna-view-btn');
    var dropMenu=tb.querySelector('#bna-view-menu');
    dropBtn.addEventListener('click',function(e){ e.stopPropagation(); dropMenu.classList.toggle('open'); });
    document.addEventListener('click',function closeDD(e){
      if(!tb.contains(e.target)){ dropMenu.classList.remove('open'); document.removeEventListener('click',closeDD); }
    });
    tb.addEventListener('click',function(e){
      var tab=e.target.closest('[data-view]');
      if(tab){ dropMenu.classList.remove('open'); B.setView(tab.getAttribute('data-view')); return; }
      if(e.target.id==='bna-prev'){ B.navigate(-1); return; }
      if(e.target.id==='bna-next'){ B.navigate(1); return; }
      if(e.target.id==='bna-today'){ B.curDate=new Date(); B.drawView(); return; }
    });

    var key=B.curView;

    if(B._loaded[key]){
      B._render(key); /* module cached — render calls its own data cache */
    } else {
      /* First time this view type is used — show spinner while JS loads */
      content.innerHTML='<div class="cal-spinner" role="status" aria-label="Loading"><div class="spinner-ring"></div></div>';
      B.requireModule(key)
        .then(function(){ B._render(key); })
        .catch(function(err){
          content.innerHTML='<div class="cal-error"><strong>Could not load this view.</strong> Please try refreshing.</div>';
          console.error('BNA module error:',err);
        });
    }
  };

  B._render = function(key){
    if(key==='agenda' && B.renderAgenda) B.renderAgenda(false);
    else if(key==='month' && B.renderMonth) B.renderMonth();
    else if(key==='week'  && B.renderWeek)  B.renderWeek();
  };

  /* ══════════════════════════════════════════════
     INIT — preload agenda module (no global data fetch)
  ══════════════════════════════════════════════ */
  B.container=document.getElementById('bna-cal');
  if(!B.container) return;

  B.requireModule('agenda')
    .then(function(){ B.drawView(); })
    .catch(function(err){
      B.container.innerHTML='<div class="cal-error">'
        +'<strong>Could not load the calendar.</strong> Please try refreshing.'
        +'</div>';
      console.error('BNA init error:',err);
    });

})();
