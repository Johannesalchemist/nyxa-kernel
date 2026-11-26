// WP-SOPHIA-LIVE-STUDIO: the microphone/frame exception is exact-path scoped and origin-pinned.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {server} from '../server.mjs';
const ROOM='https://thechat.future24.eu';
test('sophia-live grants mic and framing only to The Room origin, only on its exact path',async t=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  const base='http://127.0.0.1:'+server.address().port;
  const live=await fetch(base+'/sophia-live.html');assert.equal(live.status,200);
  const csp=live.headers.get('content-security-policy'),pp=live.headers.get('permissions-policy');
  assert.match(csp,/frame-src https:\/\/thechat\.future24\.eu;/);assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/script-src 'self';/);
  assert.equal(pp,'camera=(), microphone=(self "https://thechat.future24.eu"), autoplay=(self "https://thechat.future24.eu"), geolocation=()');
  const html=await live.text();
  assert.match(html,/src="https:\/\/thechat\.future24\.eu\/dashboard\/room\.html"/);
  assert.match(html,/allow="microphone https:\/\/thechat\.future24\.eu; autoplay https:\/\/thechat\.future24\.eu"/);
  assert.doesNotMatch(html,/<script>(?!<)/,'no inline script');
  for(const p of ['/','/training/jobs/synthetic','/sophia-live.html/','/SOPHIA-LIVE.html','/sophia-live.mjs','/health']){
    const r=await fetch(base+p);
    assert.equal(r.headers.get('permissions-policy'),'camera=(), microphone=(), geolocation=()',p);
    assert.doesNotMatch(r.headers.get('content-security-policy')||'',/frame-src/,p);
  }
  // Second request after the exception must still be strict (no header leakage between requests).
  assert.equal((await fetch(base+'/')).headers.get('permissions-policy'),'camera=(), microphone=(), geolocation=()');
  assert.equal((await fetch(base+'/sophia-live.html',{method:'POST'})).status,405);
  assert.match(fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),/href="\/sophia-live\.html"/);
});
