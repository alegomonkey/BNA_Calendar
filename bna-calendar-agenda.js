/* ── BNA Calendar — Schedule (Agenda) View ───────────────────────────────
   Fetches 180 days of upcoming events on first load; caches by date so
   navigating back to today never re-fetches.
──────────────────────────────────────────────────────────────────────── */
(function(){
  var B=window._BNA; if(!B) return;

  var DAYS_AHEAD = 180;
  var _cache = {}; /* key: 'agenda-YYYY-MM-DD' → events array */

  function agendaCacheKey(){
    var now=new Date();
    return 'agenda-'+now.getFullYear()+'-'+B.pad(now.getMonth()+1)+'-'+B.pad(now.getDate());
  }

  function loadAgendaData(){
    var key=agendaCacheKey();
    if(_cache[key]) return Promise.resolve(_cache[key]);
    var start=new Date(); start.setHours(0,0,0,0);
    var end=new Date(start.getTime()+DAYS_AHEAD*24*60*60*1000);
    return B.fetchEvents(start,end).then(function(events){
      _cache[key]=events;
      return events;
    });
  }

  /* ── filter UI ── */
  function buildFilterUI(content, onchange, events){
    var now=new Date(); now.setHours(0,0,0,0);
    var locs=[];
    events.filter(function(ev){ return new Date(ev.start)>=now && ev.location; })
      .forEach(function(ev){
        var l=(ev.location||'').trim();
        if(l && locs.indexOf(l)<0) locs.push(l);
      });
    locs.sort();

    var locOpts='<option value="">All locations</option>'
      +locs.map(function(l){
        return '<option value="'+B.esc(l)+'"'+(B.filterState.location===l?' selected':'')+'>'+B.esc(l)+'</option>';
      }).join('');

    var dayChips=B.DOW_ABBR.map(function(d,i){
      return '<button class="filter-chip'+(B.filterState.days[i]?' on':'')+'" data-fday="'+i+'">'+d+'</button>';
    }).join('');

    var bar=document.createElement('div');
    bar.className='filter-bar'; bar.id='bna-filter-bar';
    bar.innerHTML=
      '<input class="filter-search" type="search" placeholder="Search events&#8230;" value="'+B.esc(B.filterState.text)+'" id="bna-fsearch" aria-label="Search events">'
      +'<div class="filter-row">'
      +'<span class="filter-label">Source</span>'
      +'<button class="filter-chip src-main'+(B.filterState.tags.main?' on':'')+'" data-ftag="main">BNA</button>'
      +'<button class="filter-chip src-second'+(B.filterState.tags.second?' on':'')+'" data-ftag="second">Community</button>'
      +(locs.length?'<select class="filter-select" id="bna-floc" aria-label="Filter by location">'+locOpts+'</select>':'')
      +'<button class="filter-clear'+(B.filtersActive()?' visible':'')+'" id="bna-fclear">Clear filters</button>'
      +'</div>'
      +'<div class="filter-row"><span class="filter-label">Day</span>'+dayChips+'</div>';
    content.appendChild(bar);

    function syncClearBtn(){
      var cb=bar.querySelector('#bna-fclear');
      if(cb) cb.className='filter-clear'+(B.filtersActive()?' visible':'');
    }
    bar.querySelector('#bna-fsearch').addEventListener('input',function(e){
      B.filterState.text=e.target.value; syncClearBtn(); onchange();
    });
    var locSel=bar.querySelector('#bna-floc');
    if(locSel) locSel.addEventListener('change',function(e){
      B.filterState.location=e.target.value; syncClearBtn(); onchange();
    });
    bar.addEventListener('click',function(e){
      var tagBtn=e.target.closest('[data-ftag]');
      if(tagBtn){
        var tag=tagBtn.getAttribute('data-ftag');
        B.filterState.tags[tag]=!B.filterState.tags[tag];
        tagBtn.classList.toggle('on',B.filterState.tags[tag]);
        syncClearBtn(); onchange(); return;
      }
      var dayBtn=e.target.closest('[data-fday]');
      if(dayBtn){
        var di=+dayBtn.getAttribute('data-fday');
        B.filterState.days[di]=!B.filterState.days[di];
        dayBtn.classList.toggle('on',B.filterState.days[di]);
        syncClearBtn(); onchange(); return;
      }
      if(e.target.id==='bna-fclear'){
        B.filterState.text=''; B.filterState.tags.main=true; B.filterState.tags.second=true;
        B.filterState.days=[true,true,true,true,true,true,true]; B.filterState.location='';
        bar.querySelector('#bna-fsearch').value='';
        var chips=bar.querySelectorAll('[data-ftag],[data-fday]');
        for(var i=0;i<chips.length;i++) chips[i].classList.add('on');
        if(locSel) locSel.value='';
        syncClearBtn(); onchange();
      }
    });
  }

  /* ── render ── */
  function doRender(content, events){
    content.innerHTML='';
    B.allEvents=events; /* make this view's dataset active for popups */

    var now=new Date(); now.setHours(0,0,0,0);
    var baseUpcoming=events.filter(function(ev){ return new Date(ev.start)>=now; });

    buildFilterUI(content, refreshScroll, events);

    var wrap=document.createElement('div'); wrap.className='cal-scroll'; wrap.id='bna-scroll';
    content.appendChild(wrap);

    function refreshScroll(){
      wrap.innerHTML='';
      B.shownCount=0;
      var lw=content.querySelector('.load-more-wrap');
      if(lw) lw.parentNode.removeChild(lw);
      var filtered=B.applyFilters(baseUpcoming);
      if(!filtered.length){
        var msg=B.filtersActive()?'No events match your filters.':'No upcoming events. Check back soon!';
        wrap.innerHTML='<div class="no-events">'+msg+'</div>';
        return;
      }
      showBatch(filtered);
    }

    function showBatch(filtered){
      var batch=filtered.slice(B.shownCount,B.shownCount+B.PAGE_SIZE);
      batch.forEach(function(ev){
        var globalIdx=events.indexOf(ev);
        var d=new Date(ev.start);
        var mk=d.getFullYear()+'-'+B.pad(d.getMonth());
        var group=wrap.querySelector('[data-month="'+mk+'"]');
        if(!group){
          group=document.createElement('div');
          group.className='month-group'; group.setAttribute('data-month',mk);
          group.innerHTML='<div class="month-label">'+B.MON_FULL[d.getMonth()]+' '+d.getFullYear()+'</div>';
          wrap.appendChild(group);
        }
        var t=B.truncate(ev.desc,120);
        var uid='bna-ev-'+globalIdx;
        var html='<div class="event-row">'
          +'<div class="event-date"><div class="eday">'+d.getDate()+'</div><div class="edow">'+B.DOW_SHORT[d.getDay()]+'</div></div>'
          +'<div class="event-body">'
          +'<button class="event-title-btn" data-gidx="'+globalIdx+'">'+B.esc(ev.title)
          +'<span class="cal-source-tag src-'+ev.color+'">'+ev.label+'</span></button>';
        var tr=B.formatRange(ev);
        if(tr) html+='<div class="event-time">&#128336; '+tr+'</div>';
        if(ev.location) html+='<div class="event-location">&#128205; '+B.esc(ev.location)+'</div>';
        if(t.text){
          html+='<div class="event-desc" id="'+uid+'-desc">'+B.linkify(B.esc(t.text));
          if(t.clipped) html+='&hellip; <button class="btn-more" data-uid="'+uid+'" data-full="'+B.esc(B.stripHtml(ev.desc))+'">more</button>';
          html+='</div>';
        }
        html+='<div class="event-actions">'
          +'<a class="btn-cal btn-gcal" href="'+B.toGCalUrl(ev)+'" target="_blank" rel="noopener">+ Google Calendar</a>'
          +'<button class="btn-cal btn-ical" data-gidx="'+globalIdx+'">&#8615; iCal</button>'
          +'</div></div></div>';
        var tmp=document.createElement('div'); tmp.innerHTML=html;
        group.appendChild(tmp.firstChild);
      });
      B.shownCount+=batch.length;
      var lw=content.querySelector('.load-more-wrap');
      if(B.shownCount>=filtered.length){ if(lw) lw.parentNode.removeChild(lw); }
      else if(!lw){
        var w=document.createElement('div'); w.className='load-more-wrap';
        w.innerHTML='<button class="btn-load-more">Show more events</button>';
        content.appendChild(w);
      }
    }

    refreshScroll();

    B.container.addEventListener('click',function agClick(e){
      if(B.curView!=='agenda') return;
      var titleBtn=e.target.closest('.event-title-btn');
      if(titleBtn){ B.showPopup(events[+titleBtn.getAttribute('data-gidx')]); return; }
      var ical=e.target.closest('.btn-ical[data-gidx]');
      if(ical){ B.downloadICS(events[+ical.getAttribute('data-gidx')]); return; }
      var more=e.target.closest('.btn-more');
      if(more){
        var desc=document.getElementById(more.getAttribute('data-uid')+'-desc');
        if(desc) desc.innerHTML=B.linkify(B.esc(more.getAttribute('data-full')));
        return;
      }
      var load=e.target.closest('.btn-load-more');
      if(load) showBatch(B.applyFilters(baseUpcoming));
    });
  }

  B.renderAgenda=function(mobileNotice){
    var content=document.getElementById('bna-content');

    if(mobileNotice){
      /* mobile fallback — small notice above the schedule */
      content.innerHTML='<div class="mobile-notice">Month and week views are only available on larger screens.</div>';
      var tmp=document.createElement('div'); tmp.id='bna-content-inner';
      content.appendChild(tmp);
      content=tmp;
    } else {
      content.innerHTML='';
    }

    B.showSpinner();

    loadAgendaData()
      .then(function(events){ doRender(document.getElementById('bna-content'), events); })
      .catch(function(err){
        var c=document.getElementById('bna-content');
        if(c) c.innerHTML='<div class="cal-error">'
          +'<strong>Could not load events.</strong> Please try refreshing, or '
          +'<a href="https://calendar.google.com/calendar/embed?src=c_e0f11e4cdaf686bb79f2f2a4d0ded1bb97a2f3b124f5c28d0e7c54f503b68445%40group.calendar.google.com" target="_blank">view the Google Calendar directly</a>.'
          +'</div>';
        console.error('BNA agenda fetch:',err);
      });
  };

})();
