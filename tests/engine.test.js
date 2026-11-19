import test from 'node:test';
import assert from 'node:assert/strict';
import {ipv4ToInt,intToIPv4,parseCIDR,allocateVLSM,findRoute} from '../engine.js';

test('IPv4 conversion round trips boundary values',()=>{
  for(const ip of ['0.0.0.0','10.0.0.1','192.168.1.254','255.255.255.255']) assert.equal(intToIPv4(ipv4ToInt(ip)),ip);
});
test('invalid IPv4 octets are rejected',()=>assert.throws(()=>ipv4ToInt('192.168.1.256')));
test('CIDR returns normalized network and usable host range',()=>{
  const n=parseCIDR('192.168.1.130/24');
  assert.equal(intToIPv4(n.network),'192.168.1.0');
  assert.equal(intToIPv4(n.broadcast),'192.168.1.255');
  assert.equal(intToIPv4(n.first),'192.168.1.1');
  assert.equal(intToIPv4(n.last),'192.168.1.254');
  assert.equal(n.usable,254);
});
test('CIDR /31 and /32 edge cases are handled',()=>{
  assert.equal(parseCIDR('10.0.0.0/31').usable,2);
  assert.equal(parseCIDR('10.0.0.1/32').usable,1);
});
test('invalid CIDR syntax is rejected',()=>assert.throws(()=>parseCIDR('10.0.0.1/33')));
test('VLSM allocates largest blocks first without overlap',()=>{
  const rows=allocateVLSM('192.168.10.0/24',[{name:'Small',hosts:10},{name:'Large',hosts:60},{name:'Medium',hosts:25}]);
  assert.equal(rows.find(x=>x.name==='Large').prefix,26);assert.equal(rows.find(x=>x.name==='Medium').prefix,27);assert.equal(rows.find(x=>x.name==='Small').prefix,28);
  const sorted=[...rows].sort((a,b)=>a.network-b.network);
  for(let i=1;i<sorted.length;i++)assert.ok(sorted[i-1].broadcast<sorted[i].network);
});
test('VLSM rejects invalid host requirements',()=>assert.throws(()=>allocateVLSM('10.0.0.0/24',[{name:'Bad',hosts:NaN}])));
test('VLSM detects exhausted address space',()=>assert.throws(()=>allocateVLSM('192.168.1.0/29',[{name:'Too many',hosts:20}])));
test('topology path ignores failed links',()=>{
  const devices=[{id:'a'},{id:'b'},{id:'c'}],links=[{a:'a',b:'b',down:false},{a:'b',b:'c',down:true}];
  const result=findRoute('a','c',devices,links);assert.equal(result.ok,false);
});
test('topology path finds an operational route',()=>{
  const devices=[{id:'a',ip:'10.0.0.1'},{id:'b',ip:'10.0.0.2'},{id:'c',ip:'10.0.0.3'}],links=[{a:'a',b:'b',down:false},{a:'b',b:'c',down:false}];
  const result=findRoute('a','c',devices,links);assert.equal(result.ok,true);assert.deepEqual(result.path,['a','b','c']);
});
