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
  function paymentDate(no, short) {
    var v = startMonthInput.value;
    if (!v) return '';
    var parts = v.split('-');
    var idx = parseInt(parts[0], 10) * 12 + (parseInt(parts[1], 10) - 1) + (no - 1);
    var y = Math.floor(idx / 12);
    var m = idx % 12 + 1;
    return short ? y + '/' + m : y + '年' + m + '月';
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
      saveState();
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

    var h3 = document.createElement('h3');
    h3.textContent = '金利期間ごとの内訳';
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    var table = document.createElement('table');
    wrap.appendChild(table);
    container.appendChild(h3);
    container.appendChild(wrap);

    // スマホでは「期間＋金利」「元金・利息」をまとめて4列にする
    renderTable(table, {
      cols: [
        { label: '期間', sub: '金利' },
        { label: '金利', only: 'wide' },
        { label: '初回返済額' },
        { label: '支払額' },
        { label: 'うち元金', only: 'wide' },
        { label: 'うち利息', only: 'wide' },
        { label: '元金', sub: '利息', only: 'narrow' }
      ],
      body: periods.map(function (p) {
        return {
          cells: [
            { main: p.from + '〜' + p.to + '回目', sub: [pct(p.rate)] },
            pct(p.rate),
            p.firstPayment,
            p.payment,
            p.principal,
            p.interest,
            breakdown(p.principal, p.interest)
          ]
        };
      })
    });
  }

  function currentView() {
    return form.ownerDocument.querySelector('input[name="view"]:checked').value;
  }

  // 元金・利息を1セルに2段で表示（スマホ用。見出しも「元金／利息」の2段）
  function breakdown(principal, interest) {
    return { lines: [yenFmt.format(principal), yenFmt.format(interest)] };
  }

  /**
   * 表の定義
   * cols: { label, sub?, only?: 'wide' | 'narrow' }
   *   only: 'wide'   … PC幅のみ表示（CSVにも出力）
   *   only: 'narrow' … スマホ幅のみ表示（CSVには出力しない）
   *   sub            … スマホ幅で見出しの下に小さく出す補足
   * cells: 数値 | 文字列 | { main, sub: [...] }（sub はスマホ幅のみ） | { lines: [...] }
   */
  function tableData() {
    if (!lastResult) return null;
    var rows = lastResult.result.rows;
    var t = lastResult.result.totals;
    var hasDate = !!startMonthInput.value;
    if (currentView() === 'yearly') {
      return {
        cols: [
          { label: '年目', sub: '返済回' },
          { label: '返済回', only: 'wide' },
          { label: '支払額' },
          { label: '元金', only: 'wide' },
          { label: '利息', only: 'wide' },
          { label: '元金', sub: '利息', only: 'narrow' },
          { label: '年末残高' }
        ],
        body: Loan.summarizeByYear(rows).map(function (y) {
          var range = y.fromNo + '〜' + y.toNo + '回';
          return {
            cells: [
              { main: y.year + '年目', sub: [range] },
              range, y.payment, y.principal, y.interest,
              breakdown(y.principal, y.interest),
              y.balance
            ]
          };
        }),
        foot: ['合計', '', t.payment, t.principal, t.interest, breakdown(t.principal, t.interest), '']
      };
    }
    var cols = [{ label: '回', sub: hasDate ? '年月・金利' : '金利' }]
      .concat(hasDate ? [{ label: '年月', only: 'wide' }] : [])
      .concat([
        { label: '金利', only: 'wide' },
        { label: '返済額' },
        { label: '元金', only: 'wide' },
        { label: '利息', only: 'wide' },
        { label: '元金', sub: '利息', only: 'narrow' },
        { label: '残高' }
      ]);
    return {
      cols: cols,
      body: rows.map(function (r) {
        var date = hasDate ? paymentDate(r.no) : '';
        return {
          mark: r.rateChanged,
          cells: [{ main: r.no, sub: (hasDate ? [paymentDate(r.no, true)] : []).concat([pct(r.rate)]) }]
            .concat(hasDate ? [date] : [])
            .concat([pct(r.rate), r.payment, r.principal, r.interest, breakdown(r.principal, r.interest), r.balance])
        };
      }),
      foot: ['合計'].concat(hasDate ? [''] : [], ['', t.payment, t.principal, t.interest, breakdown(t.principal, t.interest), ''])
    };
  }

  function cellText(v) { return typeof v === 'number' ? yenFmt.format(v) : String(v); }

  // CSV 用のプレーンな値
  function cellPlain(v) {
    if (v && typeof v === 'object') return v.lines ? v.lines.join(' ') : cellText(v.main);
    return cellText(v);
  }

  function onlyClass(col) {
    return col.only === 'wide' ? 'wide-only' : col.only === 'narrow' ? 'narrow-only' : '';
  }

  function fillCell(el, v, col) {
    var cls = onlyClass(col);
    if (cls) el.className = cls;
    if (v && typeof v === 'object') {
      if (v.lines) {
        v.lines.forEach(function (line) {
          var s = document.createElement('span');
          s.className = 'line';
          s.textContent = line;
          el.appendChild(s);
        });
        return;
      }
      el.appendChild(document.createTextNode(cellText(v.main)));
      (v.sub || []).forEach(function (line) {
        var s = document.createElement('span');
        s.className = 'sub narrow-only';
        s.textContent = line;
        el.appendChild(s);
      });
      return;
    }
    el.textContent = cellText(v);
  }

  function renderTable(table, data) {
    table.innerHTML = '';
    var thead = table.createTHead();
    var htr = thead.insertRow();
    data.cols.forEach(function (col) {
      var th = document.createElement('th');
      th.scope = 'col';
      fillCell(th, col.sub ? { main: col.label, sub: [col.sub] } : col.label, col);
      htr.appendChild(th);
    });

    var tbody = table.createTBody();
    var frag = document.createDocumentFragment();
    data.body.forEach(function (row) {
      var tr = document.createElement('tr');
      if (row.mark) {
        tr.className = 'rate-changed';
        tr.title = 'この回から金利変更';
      }
      row.cells.forEach(function (c, i) {
        var td = document.createElement('td');
        fillCell(td, c, data.cols[i]);
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);

    if (data.foot) {
      var ftr = table.createTFoot().insertRow();
      data.foot.forEach(function (c, i) {
        var td = document.createElement('td');
        fillCell(td, c, data.cols[i]);
        ftr.appendChild(td);
      });
    }
  }

  function renderSchedule() {
    var data = tableData();
    if (!data) return;
    renderTable($('schedule'), data);
  }

  function downloadCsv() {
    var data = tableData();
    if (!data) return;
    var esc = function (v) {
      var s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    // スマホ専用列は除き、PC表示と同じ列で出力
    var keep = data.cols.map(function (c) { return c.only !== 'narrow'; });
    var toLine = function (cells) {
      return cells.filter(function (_, i) { return keep[i]; }).map(function (c) { return esc(cellPlain(c)); }).join(',');
    };
    var lines = [toLine(data.cols.map(function (c) { return c.label; }))];
    data.body.forEach(function (r) { lines.push(toLine(r.cells)); });
    lines.push(toLine(data.foot));
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

  // ---- 入力内容の保存・復元（この端末のブラウザ内に保存） ----
  var STORAGE_KEY = 'loan-repayment-simulator:v1';

  function saveState() {
    var state = {
      principal: principalInput.value,
      years: yearsInput.value,
      extraMonths: extraMonthsInput.value,
      baseRate: baseRateInput.value,
      method: form.method.value,
      startMonth: startMonthInput.value,
      rateChanges: Array.prototype.map.call(rateChangeList.querySelectorAll('.rate-change'), function (li) {
        return { month: li.querySelector('.rc-month').value, rate: li.querySelector('.rc-rate').value };
      }),
      view: currentView(),
      calculated: !!lastResult && !$('result').hidden
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できない環境では何もしない */ }
  }

  function loadState() {
    var state = null;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { state = null; }
    if (!state || typeof state !== 'object') return null;
    if (typeof state.principal === 'string') principalInput.value = state.principal;
    if (typeof state.years === 'string') yearsInput.value = state.years;
    if (typeof state.extraMonths === 'string') extraMonthsInput.value = state.extraMonths;
    if (typeof state.baseRate === 'string') baseRateInput.value = state.baseRate;
    if (typeof state.startMonth === 'string') startMonthInput.value = state.startMonth;
    form.querySelectorAll('input[name="method"]').forEach(function (r) { r.checked = r.value === state.method; });
    if (!form.method.value) form.method.value = 'equal-payment';
    document.querySelectorAll('input[name="view"]').forEach(function (r) { r.checked = r.value === state.view; });
    if (!document.querySelector('input[name="view"]:checked')) document.querySelector('input[name="view"][value="monthly"]').checked = true;
    (Array.isArray(state.rateChanges) ? state.rateChanges : []).forEach(function (c) {
      if (c && typeof c === 'object') addRateChange(String(c.month || ''), String(c.rate || ''));
    });
    return state;
  }

  function resetState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 何もしない */ }
    location.reload();
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
      saveState();
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
    saveState();
  });
  document.querySelectorAll('input[name="view"]').forEach(function (r) {
    r.addEventListener('change', function () {
      renderSchedule();
      saveState();
    });
  });
  // 入力のたびに保存（金利変更の行も含む）
  form.addEventListener('input', saveState);
  form.addEventListener('change', saveState);
  $('reset-inputs').addEventListener('click', function () {
    if (confirm('入力内容を初期状態に戻します。よろしいですか？')) resetState();
  });
  $('download-csv').addEventListener('click', downloadCsv);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = calculate();
    saveState();
    if (ok) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  var saved = loadState();
  updatePrincipalHint();
  updateTermHint();
  updateMethodHint();
  // 前回計算していた場合は、開いた時点で結果も表示する
  if (saved && saved.calculated) calculate();
})();
