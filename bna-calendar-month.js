/* ── BNA Calendar — Month View ───────────────────────────────────────────
   Fetches only the ~6-week grid range for the displayed month.
   Cache key: 'month-YYYY-M' — revisiting the same month is instant.
──────────────────────────────────────────────────────────────────────── */
(function(){
  var B=window._BNA; if(!B) return;

  var _cache = {}; /* key: 'month-YYYY-M' → events array */

  function monthRange(date){
    var year=date.getFullYear(), month=date.getMonth();
    var first=new Date(year,month,1);
    var last =new Date(year,month+1,0);
    /* expand to the full calendar grid: Sunday before 1st → day after Saturday after last */
    var start=new Date(first); start.setDate(1-first.getDay()); start.setHours(0,0,0,0);
    var end  =new Date(last);  end.setDate(last.getDate()+(6-last.getDay())+1); end.setHours(0,0,0,0);
    return {start:start, end:end};
  }

  function loadMonthData(date){
    var key='month-'+date.getFullYear()+'-'+date.getMonth();
    if(_cache[key]) return Promise.resolve(_cache[key]);
    var range=monthRange(date);
    return B.fetchEvents(range.start,range.end).then(function(events){
      _cache[key]=events;
      return events;
    });
  }

  function doRender(content, events){
    B.allEvents=events; /* activate this view's dataset for popups */

    var year=B.curDate.getFullYear(), month=B.curDate.getMonth();
    var first=new Date(year,month,1);
    var startCell=new Date(first); startCell.setDate(1-first.getDay());
    var today=new Date(); today.setHours(0,0,0,0);

    var headHTML='<div class="grid-head">';
    B.DOW_SHORT.forEach(function(d){ headHTML+='<div class="grid-head-cell">'+d+'</div>'; });
    headHTML+='</div>';

    var bodyHTML='<div class="grid-body">';
    var cur=new Date(startCell);
    for(var r=0;r<6;r++){
      for(var c=0;c<7;c++){
        var isOther=cur.getMonth()!==month, isToday=B.sameDay(cur,today);
        bodyHTML+='<div class="grid-cell'+(isOther?' other-month':'')+(isToday?' today':'')+'" data-date="'+cur.toISOString()+'">';
        bodyHTML+='<div class="cell-day">'+cur.getDate()+'</div>';
        var dayEvs=B.eventsForDay(cur);
        dayEvs.slice(0,2).forEach(function(ev){
          bodyHTML+='<div class="cell-event src-'+ev.color+'" data-evidx="'+events.indexOf(ev)+'">'+B.esc(ev.title)+'</div>';
        });
        if(dayEvs.length>2) bodyHTML+='<div class="cell-more" data-date="'+cur.toISOString()+'">+'+(dayEvs.length-2)+' more</div>';
        bodyHTML+='</div>';
        cur=B.addDays(cur,1);
      }
    }
    bodyHTML+='</div>';

    var grid=document.createElement('div'); grid.className='cal-grid';
    grid.innerHTML=headHTML+bodyHTML;
    content.innerHTML=''; content.appendChild(grid);

    grid.addEventListener('click',function(e){
      var ev=e.target.closest('[data-evidx]');
      if(ev){ B.showPopup(events[+ev.getAttribute('data-evidx')]); return; }
      var more=e.target.closest('.cell-more');
      if(more) B.showDayPopout(new Date(more.getAttribute('data-date')));
    });
  }

  B.renderMonth=function(){
    if(B.isMobile()){
      B.requireModule('agenda').then(function(){ B.renderAgenda(true); });
      return;
    }
    var content=document.getElementById('bna-content');
    var key='month-'+B.curDate.getFullYear()+'-'+B.curDate.getMonth();

    if(_cache[key]){
      doRender(content, _cache[key]);
    } else {
      B.showSpinner();
      loadMonthData(B.curDate)
        .then(function(events){ doRender(content, events); })
        .catch(function(err){
          content.innerHTML='<div class="cal-error"><strong>Could not load month data.</strong> Please try refreshing.</div>';
          console.error('BNA month fetch:',err);
        });
    }
  };

})();
