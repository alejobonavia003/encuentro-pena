import assert from 'node:assert/strict';
import areaCodes from '../lib/argentine-area-codes.mjs';
import {readFileSync} from 'node:fs';
import {normalizeArgentineMobile, whatsappUrl, PHONE_ERROR} from '../lib/phone.ts';
const cases=JSON.parse(readFileSync(new URL('./phone-cases.json',import.meta.url)));
for(const [raw,expected] of cases.valid){assert.equal(normalizeArgentineMobile(raw),expected);assert.equal(normalizeArgentineMobile(expected),expected);assert.equal(whatsappUrl(raw,'Hola Peña'),`https://wa.me/${expected}?text=Hola%20Pe%C3%B1a`)}
for(const raw of cases.invalid){assert.throws(()=>normalizeArgentineMobile(raw),{message:PHONE_ERROR});assert.equal(whatsappUrl(raw),null)}
console.log(`${cases.valid.length+cases.invalid.length} phone cases passed, including idempotency and wa.me`);

for(const area of areaCodes){const national=area+'4'.repeat(10-area.length);assert.equal(normalizeArgentineMobile(national),'549'+national);assert.equal(normalizeArgentineMobile('0'+area+'15'+'4'.repeat(10-area.length)),'549'+national)}
console.log(`${areaCodes.length} official area codes passed in national and legacy mobile formats`);
