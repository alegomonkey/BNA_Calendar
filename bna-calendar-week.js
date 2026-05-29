/* ── BNA Calendar — Week View ────────────────────────────────────────────
   Fetches only the 7 days of the displayed week.
   Cache key: 'week-YYYY-MM-DD' (Sunday of the week) — revisiting the
   same week is instant; navigating to a new week fetches fresh data.
──────────────────────────────────────────────────────────────────────── */
(function(){
  var B=window._BNA; if(!B) return;

  var _cache = {}; /* key: 'week-YYYY-MM-DD' → events array */

  function weekCacheKey(date){
    var s=B.startOfWeek(date);
    return 'week-'+s.getFullYear()+'-'+B.pad(s.getMonth()+1)+'-'+B.pad(s.getDate());
  }

  function loadWeekData(date){
    var key=weekCacheKey(date);
    if(_cache[key]) return Promise.resolve(_cache[key]);
    var start=B.startOfWeek(date);
    var end=B.addDays(start,7);
    return B.fetchEvents(start,end).then(function(events){
      _cache[key]=events;
      return events;
    });
  }

  function doRender(content, events){
    B.allEvents=events; /* activate this view's dataset for popups */

    var wStart=B.startOfWeek(B.curDate);
    var today=new Date(); today.setHours(0,0,0,0);
    var SLOT_H=36, TOTAL_SLOTS=(B.HOUR_END-B.HOUR_START)*2;

    var headHTML='<div class="wk-corner"></div>';
    for(var d=0;d<7;d++){
      var day=B.addDays(wStart,d), isToday=B.sameDay(day,today);
      headHTML+='<div class="wk-head'+(isToday?' today':'')+'">'
        +'<div class="wk-dow">'+B.DOW_SHORT[day.getDay()]+'</div>'
        +'<div class="wk-date">'+day.getDate()+'</div></div>';
    }

    var allDayHTML='<div class="wk-allday-label">all day</div>';
    for(var d=0;d<7;d++){
      var day=B.addDays(wStart,d);
      allDayHTML+='<div class="wk-allday-cell">';
      B.eventsForDay(day).filter(function(ev){ return ev.allDay; }).forEach(function(ev){
        allDayHTML+='<div class="cell-event src-'+ev.color+'" data-evidx="'+events.indexOf(ev)+'" style="position:relative;margin-bottom:0.125rem">'+B.esc(ev.title)+'</div>';
      });
      allDayHTML+='</div>';
    }

    var slotsHTML='';
    for(var slot=0;slot<TOTAL_SLOTS;slot++){
      var totalMins=(B.HOUR_START*60)+(slot*30), hh=Math.floor(totalMins/60), mm=totalMins%60;
      var label=mm===0?(hh>12?hh-12:hh)+(hh>=12?'pm':'am'):'';
      slotsHTML+='<div class="wk-time-label">'+label+'</div>';
      for(var d=0;d<7;d++)
        slotsHTML+='<div class="wk-cell'+(mm===0?' hour-start':'')+'" data-slot="'+slot+'" data-col="'+d+'"></div>';
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
      var day=B.addDays(wStart,d);
      B.eventsForDay(day).filter(function(ev){ return !ev.allDay; }).forEach(function(ev){
        var s=new Date(ev.start), e=new Date(ev.end);
        var startMins=s.getHours()*60+s.getMinutes();
        var slotStart=Math.max(0,(startMins-B.HOUR_START*60)/30);
        var slotSpan=Math.max(1,(e-s)/1800000);
        var cells=bodyGrid.querySelectorAll('[data-slot="'+Math.floor(slotStart)+'"][data-col="'+d+'"]');
        if(!cells.length) return;
        var pill=document.createElement('div');
        pill.className='wk-event src-'+ev.color;
        pill.style.top='0'; pill.style.height=(slotSpan*SLOT_H-2)+'px';
        pill.textContent=ev.title;
        pill.setAttribute('data-evidx',events.indexOf(ev));
        cells[0].style.position='relative'; cells[0].appendChild(pill);
      });
    }

    wkWrap.addEventListener('click',function(e){
      var pill=e.target.closest('[data-evidx]');
      if(pill) B.showPopup(events[+pill.getAttribute('data-evidx')]);
    });

    /* scroll to center on first event */
    var weekTimedEvs=[];
    for(var d=0;d<7;d++){
      var day=B.addDays(wStart,d);
      B.eventsForDay(day).filter(function(ev){ return !ev.allDay; }).forEach(function(ev){ weekTimedEvs.push(ev); });
    }
    weekTimedEvs.sort(function(a,b){ return new Date(a.start)-new Date(b.start); });

    var scrollTarget;
    if(weekTimedEvs.length){
      var firstS=new Date(weekTimedEvs[0].start);
      var sMins=firstS.getHours()*60+firstS.getMinutes();
      var slotOff=Math.max(0,(sMins-B.HOUR_START*60)/30)*SLOT_H;
      scrollTarget=Math.max(0, slotOff - bodyGrid.clientHeight/2);
    } else {
      var todayInWeek=false;
      for(var d=0;d<7;d++){ if(B.sameDay(B.addDays(wStart,d),today)){ todayInWeek=true; break; } }
      if(todayInWeek){
        var nowMins=today.getHours()*60+today.getMinutes();
        scrollTarget=Math.max(0,((nowMins-B.HOUR_START*60)/30)*SLOT_H - bodyGrid.clientHeight/2);
      } else {
        scrollTarget=((9-B.HOUR_START)*2)*SLOT_H;
      }
    }
    bodyGrid.scrollTop=scrollTarget;
  }

  B.renderWeek=function(){
    if(B.isMobile()){
      B.requireModule('agenda').then(function(){ B.renderAgenda(true); });
      return;
    }
    var content=document.getElementById('bna-content');
    var key=weekCacheKey(B.curDate);

    if(_cache[key]){
      doRender(content, _cache[key]);
    } else {
      B.showSpinner();
      loadWeekData(B.curDate)
        .then(function(events){ doRender(content, events); })
        .catch(function(err){
          content.innerHTML='<div class="cal-error"><strong>Could not load week data.</strong> Please try refreshing.</div>';
          console.error('BNA week fetch:',err);
        });
    }
  };

})();
