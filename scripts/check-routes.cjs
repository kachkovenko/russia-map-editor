const assert = require('node:assert/strict');
const { edges } = require('../lib/map-routes.js');
const ids = ['moscow', 'perm', 'berezniki', 'solikamsk'];
assert.deepEqual(edges(ids, 'off'), []);
assert.deepEqual(edges(ids, 'hub', 'perm'), [['perm','moscow'],['perm','berezniki'],['perm','solikamsk']]);
assert.deepEqual(edges(ids, 'chain'), [['moscow','perm'],['perm','berezniki'],['berezniki','solikamsk']]);
assert.deepEqual(edges(ids, 'network', '', 42), edges(ids, 'network', '', 42));
for (let seed=1;seed<50;seed++) {
  const net=edges(ids,'network','',seed), connected=new Set([ids[0]]);
  for(let pass=0;pass<ids.length;pass++) for(const [a,b] of net) if(connected.has(a)||connected.has(b)){connected.add(a);connected.add(b);}
  assert.equal(connected.size,ids.length);
  assert(net.every(([a,b])=>a!==b));
  assert.equal(new Set(net.map(e=>e.slice().sort().join('|'))).size,net.length);
}
assert(edges(Array.from({length:1000},(_,i)=>String(i)),'network').length<300);
global.window={}; require('../data/cities.js');
for(const name of ['Березники','Соликамск']) assert(window.RU_CITIES.some(c=>c.name===name&&c.region==='perm'));
console.log('Verified route modes, deterministic connected network, limits, Berezniki and Solikamsk.');
