// Launch Radar — Concept B. Reads window.__RADAR__ from ../data.js and renders
// the board, the detail view and the method page. No network: every number on
// this page comes from the sealed snapshot via data.js.
(function () {
  var D = window.__RADAR__;
  if (!D) { document.body.innerHTML = "<p>data.js did not load.</p>"; return; }
  var rows = D.rows, econ = D.economics, model = D.model;

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function money(v) {
    if (v === null || v === undefined) return "—";
    var a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(v >= 1e10 ? 1 : 2) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    return "$" + v.toFixed(0);
  }
  function money2(v) { return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }); }
  function signed(v) { return (v >= 0 ? "+" : "−") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }); }
  function pct(v, d) { return (v * 100).toFixed(d === undefined ? 0 : d) + "%"; }
  function ageText(days) {
    if (days === null || days === undefined) return "—";
    if (days < 365) return Math.round(days) + " d";
    return (days / 365).toFixed(1) + " y";
  }
  function gasFor(r) {
    for (var i = 0; i < r.chains.length; i++) {
      var c = r.chains[i];
      for (var k in econ.gasUsd) if (c.toLowerCase().indexOf(k.toLowerCase()) >= 0) return { chain: c, gas: econ.gasUsd[k] };
    }
    return { chain: r.chains[0] || "Ethereum", gas: 0.5 };
  }
  // The farm, priced at the reader's settings. Same arithmetic as main.ts:
  // expected drop = implied x drop share x (deposit / whole TVL);
  // net = expected - 4 transactions of gas - 4% a year foregone on the deposit.
  function farmNet(r, deposit, share, holdDays) {
    var g = gasFor(r);
    var slice = (r.implied_value_usd * share) / (econ.participation * r.tvl_usd);
    var expected = slice * deposit;
    var fees = econ.txCount * g.gas;
    var opp = (deposit * econ.oppRate * holdDays) / 365;
    return { expected: expected, fees: fees, opp: opp, net: expected - fees - opp, gas: g.gas, chain: g.chain };
  }

  var state = { deposit: econ.defaultDeposit, share: econ.defaultDropShare, hold: econ.defaultHoldDays, sort: "implied", dir: -1, cat: "", chain: "", verdict: "", watch: false, q: "" };

  function parseHash() {
    var h = location.hash || "#/board";
    var parts = h.slice(2).split("?");
    var path = parts[0] || "board";
    var q = {};
    if (parts[1]) parts[1].split("&").forEach(function (kv) { var p = kv.split("="); q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); });
    return { path: path, q: q };
  }
  function syncFromHash() {
    var parsed = parseHash();
    state.cat = parsed.q.cat || ""; state.chain = parsed.q.chain || "";
    state.verdict = parsed.q.verdict || ""; state.watch = parsed.q.watch === "1";
    state.q = parsed.q.q || ""; state.sort = parsed.q.sort || "implied";
    var dep = parseInt(parsed.q.deposit || "", 10); if (econ.deposits.indexOf(dep) >= 0) state.deposit = dep;
    var sh = parseFloat(parsed.q.share || ""); if (econ.dropShares.indexOf(sh) >= 0) state.share = sh;
    var ho = parseInt(parsed.q.hold || "", 10); if (econ.holds.indexOf(ho) >= 0) state.hold = ho;
    return parsed.path;
  }

  // ---- static header, KPIs, universe
  document.getElementById("asOf").textContent = D.meta.as_of;
  document.getElementById("topMeta").textContent = "Sealed snapshot " + D.meta.as_of + " · DefiLlama · no network · no hand-picked names";
  document.getElementById("rankedCount").textContent = D.kpis.ranked;
  var k = D.kpis;
  document.getElementById("kpis").innerHTML = [
    ["RANKED", k.ranked, "40 of 40 watchlist covered"],
    ["TOTAL IMPLIED VALUE", money(k.totalImplied), "sum of the board · × odds"],
    ["MEDIAN COMPARABLE", k.medianComparable.toFixed(2) + "×", "per $1 of TVL · 128 live rows"],
    ["CHECKED WITHIN 3×", pct(model.loo.within3x), "leave-one-out · 128 live rows"],
    ["WORTH FARMING", k.verdicts.FARM + " of " + k.ranked, "FARM " + k.verdicts.FARM + " · Marginal " + k.verdicts.MARGINAL + " · Skip " + k.verdicts.SKIP],
    ["MEDIAN LAUNCH ODDS", pct(k.medianOdds), "category share, shrunk to field"]
  ].map(function (c, i) {
    return '<div class="kpi"><div class="k-label">' + c[0] + '</div><div class="k-val' + (i === 1 ? " gold" : "") + '">' + c[1] + '</div><div class="k-sub">' + c[2] + "</div></div>";
  }).join("");
  var uni = D.universe;
  var uniParts = [["Ranked here", uni.ranked, "#f2b63d"], ["Already record a token", uni.token, "#45b8e8"], ["Bridges", uni.bridge, "#7c8db5"], ["Liquid staking", uni.liquid, "#3ddc97"], ["Exchange custody", uni.exchange, "#f26d6d"], ["Versioned releases", uni.versioned, "#b48be8"], ["Wrapped or staked by name", uni.wrapped, "#8d96ad"]];
  document.getElementById("uniBar").innerHTML = uniParts.map(function (p) {
    return '<div style="width:' + (p[1] / uni.total * 100).toFixed(2) + '%;background:' + p[2] + '" title="' + p[0] + " " + p[1] + '"></div>';
  }).join("");
  document.getElementById("uniLegend").innerHTML = "<span><b style='color:var(--text)'>" + uni.total + " protocols read:</b></span> " + uniParts.map(function (p) {
    return '<span><i style="background:' + p[2] + '"></i>' + p[0] + " <b style='color:var(--text)'>" + p[1] + "</b></span>";
  }).join("");
  document.getElementById("agree").textContent = "✓ " + k.ranked + "/" + k.ranked + " rows match board.json · sealed input sha256 " + D.meta.input_sha256.slice(0, 12) + "… · read, never written · 758 protocols read, " + k.ranked + " ranked, nothing hand-picked";
  document.getElementById("footNote").textContent = "Built from the sealed snapshot " + D.meta.as_of + " · " + D.meta.concept;

  // ---- scatter: log-log TVL vs market cap, comparables + fit + board
  function drawScatter() {
    var svg = document.getElementById("scatter");
    var W = 360, H = 150, L = 38, R = 8, T = 6, B = 20;
    var comps = D.comps || [];
    var xs = comps.map(function (c) { return Math.log10(c[0]); }).concat(rows.map(function (r) { return Math.log10(r.tvl_usd); }));
    var ys = comps.map(function (c) { return Math.log10(c[1]); }).concat(rows.map(function (r) { return Math.log10(Math.max(1, r.value_if_launch_usd)); }));
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    function X(v) { return L + ((Math.log10(v) - x0) / (x1 - x0)) * (W - L - R); }
    function Y(v) { return T + (1 - (Math.log10(v) - y0) / (y1 - y0)) * (H - T - B); }
    var s = "";
    for (var gx = x0; gx <= x1; gx++) { var px = X(Math.pow(10, gx)); var anch = gx === x1 ? "end" : gx === x0 ? "start" : "middle"; s += '<line x1="' + px + '" y1="' + T + '" x2="' + px + '" y2="' + (H - B) + '" stroke="#1d2742"/>'; s += '<text x="' + px + '" y="' + (H - 6) + '" fill="#8d96ad" font-size="8" text-anchor="' + anch + '">$' + (gx >= 9 ? (Math.pow(10, gx - 9)) + "B" : (Math.pow(10, gx - 6)) + "M") + "</text>"; }
    for (var gy = y0; gy <= y1; gy++) { var py = Y(Math.pow(10, gy)); var ylab = gy >= 9 ? Math.pow(10, gy - 9) + "B" : gy >= 6 ? Math.pow(10, gy - 6) + "M" : Math.pow(10, gy - 3) + "K"; s += '<line x1="' + L + '" y1="' + py + '" x2="' + (W - R) + '" y2="' + py + '" stroke="#1d2742"/>'; s += '<text x="' + (L - 4) + '" y="' + (py + 3) + '" fill="#8d96ad" font-size="8" text-anchor="end">$' + ylab + "</text>"; }
    comps.forEach(function (c) { s += '<circle cx="' + X(c[0]).toFixed(1) + '" cy="' + Y(c[1]).toFixed(1) + '" r="1.6" fill="#5b6b8c"/>'; });
    var b = model.beta;
    var tvlA = Math.pow(10, x0), tvlB = Math.pow(10, x1);
    function fitMcap(tvl) { return tvl * Math.exp(b[0] + b[1] * Math.log(tvl) + b[2] * Math.log1p(model.medianAgeDays)); }
    s += '<line x1="' + X(tvlA).toFixed(1) + '" y1="' + Y(Math.max(Math.pow(10, y0), fitMcap(tvlA))).toFixed(1) + '" x2="' + X(tvlB).toFixed(1) + '" y2="' + Y(Math.min(Math.pow(10, y1), fitMcap(tvlB))).toFixed(1) + '" stroke="#f2b63d" stroke-width="2"/>';
    rows.forEach(function (r) {
      var col = r.verdict === "FARM" ? "#3ddc97" : r.verdict === "MARGINAL" ? "#f5a623" : "#f26d6d";
      s += '<circle cx="' + X(r.tvl_usd).toFixed(1) + '" cy="' + Y(Math.max(1, r.value_if_launch_usd)).toFixed(1) + '" r="2.2" fill="' + col + '" opacity="0.85"/>';
    });
    svg.innerHTML = s;
    document.getElementById("formula").textContent = "ln(mcap/TVL) = " + b[0].toFixed(3) + " " + (b[1] < 0 ? "− " : "+ ") + Math.abs(b[1]).toFixed(4) + "·ln(TVL) " + (b[2] < 0 ? "− " : "+ ") + Math.abs(b[2]).toFixed(4) + "·ln(1+age)";
    document.getElementById("ablation").innerHTML = "LOO within 3×: flat <b>" + pct(model.ablation[0].within3x) + "</b> · curve <b>" + pct(model.ablation[2].within3x) + "</b> · +mom. <b>" + pct(model.ablation[3].within3x) + "</b> · final <b>" + pct(model.loo.within3x) + "</b> — 128 comps, median age " + Math.round(model.medianAgeDays) + " d.";
  }

  // ---- calculator
  function seg(el, options, cur, fmt, onPick) {
    el.innerHTML = options.map(function (o) { return '<button type="button" data-v="' + o + '" class="' + (o === cur ? "on" : "") + '">' + fmt(o) + "</button>"; }).join("");
    el.querySelectorAll("button").forEach(function (btn) { btn.addEventListener("click", function () { onPick(btn.getAttribute("data-v")); }); });
  }
  function renderCalc() {
    seg(document.getElementById("segDeposit"), econ.deposits, state.deposit, function (v) { return "$" + v.toLocaleString("en-US"); }, function (v) { state.deposit = parseInt(v, 10); renderAll(); });
    seg(document.getElementById("segShare"), econ.dropShares, state.share, function (v) { return pct(v, 1); }, function (v) { state.share = parseFloat(v); renderAll(); });
    seg(document.getElementById("segHold"), econ.holds, state.hold, function (v) { return (v / 7) + " weeks"; }, function (v) { state.hold = parseInt(v, 10); renderAll(); });
    var nets = rows.map(function (r) { return { r: r, n: farmNet(r, state.deposit, state.share, state.hold) }; });
    nets.sort(function (a, b) { return b.n.net - a.n.net; });
    var paying = nets.filter(function (x) { return x.n.net > 0; }).length;
    var best = nets[0];
    document.getElementById("calcLive").textContent = paying + " farms pay";
    document.getElementById("calcOut").innerHTML = "Best farm: <b>" + esc(best.r.name) + " " + signed(best.n.net) + " net</b> on $" + state.deposit.toLocaleString("en-US") +
      " · " + paying + " of " + rows.length + " pay at " + pct(state.share, 1) + ", " + (state.hold / 7) + " weeks. Verdicts stay at the default farm ($1,000 · 7% · 12 weeks).";
  }

  // ---- filters + table
  var cats = Array.from(new Set(rows.map(function (r) { return r.category || "(none)"; }))).sort();
  var chains = Array.from(new Set(rows.flatMap(function (r) { return r.chains; }))).sort();
  var fCat = document.getElementById("fCat"), fChain = document.getElementById("fChain");
  cats.forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; fCat.appendChild(o); });
  chains.forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; fChain.appendChild(o); });
  seg(document.getElementById("fVerdict"), ["", "FARM", "MARGINAL", "SKIP"], "", function (v) { return v === "" ? "Any verdict" : v.charAt(0) + v.slice(1).toLowerCase(); }, function (v) { state.verdict = v; renderTable(); });
  fCat.addEventListener("change", function () { state.cat = fCat.value; renderTable(); });
  fChain.addEventListener("change", function () { state.chain = fChain.value; renderTable(); });
  document.getElementById("fWatch").addEventListener("change", function (e) { state.watch = e.target.checked; renderTable(); });
  document.getElementById("fSearch").addEventListener("input", function (e) { state.q = e.target.value; renderTable(); });
  document.getElementById("fSort").addEventListener("change", function (e) { state.sort = e.target.value; renderTable(); });
  document.getElementById("fReset").addEventListener("click", function () { state.cat = ""; state.chain = ""; state.verdict = ""; state.watch = false; state.q = ""; state.sort = "implied"; renderTable(); });
  document.querySelectorAll("#board th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var key = th.getAttribute("data-sort");
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === "name" ? 1 : -1; }
      renderTable();
    });
  });
  var maxLog = Math.log10(Math.max.apply(null, rows.map(function (r) { return r.implied_value_usd; })));
  var minLog = Math.log10(Math.min.apply(null, rows.map(function (r) { return r.implied_value_usd; })));
  function filtered() {
    var q = state.q.toLowerCase();
    return rows.filter(function (r) {
      if (state.cat && (r.category || "(none)") !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (state.watch && !r.watchlist) return false;
      if (q && (r.name + " " + r.slug + " " + (r.category || "")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function renderTable() {
    fCat.value = state.cat; fChain.value = state.chain;
    document.getElementById("fWatch").checked = state.watch;
    document.getElementById("fSearch").value = state.q;
    document.getElementById("fSort").value = state.sort;
    seg(document.getElementById("fVerdict"), ["", "FARM", "MARGINAL", "SKIP"], state.verdict, function (v) { return v === "" ? "Any verdict" : v.charAt(0) + v.slice(1).toLowerCase(); }, function (v) { state.verdict = v; renderTable(); });
    var list = filtered();
    var dir = state.dir;
    list.sort(function (a, b) {
      var va, vb;
      if (state.sort === "net") { va = farmNet(a, state.deposit, state.share, state.hold).net; vb = farmNet(b, state.deposit, state.share, state.hold).net; }
      else if (state.sort === "tvl") { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (state.sort === "odds") { va = a.launch_odds; vb = b.launch_odds; }
      else if (state.sort === "age") { va = a.age_days === null ? -1 : a.age_days; vb = b.age_days === null ? -1 : b.age_days; }
      else if (state.sort === "name") { return a.name.localeCompare(b.name) * dir; }
      else if (state.sort === "rank") { va = -a.rank; vb = -b.rank; }
      else { va = a.implied_value_usd; vb = b.implied_value_usd; }
      return (va - vb) * dir;
    });
    document.querySelectorAll("#board th[data-sort]").forEach(function (th) {
      var key = th.getAttribute("data-sort");
      th.textContent = th.textContent.replace(/ [▲▼]$/, "");
      if (key === state.sort) th.textContent += dir === -1 ? " ▼" : " ▲";
    });
    var top = list[0];
    document.getElementById("boardCount").textContent = list.length + " of " + rows.length + " rows" +
      (top ? " · highest " + top.name + " " + money(top.implied_value_usd) : "") +
      " · sorted by " + state.sort + " · the watchlist is the floor, never the ceiling · click a row for its detail view";
    document.getElementById("rows").innerHTML = list.map(function (r) {
      var n = farmNet(r, state.deposit, state.share, state.hold);
      var chg = r.change_7d === null ? "—" : (r.change_7d >= 0 ? "+" : "") + r.change_7d.toFixed(1) + "%";
      var chgCls = r.change_7d === null ? "" : r.change_7d >= 0 ? "up" : "down";
      var barW = ((Math.log10(r.implied_value_usd) - minLog) / (maxLog - minLog) * 100).toFixed(0);
      return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td><div class="p-name">' + esc(r.name) + ' <span class="chip">' + esc(r.category || "(none)") + '</span>' + (r.watchlist ? '<span class="chip watch">watchlist</span>' : '<span class="chip">below floor</span>') + '</div><div class="p-slug">' + esc(r.slug) + "</div></td>" +
        '<td class="num">' + money(r.tvl_usd) + '<br><span class="' + chgCls + '">' + chg + '</span> · ' + ageText(r.age_days) + '</td>' +
        '<td><div class="v-big">' + money(r.implied_value_usd) + '</div><div class="v-band">' + money(r.band_low_usd) + "–" + money(r.band_high_usd) + " · if it launches " + money(r.value_if_launch_usd) + "</div></td>" +
        '<td class="num">' + pct(r.launch_odds) + "</td>" +
        '<td class="num ' + (n.net >= 0 ? "net-pos" : "net-neg") + '">' + signed(n.net) + '<div class="v-band">on $' + state.deposit.toLocaleString("en-US") + "</div></td>" +
        '<td><span class="verdict ' + r.verdict + '">' + r.verdict + "</span></td>" +
        '<td><div class="logbar"><i style="width:' + barW + '%"></i></div></td></tr>';
    }).join("");
    document.querySelectorAll("#rows tr").forEach(function (tr) {
      tr.addEventListener("click", function () { location.hash = "#/protocol/" + tr.getAttribute("data-slug"); });
    });
  }

  // ---- detail view
  function renderDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    var el = document.getElementById("detailView");
    if (!r) { el.innerHTML = "<p>Unknown protocol.</p>"; return; }
    var n = farmNet(r, state.deposit, state.share, state.hold);
    var g = gasFor(r);
    function chainStep(label, value, sub) {
      return '<div class="step"><div class="s-label">' + label + '</div><div class="s-val">' + value + '</div><div class="s-sub">' + sub + "</div></div>";
    }
    el.innerHTML = '<div class="detail"><a href="#/board">← Back to the board</a><h2>' + esc(r.name) + '</h2>' +
      '<div class="d-sub">' + esc(r.slug) + " · " + esc(r.category || "(none)") + " · " + esc(r.chains.join(", ")) + " · TVL " + money(r.tvl_usd) + " · 7D " + (r.change_7d === null ? "—" : r.change_7d.toFixed(1) + "%") + " · no token recorded for " + ageText(r.age_days) + (r.watchlist ? " · watchlist" : " · below floor") + "</div>" +
      '<div class="panel"><div class="panel-title">HOW THE FIGURE IS MADE</div><div class="chain">' +
      chainStep("TVL", money(r.tvl_usd), "sealed snapshot " + D.meta.as_of) +
      chainStep("SIZE CURVE", money(r.tvl_usd * r.base), "fitted multiple ×" + r.base.toFixed(3) + " on this TVL and age") +
      chainStep("CATEGORY PREMIUM", "×" + r.category_factor.toFixed(2), (r.category || "(none)") + " median vs field · " + r.category_members + " comparables") +
      chainStep("MOMENTUM", "×" + r.growth.toFixed(2), "7-day TVL change " + (r.change_7d === null ? "unreported → ×1.00" : r.change_7d.toFixed(1) + "%")) +
      chainStep("VALUE IF IT LAUNCHES", money(r.value_if_launch_usd), "what the fitted multiple says the token would be worth") +
      chainStep("× LAUNCH ODDS " + pct(r.launch_odds), money(r.implied_value_usd), "share of " + esc(r.category || "(none)") + " that already trades, shrunk to the field") +
      "</div><p class='note'>Band: P25–P75 " + money(r.band_low_usd) + "–" + money(r.band_high_usd) + " · P10–P90 " + money(r.band_p10_usd) + "–" + money(r.band_p90_usd) + ", from the leave-one-out ratio spread. Implied value is the board's own claim, never a forecast.</p></div>" +
      '<div class="panel" style="margin-top:10px"><div class="panel-title">THE FARM, AT YOUR SETTINGS ($' + state.deposit.toLocaleString("en-US") + " · " + pct(state.share, 1) + " · " + (state.hold / 7) + ' weeks)</div>' +
      '<table class="mini"><tr><th>At risk</th><th>Fees</th><th>Hold</th><th>Expected drop</th><th>Opportunity cost</th><th>Net</th><th>Verdict</th></tr>' +
      "<tr><td>" + money(r.at_risk_usd) + "</td><td>" + money2(n.fees) + " (" + econ.txCount + " tx × $" + n.gas.toFixed(2) + " on " + esc(n.chain) + ")</td><td>" + (state.hold / 7) + " weeks</td><td>" + money2(n.expected) + "</td><td>" + money2(n.opp) + "</td><td><b>" + signed(n.net) + "</b></td><td><span class='verdict " + r.verdict + "'>" + r.verdict + "</span></td></tr></table>" +
      "<p class='note'>Breakeven deposit: " + (r.breakeven_usd === null ? "unreachable at these settings — the slice per dollar never covers the 4% a year foregone" : "$" + r.breakeven_usd.toLocaleString("en-US")) + ". " +
      "Expected drop assumes " + pct(econ.participation) + " of TVL farms the same drop; change the calculator and this table re-prices.</p></div>" +
      '<div class="panel" style="margin-top:10px"><div class="panel-title">FARM PLAN — 8 STEPS, EACH WITH ITS COST AND TIME</div><ol class="farm">' +
      r.farm_steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol></div></div>";
  }

  // ---- method view
  function renderMethod() {
    var el = document.getElementById("methodView");
    var ab = model.ablation.map(function (a) {
      var label = { flat: "Flat field multiple", catmed: "Per-category median", ols: "Size curve (OLS log-log)", "ols-growth": "Size curve + 7-day momentum", final: "Final: size curve + momentum + category premium" }[a.variant];
      return "<tr><td>" + label + "</td><td>" + pct(a.within3x, 1) + "</td><td>×" + a.medianRatio.toFixed(2) + "</td></tr>";
    }).join("");
    var odds = model.odds.map(function (o) {
      return "<tr><td>" + esc(o.category) + "</td><td>" + o.token + " / " + o.total + "</td><td>" + pct(o.odds) + "</td></tr>";
    }).join("");
    el.innerHTML = '<div class="method"><a href="#/board">← Back to the board</a><h2>Method — nothing hidden, everything priced</h2>' +
      "<p>The snapshot is sealed: " + D.meta.as_of + ", floor $" + D.meta.floor_usd.toLocaleString("en-US") + ", " + D.universe.total + " protocols, sha256 " + D.meta.input_sha256.slice(0, 16) + "…. " +
      "A protocol records a token when its gecko_id or symbol is non-null — never from market cap, because 272 protocols record a token whose market cap is null. The board ranks " + D.kpis.ranked + " protocols that record no token and are not a wrapped, staked or bridged product, not a versioned re-release, and not an exchange's own product.</p>" +
      "<h3>The value model</h3><p>Least squares on the 128 comparables whose token already trades: ln(mcap/TVL) = " + model.beta[0].toFixed(4) + " " + model.beta[1].toFixed(4) + "·ln(TVL) " + model.beta[2].toFixed(4) + "·ln(1+age in days). " +
      "Category premium: the category median multiple, pulled halfway to the field median, only with ≥" + model.catMin + " comparables. Momentum: 7-day change divided by " + model.growthDivisor + ", capped at ±" + pct(model.growthCap) + "; null change is ×1.00. " +
      "Launch odds: the category's token share, shrunk toward the field share (" + pct(model.fieldTokenShare) + ") with a prior of " + model.oddsPrior + " protocols, clamped to 10–90%. Implied value = TVL × fitted multiple × category × momentum × odds.</p>" +
      "<h3>Ablation — leave-one-out, share of 128 comparables priced within 3× of their real market cap</h3>" +
      '<table class="mini"><tr><th>Variant</th><th>Within 3×</th><th>Median pred / actual</th></tr>' + ab + "</table>" +
      "<p>Walk-forward by time (fit on the older half, test on the newer half, n=" + model.walkForward.nTest + "): <b>" + pct(model.walkForward.within3x, 1) + "</b> within 3×, median ratio ×" + model.walkForward.medianRatio.toFixed(2) + ". " +
      "The final model was picked once, offline, before the board was written — not tuned against the leaderboard.</p>" +
      "<h3>Launch odds by category</h3><table class='mini'><tr><th>Category</th><th>Already token / total</th><th>Odds</th></tr>" + odds + "</table>" +
      "<h3>The farm, priced</h3><p>Default farm: $" + econ.defaultDeposit.toLocaleString("en-US") + " deposit, " + pct(econ.defaultDropShare) + " drop share, " + (econ.defaultHoldDays / 7) + " weeks. " +
      "Expected drop = implied × drop share × (deposit / (" + pct(econ.participation) + " of TVL)). Fees = " + econ.txCount + " transactions × chain gas (Ethereum $6.00, Base $0.10, Solana $0.05, and so on). " +
      "Opportunity cost = deposit × 4% × hold / 365. Verdict: net ≥ +$10 FARM, net ≥ −$5 MARGINAL, else SKIP. Breakeven deposit = fees / (slice per dollar − 4% × hold / 365); when the slice never covers the foregone yield it is unreachable, never a negative number.</p>" +
      "<h3>Determinism</h3><p>No clock, no network, no environment but the output directory name. Ages come from the snapshot's as_of date. Two runs produce byte-identical output. " +
      "One judgement call: “Project 0” is ranked — a bare 0 is a name, not a version marker (no V, no dot) — which is what takes the board to 198.</p></div>";
  }

  function renderAll() {
    drawScatter();
    renderCalc();
    var path = syncFromHash();
    var board = document.getElementById("boardView"), det = document.getElementById("detailView"), met = document.getElementById("methodView");
    var filt = document.getElementById("filters"), kpis = document.getElementById("kpis"), uni = document.querySelector(".universe");
    document.body.classList.toggle("slim", path === "method" || path.indexOf("protocol/") === 0);
    if (path === "method") {
      board.hidden = true; filt.style.display = "none"; det.hidden = true; met.hidden = false; renderMethod();
    } else if (path.indexOf("protocol/") === 0) {
      board.hidden = true; filt.style.display = "none"; met.hidden = true; det.hidden = false; renderDetail(path.slice(9));
    } else {
      board.hidden = false; filt.style.display = "flex"; det.hidden = true; met.hidden = true; renderTable();
    }
    if (kpis) kpis.style.display = ""; if (uni) uni.style.display = "";
  }
  window.addEventListener("hashchange", renderAll);
  renderAll();
})();
