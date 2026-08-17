import { chromium } from 'playwright';
let fails=0; const ok=(c,m,x='')=>{console.log(`${c?'PASS':'FAIL'}  ${m}${x?'  '+x:''}`); if(!c)fails++;};
const b = await chromium.launch({ args:['--no-sandbox','--disable-dev-shm-usage'] });
const pg = await b.newPage({ viewport:{width:1600,height:1000} });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
await pg.evaluate(()=>{localStorage.clear();indexedDB.deleteDatabase('novelka'); indexedDB.deleteDatabase('minipdf');});
await pg.reload({waitUntil:'domcontentloaded'}); await pg.waitForTimeout(2000);
ok(errs.length===0,'app boots with no errors',errs.join(';'));

const o = pg.locator('button',{hasText:/^Open editor$/}).first();
if(await o.count()) await o.click();
for(let i=0;i<40;i++){ if(await pg.evaluate(()=>!!document.querySelector('.rail'))) break; await pg.waitForTimeout(500);}
await pg.waitForTimeout(1200);

const themeBtn = pg.locator('button[aria-label^="Theme:"]');
ok(await themeBtn.count()>0,'theme button exists in the toolbar');

const read = () => pg.evaluate(()=>{
  const cs = getComputedStyle(document.documentElement);
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  return {
    attr: document.documentElement.getAttribute('data-theme'),
    surface: cs.getPropertyValue('--surface').trim(),
    text: cs.getPropertyValue('--text').trim(),
    bodyBg,
  };
});

const initial = await read();
console.log('   initial:', JSON.stringify(initial));
ok(initial.attr==='light','light is the default on a fresh visit',String(initial.attr));
ok(initial.surface==='#f3f4f6','light surface token applied by default',initial.surface);

await themeBtn.click(); await pg.waitForTimeout(400);
const darkFirst = await read(); console.log('   after 1 click:', JSON.stringify(darkFirst));
ok(darkFirst.attr==='dark','first click gives dark',String(darkFirst.attr));
ok(darkFirst.surface==='#0f1115','dark surface token applied',darkFirst.surface);

await themeBtn.click(); await pg.waitForTimeout(400);
const light = await read(); console.log('   after 2 clicks:', JSON.stringify(light));
ok(light.attr==='light','second click returns to light',String(light.attr));
ok(light.surface==='#f3f4f6','light surface token applied',light.surface);

// there is no third "system" state — the toggle only ever has two values
await themeBtn.click(); await pg.waitForTimeout(400);
const third = await read();
ok(third.attr==='dark','third click goes straight back to dark (no system state)',String(third.attr));

// persistence (currently dark)
await pg.reload({waitUntil:'domcontentloaded'}); await pg.waitForTimeout(1800);
const after = await read();
ok(after.attr==='dark','choice survives a reload',String(after.attr));

// the canvas paper must stay white in BOTH themes — it is a print preview
for(let i=0;i<40;i++){ if(await pg.evaluate(()=>!!document.querySelector('.rail'))) break; await pg.waitForTimeout(500);}
await pg.waitForTimeout(1000);
const paper = await pg.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
ok(/^#(fff|ffffff)$/i.test(paper),'paper stays white in light mode (print preview must be honest)',paper);
await pg.screenshot({path:'/tmp/t/theme-light.png'});

await pg.locator('button[aria-label^="Theme:"]').first().click();
await pg.waitForTimeout(500); // dark
const paperDark = await pg.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
ok(/^#(fff|ffffff)$/i.test(paperDark),'paper stays white in dark mode too',paperDark);
await pg.screenshot({path:'/tmp/t/theme-dark.png'});

ok(errs.length===0,'no page errors through the whole flow',errs.slice(0,2).join(';'));
console.log(`\n${fails===0?'ALL PASS':fails+' FAILURES'}`);
await b.close(); process.exit(fails?1:0);
