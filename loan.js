/**
 * 返済シミュレーション計算ロジック
 *
 * - 金額はすべて「円」の整数で扱う（10億円でも Number の安全整数範囲内）
 * - 毎月の利息 = 残高 × 年利 ÷ 12（1円未満切り捨て）
 * - 元利均等返済：金利が変わった月に「残高・残り回数・新金利」で毎月返済額を再計算
 * - 元金均等返済：毎月の元金は一定、利息だけが残高と金利に応じて変わる
 * - 端数は最終回で精算する
 */
(function (root) {
  'use strict';

  var METHOD_EQUAL_PAYMENT = 'equal-payment';     // 元利均等
  var METHOD_EQUAL_PRINCIPAL = 'equal-principal'; // 元金均等

  var MAX_PRINCIPAL = 10000000000; // 100億円
  var MAX_MONTHS = 600;            // 50年
  var MAX_RATE = 30;               // 年30%

  function monthlyInterest(balance, annualRatePercent) {
    return Math.floor(balance * annualRatePercent / 100 / 12);
  }

  // 元利均等の毎月返済額（1円未満切り捨て、差額は最終回で精算）
  function annuityPayment(balance, annualRatePercent, remainingMonths) {
    if (remainingMonths <= 0) return balance;
    var r = annualRatePercent / 100 / 12;
    if (r === 0) return Math.floor(balance / remainingMonths);
    var pow = Math.pow(1 + r, remainingMonths);
    return Math.floor(balance * r * pow / (pow - 1));
  }

  // 金利変更を「開始回 → 年利」のマップに正規化（1回目は基本金利）
  function buildRateSchedule(baseRate, rateChanges, months) {
    var changes = (rateChanges || [])
      .filter(function (c) { return c && c.month >= 2 && c.month <= months; })
      .slice()
      .sort(function (a, b) { return a.month - b.month; });
    var map = {};
    map[1] = baseRate;
    changes.forEach(function (c) { map[c.month] = c.rate; });
    return map;
  }

  function validate(input) {
    var errors = [];
    var p = input.principal;
    var n = input.months;
    if (!Number.isInteger(p) || p <= 0) errors.push('借入額は1円以上の整数で入力してください。');
    else if (p > MAX_PRINCIPAL) errors.push('借入額は100億円以下で入力してください。');
    if (!Number.isInteger(n) || n <= 0) errors.push('返済期間は1ヶ月以上で入力してください。');
    else if (n > MAX_MONTHS) errors.push('返済期間は50年（600ヶ月）以下で入力してください。');
    if (!isFinite(input.baseRate) || input.baseRate < 0 || input.baseRate > MAX_RATE) {
      errors.push('当初金利は0〜' + MAX_RATE + '%の範囲で入力してください。');
    }
    if (input.method !== METHOD_EQUAL_PAYMENT && input.method !== METHOD_EQUAL_PRINCIPAL) {
      errors.push('返済方法を選択してください。');
    }
    var seen = {};
    (input.rateChanges || []).forEach(function (c, i) {
      var label = '金利変更' + (i + 1) + '：';
      if (!Number.isInteger(c.month) || c.month < 2 || (Number.isInteger(n) && c.month > n)) {
        errors.push(label + '変更する回は2回目〜' + (Number.isInteger(n) ? n : '最終') + '回目で指定してください。');
      } else if (seen[c.month]) {
        errors.push(label + c.month + '回目の金利変更が重複しています。');
      }
      seen[c.month] = true;
      if (!isFinite(c.rate) || c.rate < 0 || c.rate > MAX_RATE) {
        errors.push(label + '金利は0〜' + MAX_RATE + '%の範囲で入力してください。');
      }
    });
    return errors;
  }

  /**
   * @param {{principal:number, months:number, baseRate:number, method:string,
   *          rateChanges?:{month:number, rate:number}[]}} input
   * @returns {{rows:Array, totals:{payment:number, principal:number, interest:number}}}
   */
  function simulate(input) {
    var errors = validate(input);
    if (errors.length) {
      var err = new Error(errors.join('\n'));
      err.messages = errors;
      throw err;
    }

    var n = input.months;
    var schedule = buildRateSchedule(input.baseRate, input.rateChanges, n);
    var balance = input.principal;
    var rate = input.baseRate;
    var payment = 0;
    var fixedPrincipal = Math.floor(input.principal / n);
    var rows = [];
    var totals = { payment: 0, principal: 0, interest: 0 };

    for (var i = 1; i <= n; i++) {
      var rateChanged = Object.prototype.hasOwnProperty.call(schedule, i);
      if (rateChanged) rate = schedule[i];
      if (input.method === METHOD_EQUAL_PAYMENT && rateChanged) {
        payment = annuityPayment(balance, rate, n - i + 1);
      }

      var interest = monthlyInterest(balance, rate);
      var principalPart;
      if (i === n) {
        principalPart = balance;
      } else if (input.method === METHOD_EQUAL_PAYMENT) {
        principalPart = Math.min(Math.max(payment - interest, 0), balance);
      } else {
        principalPart = Math.min(fixedPrincipal, balance);
      }

      balance -= principalPart;
      var total = principalPart + interest;
      rows.push({
        no: i,
        rate: rate,
        rateChanged: rateChanged && i > 1,
        payment: total,
        principal: principalPart,
        interest: interest,
        balance: balance
      });
      totals.payment += total;
      totals.principal += principalPart;
      totals.interest += interest;
    }

    return { rows: rows, totals: totals };
  }

  // 年ごと（12回ごと）の集計
  function summarizeByYear(rows) {
    var years = [];
    rows.forEach(function (r) {
      var y = Math.floor((r.no - 1) / 12);
      if (!years[y]) years[y] = { year: y + 1, payment: 0, principal: 0, interest: 0, balance: 0, fromNo: r.no, toNo: r.no };
      var s = years[y];
      s.payment += r.payment;
      s.principal += r.principal;
      s.interest += r.interest;
      s.balance = r.balance;
      s.toNo = r.no;
    });
    return years;
  }

  var api = {
    METHOD_EQUAL_PAYMENT: METHOD_EQUAL_PAYMENT,
    METHOD_EQUAL_PRINCIPAL: METHOD_EQUAL_PRINCIPAL,
    MAX_PRINCIPAL: MAX_PRINCIPAL,
    MAX_MONTHS: MAX_MONTHS,
    MAX_RATE: MAX_RATE,
    annuityPayment: annuityPayment,
    validate: validate,
    simulate: simulate,
    summarizeByYear: summarizeByYear
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Loan = api;
})(typeof self !== 'undefined' ? self : this);
