import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,webUrl,positiveId,safeEqual} from '../src/security.js';
import {createRepository} from '../src/repository.js';

test('password hashing uses salt and rejects wrong passwords', () => {
  const a=hashPassword('a-long-demo-password-123');
  const b=hashPassword('a-long-demo-password-123');
  assert.notEqual(a,b);
  assert.equal(verifyPassword('a-long-demo-password-123',a),true);
  assert.equal(verifyPassword('wrong',a),false);
  assert.equal(verifyPassword('x','malformed'),false);
});
test('rejects executable URL schemes and malformed identifiers', () => {
  assert.throws(()=>webUrl('javascript:alert(1)'));
  assert.throws(()=>webUrl('https://user:password@example.com'));
  assert.equal(webUrl('https://example.com'),'https://example.com/');
  assert.throws(()=>positiveId('1 OR 1=1'));
  assert.equal(positiveId('12'),12);
  assert.equal(safeEqual('token','token'),true);
  assert.equal(safeEqual(['token'],'token'),false);
});
test('repository treats injection-like input as a bound parameter', async () => {
  const calls=[];
  const pool={execute:async(sql,args)=>{calls.push({sql,args});return [[]];}};
  const repository=createRepository(pool);
  const payload="admin' OR '1'='1";
  await repository.findUser(payload);
  assert.equal(calls[0].sql,'SELECT id, username, password_hash FROM users WHERE username = ?');
  assert.deepEqual(calls[0].args,[payload]);
});
