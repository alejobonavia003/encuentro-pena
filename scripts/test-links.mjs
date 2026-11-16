import assert from 'node:assert/strict';
import {saleUrl,safeReturnPath} from '../lib/links.ts';
for(const origin of ['http://localhost:3000','https://preview.example.test','https://ticket.encuentromultiespacio.com']){
 const url=saleUrl(origin,'stable-id');assert.equal(new URL(url).origin,origin);assert.equal(new URL(url).searchParams.get('b'),'stable-id');assert.equal(url,saleUrl(origin,'stable-id'));assert.equal(new URL(url).searchParams.has('invite'),false);
}
for(const path of ['https://evil.test','//evil.test','/\\evil.test','/auth/callback','/login','/\n/evil.test',null])assert.equal(safeReturnPath(path),'/');
assert.equal(safeReturnPath('/?invite=test-only-private-token'),'/?invite=test-only-private-token');
console.log('Stable sales links and safe OAuth return paths passed');
