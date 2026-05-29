(function(){
  var SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwY31dCkR7B_CNObIlLyS97bIwYTUk3s26ionENU6Nla1nwjP7Qp2hA-TiInv9Z9tP3Jg/exec';
  var PAGE_SIZE  = 5;
  var HOUR_START = 7;
  var HOUR_END   = 21;
  var MOBILE_BP  = 500;

  var container = document.getElementById('bna-cal');
  if (!container) return;

  var allEvents  = [];
  var shownCount = 0;
  var curView    = 'agenda';
  var curDate    = new Date();

  /* ── filter state (persists across view switches) ── */
  var filterState = {
    text:     '',
    tags:     { main: true, second: true },
    days:     [true,true,true,true,true,true,true],
    location: ''
  };

  var DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var DOW_ABBR  = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  var MON_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function isMobile(){ return window.innerWidth < MOBILE_BP; }
  function pad(n){ return n < 10 ? '0' + n : '' + n; }

  /* ── text helpers ── */
  function stripHtml(html){
    if (!html) return '';
    var s = html.replace(/\x3Cbr\s*\/?\x3E/gi,' ').replace(/\x3C\/?(p|div|li|span|tr)[^\x3E]*\x3E/gi,' ');
    var tmp = document.createElement('div');
    tmp.innerHTML = s;
    return (tmp.textContent || tmp.innerText || '').replace(/\s+/g,' ').trim();
  }
  function truncate(str, max){
    str = stripHtml(str);
    if (!str) return {text:'', clipped:false};
    if (str.length <= max) return {text:str, clipped:false};
    var cut = str.lastIndexOf(' ', max);
    if (cut < max * 0.6) cut = max;
    return {text:str.slice(0,cut), clipped:true};
  }
  function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/\x3C/g,'&lt;').replace(/\x3E/g,'&gt;'); }
  function linkify(str){
    return str.replace(/(https?:\/\/[^\s\x3C\x3E"]+)/g,'<a href="$1" target="_blank" rel="noopener" class="bna-desc-link">$1</a>');
  }

  /* ── filter helpers ── */
  function applyFilters(events){
    return events.filter(function(ev){
      if(filterState.text){
        var q=filterState.text.toLowerCase();
        var hay=(ev.title+' '+stripHtml(ev.desc)+' '+(ev.location||'')).toLowerCase();
        if(hay.indexOf(q)<0) return false;
      }
      if(!filterState.tags[ev.color]) return false;
      var dow=new Date(ev.start).getDay();
      if(!filterState.days[dow]) return false;
      if(filterState.location && (ev.location||'').trim()!==filterState.location) return false;
      return true;
    });
  }
  function filtersActive(){
    if(filterState.text) return true;
    if(!filterState.tags.main||!filterState.tags.second) return true;
    for(var i=0;i<7;i++) if(!filterState.days[i]) return true;
    if(filterState.location) return true;
    return false;
  }

  /* ── date helpers ── */
  function sameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
  function startOfWeek(d){ var s=new Date(d); s.setHours(0,0,0,0); s.setDate(s.getDate()-s.getDay()); return s; }
  function addDays(d,n){ var r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function eventsForDay(day){
    return allEvents.filter(function(ev){
      var s=new Date(ev.start), e=new Date(ev.end);
      if(ev.allDay){
        var ds=new Date(s.getFullYear(),s.getMonth(),s.getDate());
        var de=new Date(e.getFullYear(),e.getMonth(),e.getDate());
        var dd=new Date(day.getFullYear(),day.getMonth(),day.getDate());
        return dd>=ds&&dd<de;
      }
      return sameDay(s,day);
    });
  }

  /* ── time formatting ── */
  function formatTime(iso){
    var d=new Date(iso), h=d.getHours(), m=d.getMinutes(), ampm=h>=12?'pm':'am';
    h=h%12||12;
    return h+(m?':'+pad(m):'')+'\u202f'+ampm;
  }
  function formatRange(ev){
    if(ev.allDay) return 'All day';
    var s=formatTime(ev.start), e=formatTime(ev.end);
    return (e&&e!==s)?s+' \u2013 '+e:s;
  }

  /* ── add-to-cal ── */
  function toGCalUrl(ev){
    var fmt=function(iso){return iso.replace(/[-:]/g,'').replace(/\.\d+/,'');};
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      +'&text='+encodeURIComponent(ev.title)
      +'&dates='+fmt(ev.start)+'/'+fmt(ev.end)
      +'&details='+encodeURIComponent(stripHtml(ev.desc))
      +'&location='+encodeURIComponent(ev.location||'');
  }
  function makeICS(ev){
    var now=new Date();
    var stamp=now.getUTCFullYear()+pad(now.getUTCMonth()+1)+pad(now.getUTCDate())+'T'+pad(now.getUTCHours())+pad(now.getUTCMinutes())+pad(now.getUTCSeconds())+'Z';
    var fmt=function(iso){return iso.replace(/[-:]/g,'').replace(/\.\d+/,'');};
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BNA//EN',
      'BEGIN:VEVENT','UID:'+stamp+'@bna','DTSTAMP:'+stamp,
      'DTSTART:'+(ev.allDay?fmt(ev.start).slice(0,8):fmt(ev.start)),
      'DTEND:'+(ev.allDay?fmt(ev.end).slice(0,8):fmt(ev.end)),
      'SUMMARY:'+(ev.title||''),
      'DESCRIPTION:'+stripHtml(ev.desc||'').replace(/\n/g,'\\n'),
      'LOCATION:'+(ev.location||''),
      'END:VEVENT','END:VCALENDAR'].join('\r\n');
  }
  function downloadICS(ev){
    var blob=new Blob([makeICS(ev)],{type:'text/calendar'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(ev.title||'event').replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.ics';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  }

  /* ── popup ── */
  function showPopup(ev){
    var old=document.getElementById('bna-popup-overlay'); if(old) old.parentNode.removeChild(old);
    var t=truncate(ev.desc,600);
    var tagBg=ev.color==='main'?'#fce8ee':'#e8eaf6', tagCl=ev.color==='main'?'#ad1457':'#3f51b5';
    var overlay=document.createElement('div');
    overlay.className='ev-popup-overlay'; overlay.id='bna-popup-overlay';
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label',ev.title||'Event details');
    overlay.innerHTML='<div class="ev-popup">'
      +'<button class="ev-popup-close" id="bna-popup-close" aria-label="Close">&times;</button>'
      +'<span class="ev-popup-tag" style="background:'+tagBg+';color:'+tagCl+'">'+ev.label+'</span>'
      +'<div class="ev-popup-title">'+esc(ev.title)+'</div>'
      +'<div class="ev-popup-meta">&#128336; '+formatRange(ev)+'</div>'
      +(ev.location?'<div class="ev-popup-meta">&#128205; '+esc(ev.location)+'</div>':'')
      +(t.text?'<div class="ev-popup-desc">'+linkify(esc(t.text))+(t.clipped?'&hellip;':'')+'</div>':'')
      +'<div class="ev-popup-actions">'
      +'<a class="btn-cal btn-gcal" href="'+toGCalUrl(ev)+'" target="_blank" rel="noopener">+ Google Calendar</a>'
      +'<button class="btn-cal btn-ical" id="bna-popup-ical">&#8615; iCal</button>'
      +'</div></div>';
    container.appendChild(overlay);
    var closeBtn=document.getElementById('bna-popup-close');
    closeBtn.onclick=closePopup;
    document.getElementById('bna-popup-ical').onclick=function(){downloadICS(ev);};
    overlay.addEventListener('click',function(e){if(e.target===overlay)closePopup();});
    closeBtn.focus();
    document.addEventListener('keydown',onPopupKey);
  }
  function closePopup(){
    var o=document.getElementById('bna-popup-overlay');
    if(o) o.parentNode.removeChild(o);
    document.removeEventListener('keydown',onPopupKey);
  }
  function onPopupKey(e){ if(e.key==='Escape'||e.keyCode===27) closePopup(); }

  /* ── day popout ── */
  function showDayPopout(day){
    var old=document.getElementById('bna-popup-overlay'); if(old) old.parentNode.removeChild(old);
    var evs=eventsForDay(day);
    var label=DOW_SHORT[day.getDay()]+', '+MON_FULL[day.getMonth()]+' '+day.getDate();
    var rows=evs.map(function(ev){
      var tagBg=ev.color==='main'?'#fce8ee':'#e8eaf6', tagCl=ev.color==='main'?'#ad1457':'#3f51b5';
      return '<button class="day-pop-row" data-evidx="'+allEvents.indexOf(ev)+'">'
        +'<div class="day-pop-title">'+esc(ev.title)
        +'<span class="cal-source-tag" style="background:'+tagBg+';color:'+tagCl+'">'+ev.label+'</span></div>'
        +'<div class="day-pop-time">'+formatRange(ev)+'</div>'
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
    container.appendChild(overlay);
    var closeBtn=document.getElementById('bna-popup-close');
    closeBtn.onclick=closePopup;
    overlay.addEventListener('click',function(e){
      if(e.target===overlay){closePopup();return;}
      var row=e.target.closest('[data-evidx]');
      if(row){closePopup();showPopup(allEvents[+row.getAttribute('data-evidx')]);}
    });
    closeBtn.focus();
    document.addEventListener('keydown',onPopupKey);
  }

  /* ══════════════════════════════════════════
     FILTER UI (agenda view only)
  ══════════════════════════════════════════ */
  function buildFilterUI(content, onchange){
    var now=new Date(); now.setHours(0,0,0,0);
    var locs=[];
    allEvents.filter(function(ev){ return new Date(ev.start)>=now && ev.location; })
      .forEach(function(ev){
        var l=(ev.location||'').trim();
        if(l && locs.indexOf(l)<0) locs.push(l);
      });
    locs.sort();

    var locOpts='<option value="">All locations</option>'
      +locs.map(function(l){
        return '<option value="'+esc(l)+'"'+(filterState.location===l?' selected':'')+'>'+esc(l)+'</option>';
      }).join('');

    var dayChips=DOW_ABBR.map(function(d,i){
      return '<button class="filter-chip'+(filterState.days[i]?' on':'')+'" data-fday="'+i+'">'+d+'</button>';
    }).join('');

    var bar=document.createElement('div');
    bar.className='filter-bar'; bar.id='bna-filter-bar';
    bar.innerHTML=
      '<input class="filter-search" type="search" placeholder="Search events&#8230;" value="'+esc(filterState.text)+'" id="bna-fsearch" aria-label="Search events">'
      +'<div class="filter-row">'
      +'<span class="filter-label">Source</span>'
      +'<button class="filter-chip src-main'+(filterState.tags.main?' on':'')+'" data-ftag="main">BNA</button>'
      +'<button class="filter-chip src-second'+(filterState.tags.second?' on':'')+'" data-ftag="second">Community</button>'
      +(locs.length?'<select class="filter-select" id="bna-floc" aria-label="Filter by location">'+locOpts+'</select>':'')
      +'<button class="filter-clear'+(filtersActive()?' visible':'')+'" id="bna-fclear">Clear filters</button>'
      +'</div>'
      +'<div class="filter-row"><span class="filter-label">Day</span>'+dayChips+'</div>';

    content.appendChild(bar);

    function syncClearBtn(){
      var cb=bar.querySelector('#bna-fclear');
      if(cb) cb.className='filter-clear'+(filtersActive()?' visible':'');
    }

    bar.querySelector('#bna-fsearch').addEventListener('input',function(e){
      filterState.text=e.target.value; syncClearBtn(); onchange();
    });

    var locSel=bar.querySelector('#bna-floc');
    if(locSel) locSel.addEventListener('change',function(e){
      filterState.location=e.target.value; syncClearBtn(); onchange();
    });

    bar.addEventListener('click',function(e){
      var tagBtn=e.target.closest('[data-ftag]');
      if(tagBtn){
        var tag=tagBtn.getAttribute('data-ftag');
        filterState.tags[tag]=!filterState.tags[tag];
        tagBtn.classList.toggle('on',filterState.tags[tag]);
        syncClearBtn(); onchange(); return;
      }
      var dayBtn=e.target.closest('[data-fday]');
      if(dayBtn){
        var di=+dayBtn.getAttribute('data-fday');
        filterState.days[di]=!filterState.days[di];
        dayBtn.classList.toggle('on',filterState.days[di]);
        syncClearBtn(); onchange(); return;
      }
      if(e.target.id==='bna-fclear'){
        filterState.text=''; filterState.tags.main=true; filterState.tags.second=true;
        filterState.days=[true,true,true,true,true,true,true]; filterState.location='';
        bar.querySelector('#bna-fsearch').value='';
        var chips=bar.querySelectorAll('[data-ftag],[data-fday]');
        for(var i=0;i<chips.length;i++) chips[i].classList.add('on');
        if(locSel) locSel.value='';
        syncClearBtn(); onchange();
      }
    });
  }

  /* ══════════════════════════════════════════
     AGENDA VIEW
  ══════════════════════════════════════════ */
  function renderAgenda(mobileNotice){
    var content=document.getElementById('bna-content');
    content.innerHTML='';

    if(mobileNotice){
      var notice=document.createElement('div');
      notice.className='mobile-notice';
      notice.textContent='Month and week views are only available on larger screens.';
      content.appendChild(notice);
    }

    var now=new Date(); now.setHours(0,0,0,0);
    var baseUpcoming=allEvents.filter(function(ev){ return new Date(ev.start)>=now; });

    /* build filter UI — only in schedule view */
    buildFilterUI(content, refreshScroll);

    /* scroll container */
    var wrap=document.createElement('div'); wrap.className='cal-scroll'; wrap.id='bna-scroll';
    content.appendChild(wrap);

    function refreshScroll(){
      wrap.innerHTML='';
      shownCount=0;
      var lw=content.querySelector('.load-more-wrap');
      if(lw) lw.parentNode.removeChild(lw);

      var filtered=applyFilters(baseUpcoming);
      if(!filtered.length){
        var msg=filtersActive()?'No events match your filters.':'No upcoming events. Check back soon!';
        wrap.innerHTML='<div class="no-events">'+msg+'</div>';
        return;
      }
      showBatch(filtered);
    }

    function showBatch(filtered){
      var batch=filtered.slice(shownCount,shownCount+PAGE_SIZE);
      batch.forEach(function(ev){
        var globalIdx=allEvents.indexOf(ev);
        var d=new Date(ev.start);
        var mk=d.getFullYear()+'-'+pad(d.getMonth());
        var group=wrap.querySelector('[data-month="'+mk+'"]');
        if(!group){
          group=document.createElement('div');
          group.className='month-group'; group.setAttribute('data-month',mk);
          group.innerHTML='<div class="month-label">'+MON_FULL[d.getMonth()]+' '+d.getFullYear()+'</div>';
          wrap.appendChild(group);
        }
        var t=truncate(ev.desc,120);
        var uid='bna-ev-'+globalIdx;
        var html='<div class="event-row">'
          +'<div class="event-date"><div class="eday">'+d.getDate()+'</div><div class="edow">'+DOW_SHORT[d.getDay()]+'</div></div>'
          +'<div class="event-body">'
          +'<button class="event-title-btn" data-gidx="'+globalIdx+'">'+esc(ev.title)+'<span class="cal-source-tag src-'+ev.color+'">'+ev.label+'</span></button>';
        var tr=formatRange(ev);
        if(tr) html+='<div class="event-time">&#128336; '+tr+'</div>';
        if(ev.location) html+='<div class="event-location">&#128205; '+esc(ev.location)+'</div>';
        if(t.text){
          /* FIX: linkify inline description so URLs render as links */
          html+='<div class="event-desc" id="'+uid+'-desc">'+linkify(esc(t.text));
          if(t.clipped) html+='&hellip; <button class="btn-more" data-uid="'+uid+'" data-full="'+esc(stripHtml(ev.desc))+'">more</button>';
          html+='</div>';
        }
        html+='<div class="event-actions">'
          +'<a class="btn-cal btn-gcal" href="'+toGCalUrl(ev)+'" target="_blank" rel="noopener">+ Google Calendar</a>'
          +'<button class="btn-cal btn-ical" data-gidx="'+globalIdx+'">&#8615; iCal</button>'
          +'</div></div></div>';
        var tmp=document.createElement('div'); tmp.innerHTML=html;
        group.appendChild(tmp.firstChild);
      });
      shownCount+=batch.length;

      var lw=content.querySelector('.load-more-wrap');
      if(shownCount>=filtered.length){ if(lw) lw.parentNode.removeChild(lw); }
      else if(!lw){
        var w=document.createElement('div'); w.className='load-more-wrap';
        w.innerHTML='<button class="btn-load-more">Show more events</button>';
        content.appendChild(w);
      }
    }

    refreshScroll();

    container.addEventListener('click',function agClick(e){
      if(curView!=='agenda') return;
      var titleBtn=e.target.closest('.event-title-btn');
      if(titleBtn){ showPopup(allEvents[+titleBtn.getAttribute('data-gidx')]); return; }
      var ical=e.target.closest('.btn-ical[data-gidx]');
      if(ical){ downloadICS(allEvents[+ical.getAttribute('data-gidx')]); return; }
      var more=e.target.closest('.btn-more');
      if(more){
        var desc=document.getElementById(more.getAttribute('data-uid')+'-desc');
        /* FIX: use innerHTML + linkify so expanded text renders links */
        if(desc) desc.innerHTML=linkify(esc(more.getAttribute('data-full')));
        return;
      }
      var load=e.target.closest('.btn-load-more');
      if(load) showBatch(applyFilters(baseUpcoming));
    });
  }

  /* ══════════════════════════════════════════
     MONTH VIEW
  ══════════════════════════════════════════ */
  function renderMonth(){
    if(isMobile()){ renderAgenda(true); return; }
    var content=document.getElementById('bna-content');
    var year=curDate.getFullYear(), month=curDate.getMonth();
    var first=new Date(year,month,1);
    var startCell=new Date(first); startCell.setDate(1-first.getDay());
    var today=new Date(); today.setHours(0,0,0,0);
    var headHTML='<div class="grid-head">';
    DOW_SHORT.forEach(function(d){ headHTML+='<div class="grid-head-cell">'+d+'</div>'; });
    headHTML+='</div>';
    var bodyHTML='<div class="grid-body">';
    var cur=new Date(startCell);
    for(var r=0;r<6;r++){
      for(var c=0;c<7;c++){
        var isOther=cur.getMonth()!==month, isToday=sameDay(cur,today);
        bodyHTML+='<div class="grid-cell'+(isOther?' other-month':'')+(isToday?' today':'')+'" data-date="'+cur.toISOString()+'">';
        bodyHTML+='<div class="cell-day">'+cur.getDate()+'</div>';
        var dayEvs=eventsForDay(cur);
        dayEvs.slice(0,2).forEach(function(ev){
          bodyHTML+='<div class="cell-event src-'+ev.color+'" data-evidx="'+allEvents.indexOf(ev)+'">'+esc(ev.title)+'</div>';
        });
        if(dayEvs.length>2) bodyHTML+='<div class="cell-more" data-date="'+cur.toISOString()+'">+'+(dayEvs.length-2)+' more</div>';
        bodyHTML+='</div>';
        cur=addDays(cur,1);
      }
    }
    bodyHTML+='</div>';
    var grid=document.createElement('div'); grid.className='cal-grid';
    grid.innerHTML=headHTML+bodyHTML;
    content.innerHTML=''; content.appendChild(grid);
    grid.addEventListener('click',function(e){
      var ev=e.target.closest('[data-evidx]');
      if(ev){ showPopup(allEvents[+ev.getAttribute('data-evidx')]); return; }
      var more=e.target.closest('.cell-more');
      if(more) showDayPopout(new Date(more.getAttribute('data-date')));
    });
  }

  /* ══════════════════════════════════════════
     WEEK VIEW
  ══════════════════════════════════════════ */
  function renderWeek(){
    if(isMobile()){ renderAgenda(true); return; }
    var content=document.getElementById('bna-content');
    var wStart=startOfWeek(curDate);
    var today=new Date(); today.setHours(0,0,0,0);
    var SLOT_H=36, TOTAL_SLOTS=(HOUR_END-HOUR_START)*2;

    var headHTML='<div class="wk-corner"></div>';
    for(var d=0;d<7;d++){
      var day=addDays(wStart,d), isToday=sameDay(day,today);
      headHTML+='<div class="wk-head'+(isToday?' today':'')+'">'
        +'<div class="wk-dow">'+DOW_SHORT[day.getDay()]+'</div>'
        +'<div class="wk-date">'+day.getDate()+'</div></div>';
    }
    var allDayHTML='<div class="wk-allday-label">all day</div>';
    for(var d=0;d<7;d++){
      var day=addDays(wStart,d);
      allDayHTML+='<div class="wk-allday-cell">';
      eventsForDay(day).filter(function(ev){ return ev.allDay; }).forEach(function(ev){
        allDayHTML+='<div class="cell-event src-'+ev.color+'" data-evidx="'+allEvents.indexOf(ev)+'" style="position:relative;margin-bottom:0.125rem">'+esc(ev.title)+'</div>';
      });
      allDayHTML+='</div>';
    }
    var slotsHTML='';
    for(var slot=0;slot<TOTAL_SLOTS;slot++){
      var totalMins=(HOUR_START*60)+(slot*30), hh=Math.floor(totalMins/60), mm=totalMins%60;
      var label=mm===0?(hh>12?hh-12:hh)+(hh>=12?'pm':'am'):'';
      slotsHTML+='<div class="wk-time-label">'+label+'</div>';
      for(var d=0;d<7;d++) slotsHTML+='<div class="wk-cell'+(mm===0?' hour-start':'')+'" data-slot="'+slot+'" data-col="'+d+'"></div>';
    }

    var wkWrap=document.createElement('div');
    wkWrap.innerHTML='<div style="border:0.0625rem solid #e8e8e8;border-radius:0.5rem;overflow:hidden">'
      +'<div style="display:grid;grid-template-columns:2.75rem repeat(7,1fr);background:#f5f5f5;border-bottom:0.125rem solid #e0e0e0" id="bna-wk-head-row"></div>'
      +'<div class="wk-allday-row" id="bna-wk-allday"></div>'
      +'<div class="week-grid" id="bna-wk-body" style="border:none;border-radius:0"></div>'
      +'</div>';
    wkWrap.querySelector('#bna-wk-head-row').innerHTML=headHTML;
    wkWrap.querySelector('#bna-wk-allday').innerHTML=allDayHTML;
    var bodyGrid=wkWrap.querySelector('#bna-wk-body');
    bodyGrid.innerHTML=slotsHTML;
    content.innerHTML=''; content.appendChild(wkWrap);

    for(var d=0;d<7;d++){
      var day=addDays(wStart,d);
      eventsForDay(day).filter(function(ev){ return !ev.allDay; }).forEach(function(ev){
        var s=new Date(ev.start), e=new Date(ev.end);
        var startMins=s.getHours()*60+s.getMinutes();
        var slotStart=Math.max(0,(startMins-HOUR_START*60)/30);
        var slotSpan=Math.max(1,(e-s)/1800000);
        var cells=bodyGrid.querySelectorAll('[data-slot="'+Math.floor(slotStart)+'"][data-col="'+d+'"]');
        if(!cells.length) return;
        var pill=document.createElement('div');
        pill.className='wk-event src-'+ev.color;
        pill.style.top='0'; pill.style.height=(slotSpan*SLOT_H-2)+'px';
        pill.textContent=ev.title;
        pill.setAttribute('data-evidx',allEvents.indexOf(ev));
        cells[0].style.position='relative'; cells[0].appendChild(pill);
      });
    }

    wkWrap.addEventListener('click',function(e){
      var pill=e.target.closest('[data-evidx]');
      if(pill) showPopup(allEvents[+pill.getAttribute('data-evidx')]);
    });

    /* ── FIX: scroll to center on first event; fallbacks for empty weeks ── */
    var weekTimedEvs=[];
    for(var d=0;d<7;d++){
      var day=addDays(wStart,d);
      eventsForDay(day).filter(function(ev){ return !ev.allDay; }).forEach(function(ev){ weekTimedEvs.push(ev); });
    }
    weekTimedEvs.sort(function(a,b){ return new Date(a.start)-new Date(b.start); });

    var scrollTarget;
    if(weekTimedEvs.length){
      var firstS=new Date(weekTimedEvs[0].start);
      var sMins=firstS.getHours()*60+firstS.getMinutes();
      var slotOff=Math.max(0,(sMins-HOUR_START*60)/30)*SLOT_H;
      scrollTarget=Math.max(0, slotOff - bodyGrid.clientHeight/2);
    } else {
      var todayInWeek=false;
      for(var d=0;d<7;d++){ if(sameDay(addDays(wStart,d),today)){ todayInWeek=true; break; } }
      if(todayInWeek){
        var nowMins=today.getHours()*60+today.getMinutes();
        scrollTarget=Math.max(0,((nowMins-HOUR_START*60)/30)*SLOT_H - bodyGrid.clientHeight/2);
      } else {
        scrollTarget=((9-HOUR_START)*2)*SLOT_H;
      }
    }
    bodyGrid.scrollTop=scrollTarget;
  }

  /* ══════════════════════════════════════════
     TOOLBAR
  ══════════════════════════════════════════ */
  function navLabel(){
    if(curView==='agenda') return 'Upcoming Events';
    if(curView==='month')  return MON_FULL[curDate.getMonth()]+' '+curDate.getFullYear();
    if(curView==='week'){
      var s=startOfWeek(curDate), e=addDays(s,6);
      if(s.getMonth()===e.getMonth()) return MON_SHORT[s.getMonth()]+' '+s.getDate()+' \u2013 '+e.getDate()+', '+s.getFullYear();
      return MON_SHORT[s.getMonth()]+' '+s.getDate()+' \u2013 '+MON_SHORT[e.getMonth()]+' '+e.getDate()+', '+s.getFullYear();
    }
  }
  var VIEW_LABELS={agenda:'Schedule',month:'Month',week:'Week'};

  function buildToolbar(){
    var tb=document.createElement('div'); tb.className='cal-toolbar'; tb.id='bna-toolbar';
    var isNav=(curView!=='agenda');
    var hideCls=isNav?'':' nav-hidden';
    var leftHTML='<div class="toolbar-left">'
      +'<button class="cal-nav-btn'+hideCls+'" id="bna-prev">&#8249;</button>'
      +'<span class="nav-label">'+navLabel()+'</span>'
      +'<button class="cal-nav-btn'+hideCls+'" id="bna-next">&#8250;</button>'
      +(isNav?'<button class="cal-nav-today" id="bna-today">Today</button>':'')
      +'</div>';
    var dropHTML='<div class="view-dropdown" id="bna-view-dropdown">'
      +'<button class="view-dropdown-btn" id="bna-view-btn">'+VIEW_LABELS[curView]+'</button>'
      +'<div class="view-dropdown-menu" id="bna-view-menu">'
      +'<button data-view="agenda" class="'+(curView==='agenda'?'active':'')+'">Schedule</button>'
      +'<button data-view="month"  class="'+(curView==='month' ?'active':'')+'">Month</button>'
      +'<button data-view="week"   class="'+(curView==='week'  ?'active':'')+'">Week</button>'
      +'</div></div>';
    tb.innerHTML=leftHTML+dropHTML;
    return tb;
  }

  function navigate(dir){
    if(curView==='month') curDate=new Date(curDate.getFullYear(),curDate.getMonth()+dir,1);
    if(curView==='week')  curDate=addDays(curDate,dir*7);
    drawView();
  }
  function setView(v){ curView=v; drawView(); }

  function drawView(){
    var old=document.getElementById('bna-toolbar'); if(old) old.parentNode.removeChild(old);
    var oldC=document.getElementById('bna-content'); if(oldC) oldC.parentNode.removeChild(oldC);
    container.innerHTML='';
    var tb=buildToolbar();
    container.appendChild(tb);
    var content=document.createElement('div'); content.id='bna-content';
    container.appendChild(content);
    var dropBtn=tb.querySelector('#bna-view-btn');
    var dropMenu=tb.querySelector('#bna-view-menu');
    dropBtn.addEventListener('click',function(e){ e.stopPropagation(); dropMenu.classList.toggle('open'); });
    document.addEventListener('click',function closeDD(e){
      if(!tb.contains(e.target)){ dropMenu.classList.remove('open'); document.removeEventListener('click',closeDD); }
    });
    tb.addEventListener('click',function(e){
      var tab=e.target.closest('[data-view]');
      if(tab){ dropMenu.classList.remove('open'); setView(tab.getAttribute('data-view')); return; }
      if(e.target.id==='bna-prev'){ navigate(-1); return; }
      if(e.target.id==='bna-next'){ navigate(1); return; }
      if(e.target.id==='bna-today'){ curDate=new Date(); drawView(); return; }
    });
    if(curView==='agenda') renderAgenda(false);
    if(curView==='month')  renderMonth();
    if(curView==='week')   renderWeek();
  }

  /* ── fetch & init ── */
  fetch(SCRIPT_URL)
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(data){ allEvents=data.events||[]; drawView(); })
    .catch(function(err){
      container.innerHTML='<div class="cal-error">'
        +'<strong>Could not load events.</strong> Please try refreshing, or '
        +'<a href="https://calendar.google.com/calendar/embed?src=c_e0f11e4cdaf686bb79f2f2a4d0ded1bb97a2f3b124f5c28d0e7c54f503b68445%40group.calendar.google.com" target="_blank">view the Google Calendar directly</a>.'
        +'</div>';
      console.error('BNA cal:',err);
    });
})();