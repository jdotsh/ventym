// Client controller — the only browser JS. Vanilla, no framework, no deps. Powers the
// chrome interactions ventym lacked: collapsible sidebar, dropdown menus (profile +
// notifications), theme toggle (light/dark), and client-side table filtering. Served at
// /assets/app.js and progressively enhances the server-rendered HTML.
export const APP_JS = `(()=>{
  var root=document.documentElement, ls=window.localStorage;
  var $=function(s,r){return (r||document).querySelector(s)};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};

  // Restore persisted UI state on load.
  if(ls.getItem('ventym.nav')==='collapsed') root.classList.add('is-nav-collapsed');
  var theme=ls.getItem('ventym.theme'); if(theme) root.setAttribute('data-theme',theme);

  function closeMenus(except){ $$('.menu').forEach(function(m){ if(m!==except) m.hidden=true; }); }

  document.addEventListener('click',function(e){
    var act=e.target.closest('[data-action]');
    if(act){
      var a=act.getAttribute('data-action');
      if(a==='toggle-nav'){ root.classList.toggle('is-nav-collapsed');
        ls.setItem('ventym.nav', root.classList.contains('is-nav-collapsed')?'collapsed':'open'); return; }
      if(a==='toggle-menu'){ var m=$('#'+act.getAttribute('data-menu')); closeMenus(m);
        if(m) m.hidden=!m.hidden; e.stopPropagation(); return; }
      if(a==='set-theme'){ var t=act.getAttribute('data-theme'); root.setAttribute('data-theme',t);
        ls.setItem('ventym.theme',t); return; }
    }
    // Click outside any open menu → close them all.
    if(!e.target.closest('.menu')) closeMenus(null);
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeMenus(null); });

  // Client-side table filter: an <input data-filter="tableId"> hides non-matching rows.
  $$('[data-filter]').forEach(function(inp){
    inp.addEventListener('input',function(){
      var q=inp.value.trim().toLowerCase(), tbl=$('#'+inp.getAttribute('data-filter'));
      if(!tbl) return; var shown=0;
      $$('tbody tr',tbl).forEach(function(tr){
        var hit=tr.textContent.toLowerCase().indexOf(q)>-1;
        tr.hidden=!hit; if(hit) shown++;
      });
      var empty=$('[data-filter-empty="'+inp.getAttribute('data-filter')+'"]');
      if(empty) empty.hidden=shown>0;
    });
  });
})();`

/** Content hash → cache-busting query for /assets/app.js (same trick as the CSS). */
export const JS_VERSION = ((): string => {
  let h = 5381
  for (let i = 0; i < APP_JS.length; i++) h = ((h << 5) + h + APP_JS.charCodeAt(i)) >>> 0
  return h.toString(36)
})()
