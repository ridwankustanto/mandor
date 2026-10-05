/* Reads project.db directly with sql.js. No backend, no export step, never stale.
   Serve from the repo root:  python3 -m http.server 4321   then open /dashboard/

   Routing is one hash: #view or #view/arg. Every code rendered anywhere is a chip
   that routes back to its own source, so nothing on this page is a dead end. */

const VIEWS = [
  {id:'overview',    label:'Overview'},
  {id:'work',        label:'Work'},
  {id:'design',      label:'Design'},
  {id:'standards',   label:'Standards'},
  {id:'docs',        label:'Docs'},
  {id:'engineering', label:'Engineering'},
  {id:'quality',     label:'Quality'},
  {id:'ops',         label:'Ops'},
];
const PHASES_FULL = ['intent','discover','spec','flows','design','build','edit','ship','learn'];
const PHASES_LITE = ['intent','build','edit','ship','learn'];
const LEVELS = {0:'epic', 1:'story', 2:'task', 3:'subtask'};
const WORK_STATUS = ['backlog','ready','in_progress','blocked','review','done','verified','cut'];
/* Sequential ramp for the progression, reserved status colors for the two that are states. */
const STATUS_FILL = {
  backlog:'var(--prog-0)', ready:'var(--prog-1)', in_progress:'var(--prog-2)',
  review:'var(--prog-3)', done:'var(--prog-4)', verified:'var(--prog-5)',
  blocked:'var(--chart-blocked)', cut:'var(--chart-cut)',
};
const CAT = ['var(--cat-1)','var(--cat-2)','var(--cat-3)','var(--cat-4)'];

let DB = null, ROUTE = {view:null, arg:null};
const UI = {
  work:{tab:'board', q:'', level:'', milestone:'', parent:'', page:1, per:25},
  design:{tab:'system'},
  docs:{path:null},
  eng:{tab:'areas', sub:'interfaces'},
};
const CACHE = {};
/* standards/ files, read once at boot so problems() can stay synchronous. null = missing. */
const STD = {pov:null, guard:null, tokens:null, ds:null};
const UNFILLED = '<!-- pm:unfilled -->';
const SETTLED = ['done','verified','cut'];
const IN_SETTLED = "('done','verified','cut')";

/* Databases made before lite mode and ./pm link have neither column: full, no repo. */
const project = () => one("SELECT * FROM project");
const modeOf = p => (p || project()).mode === 'lite' ? 'lite' : 'full';
const phasesOf = p => modeOf(p) === 'lite' ? PHASES_LITE : PHASES_FULL;
const povFilled = () => !!STD.pov && !STD.pov.includes(UNFILLED);

