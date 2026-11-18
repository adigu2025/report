/* 報告輸出比對：重構時確認「同樣的點選，報告文字不變」。
   用法（在 report 資料夾）：
     node tests/baseline.js           比對目前 index.html 與 tests/baseline.json
     node tests/baseline.js --update  把目前的輸出存成新基準（確認改動是刻意的才用）
     node tests/baseline.js --show <鍵>  印出某一步目前的完整報告，方便對照
   作法：把測試程式插進 index.html 的複本，用本機 Chrome 無頭模式執行，讀回結果。不需要安裝任何套件。
   每個工具做兩輪：
     1. 單點：每個片語各自從空白開始點一次，記下報告。
     2. 連點：同一位病人依序點完全部片語（模擬片語之間互斥、正常與異常互相取消）。
   片語以「工具／段落標題／片語文字」當鍵，版面重排、函式改名都不影響比對。
   全部相同時最後一行是「全部通過」。 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(__dirname, 'baseline.json');
const args = process.argv.slice(2);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(p => fs.existsSync(p));
if (!CHROME) { console.log('找不到 Chrome 或 Edge，無法執行'); process.exit(1); }

// 在頁面裡執行的程式（字串插入）
const PROBE = `
<script>
(function(){
var TOOLS=['abd','thy','car','egd','cfs','opd','cert'];
function h(s){var x=2166136261;for(var i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619);}return (x>>>0).toString(36);}
function norm(s){return String(s||'').replace(/\\d{4}-\\d{2}-\\d{2}/g,'<DATE>').replace(/\\d{4}\\/\\d{1,2}\\/\\d{1,2}/g,'<DATE>').replace(/\\d{2,3}年\\d{1,2}月\\d{1,2}日/g,'<民國日期>');}
function page(t){return document.getElementById('page-'+t);}
function out(t){
  var p=page(t);
  return norm([].slice.call(p.querySelectorAll('textarea')).filter(function(e){return /rtxt|rpt|out|text$/.test(e.id)&&!/free/.test(e.id);})
    .map(function(e){return e.id+'='+e.value;}).join('\\n---\\n'));
}
function clear(t){
  if(typeof window[t+'Clear']==='function')window[t+'Clear']();else{var b=page(t).querySelector('.btn-clr');if(b)b.click();}
  [].slice.call(page(t).querySelectorAll('input[type=date]')).forEach(function(e){e.value='2026-01-01';});
  ['cert-yr','cert-mo','cert-day'].forEach(function(id,i){var e=document.getElementById(id);if(e&&t==='cert')e.value=['115','1','1'][i];});
}
function keyOf(t,el){
  var sec=el.closest('.section'),st=sec?sec.querySelector('.sec-title'):null;
  var title=st?(st.firstChild&&st.firstChild.textContent||st.textContent).trim():'(無段落)';
  return t+'／'+title+'／'+el.textContent.replace(/\\s+/g,' ').trim();
}
function tags(t){
  var seen={},list=[];
  [].slice.call(page(t).querySelectorAll('.ftag, .cert-phrase')).forEach(function(el){
    var k=keyOf(t,el);seen[k]=(seen[k]||0)+1;if(seen[k]>1)k+=' #'+seen[k];list.push({k:k,el:el});
  });
  return list;
}
function run(order){
  var res={single:{},chain:[],full:{}};
  TOOLS.forEach(function(t){
    showTool(t);clear(t);
    var list=tags(t),map={};list.forEach(function(x){map[x.k]=x.el;});
    var keys=order?order.filter(function(k){return k.indexOf(t+'／')===0;}):list.map(function(x){return x.k;});
    res.full[t+'／空白']=out(t);
    keys.forEach(function(k){
      clear(t);var el=map[k];
      if(!el){res.single[k]='(找不到)';return;}
      try{el.click();res.single[k]=h(out(t));res.full[k]=out(t);}catch(e){res.single[k]='(錯誤) '+e.message;}
    });
    clear(t);
    keys.forEach(function(k){
      var el=map[k];
      if(!el){res.chain.push([k,'(找不到)']);return;}
      try{el.click();res.chain.push([k,h(out(t))]);}catch(e){res.chain.push([k,'(錯誤) '+e.message]);}
    });
    res.full[t+'／連點結果']=out(t);
    // 第三輪：點開後才出現的細項面板（瘜肉、結節、分級…），新出現的選項全點、文字欄填 1.2、下拉選第 2 項
    keys.forEach(function(k){
      clear(t);var el=map[k];if(!el)return;
      var vis=function(){return [].slice.call(page(t).querySelectorAll('.ftag, .cert-phrase, input:not([type=date]):not([type=checkbox]), select, button')).filter(function(e){return e.offsetParent!==null&&!e.closest('.report-out, .rep-head');});};
      var before=vis();
      try{
        el.click();
        // 面板每點一次可能重畫，所以每做一步就重新抓畫面，用「種類＋文字＋第幾個」記住做過哪些
        var sig=function(list){var c={};return list.map(function(e){var s=e.tagName+'|'+e.textContent.trim().slice(0,40)+'|'+(e.name||e.type||'');c[s]=(c[s]||0)+1;return s+'|'+c[s];});};
        var beforeSig=sig(before),done={},acted=0;
        for(var guard=0;guard<200;guard++){
          var now=vis(),ns=sig(now),i=-1;
          for(var j=0;j<now.length;j++){if(beforeSig.indexOf(ns[j])<0&&!done[ns[j]]){i=j;break;}}
          if(i<0)break;
          var e=now[i];done[ns[i]]=1;acted++;
          if(e.tagName==='INPUT'){e.value='1.2';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
          else if(e.tagName==='SELECT'){if(e.options.length>1){e.selectedIndex=1;e.dispatchEvent(new Event('change',{bubbles:true}));}}
          else if(!/remove|✕|刪|\\+ ?add|新增/i.test(e.textContent))e.click();
        }
        if(!acted)return;
        res.full['面板／'+k]=out(t);res.single['面板／'+k]=h(out(t));
      }catch(e){res.single['面板／'+k]='(錯誤) '+e.message;}
    });
    clear(t);
  });
  return res;
}
window.addEventListener('load',function(){setTimeout(function(){
  var order=window.__ORDER__||null,r;
  try{r=run(order);}catch(e){r={fatal:e.message+' '+e.stack};}
  var pre=document.createElement('pre');pre.id='__probe__';pre.textContent=JSON.stringify(r);document.body.appendChild(pre);
},300);});
})();
</script>`;

function probe(order) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<script>\s*if\s*\('serviceWorker'[\s\S]*?<\/script>/, '') // 不註冊離線快取
    .replace('</body>', (order ? `<script>window.__ORDER__=${JSON.stringify(order)};</script>` : '') + PROBE + '</body>');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'report-probe-'));
  const file = path.join(tmp, 'probe.html');
  fs.writeFileSync(file, html);
  const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + path.join(tmp, 'prof'),
    '--virtual-time-budget=60000', '--window-size=1920,1080', '--dump-dom', 'file:///' + file.replace(/\\/g, '/')],
    { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 300000 });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  const m = dom.match(/<pre id="__probe__">([\s\S]*?)<\/pre>/);
  if (!m) { console.log('頁面沒有回傳結果（可能有程式錯誤讓頁面停住）'); process.exit(1); }
  const txt = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const r = JSON.parse(txt);
  if (r.fatal) { console.log('頁面錯誤：' + r.fatal); process.exit(1); }
  return r;
}

if (args[0] === '--update') {
  const r = probe(null);
  const order = Object.keys(r.single).filter(k => !k.startsWith('面板／'));
  fs.writeFileSync(BASE, JSON.stringify({ order, single: r.single, chain: r.chain, full: r.full }, null, 0));
  console.log(`已存基準：${order.length} 個片語，${Object.keys(r.full).length} 份完整報告`);
  console.log('全部通過');
  process.exit(0);
}

if (!fs.existsSync(BASE)) { console.log('還沒有基準，先跑 node tests/baseline.js --update'); process.exit(1); }
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
const r = probe(base.order);

if (args[0] === '--show') {
  const k = args.slice(1).join(' ');
  console.log('【基準】\n' + (base.full[k] || '(無)') + '\n\n【目前】\n' + (r.full[k] || '(無)'));
  process.exit(0);
}

const bad = [];
Object.keys(base.single).forEach(k => {
  if (r.single[k] !== base.single[k]) bad.push('單點不同：' + k + (String(r.single[k]).startsWith('(') ? ' ' + r.single[k] : ''));
});
for (let i = 0; i < base.chain.length; i++) {
  const a = base.chain[i], b = r.chain[i] || [];
  if (a[1] !== b[1]) { bad.push('連點從這一步開始不同：' + a[0]); }
}
// 連點只報每個工具第一個不同處
const seenTool = {};
const out = bad.filter(s => {
  if (!s.startsWith('連點')) return true;
  const t = s.split('：')[1].split('／')[0];
  if (seenTool[t]) return false; seenTool[t] = 1; return true;
});
Object.keys(base.full).filter(k => /／(空白|連點結果)$/.test(k)).forEach(k => {
  if (base.full[k] !== r.full[k]) out.push('完整報告不同：' + k);
});
out.forEach(s => console.log('✗ ' + s));
console.log(out.length ? `${out.length} 個不同（node tests/baseline.js --show <鍵> 看內容）` : `${base.order.length} 個片語比對完成\n全部通過`);
process.exit(out.length ? 1 : 0);
