// 実行: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const Loan = require('../loan.js');

function checkConsistency(result, principal) {
  const { rows, totals } = result;
  assert.equal(totals.principal, principal, '元金合計 = 借入額');
  assert.equal(totals.payment, totals.principal + totals.interest, '総支払額 = 元金 + 利息');
  assert.equal(rows[rows.length - 1].balance, 0, '最終残高 0');
  rows.forEach((r) => {
    assert.equal(r.payment, r.principal + r.interest);
    assert.ok(r.principal >= 0 && r.interest >= 0 && r.balance >= 0);
  });
}

test('元利均等：3,000万円 / 35年 / 0.5%', () => {
  const r = Loan.simulate({ principal: 30000000, months: 420, baseRate: 0.5, method: 'equal-payment' });
  checkConsistency(r, 30000000);
  // 一般的なシミュレーターの値（77,875円）と一致
  assert.equal(r.rows[0].payment, 77875);
  assert.equal(r.rows[0].interest, 12500);
  const payments = new Set(r.rows.slice(0, -1).map((x) => x.payment));
  assert.equal(payments.size, 1, '最終回以外は毎月同額');
});

test('元金均等：3,000万円 / 35年 / 1%', () => {
  const r = Loan.simulate({ principal: 30000000, months: 420, baseRate: 1, method: 'equal-principal' });
  checkConsistency(r, 30000000);
  assert.equal(r.rows[0].principal, 71428);
  assert.equal(r.rows[0].interest, 25000);
  assert.ok(r.rows[1].payment < r.rows[0].payment, '返済額は減っていく');
});

test('元金均等は元利均等より総利息が少ない', () => {
  const base = { principal: 50000000, months: 360, baseRate: 1.5 };
  const a = Loan.simulate({ ...base, method: 'equal-payment' });
  const b = Loan.simulate({ ...base, method: 'equal-principal' });
  assert.ok(b.totals.interest < a.totals.interest);
});

test('10億円でも整数で計算できる', () => {
  for (const method of ['equal-payment', 'equal-principal']) {
    const r = Loan.simulate({ principal: 1000000000, months: 600, baseRate: 2.5, method });
    checkConsistency(r, 1000000000);
    r.rows.forEach((x) => assert.ok(Number.isSafeInteger(x.payment)));
  }
});

test('金利0%', () => {
  const r = Loan.simulate({ principal: 1000000, months: 12, baseRate: 0, method: 'equal-payment' });
  checkConsistency(r, 1000000);
  assert.equal(r.totals.interest, 0);
});

test('変動金利：61回目から金利上昇で返済額が再計算される', () => {
  const r = Loan.simulate({
    principal: 30000000, months: 420, baseRate: 0.5, method: 'equal-payment',
    rateChanges: [{ month: 61, rate: 1.5 }, { month: 121, rate: 2.0 }]
  });
  checkConsistency(r, 30000000);
  assert.equal(r.rows[59].rate, 0.5);
  assert.equal(r.rows[60].rate, 1.5);
  assert.equal(r.rows[60].rateChanged, true);
  assert.ok(r.rows[60].payment > r.rows[59].payment);
  assert.equal(r.rows[120].rate, 2.0);
  // 再計算後の返済額は残高・残り回数から求めた値
  assert.equal(r.rows[60].payment, Loan.annuityPayment(r.rows[59].balance, 1.5, 360));
});

test('変動金利：元金均等は元金一定のまま利息だけ変わる', () => {
  const r = Loan.simulate({
    principal: 12000000, months: 120, baseRate: 1, method: 'equal-principal',
    rateChanges: [{ month: 13, rate: 3 }]
  });
  checkConsistency(r, 12000000);
  assert.equal(r.rows[11].principal, r.rows[12].principal);
  assert.ok(r.rows[12].interest > r.rows[11].interest);
});

test('入力チェック', () => {
  assert.ok(Loan.validate({ principal: 0, months: 12, baseRate: 1, method: 'equal-payment' }).length);
  assert.ok(Loan.validate({ principal: 1e11, months: 12, baseRate: 1, method: 'equal-payment' }).length);
  assert.ok(Loan.validate({ principal: 1e6, months: 601, baseRate: 1, method: 'equal-payment' }).length);
  assert.ok(Loan.validate({ principal: 1e6, months: 12, baseRate: 1, method: 'equal-payment', rateChanges: [{ month: 13, rate: 1 }] }).length);
  assert.ok(Loan.validate({ principal: 1e6, months: 12, baseRate: 1, method: 'equal-payment', rateChanges: [{ month: 5, rate: 1 }, { month: 5, rate: 2 }] }).length);
  assert.equal(Loan.validate({ principal: 1e9, months: 420, baseRate: 1, method: 'equal-principal' }).length, 0);
  assert.throws(() => Loan.simulate({ principal: -1, months: 12, baseRate: 1, method: 'equal-payment' }));
});
