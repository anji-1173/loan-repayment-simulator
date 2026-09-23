(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var form = $('loan-form');
  var principalInput = $('principal');
  var yearsInput = $('years');
  var extraMonthsInput = $('extra-months');
  var baseRateInput = $('base-rate');
  var startMonthInput = $('start-month');
  var rateChangeList = $('rate-changes');
  var rateChangeTemplate = $('rate-change-template');

  var lastResult = null;

  // ---- 表示用フォーマット ----
  var yenFmt = new Intl.NumberFormat('ja-JP');
  function yen(n) { return yenFmt.format(n) + '円'; }

  // 1,234,567,890 → 「12億3,456万7,890円」
  function yenKanji(n) {
    if (!n) return '0円';
    var oku = Math.floor(n / 100000000);
    var man = Math.floor((n % 100000000) / 10000);
    var rest = n % 10000;
    var s = '';
    if (oku) s += yenFmt.format(oku) + '億';
    if (man) s += yenFmt.format(man) + '万';
    if (rest) s += yenFmt.format(rest);
    return s + '円';
  }

  function pct(rate) { return (Math.round(rate * 1000) / 1000) + '%'; }

  function parseYen(str) {
    var digits = String(str).replace(/[,，\s円]/g, '').replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    if (!/^\d+$/.test(digits)) return NaN;
    return parseInt(digits, 10);
  }

  function parseNum(str) {
    if (String(str).trim() === '') return NaN;
    return Number(str);
  }

  function totalMonths() {
    var y = parseInt(yearsInput.value, 10) || 0;
    var m = parseInt(extraMonthsInput.value, 10) || 0;
    return y * 12 + m;
  }

  // n回目の返済年月（開始年月が入力されている場合）
  function paymentDate(no) {
    var v = startMonthInput.value;
    if (!v) return '';
    var parts = v.split('-');
    var idx = parseInt(parts[0], 10) * 12 + (parseInt(parts[1], 10) - 1) + (no - 1);
    return Math.floor(idx / 12) + '年' + (idx % 12 + 1) + '月';
  }

  function whenLabel(no) {
    if (!no || no < 1) return '';
    var y = Math.floor((no - 1) / 12);
    var m = (no - 1) % 12;
    var s = (y ? y + '年' : '') + (m ? m + 'ヶ月' : '') + '経過後';
    if (no === 1) s = '初回';
    var d = paymentDate(no);
    return s + (d ? '（' + d + '）' : '');
  }

  // ---- 入力補助 ----
  function updatePrincipalHint() {
    var v = parseYen(principalInput.value);
    $('principal-hint').textContent = isNaN(v) ? '' : '＝ ' + yenKanji(v);
  }

  function updateTermHint() {
    var n = totalMonths();
    $('term-hint').textContent = n ? '返済回数：' + n + '回' : '';
    rateChangeList.querySelectorAll('.rc-month').forEach(function (el) { el.max = n || ''; });
    updateRateChangeHints();
  }

  function updateMethodHint() {
    var method = form.method.value;
    $('method-hint').textContent = method === 'equal-payment'
      ? '毎月の返済額（元金＋利息）が一定。当初の返済額を抑えやすい方法です。'
      : '毎月の元金が一定。初めの返済額は大きいですが、総支払額は少なくなります。';
  }

  function updateRateChangeHints() {
    rateChangeList.querySelectorAll('.rate-change').forEach(function (li) {
      var no = parseInt(li.querySelector('.rc-month').value, 10);
      li.querySelector('.rc-when').textContent = whenLabel(no);
    });
  }

  function addRateChange(month, rate) {
    var node = rateChangeTemplate.content.firstElementChild.cloneNode(true);
    var monthEl = node.querySelector('.rc-month');
    var rateEl = node.querySelector('.rc-rate');
    monthEl.value = month;
    rateEl.value = rate;
    monthEl.max = totalMonths() || '';
    monthEl.addEventListener('input', updateRateChangeHints);
    node.querySelector('.rc-remove').addEventListener('click', function () {
      node.remove();
    });
    rateChangeList.appendChild(node);
    updateRateChangeHints();
    return node;
  }

  function readRateChanges() {
    return Array.prototype.map.call(rateChangeList.querySelectorAll('.rate-change'), function (li) {
      return {
        month: parseNum(li.querySelector('.rc-month').value),
        rate: parseNum(li.querySelector('.rc-rate').value)
      };
    });
  }

  function showErrors(messages) {
    var box = $('errors');
    if (!messages.length) { box.hidden = true; box.innerHTML = ''; return; }
    var ul = document.createElement('ul');
    messages.forEach(function (m) {
      var li = document.createElement('li');
      li.textContent = m;
      ul.appendChild(li);
    });
    box.innerHTML = '';
    box.appendChild(ul);
    box.hidden = false;
  }

  // ---- 計算・描画 ----
  function calculate() {
    var input = {
      principal: parseYen(principalInput.value),
      months: totalMonths(),
      baseRate: parseNum(baseRateInput.value),
      method: form.method.value,
      rateChanges: readRateChanges()
    };
    var errors = Loan.validate(input);
    showErrors(errors);
    if (errors.length) {
      $('result').hidden = true;
      return false;
    }
    var result = Loan.simulate(input);
    lastResult = { input: input, result: result };
    renderSummary(input, result);
    renderSchedule();
    $('result').hidden = false;
    return true;
  }

  function renderSummary(input, result) {
    var rows = result.rows;
    var first = rows[0];
    var t = result.totals;

    $('first-payment-label').textContent = input.method === 'equal-payment'
      ? '毎月の返済額（初回）'
      : '毎月の返済額（初回・以降は減少）';
    $('first-payment').textContent = yen(first.payment);
    $('first-payment-breakdown').textContent = '元金 ' + yen(first.principal) + '／利息 ' + yen(first.interest);

    $('total-payment').textContent = yen(t.payment);
    $('total-breakdown').textContent = '元金 ' + yen(t.principal) + '／利息 ' + yen(t.interest);

    var pShare = t.payment ? t.principal / t.payment * 100 : 100;
    $('ratio-principal').style.width = pShare + '%';
    $('ratio-interest').style.width = (100 - pShare) + '%';
    $('ratio-principal-text').textContent = pShare.toFixed(1) + '%';
    $('ratio-interest-text').textContent = (100 - pShare).toFixed(1) + '%';

    renderPeriods(rows);
  }

  // 金利ごとの期間サマリー（金利変更がある場合のみ）
  function renderPeriods(rows) {
    var container = $('periods');
    container.innerHTML = '';
    var periods = [];
    rows.forEach(function (r) {
      var cur = periods[periods.length - 1];
      if (!cur || r.no === 1 || r.rateChanged) {
        cur = { from: r.no, to: r.no, rate: r.rate, firstPayment: r.payment, payment: 0, principal: 0, interest: 0 };
        periods.push(cur);
      }
      cur.to = r.no;
      cur.payment += r.payment;
      cur.principal += r.principal;
      cur.interest += r.interest;
    });
    if (periods.length < 2) return;

    var html = '<h3>金利期間ごとの内訳</h3><div class="table-wrap"><table><thead><tr>' +
      '<th>期間</th><th>金利</th><th>期間初回の返済額</th><th>支払額</th><th>うち元金</th><th>うち利息</th>' +
      '</tr></thead><tbody>';
    periods.forEach(function (p) {
      html += '<tr><td>' + p.from + '〜' + p.to + '回目</td><td>' + pct(p.rate) + '</td><td>' +
        yen(p.firstPayment) + '</td><td>' + yen(p.payment) + '</td><td>' + yen(p.principal) + '</td><td>' +
        yen(p.interest) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  function currentView() {
    return form.ownerDocument.querySelector('input[name="view"]:checked').value;
  }

  function tableData() {
    if (!lastResult) return null;
    var rows = lastResult.result.rows;
    var t = lastResult.result.totals;
    var hasDate = !!startMonthInput.value;
    if (currentView() === 'yearly') {
      return {
        head: ['年目', '返済回', '支払額', '元金', '利息', '年末残高'],
        body: Loan.summarizeByYear(rows).map(function (y) {
          return { cells: [y.year + '年目', y.fromNo + '〜' + y.toNo + '回', y.payment, y.principal, y.interest, y.balance] };
        }),
        foot: ['合計', '', t.payment, t.principal, t.interest, '']
      };
    }
    var head = ['回'].concat(hasDate ? ['年月'] : [], ['金利', '返済額', '元金', '利息', '残高']);
    return {
      head: head,
      body: rows.map(function (r) {
        return {
          mark: r.rateChanged,
          cells: [r.no].concat(hasDate ? [paymentDate(r.no)] : [], [pct(r.rate), r.payment, r.principal, r.interest, r.balance])
        };
      }),
      foot: ['合計'].concat(hasDate ? [''] : [], ['', t.payment, t.principal, t.interest, ''])
    };
  }

  function cellText(v) { return typeof v === 'number' ? yenFmt.format(v) : v; }

  function renderSchedule() {
    var data = tableData();
    if (!data) return;
    var table = $('schedule');
    table.querySelector('thead').innerHTML = '<tr>' + data.head.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') + '</tr>';
    var frag = document.createDocumentFragment();
    data.body.forEach(function (row) {
      var tr = document.createElement('tr');
      if (row.mark) {
        tr.className = 'rate-changed';
        tr.title = 'この回から金利変更';
      }
      row.cells.forEach(function (c) {
        var td = document.createElement('td');
        td.textContent = cellText(c);
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    var tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    tbody.appendChild(frag);
    var tfoot = table.querySelector('tfoot') || table.appendChild(document.createElement('tfoot'));
    tfoot.innerHTML = '<tr>' + data.foot.map(function (c) { return '<td>' + cellText(c) + '</td>'; }).join('') + '</tr>';
  }

  function downloadCsv() {
    var data = tableData();
    if (!data) return;
    var esc = function (v) {
      var s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var lines = [data.head.map(esc).join(',')];
    data.body.forEach(function (r) { lines.push(r.cells.map(esc).join(',')); });
    lines.push(data.foot.map(esc).join(','));
    // Excel で文字化けしないよう BOM 付き UTF-8
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '返済予定表_' + (currentView() === 'yearly' ? '年別' : '月別') + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ---- イベント ----
  principalInput.addEventListener('input', updatePrincipalHint);
  principalInput.addEventListener('blur', function () {
    var v = parseYen(principalInput.value);
    if (!isNaN(v)) principalInput.value = yenFmt.format(v);
    updatePrincipalHint();
  });
  document.querySelectorAll('.presets button').forEach(function (b) {
    b.addEventListener('click', function () {
      principalInput.value = yenFmt.format(Number(b.dataset.amount));
      updatePrincipalHint();
    });
  });
  yearsInput.addEventListener('input', updateTermHint);
  extraMonthsInput.addEventListener('input', updateTermHint);
  startMonthInput.addEventListener('input', function () {
    updateRateChangeHints();
    if (lastResult) renderSchedule();
  });
  form.querySelectorAll('input[name="method"]').forEach(function (r) {
    r.addEventListener('change', updateMethodHint);
  });
  $('add-rate-change').addEventListener('click', function () {
    var existing = readRateChanges().filter(function (c) { return !isNaN(c.month); });
    var last = existing.length ? Math.max.apply(null, existing.map(function (c) { return c.month; })) : 1;
    var lastRate = existing.length ? existing[existing.length - 1].rate : parseNum(baseRateInput.value) || 0;
    var next = last + 60; // 既定は5年後
    var n = totalMonths();
    if (n && next > n) next = Math.max(2, n);
    var node = addRateChange(next, Math.round((lastRate + 0.5) * 1000) / 1000);
    node.querySelector('.rc-rate').focus();
  });
  document.querySelectorAll('input[name="view"]').forEach(function (r) {
    r.addEventListener('change', renderSchedule);
  });
  $('download-csv').addEventListener('click', downloadCsv);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (calculate()) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  updatePrincipalHint();
  updateTermHint();
  updateMethodHint();
})();
