const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8').split('\ndocument.querySelectorAll("[data-mode]")')[0];
const context = vm.createContext({URLSearchParams, location:{search:''}});
vm.runInContext(code, context);
const evaluate = (expression) => vm.runInContext(expression, context);

test('missing values are not zero, recorded zero remains zero', () => {
  assert.equal(evaluate('sum([{v:null},{v:undefined}],"v")'), null);
  assert.equal(evaluate('sum([{v:null},{v:0}],"v")'), 0);
  assert.equal(evaluate('sum([{v:3},{v:2.5},{v:null}],"v")'), 5.5);
});
test('rates and productivity use only paired eligible records', () => {
  const result = evaluate('performance([{actual:10,target:20,fte:2},{actual:6,target:4,fte:0.5},{actual:100,target:0,fte:null},{actual:null,target:999,fte:10}])');
  assert.equal(result.rate, 16/24);
  assert.equal(result.perPerson, 16/2.5);
  assert.equal(result.targeted, 2);
});
test('incomplete stock cannot produce a misleading warehouse total', () => {
  assert.equal(evaluate('stockTotal({skuRows:[{closing:5},{closing:null}]})'), null);
  assert.equal(evaluate('stockTotal({skuRows:[{closing:5},{closing:0}]})'), 5);
});
test('date ranges reject invalid dates and clamp excessive bounds', () => {
  assert.equal(evaluate('validDay("2026-02-30")'), false);
  assert.equal(evaluate('boundedDay("invalid","2026-05-28","2026-09-14")'), '2026-09-14');
  assert.equal(evaluate('boundedDay("1900-01-01","2026-05-28","2026-09-14")'), '2026-05-28');
  assert.equal(evaluate('shiftDay("2026-09-14",-6)'), '2026-09-08');
});
test('line filter does not change warehouse records', () => {
  evaluate('state.line="A"');
  assert.equal(evaluate('rowsFor({date:"2026-09-14",processes:[{line:"A",actual:7},{line:"B",actual:3}]}).length'), 1);
  assert.equal(evaluate('roleTotal([{name:"维修",actual:7},{name:"检测维修",actual:3},{name:"打包",actual:6}],/维修/)'), 10);
});
