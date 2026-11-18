/* 畫面穩定檢查：點片語、點分頁、展開段落時，其他元素不可以移位（浮在上層的細項面板不算）。
   用法（在 report 資料夾）：node tests/stable.js [--light|--dark]
   作法：本機 Chrome 無頭模式，1920x1080 與 1366x768 兩種畫面、淺色與深色各跑一次。
   每個工具從空白開始，逐一點每個片語（點完再點一次復原），量點擊前後「沒被點的片語、段落標題、
   頂端分頁、報告欄」的位置，差超過 1px 就列出來。點擊造成的移位只算一次：同一個片語點下去讓
   10 個片語移位，列一行。全部沒移位時最後一行是「全部通過」。 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(p => fs.existsSync(p));
if (!CHROME) { console.log('找不到 Chrome 或 Edge，無法執行'); process.exit(1); }

const PROBE = `
<script>
(function(){
var TOOLS=['abd','thy','car','egd','cfs','opd','cert'];
function page(t){return document.getElementById('page-'+t);}
function vis(e){if(!e.offsetParent&&getComputedStyle(e).position!=='fixed')return false;if(e.closest('.pop-panel'))return false;var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}
function watch(t){
  return [].slice.call(document.querySelectorAll('.tt, .nav-brand, .nav-ctl, #page-'+t+' .ftag, #page-'+t+' .ind-tag, #page-'+t+' .cert-phrase, #page-'+t+' .sec-head, #page-'+t+' .report-out, #page-'+t+' .pt-bar')).filter(vis);
}
function snap(list){return list.map(function(e){var r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height];});}
function label(e){return (e.textContent||e.className).replace(/\\s+/g,' ').trim().slice(0,30);}
function moved(list,a,skip){
  var out=[];
  list.forEach(function(e,i){
    if(e===skip||!e.isConnected||!vis(e))return;
    var r=e.getBoundingClientRect(),b=a[i];
    var d=Math.max(Math.abs(r.left-b[0]),Math.abs(r.top-b[1]),Math.abs(r.width-b[2]),Math.abs(r.height-b[3]));
    if(d>1)out.push(label(e)+'('+Math.round(d)+'px)');
  });
  return out;
}
function closePops(){document.querySelectorAll('.pop-panel:not(.pop-min)').forEach(function(p){if(window.popMin)popMin(p);});}
function tick(){return new Promise(function(r){setTimeout(r,0);});}
async function run(){
  var res=[];
  // 頂端分頁：切換工具時分頁本身不可以變寬
  var tabs=[].slice.call(document.querySelectorAll('.tt'));
  showTool('abd');await tick();var a=snap(tabs);showTool('egd');await tick();
  var m=tabs.map(function(e,i){var r=e.getBoundingClientRect();return Math.abs(r.left-a[i][0])+Math.abs(r.width-a[i][2])>1?label(e):null;}).filter(Boolean);
  if(m.length)res.push('切換工具：頂端分頁移位 '+m.join('、'));
  // 切換深色模式：版面不可以動
  var all=watch('egd'),b0=snap(all);toggleTheme();await tick();var mt=moved(all,b0,null);toggleTheme();await tick();
  if(mt.length)res.push('切換深色模式：'+mt.length+' 個移位');
  for(var ti=0;ti<TOOLS.length;ti++){var t=TOOLS[ti];
    showTool(t);
    if(typeof window[t+'Clear']==='function')window[t+'Clear']();
    if(window.fitColumns)fitColumns();await tick();
    var tags=[].slice.call(page(t).querySelectorAll('.ftag, .ind-tag, .cert-phrase, .sec-head')).filter(vis);
    for(var k=0;k<tags.length;k++){var el=tags[k];
      if(!el.isConnected||!vis(el))continue;
      var list=watch(t),before=snap(list);
      var deep=[].slice.call(page(t).querySelectorAll('.main-content *')),dh=deep.map(function(e){return e.offsetHeight;});
      try{el.click();}catch(e){res.push(t+'：'+label(el)+' 點擊錯誤 '+e.message);continue;}
      await tick();
      var mv=moved(list,before,el);
      if(mv.length){
        // 找出長高或變矮的最內層元素，當成移位原因
        var why=deep.filter(function(e,i){return Math.abs(e.offsetHeight-dh[i])>1&&!e.closest('.pop-panel')&&![].some.call(e.children,function(c){var j=deep.indexOf(c);return j>-1&&Math.abs(c.offsetHeight-dh[j])>1;});})
          .map(function(e,i){return (e.id||e.className||e.tagName).toString().slice(0,30)+(e.offsetHeight-dh[deep.indexOf(e)]>0?'+':'')+(e.offsetHeight-dh[deep.indexOf(e)]);}).slice(0,3);
        res.push(t+'：點「'+label(el)+'」→ '+mv.length+' 個移位，原因 '+(why.join('、')||'欄位重排'));
      }
      closePops();
      if(typeof window[t+'Clear']==='function')window[t+'Clear']();
      if(window.fitColumns)fitColumns();
      await tick();
    }
  }
  return res;
}
window.addEventListener('load',function(){setTimeout(async function(){
  var r;try{r=await run();}catch(e){r=['頁面錯誤：'+e.message];}
  var pre=document.createElement('pre');pre.id='__probe__';pre.textContent=JSON.stringify(r);document.body.appendChild(pre);
},300);});
})();
</script>`;

function probe(w, h, theme) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<script>\s*if\s*\('serviceWorker'[\s\S]*?<\/script>/, '')
    .replace('</head>', `<script>try{localStorage.setItem('report-theme','${theme}')}catch(e){}</script></head>`)
    .replace('</body>', PROBE + '</body>');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'report-stable-'));
  const file = path.join(tmp, 'probe.html');
  fs.writeFileSync(file, html);
  const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars=false', '--user-data-dir=' + path.join(tmp, 'prof'),
    '--virtual-time-budget=60000', `--window-size=${w},${h}`, '--dump-dom', 'file:///' + file.replace(/\\/g, '/')],
    { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 300000 });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  const m = dom.match(/<pre id="__probe__">([\s\S]*?)<\/pre>/);
  if (!m) { console.log('頁面沒有回傳結果'); process.exit(1); }
  return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

const themes = process.argv.includes('--dark') ? ['dark'] : process.argv.includes('--light') ? ['light'] : ['light', 'dark'];
let bad = 0;
for (const theme of themes) for (const [w, h] of [[1920, 1080], [1366, 768]]) {
  const r = probe(w, h, theme);
  r.forEach(s => console.log(`✗ ${w}x${h} ${theme === 'dark' ? '深色' : '淺色'} ${s}`));
  bad += r.length;
}
console.log(bad ? `${bad} 處移位` : '全部通過');
process.exit(bad ? 1 : 0);