/* Front matter is metadata for tooling, not a heading. Strip it before rendering. */
const renderMd = md => marked.parse(String(md || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function q(sql, params){
  if(!DB) return [];
  try{
    const st = DB.prepare(sql);
    if(params) st.bind(params);
    const out = [];
    while(st.step()) out.push(st.getAsObject());
    st.free();
    return out;
  }catch(e){ console.warn('query failed:', sql, e.message); return []; }
}
const one = (sql,p) => q(sql,p)[0] || {};
const n = (sql,p) => Object.values(one(sql,p))[0] ?? 0;

async function text(path){
  if(path in CACHE) return CACHE[path];
  try{ const r = await fetch(path,{cache:'no-store'}); CACHE[path] = r.ok ? await r.text() : null; }
  catch(e){ CACHE[path] = null; }
  return CACHE[path];
}

const BADGE = {
  verified:'success', done:'success', approved:'success', accepted:'success', live:'success',
  linked:'success', applied:'success',
  in_progress:'info', review:'info', ready:'info', triaged:'info', prototype:'info', active:'info',
  blocked:'danger', rejected:'danger', stale:'danger', failed:'danger', rolled_back:'danger',
  pending:'warning', new:'warning', open:'warning', proposed:'warning', brief:'warning',
  skipped:'violet',
};
const badge = s => `<span class="d-badge d-badge--${BADGE[s] ?? 'neutral'}">${esc(s || 'none')}</span>`;
const ago = iso => {
  if(!iso) return '';
  const d = (Date.now() - new Date(iso).getTime())/1000;
  if(d < 3600) return Math.max(1,Math.round(d/60))+'m';
  if(d < 86400) return Math.round(d/3600)+'h';
  return Math.round(d/86400)+'d';
};

/* Every code becomes a chip that routes to whatever owns it. */
const ROUTE_OF = {EPIC:'work', STORY:'work', TASK:'work', SUB:'work', SCR:'design',
                  ADR:'engineering', FB:'ops', CR:'ops', M:'overview', RN:'overview'};
function chip(code){
  if(!code) return '';
  const pre = String(code).match(/^[A-Z]+/);
  const view = pre ? ROUTE_OF[pre[0]] : null;
  if(!view) return `<span class="d-chip">${esc(code)}</span>`;
  return `<a class="d-chip" href="#${view}/${esc(code)}">${esc(code)}</a>`;
}
const chips = list => (list||[]).filter(Boolean).map(chip).join(' ');

/* Recomputes the invariants ./pm check enforces (problems_now in pm), in the same
   order, so the two never disagree. */
function problems(){
  const p = [];
  const add = (rows, fn) => rows.forEach(r => p.push(fn(r)));
  add(q("SELECT code, level FROM work_item WHERE level>0 AND (parent IS NULL OR parent NOT IN (SELECT code FROM work_item))"),
      r => ({code:r.code, msg:`${r.code} is a ${LEVELS[r.level]} with no parent`}));
  add(q("SELECT w.code, w.level, w.parent, x.level AS plevel FROM work_item w JOIN work_item x ON x.code=w.parent WHERE x.level != w.level-1"),
      r => ({code:r.code, msg:`${r.code} (${LEVELS[r.level]}) hangs off ${r.parent} (${LEVELS[r.plevel]}), the wrong level`}));
  add(q("SELECT code FROM work_item WHERE level=0 AND status!='cut' AND (milestone IS NULL OR milestone='')"),
      r => ({code:r.code, msg:`epic ${r.code} is in no milestone`}));
  add(q("SELECT code, milestone FROM work_item WHERE milestone IS NOT NULL AND milestone!='' AND milestone NOT IN (SELECT code FROM milestone)"),
      r => ({code:r.code, msg:`${r.code} points at milestone ${r.milestone}, which does not exist`}));
  add(q("SELECT code FROM work_item WHERE level=0 AND status NOT IN ('cut','backlog') AND code NOT IN (SELECT parent FROM work_item WHERE parent IS NOT NULL)"),
      r => ({code:r.code, msg:`epic ${r.code} has no stories`}));
  add(q(`SELECT parent, count(*) AS n FROM work_item WHERE parent IN (SELECT code FROM work_item WHERE status IN ${IN_SETTLED}) AND status NOT IN ${IN_SETTLED} GROUP BY parent`),
      r => ({code:r.parent, msg:`${r.parent} is closed but ${r.n} of its children are not`}));
  add(q("SELECT code, blocked_by FROM work_item WHERE blocked_by IS NOT NULL AND blocked_by!='' AND blocked_by NOT IN (SELECT code FROM work_item)"),
      r => ({code:r.code, msg:`${r.code} is blocked by ${r.blocked_by}, which does not exist`}));
  add(q("SELECT code FROM work_item WHERE status='verified' AND NOT EXISTS (SELECT 1 FROM test_run t WHERE t.failed=0 AND (','||replace(ifnull(t.covers,''),' ','')||',') LIKE '%,'||work_item.code||',%')"),
      r => ({code:r.code, msg:`${r.code} is verified but no passing test run covers it`}));
  add(q("SELECT code, name FROM screen WHERE design_status='stale'"),
      r => ({code:r.code, msg:`screen ${r.code} (${r.name}) went stale after a change`}));
  add(q("SELECT code, item FROM screen WHERE item IS NOT NULL AND item!='' AND item NOT IN (SELECT code FROM work_item)"),
      r => ({code:r.code, msg:`screen ${r.code} points at ${r.item}, which does not exist`}));
  const proj = project(), cur = proj.current_phase;
  if(pastEdit(proj)) editRows().filter(e => e.unedited).forEach(e =>
    p.push({code:e.code, kind:'edit', msg:`epic ${e.code} is delivered but nobody edited it. Run /pm-edit`}));
  if(cur !== 'intent' && !povFilled())
    p.push({code:null, kind:'pov', msg:'standards/point-of-view.md is empty, so the AI will pick a generic one'});
  add(q("SELECT phase, subject FROM gate WHERE phase=? AND status IN ('pending','rejected')",[cur]),
      r => ({code:null, msg:`gate ${r.phase}${r.subject==='*'?'':'/'+r.subject} is not approved`}));
  return p;
}

/* ------------------------------------------------------------------ edit pass */

/* True once the current phase is after edit in this project's phase list. */
function pastEdit(proj){
  const ph = phasesOf(proj), i = ph.indexOf(proj.current_phase);
  return i > ph.indexOf('edit');
}

/* One row per epic that is not cut: delivered when it has stories and every one is settled.
   The edit gate is phase='edit', subject=<epic code>. Fix tasks are L2 type='fix' under it. */
function editRows(){
  return q("SELECT code, title, status FROM work_item WHERE level=0 AND status!='cut' ORDER BY code").map(e => {
    const stories = q("SELECT status FROM work_item WHERE parent=?", [e.code]);
    const settled = stories.filter(s => SETTLED.includes(s.status)).length;
    const delivered = stories.length > 0 && settled === stories.length;
    const gate = one("SELECT * FROM gate WHERE phase='edit' AND subject=?", [e.code]);
    const fixes = subtree(e.code).filter(w => w.level === 2 && w.type === 'fix');
    const fixOpen = fixes.filter(w => !SETTLED.includes(w.status));
    const ok = ['approved','skipped'].includes(gate.status);
    return {...e, stories:stories.length, settled, delivered, gate, fixes, fixOpen,
            unedited: delivered && !ok};
  });
}

function editTable(rows, opts={}){
  if(!rows.length) return `<div class="d-empty">No epics yet, so nothing to edit.</div>`;
  return `<div class="d-scroller"><table><thead><tr><th>Epic</th><th>Stories</th><th>Edit gate</th>
    <th>Editor</th><th>When</th><th>Fix tasks</th><th>Note</th></tr></thead><tbody>` +
    rows.map(e => `<tr><td>${chip(e.code)}${opts.titles===false?'':
        ` <button class="d-rowlink" data-go="work/${esc(e.code)}">${esc(e.title)}</button>`}</td>
      <td class="num">${e.settled} / ${e.stories}${e.delivered?' <span class="d-badge d-badge--success">delivered</span>':''}</td>
      <td>${editBadge(e, opts.past)}</td>
      <td>${esc(e.gate.approved_by || '')}</td>
      <td class="code">${esc((e.gate.approved_at || '').slice(0,10))}</td>
      <td class="num">${e.fixes.length ? `${e.fixOpen.length} open, ${e.fixes.length - e.fixOpen.length} closed` : 'none'}</td>
      <td>${esc(e.gate.note || '')}</td></tr>`).join('') + `</tbody></table></div>`;
}

/* Gate status, plus the two states ./pm check cares about when there is no gate row. */
function editBadge(e, past){
  if(e.gate.status) return badge(e.gate.status);
  if(e.unedited) return past ? `<span class="d-badge d-badge--danger">not edited</span>`
                             : `<span class="d-badge d-badge--warning">awaiting edit</span>`;
  return `<span class="d-badge">no gate</span>`;
}

/* ------------------------------------------------------------------ charts */

const SVG_W = 640;

function svgStackedRows(rows, keys, fills, opts={}){
  /* rows: [{label, code, parts:{key:n}}]. Horizontal stacked bars, one row per entity. */
  const rowH = 30, gap = 10, padL = opts.padL ?? 128, padR = 46;
  const h = rows.length * (rowH + gap);
  const max = Math.max(1, ...rows.map(r => keys.reduce((a,k)=>a+(r.parts[k]||0),0)));
  const w = SVG_W - padL - padR;
  let out = `<svg viewBox="0 0 ${SVG_W} ${h}" role="img" aria-label="${esc(opts.label||'')}">`;
  rows.forEach((r,i)=>{
    const y = i * (rowH + gap);
    const total = keys.reduce((a,k)=>a+(r.parts[k]||0),0);
    const scale = opts.proportional ? (total || 1) : max;
    const lbl = r.label.length > 18 ? r.label.slice(0,17).trimEnd() + '\u2026' : r.label;
    out += `<text class="axis" x="0" y="${y+rowH/2+4}">${esc(lbl)}</text>`;
    let x = padL;
    keys.forEach(k=>{
      const v = r.parts[k] || 0;
      if(!v) return;
      const bw = Math.max(2, v/scale*w - 2);   /* 2px surface gap between segments */
      out += `<rect class="mark" x="${x}" y="${y+6}" width="${bw}" height="${rowH-12}" rx="4"
        fill="${fills[k]}"><title>${esc(r.label)}: ${v} ${esc(k.replace('_',' '))}</title></rect>`;
      x += bw + 2;
    });
    out += `<text class="val" x="${SVG_W-padR+8}" y="${y+rowH/2+4}">${total}</text>`;
  });
  return out + `</svg>`;
}

function svgLine(points, opts={}){
  /* points: [{x:label, y:number}] cumulative. One series, so no legend, the title names it. */
  const padL = 34, padB = 26, padT = 12, h = 190;
  const w = SVG_W - padL - 12, ph = h - padB - padT;
  const max = Math.max(1, ...points.map(p=>p.y));
  const X = i => padL + (points.length<2 ? w/2 : i/(points.length-1)*w);
  const Y = v => padT + ph - (v/max)*ph;
  let grid = '', area = '', line = '', dots = '';
  for(let g=0; g<=3; g++){
    const v = Math.round(max*g/3), y = Y(v);
    grid += `<line class="grid" x1="${padL}" y1="${y}" x2="${padL+w}" y2="${y}"/>
             <text class="axis" x="0" y="${y+3}">${v}</text>`;
  }
  points.forEach((p,i)=>{
    line += `${i?'L':'M'}${X(i)},${Y(p.y)}`;
    if(i === points.length-1 || points.length <= 12)
      dots += `<circle class="mark" cx="${X(i)}" cy="${Y(p.y)}" r="${i===points.length-1?5:3.5}"
        fill="var(--cat-1)" stroke="var(--surface-card)" stroke-width="2">
        <title>${esc(p.x)}: ${p.y} delivered</title></circle>`;
    if(i % Math.ceil(points.length/6) === 0 || i === points.length-1)
      grid += `<text class="axis" x="${X(i)}" y="${h-6}" text-anchor="middle">${esc(p.x)}</text>`;
  });
  area = `<path d="${line}L${X(points.length-1)},${Y(0)}L${X(0)},${Y(0)}Z" fill="var(--cat-1)" opacity=".12"/>`;
  return `<svg viewBox="0 0 ${SVG_W} ${h}" role="img" aria-label="${esc(opts.label||'')}">
    ${grid}${area}<path d="${line}" fill="none" stroke="var(--cat-1)" stroke-width="2"
    stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
}

function svgGroupedBars(groups, series, fills, opts={}){
  /* groups: [{label, values:[n,...]}] aligned to series names. */
  const padL = 34, padB = 26, padT = 12, h = 190;
  const w = SVG_W - padL - 12, ph = h - padB - padT;
  const max = Math.max(1, ...groups.flatMap(g=>g.values));
  const gw = w / groups.length, bw = Math.min(26, (gw - 14) / series.length);
  let out = '';
  for(let g=0; g<=3; g++){
    const v = Math.round(max*g/3), y = padT + ph - (v/max)*ph;
    out += `<line class="grid" x1="${padL}" y1="${y}" x2="${padL+w}" y2="${y}"/>
            <text class="axis" x="0" y="${y+3}">${v}</text>`;
  }
  groups.forEach((grp,i)=>{
    const x0 = padL + i*gw + (gw - bw*series.length - 2*(series.length-1))/2;
    grp.values.forEach((v,j)=>{
      const bh = (v/max)*ph;
      out += `<rect class="mark" x="${x0 + j*(bw+2)}" y="${padT+ph-bh}" width="${bw}"
        height="${Math.max(v?2:0,bh)}" rx="4" fill="${fills[j]}">
        <title>${esc(grp.label)} ${esc(series[j])}: ${v}</title></rect>`;
    });
    out += `<text class="axis" x="${padL + i*gw + gw/2}" y="${h-6}" text-anchor="middle">${esc(grp.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${SVG_W} ${h}" role="img" aria-label="${esc(opts.label||'')}">${out}</svg>`;
}

const legend = (names, fills) => `<div class="d-legend">` +
  names.map((nm,i)=>`<span><i style="background:${fills[i]}"></i>${esc(nm).replace('_',' ')}</span>`).join('') + `</div>`;

function chartCard(title, note, body, expandKey){
  return `<div class="d-card">
    <div class="d-secthead"><div>
      <h3 class="d-h3" style="margin:0">${esc(title)}</h3>
      <div style="color:var(--text-secondary);font-size:var(--fs-body-s)">${esc(note)}</div></div>
      ${expandKey?`<button class="d-btn d-btn--sm" data-expand="${expandKey}">Expand</button>`:''}
    </div><div class="d-chart">${body}</div></div>`;
}

/* ------------------------------------------------------------------ overview */

function deliveredSeries(){
  const rows = q("SELECT date(done_at) AS d, count(*) AS n FROM work_item WHERE level=1 AND done_at IS NOT NULL GROUP BY date(done_at) ORDER BY d");
  let acc = 0;
  return rows.map(r => ({x:(r.d||'').slice(5), y:(acc += r.n)}));
}

function epicRows(){
  return q("SELECT code, title FROM work_item WHERE level=0 AND status!='cut' ORDER BY code").map(e=>{
    const parts = {};
    q(`WITH RECURSIVE t(code) AS (SELECT ? UNION ALL SELECT w.code FROM work_item w JOIN t ON w.parent=t.code)
        SELECT w.status, count(*) AS n FROM work_item w JOIN t ON w.code=t.code WHERE w.level>0 GROUP BY w.status`,
      [e.code]).forEach(r => parts[r.status] = r.n);
    return {label:e.title, code:e.code, parts};
  });
}

function overview(){
  const p = one("SELECT * FROM project");
  const probs = problems();
  const stories = n("SELECT count(*) FROM work_item WHERE level=1 AND status!='cut'");
  const delivered = n("SELECT count(*) FROM work_item WHERE level=1 AND status IN ('done','verified')");
  const verified = n("SELECT count(*) FROM work_item WHERE level=1 AND status='verified'");
  const blocked = q("SELECT code,title,blocked_by FROM work_item WHERE status='blocked'");
  const stale = q("SELECT code,name FROM screen WHERE design_status='stale'");
  const untriaged = n("SELECT count(*) FROM feedback WHERE status='new'");
  const dep = one("SELECT * FROM deployment ORDER BY id DESC LIMIT 1");

  let h = `<div class="d-eyebrow">Phase ${esc(p.current_phase)}, ${modeOf(p)} mode</div>
    <h1 class="d-display">${esc(p.name || 'Project')}</h1>
    <p class="d-lede">${probs.length
      ? `${probs.length} thing${probs.length>1?'s':''} need attention before this phase can close.`
      : 'Every invariant passes. Nothing is blocking the current phase.'}</p>
    <hr class="d-rule">`;

  h += `<div class="d-grid">
    <button class="d-card d-tap d-stat ${verified===stories&&stories?'d-stat--good':''}" data-expand="stories">
      <div class="d-stat__label">Stories delivered</div>
      <div class="d-stat__val">${delivered}<small> / ${stories}</small></div>
      <div class="d-stat__note">${verified} verified by a passing test</div></button>
    <button class="d-card d-tap d-stat ${blocked.length?'d-stat--alarm':''}" data-expand="blocked">
      <div class="d-stat__label">Blocked</div>
      <div class="d-stat__val">${blocked.length}</div>
      <div class="d-stat__note">${blocked.length?esc(blocked[0].code+' '+blocked[0].title).slice(0,38):'nothing waiting'}</div></button>
    <button class="d-card d-tap d-stat ${stale.length?'d-stat--alarm':''}" data-expand="stale">
      <div class="d-stat__label">Stale designs</div>
      <div class="d-stat__val">${stale.length}</div>
      <div class="d-stat__note">${stale.length?'a change invalidated these':'design matches the spec'}</div></button>
    <button class="d-card d-tap d-stat ${untriaged?'d-stat--alarm':''}" data-expand="feedback">
      <div class="d-stat__label">Untriaged feedback</div>
      <div class="d-stat__val">${untriaged}</div>
      <div class="d-stat__note">${dep.env?`${esc(dep.env)} on ${esc(dep.version||dep.sha||'')}`:'not deployed yet'}</div></button>
  </div>`;

  if(probs.length){
    h += `<h2 class="d-h">Needs attention</h2>
      <div class="d-alert"><b>${probs.length} open problem${probs.length>1?'s':''}.</b>
      Same list <code>./pm check</code> prints.
      <ul>${probs.slice(0,8).map(x=>`<li>${esc(x.msg)} ${x.code?chip(x.code):''}</li>`).join('')}</ul></div>`;
  }

  h += `<h2 class="d-h">Delivery pipeline</h2>${pipeline(p.current_phase)}`;

  const past = pastEdit(p), edits = editRows();
  h += `<h2 class="d-h">Edit pass</h2>
    <p class="d-muted" style="margin-bottom:var(--space-15);max-width:72ch">Built is not done. Each delivered
      epic is played as a user, fixed, and approved by a named editor with
      <span class="d-cmd">./pm gate approve edit --subject EPIC001 "&lt;note&gt;"</span>.
      ${past ? 'This project is past edit, so an unedited delivered epic fails <span class="d-cmd">./pm check</span>.'
             : 'Once the project moves past edit, an unedited delivered epic fails <span class="d-cmd">./pm check</span>.'}</p>
    ${editTable(edits, {past})}`;

  h += `<h2 class="d-h">Code repo</h2>${codeCard(p)}`;

  const series = deliveredSeries();
  const epics = epicRows();
  const usedStatus = WORK_STATUS.filter(s => epics.some(e => e.parts[s]));
  const runs = q("SELECT kind, sum(passed) AS p, sum(failed) AS f FROM test_run GROUP BY kind");

  h += `<h2 class="d-h">Where the work stands</h2><div class="d-grid d-grid--2">`;
  h += chartCard('Stories delivered over time',
    series.length ? 'Cumulative, by the day each story closed' : 'Nothing delivered yet',
    series.length ? svgLine(series, {label:'Cumulative stories delivered'})
      : `<div class="d-empty">No story has a completion date yet.</div>`, 'stories');
  h += chartCard('Work by epic', 'Every item under each epic, by status',
    epics.length ? svgStackedRows(epics, usedStatus, STATUS_FILL, {label:'Work per epic by status'})
      + legend(usedStatus, usedStatus.map(s=>STATUS_FILL[s]))
      : `<div class="d-empty">No epics yet.</div>`, 'epics');
  h += `</div>`;

  if(runs.length){
    /* Proportion per suite, not raw totals: a 142-assertion unit suite would otherwise
       flatten a 1-check security scan into nothing. The counts are labelled instead. */
    h += chartCard('Test results', 'Pass and fail per suite, each row to its own scale',
      svgStackedRows(runs.map(r=>({label:r.kind, code:r.kind, parts:{passed:r.p||0, failed:r.f||0}})),
        ['passed','failed'], {passed:'var(--cat-1)', failed:'var(--chart-fail)'},
        {label:'Test results by suite', padL:80, proportional:true})
      + legend(['passed','failed'], ['var(--cat-1)','var(--chart-fail)']), 'quality');
  }
  h += `<h2 class="d-h">Milestones</h2>` +
    `<div class="d-card">${msTable(q("SELECT * FROM milestone ORDER BY code"))}</div>`;

  const ev = q("SELECT * FROM event ORDER BY id DESC LIMIT 10");
  h += `<h2 class="d-h">Recent activity</h2><div class="d-card d-card--flat">${ev.length
    ? `<ul class="d-feed">${ev.map(e=>`<li><span class="when">${ago(e.created_at)}</span>
        ${chip(e.entity)}<span>${esc(e.summary||'')}</span></li>`).join('')}</ul>`
    : '<div class="d-empty">Nothing logged yet.</div>'}</div>`;
  return h;
}

/* Where the code lives, and the last commit that stamped a work item. */
function codeCard(p){
  const ev = one("SELECT * FROM event WHERE kind='commit' ORDER BY id DESC LIMIT 1");
  const [sha, ...msg] = String(ev.summary || '').split(' ');
  const last = ev.id ? `<dl class="d-kv" style="margin-top:var(--space-15)">
      <dt>Last commit</dt><dd><span class="d-mono">${esc(sha)}</span> ${esc(msg.join(' '))}</dd>
      <dt>Stamped</dt><dd>${chip(ev.entity)}</dd>
      <dt>When</dt><dd class="d-mono">${esc((ev.created_at || '').replace('T',' ').slice(0,16))} UTC, ${ago(ev.created_at)} ago</dd></dl>`
    : `<p class="d-muted" style="margin-top:var(--space-15)">No commit has stamped a work item yet. Put a code
        in the message, for example <span class="d-cmd">feat: inbox empty state TASK004</span>, and the
        post-commit hook records it here.</p>`;
  if(p.code_path) return `<div class="d-card"><div class="d-secthead">
      <div><div class="d-eyebrow">Linked</div>
        <div class="d-mono" style="margin-top:var(--space-05);overflow-wrap:anywhere">${esc(p.code_path)}</div></div>
      <span class="d-badge d-badge--success">hook installed by ./pm link</span></div>${last}</div>`;
  return `<div class="d-card"><div class="d-eyebrow">Not linked</div>
    <p style="margin-top:var(--space-05)">Code lives in <code>code/</code>, its own git repo inside this folder. Create it with
      <span class="d-cmd">git init code</span>, then <span class="d-cmd">./pm link code</span>. That installs
      the commit hook there, points its agent at <code>standards/</code> and keeps it out of this repo's git.</p>
    ${ev.id ? last : ''}</div>`;
}

function msTable(ms){
  if(!ms.length) return `<div class="d-empty">No milestones yet.</div>`;
  const roll = `WITH RECURSIVE tree(code,root) AS (SELECT code,code FROM work_item WHERE level=0
    UNION ALL SELECT w.code,t.root FROM work_item w JOIN tree t ON w.parent=t.code)
    SELECT count(*) FROM tree JOIN work_item w ON w.code=tree.code
    WHERE tree.root IN (SELECT code FROM work_item WHERE milestone=?) AND w.level>0 AND w.status `;
  return `<div class="d-xscroll"><table><thead><tr><th>Code</th><th>Target</th><th>Epics</th>
    <th>Closed</th><th>Status</th></tr></thead><tbody>` + ms.map(m=>{
    const d = n(roll + "IN ('done','verified')",[m.code]);
    const t = n(roll + "!= 'cut'",[m.code]);
    const epics = q("SELECT code FROM work_item WHERE level=0 AND milestone=?",[m.code]).map(e=>e.code);
    return `<tr><td class="code">${esc(m.code)}</td>
      <td><b>${esc(m.name)}</b><div style="color:var(--text-secondary)">${esc(m.goal||'')}</div></td>
      <td>${chips(epics) || '<span class="d-badge d-badge--danger">none</span>'}</td>
      <td class="num">${d} / ${t}<div class="d-bar" style="margin-top:6px"><i style="width:${t?d/t*100:0}%"></i></div></td>
      <td>${badge(m.status)}</td></tr>`;
  }).join('') + `</tbody></table></div>`;
}

function pipeline(current){
  const PHASES = phasesOf();
  const idx = PHASES.indexOf(current);
  return `<div class="d-pipe">` + PHASES.map((ph,i)=>{
    const gs = q("SELECT status FROM gate WHERE phase=?",[ph]).map(g=>g.status);
    const cls = gs.includes('skipped') ? 'skip' : i < idx ? 'done' : i === idx ? 'here' : 'todo';
    const state = i > idx ? 'not started'
      : gs.includes('skipped') ? 'skipped'
      : gs.length && gs.every(s=>s==='approved') ? 'approved'
      : gs.includes('rejected') ? 'rejected' : 'gate open';
    return `<button class="d-pipe__step d-pipe__step--${cls}" data-expand="phase:${ph}">
      <div class="d-pipe__n">${String(i+1).padStart(2,'0')}</div>
      <div class="d-pipe__name">${ph}</div>
      <div class="d-pipe__state">${state}</div></button>`;
  }).join('') + `</div>`;
}

/* ------------------------------------------------------------------ dialogs */

function expand(key){
  const [kind, arg] = String(key).split(':');
  const T = (title, body) => `<h2 class="d-h" style="margin-top:0">${esc(title)}</h2>${body}`;
  const wtable = rows => rows.length ? `<div class="d-scroller"><table><thead><tr>
      <th>Code</th><th>Level</th><th>Title</th><th>Parent</th><th>Status</th></tr></thead><tbody>` +
    rows.map(r=>`<tr><td>${chip(r.code)}</td><td>${LEVELS[r.level]}</td>
      <td>${esc(r.title)}</td><td>${chip(r.parent)}</td><td>${badge(r.status)}</td></tr>`).join('') +
    `</tbody></table></div>` : `<div class="d-empty">Nothing here.</div>`;

  if(kind === 'stories') return T('Every story',
    wtable(q("SELECT * FROM work_item WHERE level=1 ORDER BY code")));
  if(kind === 'blocked') return T('Blocked work',
    wtable(q("SELECT * FROM work_item WHERE status='blocked' ORDER BY code")) +
    `<p class="d-lede">Each of these names what it is waiting on in <code>blocked_by</code>.</p>`);
  if(kind === 'stale') return T('Screens whose approval went stale',
    q("SELECT * FROM screen WHERE design_status='stale'").map(s=>
      `<div class="d-card d-card--soft" style="margin-bottom:var(--space-15)">
        <b>${esc(s.name)}</b> ${chip(s.code)} ${chip(s.item)}
        <div style="color:var(--text-secondary);font-size:var(--fs-body-s);margin-top:var(--space-05)">
        A change invalidated this approval. It needs a design pass before ship.</div></div>`).join('')
      || `<div class="d-empty">None. Design matches the spec.</div>`);
  if(kind === 'feedback') return T('Untriaged feedback',
    q("SELECT * FROM feedback WHERE status='new'").map(f=>
      `<div class="d-card d-card--soft" style="margin-bottom:var(--space-15)">
        <b>${esc(f.title)}</b> ${chip(f.code)}
        <div class="d-tile__meta"><span>${esc(f.source||'')}</span><span>${esc(f.kind||'')}</span></div>
      </div>`).join('') || `<div class="d-empty">Everything is triaged.</div>`);
  if(kind === 'epics') return T('Work under each epic',
    epicRows().map(e=>`<div class="d-card d-card--soft" style="margin-bottom:var(--space-15)">
      <div class="d-secthead"><b>${esc(e.label)}</b>${chip(e.code)}</div>
      <div class="d-legend" style="margin-top:var(--space-15)">${
        WORK_STATUS.filter(s=>e.parts[s]).map(s=>
          `<span><i style="background:${STATUS_FILL[s]}"></i>${s.replace('_',' ')} <b>${e.parts[s]}</b></span>`).join('')
        || '<span>nothing under it yet</span>'}</div></div>`).join(''));
  if(kind === 'quality') return T('Test runs',
    `<div class="d-scroller"><table><thead><tr><th>Kind</th><th>Tool</th><th>Pass</th><th>Fail</th>
      <th>Covers</th><th>When</th></tr></thead><tbody>` +
    q("SELECT * FROM test_run ORDER BY id DESC").map(r=>`<tr><td>${esc(r.kind)}</td>
      <td>${esc(r.tool||'')}</td><td class="num">${r.passed||0}</td>
      <td class="num">${r.failed||0}</td><td>${chips(String(r.covers||'').split(/[,\s]+/))}</td>
      <td class="code">${esc((r.created_at||'').slice(0,10))}</td></tr>`).join('') + `</tbody></table></div>`);
  if(kind === 'milestones') return T('Milestones', msTable(q("SELECT * FROM milestone ORDER BY code")));
  if(kind === 'phase'){
    const gs = q("SELECT * FROM gate WHERE phase=? ORDER BY id",[arg]);
    return T(`Phase ${arg}`, gs.length ? `<div class="d-scroller"><table><thead><tr>
      <th>Subject</th><th>Status</th><th>Approved by</th><th>When</th><th>Note</th></tr></thead><tbody>` +
      gs.map(g=>`<tr><td class="code">${g.subject==='*'?'whole phase':esc(g.subject)}</td>
        <td>${badge(g.status)}</td><td>${esc(g.approved_by||'')}</td>
        <td class="code">${esc((g.approved_at||'').slice(0,10))}</td>
        <td>${esc(g.note||'')}</td></tr>`).join('') + `</tbody></table></div>`
      : `<div class="d-empty">No gate recorded for this phase.</div>`);
  }
  return `<div class="d-empty">Nothing to expand.</div>`;
}

/* ------------------------------------------------------------------ work */

function subtree(code){
  return q(`WITH RECURSIVE t(code) AS (SELECT ? UNION ALL
    SELECT w.code FROM work_item w JOIN t ON w.parent=t.code)
    SELECT w.* FROM work_item w JOIN t ON w.code=t.code WHERE w.code != ? ORDER BY w.level, w.code`,
    [code, code]);
}

async function work(){
  if(ROUTE.arg) return workDetail(ROUTE.arg);
  const s = UI.work;
  let sql = "SELECT * FROM work_item WHERE 1=1", args = [];
  if(s.level !== ''){ sql += " AND level = ?"; args.push(Number(s.level)); }
  if(s.parent){
    sql += ` AND code IN (WITH RECURSIVE t(code) AS (SELECT ? UNION ALL
      SELECT w.code FROM work_item w JOIN t ON w.parent=t.code) SELECT code FROM t)`;
    args.push(s.parent);
  }
  if(s.milestone){
    sql += ` AND code IN (WITH RECURSIVE tree(code,root) AS (
      SELECT code,code FROM work_item WHERE level=0
      UNION ALL SELECT w.code,t.root FROM work_item w JOIN tree t ON w.parent=t.code)
      SELECT tree.code FROM tree WHERE tree.root IN (SELECT code FROM work_item WHERE milestone=?))`;
    args.push(s.milestone);
  }
  let rows = q(sql + " ORDER BY level, code", args);
  if(s.q){
    const needle = s.q.toLowerCase();
    rows = rows.filter(r => (r.code+' '+r.title+' '+(r.description||'')+' '+(r.area||'')).toLowerCase().includes(needle));
  }

  const ms = q("SELECT code,name FROM milestone ORDER BY code");
  const parents = q("SELECT code,title,level FROM work_item WHERE level<2 ORDER BY level, code");
  let h = `<div class="d-eyebrow">Epic, story, task, sub-task</div>
    <h1 class="d-title">Work</h1><hr class="d-rule">
    <div class="d-toolbar">
      <div class="d-tabs" role="tablist">
        <button class="d-tabs__tab" role="tab" aria-selected="${s.tab==='board'}" data-wtab="board">Board</button>
        <button class="d-tabs__tab" role="tab" aria-selected="${s.tab==='list'}" data-wtab="list">List</button>
      </div>
      <input class="d-input" id="wq" type="search" placeholder="Search code, title, area" value="${esc(s.q)}">
      <select class="d-input" id="wparent"><option value="">All epics and stories</option>
        ${parents.map(p=>`<option value="${esc(p.code)}" ${s.parent===p.code?'selected':''}>
          ${p.level===0?'':'   '}${esc(p.code)} ${esc(p.title.slice(0,34))}</option>`).join('')}</select>
      <select class="d-input" id="wlevel"><option value="">All levels</option>
        ${Object.entries(LEVELS).map(([k,v])=>`<option value="${k}" ${String(s.level)===k?'selected':''}>${v}</option>`).join('')}</select>
      <select class="d-input" id="wms"><option value="">All milestones</option>
        ${ms.map(m=>`<option value="${esc(m.code)}" ${s.milestone===m.code?'selected':''}>${esc(m.code)} ${esc(m.name)}</option>`).join('')}</select>
      <span class="d-eyebrow" style="margin-left:auto">${rows.length} item${rows.length===1?'':'s'}</span>
    </div>`;

  if(!rows.length) return h + `<div class="d-empty">Nothing matches. Run <code>./pm epic</code> to start a breakdown.</div>`;

  if(s.tab === 'board'){
    const shown = WORK_STATUS.filter(st => rows.some(r=>r.status===st));
    h += `<div class="d-board">` + shown.map(st => {
      const inCol = rows.filter(r=>r.status===st);
      return `<div class="d-col"><div class="d-col__head"><span>${st.replace('_',' ')}</span>
        <span class="num">${inCol.length}</span></div>` + inCol.map(tile).join('') + `</div>`;
    }).join('') + `</div>`;
  } else {
    const pages = Math.max(1, Math.ceil(rows.length / s.per));
    s.page = Math.min(s.page, pages);
    const slice = rows.slice((s.page-1)*s.per, s.page*s.per);
    h += `<div class="d-scroller"><table><thead><tr><th>Code</th><th>Level</th><th>Title</th>
      <th>Parent</th><th>Owner</th><th>Status</th></tr></thead><tbody>` +
      slice.map(r=>`<tr class="${r.status==='cut'?'d-gone':''}">
        <td>${chip(r.code)}</td>
        <td><span class="d-badge">${LEVELS[r.level]}</span></td>
        <td class="t"><button class="d-rowlink" data-go="work/${esc(r.code)}">${esc(r.title)}</button>
          ${r.description?`<div style="color:var(--text-secondary)">${esc(r.description).slice(0,90)}</div>`:''}</td>
        <td>${chip(r.parent)}</td><td class="code">${esc(r.owner||'')}</td>
        <td>${badge(r.status)}${r.blocked_by?' '+chip(r.blocked_by):''}</td></tr>`).join('') +
      `</tbody></table></div>
      <div class="d-pager">
        <button class="d-btn" data-wpage="${s.page-1}" ${s.page<=1?'disabled':''}>Previous</button>
        <span>Page ${s.page} of ${pages}</span>
        <button class="d-btn" data-wpage="${s.page+1}" ${s.page>=pages?'disabled':''}>Next</button></div>`;
  }
  return h;
}

function tile(r){
  const kids = n("SELECT count(*) FROM work_item WHERE parent=?",[r.code]);
  const done = n("SELECT count(*) FROM work_item WHERE parent=? AND status IN ('done','verified')",[r.code]);
  return `<button class="d-tile" data-go="work/${esc(r.code)}">
    <div class="d-tile__title">${esc(r.title)}</div>
    <div class="d-tile__meta"><span>${esc(r.code)}</span><span>${LEVELS[r.level]}</span>
      ${r.milestone?`<span>${esc(r.milestone)}</span>`:''}${r.type?`<span>${esc(r.type)}</span>`:''}
      ${r.owner?`<span>${esc(r.owner)}</span>`:''}</div>
    ${kids?`<div class="d-tile__meta"><span>${done}/${kids} children done</span></div>`:''}
    ${r.blocked_by?`<div class="d-tile__meta"><span style="color:var(--status-recording)">blocked by ${esc(r.blocked_by)}</span></div>`:''}
  </button>`;
}

async function workDetail(code){
  const w = one("SELECT * FROM work_item WHERE code=?",[code]);
  if(!w.code) return `<div class="d-alert">${esc(code)} not found. <a href="#work">Back to Work</a></div>`;
  const kids = subtree(code);
  const screens = q("SELECT * FROM screen WHERE item=?",[code]);
  const fb = q("SELECT * FROM feedback WHERE item=?",[code]);
  const tests = q("SELECT * FROM test_run WHERE (','||replace(ifnull(covers,''),' ','')||',') LIKE '%,'||?||',%'",[code]);
  const chain = [];
  let cur = w.parent;
  while(cur){ const p = one("SELECT code,title,parent FROM work_item WHERE code=?",[cur]); if(!p.code) break; chain.unshift(p); cur = p.parent; }

  let h = `<div class="d-crumbs"><button data-go="work">Work</button>` +
    chain.map(c=>` / <button data-go="work/${esc(c.code)}">${esc(c.code)}</button>`).join('') +
    ` / ${esc(w.code)}</div>
    <div class="d-eyebrow">${LEVELS[w.level]}${w.milestone?' in '+esc(w.milestone):''}</div>
    <h1 class="d-title">${esc(w.title)}</h1>
    <hr class="d-rule">`;

  h += `<div class="d-grid d-grid--2"><div class="d-card"><dl class="d-kv">
    <dt>Status</dt><dd>${badge(w.status)}</dd>
    <dt>Code</dt><dd class="mono">${esc(w.code)}</dd>
    ${w.parent?`<dt>Parent</dt><dd>${chip(w.parent)}</dd>`:''}
    ${w.kind?`<dt>Kind</dt><dd>${esc(w.kind)}</dd>`:''}
    ${w.type?`<dt>Type</dt><dd>${esc(w.type)}</dd>`:''}
    <dt>Priority</dt><dd>${esc(w.priority||'')}</dd>
    ${w.owner?`<dt>Owner</dt><dd>${esc(w.owner)}</dd>`:''}
    ${w.area?`<dt>Area</dt><dd>${esc(w.area)}</dd>`:''}
    ${w.blocked_by?`<dt>Blocked by</dt><dd>${chip(w.blocked_by)}</dd>`:''}
    ${w.commit_sha?`<dt>Commit</dt><dd class="mono">${esc(w.commit_sha)}</dd>`:''}
    ${w.done_at?`<dt>Closed</dt><dd class="mono">${esc(w.done_at.slice(0,10))}</dd>`:''}
  </dl>${w.description?`<p style="margin-top:var(--space-2);color:var(--text-secondary)">${esc(w.description)}</p>`:''}
  </div>`;

  const parts = {};
  kids.forEach(k => parts[k.status] = (parts[k.status]||0) + 1);
  const used = WORK_STATUS.filter(s=>parts[s]);
  h += `<div class="d-card"><h3 class="d-h3">Breakdown</h3>${
    kids.length ? `<div class="d-chart">${svgStackedRows([{label:w.code, code:w.code, parts}], used, STATUS_FILL, {padL:70})}</div>`
      + legend(used, used.map(s=>STATUS_FILL[s]))
      : `<div class="d-empty">Nothing under this yet.</div>`}
    ${tests.length?`<div style="margin-top:var(--space-2)" class="d-eyebrow">Verified by</div>
      <div style="margin-top:var(--space-1)">${tests.map(t=>
        `<span class="d-badge d-badge--${t.failed?'danger':'success'}">${esc(t.tool||t.kind)} ${t.passed}/${t.passed+t.failed}</span> `).join('')}</div>`:''}
  </div></div>`;

  if(w.level === 0) h += epicEdit(w.code);

  if(kids.length){
    h += `<h2 class="d-h">Everything under ${esc(w.code)}</h2><div class="d-scroller"><table>
      <thead><tr><th>Code</th><th>Level</th><th>Title</th><th>Parent</th><th>Status</th></tr></thead><tbody>` +
      kids.map(k=>`<tr class="${k.status==='cut'?'d-gone':''}">
        <td>${chip(k.code)}</td><td><span class="d-badge">${LEVELS[k.level]}</span></td>
        <td class="t" style="padding-left:${(k.level-w.level)*16 + 20}px">
          <button class="d-rowlink" data-go="work/${esc(k.code)}">${esc(k.title)}</button></td>
        <td>${chip(k.parent)}</td><td>${badge(k.status)}${k.blocked_by?' '+chip(k.blocked_by):''}</td></tr>`).join('') +
      `</tbody></table></div>
      <div style="margin-top:var(--space-2)">
        <button class="d-btn" data-filter-parent="${esc(w.code)}">Filter the list by this</button></div>`;
  }

  if(screens.length){
    h += `<h2 class="d-h">Screens</h2><div class="d-scroller"><table><thead><tr>
      <th>Code</th><th>Screen</th><th>Route</th><th>Rounds</th><th>Status</th></tr></thead><tbody>` +
      screens.map(s=>`<tr><td>${chip(s.code)}</td>
        <td><button class="d-rowlink" data-go="design/${esc(s.code)}">${esc(s.name)}</button></td>
        <td class="code">${esc(s.route||'')}</td><td class="num">${s.iterations||0}</td>
        <td>${badge(s.design_status)}</td></tr>`).join('') + `</tbody></table></div>`;
  }
  if(fb.length){
    h += `<h2 class="d-h">Feedback pointing here</h2><div class="d-card d-card--flat"><ul class="d-feed">` +
      fb.map(f=>`<li>${chip(f.code)}<span>${esc(f.title)}</span>${badge(f.status)}</li>`).join('') + `</ul></div>`;
  }

  if(w.doc_path){
    const md = await text('../' + w.doc_path);
    h += `<h2 class="d-h">Document</h2><div class="d-card d-md" data-docbase="../${esc(w.doc_path)}">${
      md ? renderMd(md) : `<div class="d-empty">${esc(w.doc_path)} not found on disk.</div>`}</div>`;
  }
  return h + contextSection(w.code);
}

/* The edit pass for one epic: gate, editor, note, and the fix tasks it produced. */
function epicEdit(code){
  const proj = project(), past = pastEdit(proj);
  const e = editRows().find(r => r.code === code);
  if(!e) return '';
  const state = e.gate.status ? '' : !e.delivered
    ? `Not delivered yet (${e.settled} of ${e.stories} stories settled). The edit pass starts once every story is done.`
    : past ? `Delivered and never edited. <span class="d-cmd">./pm check</span> fails on this until
        <span class="d-cmd">/pm-edit</span> approves or skips its edit gate.`
    : `Delivered. It gets its edit pass in the edit phase: <span class="d-cmd">./pm gate open edit ${esc(code)}</span>.`;
  return `<h2 class="d-h">Edit pass</h2><div class="d-card">
    <div class="d-secthead"><h3 class="d-h3" style="margin:0">Played as a user, fixed, approved</h3>${editBadge(e, past)}</div>
    ${state ? `<p class="d-muted" style="margin-top:var(--space-1)">${state}</p>` : ''}
    ${e.gate.status ? `<dl class="d-kv" style="margin-top:var(--space-15)">
      <dt>Editor</dt><dd>${esc(e.gate.approved_by || 'not recorded')}</dd>
      <dt>When</dt><dd class="d-mono">${esc((e.gate.approved_at || '').slice(0,10)) || 'not yet'}</dd>
      <dt>Note</dt><dd>${esc(e.gate.note || '') || '<span class="d-muted">none</span>'}</dd></dl>` : ''}
    <div class="d-eyebrow" style="margin-top:var(--space-2)">Fix tasks, ${e.fixOpen.length} open and
      ${e.fixes.length - e.fixOpen.length} closed</div>
    ${e.fixes.length ? `<ul class="d-feed">${e.fixes.map(f => `<li>${chip(f.code)}
      <span><button class="d-rowlink" data-go="work/${esc(f.code)}">${esc(f.title)}</button></span>${badge(f.status)}</li>`).join('')}</ul>`
      : `<p class="d-muted" style="margin-top:var(--space-05)">None. Fixes found while editing become
          <span class="d-cmd">./pm task type=fix</span> under the story they touch.</p>`}
  </div>`;
}

/* Mirrors cmd_context in pm: point of view, the chain up to the epic, every screen on that
   chain, guardrails in full, and the pointers. What an agent reads before building. */
function contextSection(code){
  const isScreen = /^SCR/.test(code);
  const screens = [], chain = [];
  let cur = code;
  if(isScreen){
    const s = one("SELECT * FROM screen WHERE code=?", [code]);
    if(s.code) screens.push(s);
    cur = s.item;
  }
  while(cur){
    const w = one("SELECT * FROM work_item WHERE code=?", [cur]);
    if(!w.code) break;
    chain.push(w);
    cur = w.parent;
  }
  if(chain.length){
    const seen = new Set(screens.map(s => s.code));
    q(`SELECT * FROM screen WHERE item IN (${chain.map(() => '?').join(',')}) ORDER BY code`, chain.map(w => w.code))
      .forEach(s => { if(!seen.has(s.code)) screens.push(s); });
  }
  const sec = (title, body, open=true) =>
    `<details class="d-ctx__sec"${open ? ' open' : ''}><summary class="d-eyebrow">${title}</summary>${body}</details>`;

  const pov = povFilled()
    ? `<div class="d-md d-md--compact">${renderMd(STD.pov)}</div>`
    : `<div class="d-ctx__body"><div class="d-alert" style="margin:0"><b>MISSING.</b> standards/point-of-view.md is
        ${STD.pov === null ? 'not there' : 'unfilled'}, so the agent is told to stop and run the point of view
        round of <span class="d-cmd">/pm-new</span>.</div></div>`;

  const chainHtml = chain.length ? `<ol class="d-chain">${chain.map(w => `<li>
      <div class="d-chain__row">${chip(w.code)}<span class="d-badge">${LEVELS[w.level]}</span>${badge(w.status)}
        <b>${esc(w.title)}</b></div>
      ${w.description ? `<div class="d-chain__desc">${esc(w.description)}</div>` : ''}
      ${w.doc_path ? `<div class="d-chain__desc">doc: <button class="d-rowlink d-mono" data-doc="${esc(w.doc_path)}">${esc(w.doc_path)}</button></div>` : ''}
    </li>`).join('')}</ol>`
    : `<p class="d-muted d-ctx__body">${isScreen ? 'This screen belongs to no work item.' : 'No chain.'}</p>`;

  const screenHtml = screens.length ? `<div class="d-ctx__body d-stack">${screens.map(s => {
      let st = []; try{ st = JSON.parse(s.states_json || '[]'); }catch(e){}
      return `<div><div class="d-chain__row">${chip(s.code)}<b>${esc(s.name)}</b>${badge(s.design_status)}</div>
        <div class="d-chain__desc">states: ${st.length ? st.map(esc).join(', ') : 'none listed'}</div>
        ${s.doc_path ? `<div class="d-chain__desc">brief: <button class="d-rowlink d-mono" data-doc="${esc(s.doc_path)}">${esc(s.doc_path)}</button></div>` : ''}
        ${s.prototype_path ? `<div class="d-chain__desc">prototype: <a class="d-link d-mono" href="../${esc(s.prototype_path)}" target="_blank" rel="noopener">${esc(s.prototype_path)}</a></div>` : ''}
      </div>`; }).join('')}</div>`
    : `<p class="d-muted d-ctx__body">No screen is attached to anything on this chain.</p>`;

  const guard = STD.guard
    ? `<div class="d-md d-md--compact">${renderMd(STD.guard)}</div>`
    : `<p class="d-muted d-ctx__body">standards/guardrails.md is missing or empty, so no guardrails are printed.</p>`;

  return `<h2 class="d-h" id="context">What the agent sees before building this</h2>
    <div class="d-ctx">
      <div class="d-ctx__head"><p class="d-muted" style="margin:0">The same content
        <span class="d-cmd">./pm context ${esc(code)}</span> prints. An agent runs it before every task
        and every screen, and builds from it.</p></div>
      ${sec('Point of view', pov, !povFilled())}
      ${sec(`Work, from ${esc(code)} up to its epic`, chainHtml)}
      ${sec(`Screens on this chain (${screens.length})`, screenHtml)}
      ${sec('Guardrails', guard, false)}
      ${sec('Read before writing UI', `<ul class="d-feed d-ctx__body">
        <li><button class="d-rowlink d-mono" data-doc="standards/design-system.md">standards/design-system.md</button><span class="d-muted">rules</span></li>
        <li><button class="d-rowlink d-mono" data-go="standards">standards/tokens.css</button><span class="d-muted">every color, size and radius comes from here</span></li>
        <li><button class="d-rowlink d-mono" data-go="standards">standards/patterns/</button><span class="d-muted">full templates and flows, reuse before inventing</span></li></ul>`)}
    </div>`;
}

/* ------------------------------------------------------------------ design */

async function listDir(path){
  const t = await text(path);
  return t ? [...t.matchAll(/href="([^"?][^"]*\.html)"/g)].map(m=>m[1]) : [];
}

/* Specimen cards use Claude Design's own marker, so a synced system drops straight in:
   <!-- @dsCard group="Actions" name="Button" subtitle="..." height="360" --> */
async function specCards(){
  const files = await listDir('../design-prototypes/');
  const cards = [];
  for(const f of files){
    const src = await text('../design-prototypes/' + f);
    if(!src) continue;
    const m = src.match(/<!--\s*@dsCard([^>]*?)-->/);
    if(!m) continue;
    const attr = k => (m[1].match(new RegExp(k + '="([^"]*)"')) || [])[1];
    const notes = (src.match(/<!--\s*@dsNotes\s*([\s\S]*?)-->/) || [])[1];
    cards.push({file:f, group:attr('group') || 'Components', name:attr('name') || f.replace('.html',''),
                subtitle:attr('subtitle') || '', height:Number(attr('height')) || 340, notes});
  }
  return cards;
}

async function design(){
  if(ROUTE.arg) return screenDetail(ROUTE.arg);
  const s = UI.design;
  let h = `<div class="d-eyebrow">Foundations and screens</div>
    <h1 class="d-title">Design</h1><hr class="d-rule">
    <div class="d-toolbar"><div class="d-tabs" role="tablist">
      <button class="d-tabs__tab" role="tab" aria-selected="${s.tab==='system'}" data-dtab="system">Design system</button>
      <button class="d-tabs__tab" role="tab" aria-selected="${s.tab==='screens'}" data-dtab="screens">Screens</button>
    </div></div>`;
  return h + (s.tab === 'system' ? await designSystem() : await designScreens());
}

async function designSystem(){
  const gate = one("SELECT * FROM gate WHERE phase='design' AND subject='design-system'");
  const md = await text('../standards/design-system.md');
  let h = `<div class="d-card" style="margin-bottom:var(--space-3)">
    <div class="d-secthead"><h3 class="d-h3" style="margin:0">System status</h3>${badge(gate.status||'pending')}</div>
    <p style="color:var(--text-secondary);font-size:var(--fs-body-s);margin-top:var(--space-1)">${esc(gate.note ||
      'Not approved yet. No screen should be designed before the system is.')}</p></div>`;

  const cards = await specCards();
  if(cards.length){
    const groups = [...new Set(cards.map(c=>c.group))];
    for(const g of groups){
      h += `<div class="d-specgroup">${esc(g)}</div>`;
      for(const c of cards.filter(x=>x.group===g)){
        h += `<div class="d-spec">
          <div class="d-spec__head"><div>
            <div class="d-spec__name">${esc(c.name)}</div>
            <div class="d-spec__sub">${esc(c.subtitle)}</div></div>
            <a class="d-btn d-btn--sm" href="../design-prototypes/${c.file}" target="_blank" rel="noopener">Open</a>
          </div>
          <div class="d-spec__stage"><iframe src="../design-prototypes/${c.file}" loading="lazy"
            style="height:${c.height}px" title="${esc(c.name)} specimen"></iframe></div>
          ${c.notes?`<details class="d-spec__notes"><summary>Usage notes for Claude</summary>
            <div class="d-md">${renderMd(c.notes.trim())}</div></details>`:''}
        </div>`;
      }
    }
  } else {
    h += `<div class="d-empty">No specimen cards yet. Add a first-line marker to any file in
      <code>design-prototypes/</code> and it appears here, grouped:
      <pre style="margin-top:var(--space-15)">&lt;!-- @dsCard group="Actions" name="Button"
     subtitle="Every variant and size" height="360" --&gt;
&lt;!-- @dsNotes
Usage notes in markdown. Rendered under the specimen.
--&gt;</pre>
      Same marker Claude Design uses, so a system synced from there drops straight in.</div>`;
  }

  const hexes = md ? [...new Set(md.match(/#[0-9A-Fa-f]{6}\b/g) || [])].slice(0,32) : [];
  if(hexes.length){
    h += `<div class="d-specgroup">Palette declared in design-system.md</div>
      <div class="d-swatches">${hexes.map(x=>`<div class="d-sw"><i style="background:${x}"></i><span>${x}</span></div>`).join('')}</div>`;
  }
  h += `<div class="d-specgroup">The written system</div>
    <div class="d-card d-md" data-docbase="../standards/design-system.md">${
      md ? renderMd(md) : '<div class="d-empty">standards/design-system.md not found.</div>'}</div>`;
  return h;
}

async function designScreens(){
  const screens = q("SELECT * FROM screen ORDER BY code");
  if(!screens.length) return `<div class="d-empty">No screens yet. <code>/pm-flows</code> inventories them
    before design starts.</div>`;
  let h = `<div class="d-shots">`;
  for(const s of screens){
    let st = []; try{ st = JSON.parse(s.states_json || '[]'); }catch(e){}
    h += `<div class="d-shot" data-go="design/${esc(s.code)}" tabindex="0" role="button">
      <div class="d-shot__frame">${s.prototype_path
        ? `<iframe src="../${esc(s.prototype_path)}" loading="lazy" title="${esc(s.name)}"></iframe>`
        : `<div class="d-placeholder">no prototype yet</div>`}</div>
      <div class="d-shot__foot"><div>
        <div class="d-shot__name">${esc(s.name)}</div>
        <div class="d-tile__meta"><span>${esc(s.code)}</span><span>${st.length} states</span>
          <span>${s.iterations||0} rounds</span></div></div>
        ${badge(s.design_status)}</div></div>`;
  }
  return h + `</div>`;
}

async function screenDetail(code){
  const s = one("SELECT * FROM screen WHERE code=?",[code]);
  if(!s.code) return `<div class="d-alert">${esc(code)} not found. <a href="#design">Back to Design</a></div>`;
  let st = []; try{ st = JSON.parse(s.states_json || '[]'); }catch(e){}
  const gate = one("SELECT * FROM gate WHERE phase='design' AND subject=?",[code]);

  let h = `<div class="d-crumbs"><button data-go="design">Design</button> / ${esc(s.code)}</div>
    <div class="d-eyebrow">Screen${s.route?' at '+esc(s.route):''}</div>
    <h1 class="d-title">${esc(s.name)}</h1><hr class="d-rule">
    <div class="d-grid d-grid--2">
      <div class="d-card"><dl class="d-kv">
        <dt>Status</dt><dd>${badge(s.design_status)}</dd>
        <dt>Belongs to</dt><dd>${chip(s.item) || 'nothing'}</dd>
        <dt>Route</dt><dd class="mono">${esc(s.route||'')}</dd>
        <dt>Rounds</dt><dd class="num">${s.iterations||0}</dd>
        ${s.approved_at?`<dt>Approved</dt><dd class="mono">${esc(String(s.approved_at).slice(0,10))}</dd>`:''}
      </dl>${gate.note?`<p style="margin-top:var(--space-2);color:var(--text-secondary)">
        <b>Why this one won:</b> ${esc(gate.note)}</p>`:''}</div>
      <div class="d-card"><h3 class="d-h3">States inventoried</h3>
        ${st.length ? st.map(x=>`<span class="d-badge" style="margin:0 6px 6px 0">${esc(x)}</span>`).join('')
          : '<div class="d-empty">None listed.</div>'}
        ${st.length && st.length<6 ? `<div class="d-alert" style="margin-top:var(--space-2)">
          Fewer than six states usually means states were skipped, not that the screen is simple.</div>`:''}
      </div></div>`;

  if(s.prototype_path){
    h += `<h2 class="d-h">Prototype</h2>
      <div class="d-card" style="padding:0;overflow:hidden">
        <iframe src="../${esc(s.prototype_path)}" style="width:100%;height:620px;border:0;display:block"
          title="${esc(s.name)} prototype"></iframe></div>
      <div style="margin-top:var(--space-15)">
        <a class="d-btn" href="../${esc(s.prototype_path)}" target="_blank" rel="noopener">Open full size</a></div>`;
  }
  if(s.doc_path){
    const md = await text('../' + s.doc_path);
    h += `<h2 class="d-h">Brief</h2><div class="d-card d-md" data-docbase="../${esc(s.doc_path)}">${
      md ? renderMd(md) : `<div class="d-empty">${esc(s.doc_path)} not found on disk.</div>`}</div>`;
  }
  return h + contextSection(s.code);
}

/* ------------------------------------------------------------------ standards */

/* Pulls the custom properties out of standards/tokens.css as written, light from the bare
   :root block and dark from the [data-theme="dark"] or prefers-color-scheme block. A
   reading of the file, not of computed styles, so it shows what the code repo imports. */
function parseTokens(css){
  const light = {}, dark = {};
  const src = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
  for(const m of src.matchAll(/([^{}]*)\{([^{}]*)\}/g)){
    const sel = m[1].trim();
    if(!sel.includes(':root')) continue;
    const isDark = sel.includes('data-theme="dark"') || sel.includes("data-theme='dark'") ||
                   sel.includes('data-theme="light"])');
    for(const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g))
      (isDark ? dark : light)[d[1]] = d[2].trim();
  }
  const names = [...new Set([...Object.keys(light), ...Object.keys(dark)])];
  const kind = (name, v) =>
    /(^--r-|radius|rounded)/i.test(name) && CSS.supports('border-radius', v) ? 'radius'
    : /(^--f-|font|family)/i.test(name) && CSS.supports('font-family', v) ? 'font'
    : CSS.supports('color', v) ? 'color' : 'other';
  return names.map(name => {
    const l = light[name] ?? null, d = dark[name] ?? null;
    return {name, light:l, dark:d, kind:kind(name, l ?? d)};
  });
}

function tokenSwatch(v){
  if(v == null) return `<code>not set</code>`;
  return (CSS.supports('color', v) ? `<i class="d-chipsw" style="background:${esc(v)}"></i>` : '') +
    `<code>${esc(v)}</code>`;
}

function tokensBlock(css){
  if(css == null) return `<div class="d-empty">standards/tokens.css not found. It is the only file
    allowed a raw value, so every component in the code repo reads from it.</div>`;
  const toks = parseTokens(css);
  if(!toks.length) return `<div class="d-empty">standards/tokens.css has no custom properties on
    <code>:root</code> yet. <span class="d-cmd">/pm-design</span> fills it.</div>`;
  const colors = toks.filter(t => t.kind === 'color'), radii = toks.filter(t => t.kind === 'radius');
  const fonts = toks.filter(t => t.kind === 'font'), other = toks.filter(t => t.kind === 'other');
  const hasDark = toks.some(t => t.dark != null);
  const grid = rows => `<div class="d-tok" role="table" aria-label="Tokens, light and dark">
      <div class="h name" role="columnheader">Token</div><div class="h" role="columnheader">Light</div>
      <div class="h" role="columnheader">Dark</div>` +
    rows.map(t => `<div class="name" role="cell"><code>${esc(t.name)}</code></div>
      <div class="val" role="cell">${tokenSwatch(t.light)}</div>
      <div class="val" role="cell">${t.dark == null ? `<code>same as light</code>` : tokenSwatch(t.dark)}</div>`).join('') +
    `</div>`;
  let h = `<p class="d-muted" style="margin-bottom:var(--space-15)">${toks.length} tokens read live from
    <a class="d-link d-mono" href="../standards/tokens.css" target="_blank" rel="noopener">standards/tokens.css</a>.
    ${hasDark ? 'Dark values come from its dark block.' : 'No dark block yet, so both themes use the light values.'}</p>`;
  if(colors.length) h += `<div class="d-specgroup">Color</div>` + grid(colors);
  if(radii.length) h += `<div class="d-specgroup">Radius</div><div class="d-radii">` + radii.map(t =>
    `<figure><i style="border-radius:${esc(t.light ?? t.dark)}"></i>
      <figcaption>${esc(t.name)}<br>${esc(t.light ?? t.dark)}</figcaption></figure>`).join('') + `</div>`;
  if(fonts.length) h += `<div class="d-specgroup">Type</div><div class="d-card">` + fonts.map(t =>
    `<div class="d-font"><div class="d-font__sample" style="font-family:${esc(t.light ?? t.dark)}">
      The chain has to hold. 0123456789</div>
      <div class="d-font__meta">${esc(t.name)}: ${esc(t.light ?? t.dark)}</div></div>`).join('') + `</div>`;
  if(other.length) h += `<div class="d-specgroup">Other values</div>` + grid(other);
  return h;
}

async function standards(){
  let h = `<div class="d-eyebrow">What every agent applies</div>
    <h1 class="d-title">Standards</h1>
    <p class="d-lede">Point of view, tokens, guardrails and patterns. <span class="d-cmd">./pm context</span>
      serves these to an agent before every task, so a rule only lives here if it should reach the code.</p>
    <hr class="d-rule">`;
  if(!STD.dir) return h + `<div class="d-alert"><b>No standards/ folder.</b> <span class="d-cmd">./pm check</span>
    and <span class="d-cmd">./pm context</span> both read it. Restore it from the template: point-of-view.md,
    design-system.md, tokens.css, guardrails.md and patterns/.</div>`;

  const phase = project().current_phase;
  h += `<h2 class="d-h" style="margin-top:0">Point of view</h2>`;
  if(STD.pov === null){
    h += `<div class="d-alert"><b>standards/point-of-view.md is missing.</b> <span class="d-cmd">./pm check</span>
      fails past intent without it, and <span class="d-cmd">./pm context</span> prints a MISSING warning in its
      place. <span class="d-cmd">/pm-new</span> writes it.</div>`;
  } else if(!povFilled()){
    h += `<div class="d-alert"><b>Unfilled.</b> The file still carries the <code>pm:unfilled</code> marker, so
      <span class="d-cmd">./pm check</span> fails past intent and <span class="d-cmd">./pm context</span> tells the agent
      to stop instead of printing it. ${phase === 'intent'
        ? 'This project is still in intent, so the check is not failing yet.'
        : `This project is in ${esc(phase)}, so the check is failing now.`}
      Run <span class="d-cmd">/pm-new</span> to fill it.</div>
      <details class="d-card d-details"><summary>The unfilled template</summary>
        <div class="d-md d-md--compact" style="margin-top:var(--space-15)">${renderMd(STD.pov.replace(/<!--[\s\S]*?-->/g,''))}</div></details>`;
  } else {
    h += `<div class="d-card d-md" data-docbase="../standards/point-of-view.md">${renderMd(STD.pov)}</div>`;
  }

  h += `<h2 class="d-h">Tokens</h2>` + tokensBlock(STD.tokens);

  h += `<h2 class="d-h">Guardrails</h2>` + (STD.guard
    ? `<div class="d-card d-md" data-docbase="../standards/guardrails.md">${renderMd(STD.guard)}</div>`
    : `<div class="d-empty">standards/guardrails.md is missing or empty. It holds one line rules from
        approvals, edit passes and mistakes, and <span class="d-cmd">./pm context</span> prints it in full.</div>`);

  const pats = (await docTree('../standards/patterns/', 0)).filter(f => !/\/README\.md$/i.test(f));
  h += `<h2 class="d-h">Patterns</h2>`;
  if(pats.length){
    const rows = [];
    for(const f of pats){
      const md = await text(f) || '';
      const title = strip((md.match(/^#\s+(.*)$/m) || [])[1] || norm(f).split('/').pop());
      const when = strip(mdBullets(md).find(b => /^\**when/i.test(b)) || '').replace(/^When:?\s*/i,'');
      rows.push(`<li><button class="d-rowlink" data-doc="${esc(f)}">${esc(title)}</button>
        <span class="d-muted">${esc(when || norm(f))}</span></li>`);
    }
    h += `<div class="d-card d-card--flat"><ul class="d-feed">${rows.join('')}</ul></div>`;
  } else {
    h += `<div class="d-empty">No patterns yet. <span class="d-cmd">/pm-design</span> writes one per first of
      its kind screen, once that screen is approved. ${STD.patternsReadme ? `See
      <button class="d-rowlink" data-doc="standards/patterns/README.md">patterns/README.md</button> for the shape.` : ''}</div>`;
  }

  h += `<h2 class="d-h">Design system</h2><div class="d-card"><p>${STD.ds
    ? `The rules that tie these together live in
      <button class="d-rowlink" data-doc="standards/design-system.md">standards/design-system.md</button>.
      Specimens and screens are on the <button class="d-rowlink" data-go="design">Design</button> page.`
    : 'standards/design-system.md not found.'}</p></div>`;
  return h;
}

/* ------------------------------------------------------------------ docs */

async function docTree(base, depth){
  const t = await text(base);
  if(!t) return [];
  const out = [];
  for(const m of t.matchAll(/href="([^"?][^"]*)"/g)){
    const href = m[1];
    if(href.startsWith('/') || href.startsWith('..')) continue;
    if(href.endsWith('/')){ if(depth > 0) out.push(...await docTree(base + href, depth - 1)); }
    else if(href.endsWith('.md')) out.push(base + href);
  }
  return out;
}

async function allDocs(){
  if(CACHE.__docs) return CACHE.__docs;
  const files = [...new Set([...await docTree('../docs/', 3), ...await docTree('../standards/', 1),
    ...await docTree('../', 0)])].sort();
  CACHE.__docs = files;
  return files;
}

const norm = p => p.replace(/^\.\.\//,'').replace(/\/+/g,'/');

/* Resolve a markdown link against the document it appears in, in repo-relative space.
   'docs/engineering/trd/sync.md' + '../architecture.md' -> '../docs/engineering/architecture.md' */
function resolveDoc(baseDocPath, href){
  const baseRel = norm(baseDocPath);
  const dir = baseRel.includes('/') ? baseRel.slice(0, baseRel.lastIndexOf('/')) : '';
  const parts = (dir ? dir.split('/') : []).concat(href.split('#')[0].split('/'));
  const out = [];
  for(const seg of parts){
    if(!seg || seg === '.') continue;
    if(seg === '..') out.pop();
    else out.push(seg);
  }
  return '../' + out.join('/');
}

async function docs(){
  const files = await allDocs();
  if(!files.length) return `<h1 class="d-title">Docs</h1>
    <div class="d-empty">No markdown found. Serve from the repo root so the dashboard can read
    <code>docs/</code>.</div>`;

  if(ROUTE.arg) UI.docs.path = '../' + decodeURIComponent(ROUTE.arg).replace(/^\.\.\//,'');
  if(!UI.docs.path || !files.includes(UI.docs.path))
    UI.docs.path = files.find(f=>f.endsWith('docs/index.md')) || files[0];

  const tree = {};
  for(const f of files){
    const rel = norm(f);
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.';
    (tree[dir] = tree[dir] || []).push(f);
  }

  const body = await text(UI.docs.path);
  const rel = norm(UI.docs.path);
  const html = body ? renderMd(body) : '';

  /* table of contents from the rendered headings */
  const toc = [...(html.matchAll(/<h([23])[^>]*>(.*?)<\/h\1>/g))].map(m=>({
    lvl:Number(m[1]), text:m[2].replace(/<[^>]+>/g,''),
    id:m[2].replace(/<[^>]+>/g,'').toLowerCase().replace(/[^\w]+/g,'-').replace(/^-|-$/g,'')}));
  const withIds = html.replace(/<h([23])([^>]*)>(.*?)<\/h\1>/g, (m,l,a,t)=>{
    const id = t.replace(/<[^>]+>/g,'').toLowerCase().replace(/[^\w]+/g,'-').replace(/^-|-$/g,'');
    return `<h${l}${a} id="${id}">${t}</h${l}>`;
  });

  /* backlinks: any other doc whose markdown links to this path */
  const back = [];
  for(const f of files){
    if(f === UI.docs.path) continue;
    const src = CACHE[f];
    if(!src) continue;
    const target = rel.split('/').pop();
    if(new RegExp('\\]\\([^)]*' + target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\)').test(src)) back.push(f);
  }

  const crumbs = rel.split('/');
  return `<div class="d-eyebrow">Every markdown file in the repo</div>
    <h1 class="d-title">Docs</h1><hr class="d-rule">
    <div class="d-docs">
      <div class="d-side"><ul class="d-tree">${Object.keys(tree).sort().map(dir=>`
        <li><details ${rel.startsWith(dir)||dir==='.'?'open':''}>
          <summary>${esc(dir === '.' ? 'root' : dir.replace(/^docs\/?/,'') || 'docs')}</summary>
          <ul>${tree[dir].map(f=>`<li><button class="d-tree__file" data-doc="${esc(f)}"
            aria-current="${f===UI.docs.path}">${esc(f.split('/').pop())}</button></li>`).join('')}</ul>
        </details></li>`).join('')}</ul></div>
      <div>
        <div class="d-crumbs">${crumbs.map((c,i)=>
          i===crumbs.length-1 ? esc(c) : `<button data-doc-dir>${esc(c)}</button> / `).join('')}</div>
        <div class="d-card d-md" data-docbase="${esc(UI.docs.path)}">${
          body ? withIds : '<div class="d-empty">Could not read that file.</div>'}</div>
        ${back.length?`<h2 class="d-h">Referenced by</h2><div class="d-card d-card--flat"><ul class="d-feed">${
          back.map(f=>`<li><button class="d-rowlink" data-doc="${esc(f)}">${esc(norm(f))}</button></li>`).join('')
        }</ul></div>`:''}
      </div>
      <div class="d-side d-toc">${toc.length?`<div class="d-eyebrow" style="margin-bottom:var(--space-1)">On this page</div>`
        + toc.map(t=>`<a href="#${t.id}" class="${t.lvl===3?'lvl3':''}" data-anchor>${esc(t.text)}</a>`).join('')
        : ''}</div>
    </div>`;
}

/* ------------------------------------------------------------------ engineering */

function mdSection(md, heading){
  if(!md) return '';
  const re = new RegExp('^#{1,6}\\s*' + heading + '\\s*$([\\s\\S]*?)(?=^#{1,6}\\s|\\Z)', 'im');
  return (md.match(re) || [])[1] || '';
}
function mdBullets(section){
  /* Join continuation lines, so a bullet that wraps is not truncated at the wrap. */
  const out = [];
  for(const raw of section.split('\n')){
    if(/^\s*[-*]\s+/.test(raw)) out.push(raw.replace(/^\s*[-*]\s+/,'').trim());
    else if(out.length && /^\s+\S/.test(raw)) out[out.length-1] += ' ' + raw.trim();
    else if(!raw.trim()) continue;
  }
  return out;
}
function mdRows(section){
  const lines = section.split('\n').filter(l => /^\s*\|/.test(l));
  return lines.slice(2).map(l => l.split('|').slice(1,-1).map(c=>c.trim()))
              .filter(cells => cells.some(c => c && !/^<.*>$/.test(c)));
}
const strip = s => s.replace(/[`*]/g,'').replace(/<[^>]*>/g,'').trim();

const ENG_TABS = [['areas','Areas'],['decisions','Decisions'],['debt','Debt'],
                  ['contract','Contract surface'],['architecture','Architecture']];

async function parseAreas(){
  const files = (await docTree('../docs/engineering/trd/', 1)).filter(f=>!f.endsWith('index.md'));
  const parsed = [];
  for(const f of files){
    const md = await text(f);
    if(!md) continue;
    parsed.push({
      file:f, name:strip((md.match(/^#\s+(.*)$/m)||[])[1] || norm(f).split('/').pop()),
      owns:mdBullets(mdSection(md,'Responsibility')),
      covers:(md.match(/Covers epics?:\s*(.*)/i)||[])[1] || '',
      debt:mdBullets(mdSection(md,'Deferred and accepted debt')),
      interfaces:mdRows(mdSection(md,'Interfaces')),
      model:mdRows(mdSection(md,'Data model')),
    });
  }
  return parsed;
}

async function engineering(){
  const t = UI.eng.tab;
  const parsed = await parseAreas();
  let h = `<div class="d-eyebrow">What breaks if I change this, and who decided it</div>
    <h1 class="d-title">Engineering</h1><hr class="d-rule">
    <div class="d-toolbar"><div class="d-tabs" role="tablist">` +
    ENG_TABS.map(([id,label])=>`<button class="d-tabs__tab" role="tab"
      aria-selected="${t===id}" data-etab="${id}">${label}</button>`).join('') +
    `</div></div>`;
  if(t === 'areas')        return h + engAreas(parsed);
  if(t === 'decisions')    return h + engDecisions();
  if(t === 'debt')         return h + engDebt(parsed);
  if(t === 'contract')     return h + engContract(parsed);
  return h + await engArchitecture();
}

function engAreas(parsed){
  if(!parsed.length) return `<div class="d-empty">No area files yet. Each subsystem gets
    <code>docs/engineering/trd/&lt;area&gt;.md</code> from the template, and this map builds
    itself from them.</div>`;
  return `<p class="d-lede" style="margin-bottom:var(--space-3)">Who owns which state. The most
    common source of bugs is unclear authority, so each area says what it must never write.</p>
    <div class="d-grid d-grid--2">` + parsed.map(a=>`
    <div class="d-card"><div class="d-secthead">
      <h3 class="d-h3" style="margin:0">${esc(a.name)}</h3>
      <button class="d-btn d-btn--sm" data-doc="${esc(a.file)}">Open</button></div>
      ${a.covers?`<div style="margin:var(--space-1) 0">${chips(a.covers.match(/[A-Z]+\d+/g)||[])}</div>`:''}
      ${a.owns.length?`<dl class="d-kv" style="margin-top:var(--space-15)">${a.owns.slice(0,2).map(o=>{
        const [k,...v] = o.split(':');
        return `<dt>${esc(strip(k).slice(0,14))}</dt><dd>${esc(strip(v.join(':')))}</dd>`;
      }).join('')}</dl>`:'<div class="d-empty">No ownership recorded yet.</div>'}
      <div class="d-tile__meta">
        <span>${a.interfaces.length} interfaces</span><span>${a.model.length} tables</span>
        <span${a.debt.length?' style="color:var(--status-warning)"':''}>${a.debt.length} debt</span></div>
    </div>`).join('') + `</div>`;
}

function engDecisions(){
  const adrs = q("SELECT * FROM adr ORDER BY code");
  if(!adrs.length) return `<div class="d-empty">No decisions recorded yet.</div>`;
  const byCode = Object.fromEntries(adrs.map(a=>[a.code,a]));
  const replacedBy = {};
  adrs.forEach(a => { if(a.supersedes) replacedBy[a.supersedes] = a.code; });
  return `<p class="d-lede" style="margin-bottom:var(--space-3)">A decision is immutable. One that
    turns out wrong is superseded, never edited, so the chain reads as history.</p>` +
    adrs.filter(a=>!a.supersedes).map(head=>{
      const chain = [head];
      let cur = head.code;
      while(replacedBy[cur]){ cur = replacedBy[cur]; chain.push(byCode[cur]); }
      return `<div class="d-card" style="margin-bottom:var(--space-2)">` + chain.map((a,i)=>`
        <div style="${i?'margin-top:var(--space-2);padding-top:var(--space-2);border-top:1px solid var(--border-subtle)':''}">
          <div class="d-secthead">
            <div><span class="d-chip">${esc(a.code)}</span>
              <b style="margin-left:var(--space-1);${a.status==='superseded'?'text-decoration:line-through;opacity:.6':''}">${esc(a.title)}</b></div>
            ${badge(a.status)}</div>
          ${a.why?`<p style="color:var(--text-secondary);font-size:var(--fs-body-s);margin-top:var(--space-1)">${esc(a.why)}</p>`:''}
          ${a.alternatives?`<p style="color:var(--text-secondary);font-size:var(--fs-body-s)"><b>Rejected:</b> ${esc(a.alternatives)}</p>`:''}
          ${a.doc_path?`<button class="d-btn d-btn--sm" style="margin-top:var(--space-1)" data-doc="../${esc(a.doc_path)}">Read the decision</button>`:''}
          ${i < chain.length-1?`<div class="d-eyebrow" style="margin-top:var(--space-15)">replaced by ${esc(chain[i+1].code)}</div>`:''}
        </div>`).join('') + `</div>`;
    }).join('');
}

function engDebt(parsed){
  const debt = parsed.flatMap(a => a.debt.map(d => ({area:a.name, file:a.file, text:d})));
  if(!debt.length) return `<div class="d-empty">Nothing deferred, or nothing written down. Each area
    TRD has a "Deferred and accepted debt" section, and every entry lands here with its ceiling and
    upgrade path. Mirror <code>ponytail:</code> comments from the code into it.</div>`;
  return `<p class="d-lede" style="margin-bottom:var(--space-3)">Every deliberate shortcut, with the
    ceiling it hits and what replaces it. Harvested from each area TRD, so it cannot rot quietly.</p>
    <div class="d-scroller"><table><thead><tr><th>Area</th>
    <th>Shortcut, ceiling and upgrade path</th><th></th></tr></thead><tbody>` +
    debt.map(d=>`<tr><td class="code">${esc(d.area)}</td><td>${esc(strip(d.text))}</td>
      <td><button class="d-btn d-btn--sm" data-doc="${esc(d.file)}">Open</button></td></tr>`).join('') +
    `</tbody></table></div>`;
}

function engContract(parsed){
  const sub = UI.eng.sub;
  const h = `<div class="d-toolbar"><div class="d-tabs" role="tablist">
    <button class="d-tabs__tab" role="tab" aria-selected="${sub==='interfaces'}" data-esub="interfaces">Interfaces</button>
    <button class="d-tabs__tab" role="tab" aria-selected="${sub==='model'}" data-esub="model">Data model</button>
  </div></div>`;
  return h + (sub === 'interfaces' ? engInterfaces(parsed) : engDataModel(parsed));
}

/* Interfaces read as an API reference: verb, path, then the detail on expand. */
const VERB_OF = ep => {
  const m = String(ep).trim().match(/^(GET|POST|PUT|PATCH|DELETE|WS|SSE)\b/i);
  if(m) return m[1].toUpperCase();
  return /^\w+\.\w+/.test(strip(ep)) ? 'MSG' : 'MSG';
};
function engInterfaces(parsed){
  const ops = parsed.flatMap(a => a.interfaces.map(r => ({
    area:a.name, file:a.file, ep:strip(r[0]||''), dir:strip(r[1]||''),
    purpose:strip(r[2]||''), auth:strip(r[3]||'')})));
  if(!ops.length) return `<div class="d-empty">No interfaces tabled yet. They come from the
    Interfaces table in each area TRD, one row per endpoint or message.</div>`;
  const areas = [...new Set(ops.map(o=>o.area))];
  return `<div class="d-secthead" style="margin-bottom:var(--space-3)">
      <p class="d-lede" style="margin:0">Every endpoint and message across the system, grouped by the
        area that owns it. ${ops.length} operations.</p>
      <div style="display:flex;gap:var(--space-1)">
        <button class="d-btn d-btn--sm" data-ops="open">Expand all</button>
        <button class="d-btn d-btn--sm" data-ops="close">Collapse all</button></div>
    </div>` +
    areas.map(area=>`<details class="d-opgroup" open>
      <summary><span class="d-op__chev">&#9656;</span>${esc(area)}
        <span style="margin-left:auto">${ops.filter(o=>o.area===area).length}</span></summary>` +
      ops.filter(o=>o.area===area).map(o=>{
        const verb = VERB_OF(o.ep);
        const path = strip(o.ep).replace(/^(GET|POST|PUT|PATCH|DELETE|WS|SSE)\s+/i,'');
        return `<details class="d-op"><summary>
          <span class="d-op__chev">&#9656;</span>
          <span class="d-op__verb d-op__verb--${verb.toLowerCase()}">${verb}</span>
          <span class="d-op__path">${esc(path)}</span>
          <span class="d-op__sum">${esc(o.purpose)}</span></summary>
          <div class="d-op__body"><dl class="d-kv">
            <dt>Direction</dt><dd>${esc(o.dir) || 'not stated'}</dd>
            <dt>Purpose</dt><dd>${esc(o.purpose) || 'not stated'}</dd>
            <dt>Auth</dt><dd>${o.auth ? esc(o.auth) : '<span class="d-badge d-badge--danger">none stated</span>'}</dd>
            <dt>Owner</dt><dd>${esc(o.area)}</dd>
          </dl><button class="d-btn d-btn--sm" style="margin-top:var(--space-2)"
            data-doc="${esc(o.file)}">Open the area TRD</button></div></details>`;
      }).join('') + `</details>`).join('');
}

/* ERD drawn from the Data model tables. A column ending in _id that names another
   table is treated as a foreign key, which is a heuristic, not a schema read.
   Positions live in ERD state so boxes can be dragged and the edges follow. */
let ERD = null;

const ERD_GEO = {COLW:210, GAPX:78, GAPY:44, HDR:28, ROW:16, PAD:10};

function erdModel(parsed){
  const {COLW, GAPX, GAPY, HDR, ROW, PAD} = ERD_GEO;
  const ents = parsed.flatMap(a => a.model.map(r => ({
    area:a.name, table:strip(r[0]||''), notes:strip(r[2]||''),
    cols:strip(r[1]||'').split(',').map(c=>c.trim()).filter(Boolean)})))
    .filter(e=>e.table);
  const key = t => t.toLowerCase().replace(/s$/,'');
  const byKey = {};
  ents.forEach(e => byKey[key(e.table)] = e);
  const rels = [];
  ents.forEach((e,ei) => e.cols.forEach((c,ci) => {
    const m = c.match(/^(\w+)_id$/);
    const target = m && byKey[key(m[1])];
    if(target && target !== e) rels.push({from:ei, fromCol:ci, to:ents.indexOf(target)});
  }));
  const perRow = 3;
  let x = 0, y = 0, rowH = 0;
  ents.forEach((e,i)=>{
    e.h = HDR + e.cols.length*ROW + PAD;
    if(i && i % perRow === 0){ x = 0; y += rowH + GAPY; rowH = 0; }
    e.x = x; e.y = y;
    rowH = Math.max(rowH, e.h);
    x += COLW + GAPX;
  });
  return {ents, rels, home:ents.map(e=>({x:e.x, y:e.y}))};
}

function erdInner(state){
  const {COLW, HDR, ROW} = ERD_GEO;
  let edges = '', boxes = '';
  state.rels.forEach(r=>{
    const a = state.ents[r.from], b = state.ents[r.to];
    if(!a || !b) return;
    const y1 = a.y + HDR + 10 + r.fromCol*ROW, y2 = b.y + HDR/2;
    /* Leave and enter on whichever sides are actually nearest. Picking by
       "is the target to the right" loops the edge across stacked tables. */
    let best = null;
    for(const x1 of [a.x + COLW, a.x])
      for(const x2 of [b.x, b.x + COLW]){
        const d = Math.abs(x2 - x1);
        if(!best || d < best.d) best = {x1, x2, d};
      }
    const {x1, x2} = best;
    const out = x1 === a.x ? -1 : 1;          /* which way the curve leaves a */
    const into = x2 === b.x ? -1 : 1;         /* which way it arrives at b */
    const dx = Math.max(34, best.d / 2);
    edges += `<path class="rel" d="M${x1} ${y1} C${x1 + out*dx} ${y1},
      ${x2 + into*dx} ${y2}, ${x2} ${y2}"/>
      <circle class="rel-d" cx="${x1}" cy="${y1}" r="3"/>
      <circle class="rel-d" cx="${x2}" cy="${y2}" r="3"/>`;
  });
  state.ents.forEach((e,i)=>{
    boxes += `<g class="ent-g" data-ent="${i}" transform="translate(${e.x} ${e.y})">
      <rect class="ent" x="0" y="0" width="${COLW}" height="${e.h}" rx="10"/>
      <path class="ent-h" d="M0 10 a10 10 0 0 1 10 -10 h${COLW-20} a10 10 0 0 1 10 10 v${HDR-10} h-${COLW} z"/>
      <text class="ent-t" x="10" y="19">${esc(e.table.toUpperCase())}</text>
      <text class="area" x="${COLW-10}" y="19" text-anchor="end" fill="var(--text-inverse)"
        opacity=".7">${esc(e.area.replace(/^TRD\s*/,''))}</text>` +
      e.cols.map((c,ci)=>{
        const isPk = /^id$/i.test(c), isFk = /_id$/i.test(c) && !isPk;
        return `<text class="col ${isPk?'pk':isFk?'fk':''}" x="10"
          y="${HDR+14+ci*ROW}">${esc(c)}${isPk?'  PK':isFk?'  FK':''}</text>`;
      }).join('') + `</g>`;
  });
  return edges + boxes;
}

function erdCanvas(id, height){
  return `<div class="d-erd" data-erdroot="${id}" style="height:${height}px">
    <div class="d-erd__bar">
      <button class="d-btn d-btn--sm" data-erd="reset">Reset layout</button>
      ${id === 'inline' ? `<button class="d-btn d-btn--sm" data-erd="full">Full screen</button>`
                        : ``}
    </div>
    <svg><g class="pz"></g></svg>
    <div class="d-erd__hint">Drag a table to move it. Drag the canvas to pan, scroll to zoom.</div>
  </div>`;
}

/* One pointer handler set per mounted canvas. Re-rendering the group is cheap at this size. */
function erdMount(root){
  if(!root || !ERD) return;
  const svg = root.querySelector('svg'), g = root.querySelector('.pz');
  const view = {tx:24, ty:24, k:1};
  const apply = () => g.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.k})`);
  const draw = () => { g.innerHTML = erdInner(ERD); };
  draw(); apply();

  const at = e => {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(g.getScreenCTM().inverse());
  };

  let drag = null;
  svg.addEventListener('pointerdown', e => {
    const box = e.target.closest('[data-ent]');
    const p = at(e);
    if(box){
      const ent = ERD.ents[Number(box.dataset.ent)];
      drag = {kind:'ent', ent, dx:p.x - ent.x, dy:p.y - ent.y};
    } else {
      drag = {kind:'pan', sx:e.clientX, sy:e.clientY, tx:view.tx, ty:view.ty};
      svg.classList.add('grabbing');
    }
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if(!drag) return;
    if(drag.kind === 'ent'){
      const p = at(e);
      drag.ent.x = Math.round(p.x - drag.dx);
      drag.ent.y = Math.round(p.y - drag.dy);
      draw();
    } else {
      view.tx = drag.tx + (e.clientX - drag.sx);
      view.ty = drag.ty + (e.clientY - drag.sy);
      apply();
    }
  });
  const stop = e => {
    if(!drag) return;
    drag = null;
    svg.classList.remove('grabbing');
    try{ svg.releasePointerCapture(e.pointerId); }catch(_){}
  };
  svg.addEventListener('pointerup', stop);
  svg.addEventListener('pointercancel', stop);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const p = at(e);
    const k = Math.min(2.5, Math.max(0.4, view.k * (e.deltaY < 0 ? 1.12 : 1/1.12)));
    /* keep the point under the cursor fixed while zooming */
    view.tx -= (k - view.k) * p.x;
    view.ty -= (k - view.k) * p.y;
    view.k = k;
    apply();
  }, {passive:false});

  root.__erdReset = () => {
    ERD.ents.forEach((e,i)=>{ e.x = ERD.home[i].x; e.y = ERD.home[i].y; });
    view.tx = 24; view.ty = 24; view.k = 1;
    draw(); apply();
  };
}

function engDataModel(parsed){
  ERD = erdModel(parsed);
  if(!ERD.ents.length){ ERD = null; return `<div class="d-empty">No data model tabled yet.
    It comes from the Data model table in each area TRD.</div>`; }
  const areas = new Set(ERD.ents.map(e=>e.area)).size;
  return `<p class="d-lede" style="margin-bottom:var(--space-3)">${ERD.ents.length} tables across
    ${areas} area${areas===1?'':'s'}, ${ERD.rels.length} relationship${ERD.rels.length===1?'':'s'}.
    A column ending in <code>_id</code> that names another table is drawn as a foreign key. That is
    a reading of the TRD, not of the live schema.</p>` +
    erdCanvas('inline', 460) +
    `<div class="d-legend"><span><i style="background:var(--cat-4)"></i>primary key</span>
      <span><i style="background:var(--cat-2)"></i>foreign key</span></div>
    <div class="d-scroller" style="margin-top:var(--space-4)"><table><thead><tr>
      <th>Area</th><th>Table</th><th>Columns</th><th>Notes</th></tr></thead><tbody>` +
    ERD.ents.map(e=>`<tr><td class="code">${esc(e.area)}</td><td class="code">${esc(e.table)}</td>
      <td>${e.cols.map(c=>`<code>${esc(c)}</code>`).join(' ')}</td>
      <td style="color:var(--text-secondary)">${esc(e.notes)}</td></tr>`).join('') +
    `</tbody></table></div>`;
}

async function engArchitecture(){
  const arch = await text('../docs/engineering/architecture.md');
  return `<div class="d-card d-md" data-docbase="../docs/engineering/architecture.md">${
    arch ? renderMd(arch) : '<div class="d-empty">docs/engineering/architecture.md not found.</div>'}</div>`;
}

/* ------------------------------------------------------------------ quality, ops */

function quality(){
  const runs = q("SELECT * FROM test_run ORDER BY id DESC LIMIT 50");
  let h = `<div class="d-eyebrow">Checks that ran, with results</div>
    <h1 class="d-title">Quality</h1>
    <p class="d-lede">A checkbox nobody ran is worse than no checkbox.</p><hr class="d-rule">`;
  if(!runs.length) return h + `<div class="d-empty">No test runs recorded. <code>/pm-ship</code> records them.</div>`;

  const kinds = [...new Set(runs.map(r=>r.kind))];
  h += `<div class="d-grid">` + kinds.map(k=>{
    const last = runs.find(r=>r.kind===k);
    return `<div class="d-card d-stat ${last.failed?'d-stat--alarm':'d-stat--good'}">
      <div class="d-stat__label">${esc(k)}</div>
      <div class="d-stat__val">${last.passed||0}<small> pass</small></div>
      <div class="d-stat__note">${last.failed||0} failed${last.coverage_pct!=null?`, ${last.coverage_pct}% covered`:''}</div></div>`;
  }).join('') + `</div>`;

  const unverified = q("SELECT code,title FROM work_item WHERE level=1 AND status='done'");
  if(unverified.length){
    h += `<h2 class="d-h">Delivered but unverified</h2>
      <div class="d-card d-card--flat"><ul class="d-feed">${unverified.map(u=>
        `<li>${chip(u.code)}<span>${esc(u.title)}</span><span class="when">no test covers it</span></li>`).join('')}</ul></div>`;
  }

  h += `<h2 class="d-h">Run history</h2><div class="d-scroller"><table><thead><tr><th>Kind</th><th>Tool</th>
    <th>Pass</th><th>Fail</th><th>Coverage</th><th>Covers</th><th>Ref</th><th>When</th></tr></thead><tbody>` +
    runs.map(r=>`<tr><td>${esc(r.kind)}</td><td>${esc(r.tool||'')}</td>
      <td class="num">${r.passed||0}</td>
      <td class="num" ${r.failed?'style="color:var(--status-recording);font-weight:700"':''}>${r.failed||0}</td>
      <td class="num">${r.coverage_pct!=null?r.coverage_pct+'%':''}</td>
      <td>${chips(String(r.covers||'').split(/[,\s]+/))}</td>
      <td class="code">${esc((r.ref||'').slice(0,10))}</td>
      <td class="code">${esc((r.created_at||'').slice(0,10))}</td></tr>`).join('') + `</tbody></table></div>`;
  return h;
}

function ops(){
  const deps = q("SELECT * FROM deployment ORDER BY id DESC");
  const fb = q("SELECT * FROM feedback ORDER BY id DESC");
  const crs = q("SELECT * FROM change_request ORDER BY id DESC");
  let h = `<div class="d-eyebrow">What is live, and what reality said</div>
    <h1 class="d-title">Ops</h1><hr class="d-rule"><h2 class="d-h" style="margin-top:0">Deployments</h2>`;
  h += deps.length ? `<div class="d-scroller"><table><thead><tr><th>Env</th><th>Version</th><th>Commit</th>
    <th>URL</th><th>Status</th><th>When</th></tr></thead><tbody>` +
    deps.map(d=>`<tr><td><b>${esc(d.env)}</b></td><td class="code">${esc(d.version||'')}</td>
      <td class="code">${esc((d.sha||'').slice(0,10))}</td>
      <td>${d.url?`<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a>`:''}</td>
      <td>${badge(d.status)}</td><td class="code">${esc((d.created_at||'').slice(0,10))}</td></tr>`).join('') +
    `</tbody></table></div>` : `<div class="d-empty">Nothing deployed yet.</div>`;

  const untriaged = fb.filter(f=>f.status==='new').length;
  h += `<h2 class="d-h">Feedback</h2>`;
  if(untriaged) h += `<div class="d-alert">${untriaged} item${untriaged>1?'s':''} untriaged. Every one lands
    in a fix task, a story, a change request, or wontfix with a reason.</div>`;
  h += fb.length ? `<div class="d-scroller"><table><thead><tr><th>Code</th><th>Source</th><th>Kind</th>
    <th>Title</th><th>Links to</th><th>Status</th></tr></thead><tbody>` +
    fb.map(f=>`<tr class="${['wontfix','closed'].includes(f.status)?'d-gone':''}">
      <td>${chip(f.code)}</td>
      <td>${esc(f.source||'')}${f.external_id?` <span class="d-chip">#${esc(f.external_id)}</span>`:''}</td>
      <td>${esc(f.kind||'')}</td><td class="t">${esc(f.title)}</td>
      <td>${chip(f.item)}</td><td>${badge(f.status)}</td></tr>`).join('') +
    `</tbody></table></div>` : `<div class="d-empty">No feedback yet.</div>`;

  h += `<h2 class="d-h">Change requests</h2>`;
  h += crs.length ? `<div class="d-scroller"><table><thead><tr><th>Code</th><th>Origin</th><th>Change</th>
    <th>Touches</th><th>Status</th></tr></thead><tbody>` +
    crs.map(c=>{
      let impact = {};
      try{ impact = JSON.parse(c.impact_json || '{}'); }catch(e){}
      return `<tr><td>${chip(c.code)}</td><td>${esc(c.origin||'')}</td><td class="t">${esc(c.description)}</td>
        <td>${chips(Object.values(impact).flat())}</td><td>${badge(c.status)}</td></tr>`;
    }).join('') + `</tbody></table></div>` : `<div class="d-empty">No scope changes recorded yet.</div>`;
  return h;
}

const RENDER = {overview, work, design, standards, docs, engineering, quality, ops};

/* ------------------------------------------------------------------ shell */

/* A strip on every page while ./pm check would fail. Static, it names the count and the first. */
function warnbar(){
  const probs = problems();
  const el = document.getElementById('warnbar');
  if(!probs.length){ el.innerHTML = ''; return; }
  el.innerHTML = `<div class="d-warnbar" role="status">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
      <path d="M12 9v4"/><path d="M12 17h.01"/></svg>
    <span><b>${probs.length} problem${probs.length > 1 ? 's' : ''}</b> <span class="d-cmd">./pm check</span>
      would fail on. ${esc(probs[0].msg)}${probs.length > 1 ? ', and more.' : '.'}</span>
    <button class="d-btn d-btn--sm" data-go="overview">See all</button></div>`;
}

/* Theme: unstamped follows the OS, a stamp on <html> overrides it. Remembered per browser. */
const THEMES = ['system','light','dark'];
function themeNow(){ return document.documentElement.dataset.theme || 'system'; }
function setTheme(t){
  if(t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try{ localStorage.setItem('pm-dashboard-theme', t); }catch(e){}
  const b = document.getElementById('themeBtn');
  if(b) b.textContent = 'Theme: ' + t;
}

function buildNav(active){
  const c = {
    work: n("SELECT count(*) FROM work_item WHERE status NOT IN ('done','verified','cut')"),
    design: n("SELECT count(*) FROM screen WHERE design_status != 'approved'"),
    quality: n("SELECT count(*) FROM test_run WHERE failed > 0"),
    ops: n("SELECT count(*) FROM feedback WHERE status='new'"),
  };
  document.getElementById('nav').innerHTML = VIEWS.map(v =>
    `<button class="d-nav__link" data-go="${v.id}" aria-current="${v.id===active}">${v.label}${
      c[v.id] ? `<span class="d-nav__count">${c[v.id]}</span>` : ''}</button>`).join('');
}

function go(path){
  if(location.hash.slice(1) === path) return render();
  location.hash = path;
}

async function render(){
  const [view, ...rest] = location.hash.slice(1).split('/');
  ROUTE = {view: VIEWS.some(v=>v.id===view) ? view : 'overview', arg: rest.join('/') || null};
  buildNav(ROUTE.view);
  const main = document.getElementById('main');
  main.innerHTML = `<div class="d-empty">Loading…</div>`;
  main.innerHTML = await RENDER[ROUTE.view]();
  erdMount(main.querySelector('[data-erdroot="inline"]'));
  window.scrollTo(0,0);
}

/* One delegated listener. Every control is a data attribute, so re-rendering never leaks handlers. */
document.addEventListener('click', async e => {
  if(e.target.closest('[data-skip]')){ e.preventDefault(); document.getElementById('main').focus(); return; }
  if(e.target.closest('[data-close]')){ document.getElementById('dlg').close(); return; }
  const t = e.target.closest('[data-go],[data-wtab],[data-dtab],[data-etab],[data-esub],[data-wpage],[data-doc],[data-expand],[data-filter-parent],[data-ops],[data-erd]');
  if(t){
    if(t.dataset.expand !== undefined){
      document.getElementById('dlgBody').innerHTML = expand(t.dataset.expand);
      document.getElementById('dlg').showModal();
      return;
    }
    if(t.dataset.go !== undefined){ e.preventDefault(); return go(t.dataset.go); }
    if(t.dataset.wtab){ UI.work.tab = t.dataset.wtab; UI.work.page = 1; return render(); }
    if(t.dataset.dtab){ UI.design.tab = t.dataset.dtab; return render(); }
    if(t.dataset.etab){ UI.eng.tab = t.dataset.etab; return render(); }
    if(t.dataset.esub){ UI.eng.sub = t.dataset.esub; return render(); }
    if(t.dataset.ops){
      const open = t.dataset.ops === 'open';
      document.querySelectorAll('.d-op, .d-opgroup').forEach(d => d.open = open);
      return;
    }
    if(t.dataset.erd){
      const root = t.closest('[data-erdroot]');
      if(t.dataset.erd === 'reset'){ root.__erdReset?.(); return; }
      /* full screen: same ERD state, so a layout you arranged inline carries over */
      const dlg = document.getElementById('dlg');
      document.getElementById('dlgBody').innerHTML =
        `<h2 class="d-h" style="margin-top:0">Data model</h2>` + erdCanvas('full', 620);
      dlg.showModal();
      erdMount(document.querySelector('[data-erdroot="full"]'));
      return;
    }
    if(t.dataset.wpage){ UI.work.page = Number(t.dataset.wpage); return render(); }
    if(t.dataset.filterParent !== undefined){
      UI.work.parent = t.dataset.filterParent; UI.work.tab = 'list'; UI.work.page = 1;
      return go('work');
    }
    if(t.dataset.doc !== undefined){
      e.preventDefault();
      document.getElementById('dlg').close();
      let p = t.dataset.doc;
      if(!p.startsWith('../')) p = '../' + p.replace(/^\.\//,'');
      UI.docs.path = p;
      return go('docs/' + norm(p));
    }
  }

  /* A link inside rendered markdown stays inside the dashboard. */
  /* An in-page anchor must never reach the hash router, which reads the hash as a view.
     Scroll to it instead and leave the route alone. */
  const anchor = e.target.closest('[data-anchor], .d-md a[href^="#"]');
  if(anchor){
    e.preventDefault();
    const id = anchor.getAttribute('href').slice(1);
    const target = document.getElementById(id) ||
      [...document.querySelectorAll('.d-md h2, .d-md h3')].find(h => h.id === id);
    if(target) target.scrollIntoView({behavior:'smooth', block:'start'});
    return;
  }

  const a = e.target.closest('.d-md a[href]');
  if(a){
    const href = a.getAttribute('href');
    if(/^https?:/i.test(href)) return;               /* external, let it open */
    e.preventDefault();
    const base = a.closest('[data-docbase]')?.dataset.docbase || UI.docs.path || '../docs/index.md';
    const target = resolveDoc(base, href);
    const files = await allDocs();
    const hit = files.find(f => norm(f) === norm(target)) ||
                files.find(f => norm(f).endsWith('/' + href.replace(/^[./]+/,'').split('#')[0]));
    if(hit){ UI.docs.path = hit; return go('docs/' + norm(hit)); }
    /* Not a doc we can render. Say so rather than dumping the reader on a raw file. */
    const note = document.createElement('span');
    note.className = 'd-badge d-badge--warning';
    note.style.marginLeft = '6px';
    note.textContent = 'not in this repo';
    if(!a.nextElementSibling?.classList.contains('d-badge')) a.after(note);
  }
});

document.addEventListener('input', e => {
  if(e.target.id === 'wq'){
    UI.work.q = e.target.value; UI.work.page = 1;
    clearTimeout(window.__wq);
    window.__wq = setTimeout(async () => {
      await render();
      const box = document.getElementById('wq');
      if(box){ box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    }, 180);
  }
});
document.addEventListener('change', e => {
  const map = {wlevel:'level', wms:'milestone', wparent:'parent'};
  if(map[e.target.id]){ UI.work[map[e.target.id]] = e.target.value; UI.work.page = 1; render(); }
});
addEventListener('hashchange', render);
document.getElementById('themeBtn').addEventListener('click', () =>
  setTheme(THEMES[(THEMES.indexOf(themeNow()) + 1) % THEMES.length]));
setTheme(themeNow());

async function boot(){
  const main = document.getElementById('main');
  let SQL;
  try{ SQL = await initSqlJs({locateFile: f => 'vendor/' + f}); }
  catch(e){
    main.innerHTML = `<div class="d-alert"><b>sql.js failed to load.</b> Expected
      <code>dashboard/vendor/sql-wasm.js</code> and <code>sql-wasm.wasm</code>.</div>`;
    return;
  }
  let buf;
  try{
    const r = await fetch('../project.db',{cache:'no-store'});
    if(!r.ok) throw new Error(r.status);
    buf = await r.arrayBuffer();
    if(buf.byteLength < 100) throw new Error('empty');
  }catch(e){
    main.innerHTML = `<div class="d-alert"><b>Could not read project.db.</b><ul>
      <li>Serve from the repo root, not from <code>dashboard/</code>:
        <code>python3 -m http.server 4321</code>, then open <code>/dashboard/</code></li>
      <li>If the project has not started yet, run <code>./pm init "&lt;name&gt;"</code></li></ul></div>`;
    return;
  }
  DB = new SQL.Database(new Uint8Array(buf));
  const p = one("SELECT * FROM project");
  const mode = modeOf(p);
  document.getElementById('brand').innerHTML = `<span>${esc(p.name || 'Project')}</span>
    <span class="d-badge ${mode === 'lite' ? 'd-badge--accent' : ''}" title="${mode === 'lite'
      ? 'Lite: intent, build, edit, ship, learn' : 'Full: every phase from intent to learn'}">${mode}</span>`;
  document.getElementById('brandMeta').textContent =
    `phase ${p.current_phase || 'unknown'}${p.category ? ', ' + p.category : ''}`;
  document.title = (p.name || 'Project') + ' dashboard';

  /* standards/ is read once. A missing file stays null so views can say so. */
  STD.dir = (await text('../standards/')) !== null;
  [STD.pov, STD.guard, STD.tokens, STD.ds, STD.patternsReadme] = await Promise.all([
    'point-of-view.md','guardrails.md','tokens.css','design-system.md','patterns/README.md'
  ].map(f => text('../standards/' + f)));
  if(STD.guard !== null && !STD.guard.trim()) STD.guard = null;
  warnbar();
  if(!location.hash) location.hash = 'overview';
  render();
}

boot();
