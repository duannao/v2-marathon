(function () {
  "use strict";

  const STORAGE_KEY = "v2-marathon-session-v1";
  const TARGET = 50;
  const BLOCK_SIZE = 10;
  const STYLES = ["Slab", "Vertical", "Overhang", "Dynamic", "Balance", "Crimpy", "Power", "Coordination", "Other"];
  const RESULTS = { flash: "FLASH", send: "SEND", failed: "FAILED", skipped: "SKIPPED" };

  const app = document.getElementById("app");
  const modalRoot = document.getElementById("modal-root");
  const toast = document.getElementById("toast");
  const networkStatus = document.getElementById("network-status");
  let state = loadState();
  let restInterval = null;

  function createSession() {
    return {
      version: 1,
      id: makeId(),
      name: "V2 Marathon",
      target: TARGET,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      status: "active",
      routes: [],
      blockChecks: [],
      restSessions: []
    };
  }

  function makeId() {
    return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.routes) && Array.isArray(saved.blockChecks)) {
        saved.restSessions = saved.restSessions || [];
        return saved;
      }
    } catch (error) {
      console.warn("Could not restore session", error);
    }
    return createSession();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function percent(numerator, denominator) {
    return denominator ? Math.round((numerator / denominator) * 100) : 0;
  }

  function average(values) {
    const valid = values.filter(value => Number.isFinite(Number(value))).map(Number);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  }

  function formatAverage(value) {
    return value == null ? "—" : value.toFixed(1);
  }

  function getStats(routes = state.routes) {
    const attempted = routes.filter(route => route.result !== "skipped").length;
    const flash = routes.filter(route => route.result === "flash").length;
    const send = routes.filter(route => route.result === "send").length;
    const failed = routes.filter(route => route.result === "failed").length;
    const skipped = routes.filter(route => route.result === "skipped").length;
    const sent = flash + send;
    return {
      logged: routes.length,
      attempted, flash, send, failed, skipped, sent,
      flashRate: percent(flash, attempted),
      sendRate: percent(sent, attempted),
      totalAttempts: routes.reduce((sum, route) => sum + (Number(route.attempts) || 0), 0),
      quality: average(routes.map(route => route.quality)),
      rpe: average(routes.map(route => route.rpe))
    };
  }

  function blockFor(routeNumber) {
    return Math.ceil(routeNumber / BLOCK_SIZE);
  }

  function currentBlock() {
    if (!state.routes.length) return 1;
    return Math.min(Math.floor(state.routes.length / BLOCK_SIZE) + 1, Math.ceil(state.target / BLOCK_SIZE));
  }

  function render() {
    if (state.status === "finished") renderSummary();
    else renderMain();
  }

  function renderMain() {
    const stats = getStats();
    const progress = Math.min(100, (stats.logged / state.target) * 100);
    app.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand-row"><h1 class="brand">V2 MARATHON</h1><span class="date-label">${formatDate(state.createdAt)}</span></div>
          <div class="hero-stat">
            <div class="hero-number">${stats.logged}<small> / ${state.target}</small></div>
            <div class="block-label">Block ${currentBlock()} / ${Math.ceil(state.target / BLOCK_SIZE)}</div>
          </div>
          <div class="progress" aria-label="训练进度 ${stats.logged} / ${state.target}"><i style="width:${progress}%"></i></div>
          <div class="stat-grid">
            ${statCell("已尝试", stats.attempted)}${statCell("完成", stats.sent)}${statCell("Flash", stats.flash)}${statCell("失败", stats.failed)}${statCell("跳过", stats.skipped)}
          </div>
          <div class="rates"><div class="rate">Flash Rate <strong>${stats.flashRate}%</strong></div><div class="rate">Send Rate <strong>${stats.sendRate}%</strong></div></div>
        </header>

        <div class="record-zone">
          <button class="primary-record" data-action="record" ${stats.logged >= state.target ? "disabled" : ""}>${stats.logged >= state.target ? "已记录 50 条" : "+ 记录下一条"}</button>
          ${stats.logged >= 10 ? `<div class="quick-actions"><button class="secondary-btn" data-action="rest">开始休息</button><button class="secondary-btn" data-action="finish">结束训练</button></div>` : `<div class="quick-actions"><button class="secondary-btn wide" data-action="finish">结束训练</button></div>`}
        </div>

        <section>
          <div class="section-head"><h2>线路历史</h2><span>${stats.logged} 条</span></div>
          ${renderHistory()}
        </section>

        <footer class="footer-actions">
          <button class="danger-btn" data-action="new-session">开始新训练 / 清空本次训练</button>
          <div class="footer-note">所有记录均自动保存在此设备</div>
        </footer>
      </div>`;
  }

  function statCell(label, value) {
    return `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;
  }

  function renderHistory() {
    if (!state.routes.length) return `<div class="empty">还没有记录。完成一条后，点上方大按钮即可。</div>`;
    return `<div class="history-list">${state.routes.slice().reverse().map(route => `
      <article class="history-item">
        <div class="route-num">#${String(route.routeNumber).padStart(2, "0")}</div>
        <div class="history-info" data-action="edit" data-id="${route.id}">
          <div class="history-main"><span class="badge ${route.result}">${RESULTS[route.result]}</span>${route.attempts > 1 ? `<strong>×${route.attempts}${route.attemptsCapped ? "+" : ""}</strong>` : ""}</div>
          <div class="history-meta">${route.styles.length ? route.styles.join(" · ") : "未选风格"}${route.quality ? ` · Quality ${route.quality}` : ""}${route.rpe ? ` · RPE ${route.rpe}` : ""}</div>
        </div>
        <button class="icon-delete" aria-label="删除线路 ${route.routeNumber}" data-action="delete" data-id="${route.id}">×</button>
      </article>`).join("")}</div>`;
  }

  function openQuickRecord() {
    const routeNumber = state.routes.length + 1;
    openModal(`
      <button class="close-x" data-close aria-label="关闭">×</button>
      <h2>#${String(routeNumber).padStart(2, "0")}</h2>
      <p class="modal-sub">结果如何？</p>
      <div class="result-grid">
        <button class="result-btn flash" data-result="flash">FLASH</button>
        <button class="result-btn send" data-result="send">SEND</button>
        <button class="result-btn failed" data-result="failed">FAILED</button>
        <button class="result-btn skipped" data-result="skipped">SKIPPED</button>
      </div>`);
  }

  function chooseAttempts(result) {
    const choices = result === "send" ? [[2, false, "2 tries"], [3, false, "3 tries"], [4, true, "4+ tries"]] : [[1, false, "1 try"], [2, false, "2 tries"], [3, true, "3+ tries"]];
    openModal(`
      <button class="close-x" data-close aria-label="关闭">×</button>
      <h2>${RESULTS[result]}</h2>
      <p class="modal-sub">用了几次尝试？</p>
      <div class="choice-grid">${choices.map(([count, capped, label]) => `<button class="choice-btn" data-attempt-result="${result}" data-attempts="${count}" data-capped="${capped}">${label}</button>`).join("")}</div>`);
  }

  function addRoute(result, attempts, attemptsCapped = false) {
    const route = {
      id: makeId(), routeNumber: state.routes.length + 1, result, attempts,
      attemptsCapped, styles: [], quality: null, rpe: null, note: "",
      timestamp: new Date().toISOString(), block: blockFor(state.routes.length + 1), updatedAt: null
    };
    state.routes.push(route);
    saveState();
    render();
    showToast(`#${String(route.routeNumber).padStart(2, "0")} ${RESULTS[result]} 已记录`);
    openDetails(route.id, true);
  }

  function openDetails(routeId, justAdded = false) {
    const route = state.routes.find(item => item.id === routeId);
    if (!route) return;
    openModal(`
      <button class="close-x" data-detail-close="${justAdded ? "new" : "edit"}" aria-label="关闭">×</button>
      <h2>#${String(route.routeNumber).padStart(2, "0")} <span class="badge ${route.result}">${RESULTS[route.result]}</span></h2>
      <p class="modal-sub">${justAdded ? "已保存。以下均可跳过。" : "编辑线路信息"}</p>
      <h3>结果</h3>
      <div class="chip-grid">${Object.entries(RESULTS).map(([key, label]) => `<button class="chip ${route.result === key ? "selected" : ""}" data-edit-result="${key}">${label}</button>`).join("")}</div>
      <div id="attempt-editor">${renderAttemptEditor(route)}</div>
      <h3>线路类型 · 可多选</h3>
      <div class="chip-grid">${STYLES.map(style => `<button class="chip ${route.styles.includes(style) ? "selected" : ""}" data-style="${style}">${style}</button>`).join("")}</div>
      ${renderScale("动作质量", "quality", route.quality, 1, 5, "非常乱 / 拼命", "流畅 / 省力")}
      ${renderScale("体感强度 RPE", "rpe", route.rpe, 1, 5, "非常轻松", "接近极限")}
      <h3>简短备注 · 可选</h3>
      <textarea class="note-input" id="route-note" maxlength="120" placeholder="例如：右脚没踩稳">${escapeHtml(route.note)}</textarea>
      <div class="modal-actions"><button class="ghost-btn" data-detail-close="${justAdded ? "new" : "edit"}">跳过</button><button class="save-btn" data-save-details="${route.id}" data-new="${justAdded}">保存</button></div>`);
  }

  function renderAttemptEditor(route) {
    if (route.result === "skipped") return "";
    const choices = route.result === "flash" ? [[1, false, "1 try"]] : route.result === "send" ? [[2, false, "2"], [3, false, "3"], [4, true, "4+"]] : [[1, false, "1"], [2, false, "2"], [3, true, "3+"]];
    return `<h3>Attempts</h3><div class="choice-grid">${choices.map(([count, capped, label]) => `<button class="choice-btn ${route.attempts === count && route.attemptsCapped === capped ? "selected" : ""}" data-edit-attempts="${count}" data-edit-capped="${capped}">${label}</button>`).join("")}</div>`;
  }

  function renderScale(title, field, selected, min, max, leftLabel, rightLabel) {
    const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);
    return `<h3>${title}</h3><div class="scale ${values.length === 6 ? "six" : ""}">${values.map(value => `<button class="${selected === value ? "selected" : ""}" data-scale="${field}" data-value="${value}">${value}</button>`).join("")}</div><div class="scale-labels"><span>${leftLabel}</span><span>${rightLabel}</span></div>`;
  }

  function saveDetails(routeId, modal) {
    const route = state.routes.find(item => item.id === routeId);
    if (!route) return;
    route.note = modal.querySelector("#route-note").value.trim();
    route.updatedAt = new Date().toISOString();
    saveState(); closeModal(); render(); showToast("线路信息已保存");
    maybeShowBlockCheck(route.routeNumber);
  }

  function maybeShowBlockCheck(routeNumber) {
    if (routeNumber % BLOCK_SIZE !== 0) return;
    const block = routeNumber / BLOCK_SIZE;
    if (!state.blockChecks.some(check => check.block === block)) openBlockCheck(block);
  }

  function openBlockCheck(block) {
    openModal(`
      <h2>Block ${block} 完成！</h2>
      <p class="modal-sub">花几秒钟检查一下当前状态。</p>
      ${renderScale("整体疲劳", "fatigue", null, 1, 5, "状态很好", "非常疲劳")}
      ${renderScale("前臂 Pump", "pump", null, 0, 5, "完全没有", "非常明显")}
      ${renderScale("手指 / 关节不适", "discomfort", null, 0, 5, "完全没有", "明显不适")}
      <div id="pain-warning"></div>
      <div class="modal-actions"><button class="ghost-btn" data-end-from-check>结束训练</button><button class="save-btn" data-save-check="${block}">继续下一 Block</button></div>`);
  }

  function saveBlockCheck(block, modal) {
    const getValue = field => Number(modal.querySelector(`[data-scale="${field}"].selected`)?.dataset.value);
    const fatigue = getValue("fatigue");
    const pump = getValue("pump");
    const discomfort = getValue("discomfort");
    if (![fatigue, pump, discomfort].every(Number.isFinite)) { showToast("请完成三个状态选择"); return; }
    state.blockChecks = state.blockChecks.filter(check => check.block !== block);
    state.blockChecks.push({ block, fatigue, pump, discomfort, timestamp: new Date().toISOString() });
    saveState(); closeModal(); render(); showToast(`Block ${block} 状态已保存`);
  }

  function openRestTimer() {
    const rest = { id: makeId(), blockAfter: Math.max(1, Math.floor(state.routes.length / BLOCK_SIZE)), startedAt: new Date().toISOString(), elapsedBeforePause: 0, pausedAt: null, finishedAt: null };
    state.restSessions.push(rest); saveState();
    openModal(`<button class="close-x" data-rest-finish aria-label="结束休息">×</button><h2>休息中</h2><p class="modal-sub">按自己的节奏恢复。</p><div class="timer" id="rest-timer">00:00</div><div class="timer-actions"><button class="secondary-btn" data-rest-pause>Pause</button><button class="save-btn" data-rest-finish>Finish Rest</button></div>`);
    updateRestTimer(rest);
    restInterval = setInterval(() => updateRestTimer(rest), 250);
  }

  function restElapsed(rest) {
    const end = rest.pausedAt ? new Date(rest.pausedAt).getTime() : Date.now();
    return rest.elapsedBeforePause + Math.max(0, end - new Date(rest.startedAt).getTime());
  }

  function updateRestTimer(rest) {
    const element = document.getElementById("rest-timer");
    if (element) element.textContent = formatDuration(restElapsed(rest));
  }

  function toggleRest() {
    const rest = state.restSessions[state.restSessions.length - 1];
    if (!rest || rest.finishedAt) return;
    if (rest.pausedAt) {
      rest.elapsedBeforePause = restElapsed(rest);
      rest.startedAt = new Date().toISOString();
      rest.pausedAt = null;
    } else {
      rest.pausedAt = new Date().toISOString();
    }
    saveState();
    const button = modalRoot.querySelector("[data-rest-pause]");
    if (button) button.textContent = rest.pausedAt ? "Resume" : "Pause";
  }

  function finishRest() {
    const rest = state.restSessions[state.restSessions.length - 1];
    if (rest && !rest.finishedAt) {
      rest.durationSeconds = Math.round(restElapsed(rest) / 1000);
      rest.finishedAt = new Date().toISOString();
      rest.pausedAt = null;
      saveState(); showToast(`休息 ${formatDuration(rest.durationSeconds * 1000)}`);
    }
    closeModal(); render();
  }

  function finishSession() {
    if (!state.routes.length) { showToast("先记录至少一条线路"); return; }
    if (!confirm("结束本次训练并查看总结？\n你之后仍可返回继续记录。")) return;
    state.status = "finished"; state.finishedAt = new Date().toISOString(); saveState(); closeModal(); render(); window.scrollTo(0, 0);
  }

  function renderSummary() {
    const stats = getStats();
    const comparison = performanceComparison();
    app.innerHTML = `<div class="app-shell">
      <header class="summary-header"><div class="summary-kicker">V2 MARATHON SUMMARY</div><h1>训练总结</h1><p>${formatDate(state.createdAt)} · ${formatSessionDuration()}</p></header>
      <div class="summary-grid">
        ${summaryCard("Attempted", stats.attempted)}${summaryCard("Sent", stats.sent)}${summaryCard("Flash", stats.flash)}${summaryCard("Failed", stats.failed)}
        ${summaryCard("Skipped", stats.skipped)}${summaryCard("Flash Rate", `${stats.flashRate}%`)}${summaryCard("Send Rate", `${stats.sendRate}%`)}${summaryCard("Total Attempts", stats.totalAttempts)}
        ${summaryCard("平均动作质量", formatAverage(stats.quality))}${summaryCard("平均 RPE", formatAverage(stats.rpe))}
      </div>
      <section><div class="section-head"><h2>Performance Drop</h2><span>${comparison.label}</span></div>
        <div class="drop-card"><div class="compare"><div class="compare-col"><span>Early</span><strong>Flash ${comparison.early.flashRate}%</strong><strong>Quality ${formatAverage(comparison.early.quality)}</strong></div><div class="arrow">→</div><div class="compare-col"><span>Late</span><strong>Flash ${comparison.late.flashRate}%</strong><strong>Quality ${formatAverage(comparison.late.quality)}</strong></div></div></div>
      </section>
      <section><div class="section-head"><h2>各 Block</h2><span>表现与疲劳</span></div>${renderBlockTable()}</section>
      <section><div class="section-head"><h2>线路类型</h2><span>可多选统计</span></div>${renderStyleTable()}</section>
      <section><div class="section-head"><h2>数据导出</h2></div><div class="quick-actions"><button class="secondary-btn" data-export="json">Export JSON</button><button class="secondary-btn" data-export="csv">Export CSV</button></div></section>
      <div class="footer-actions"><button class="save-btn" data-action="resume">返回继续记录</button><button class="danger-btn" data-action="new-session">开始新训练 / 清空本次训练</button><div class="footer-note">训练不是非得完成 50 条；今天的记录已经有价值。</div></div>
    </div>`;
  }

  function summaryCard(label, value) { return `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`; }

  function performanceComparison() {
    const count = state.routes.length;
    let early, late, label;
    if (count >= 40) { early = state.routes.slice(0, 20); late = state.routes.slice(-20); label = "前 20 vs 后 20"; }
    else { const midpoint = Math.ceil(count / 2); early = state.routes.slice(0, midpoint); late = state.routes.slice(midpoint); label = "前半程 vs 后半程"; }
    return { early: getStats(early), late: getStats(late), label };
  }

  function renderBlockTable() {
    const blocks = Array.from(new Set(state.routes.map(route => route.block)));
    return `<table class="data-table"><thead><tr><th>Block</th><th>Routes</th><th>Flash</th><th>Avg RPE</th><th>Fatigue</th></tr></thead><tbody>${blocks.map(block => {
      const routes = state.routes.filter(route => route.block === block); const stats = getStats(routes); const check = state.blockChecks.find(item => item.block === block);
      return `<tr><td>Block ${block}</td><td>${routes.length}</td><td>${stats.flash}</td><td>${formatAverage(stats.rpe)}</td><td>${check ? `${check.fatigue}/5` : "—"}</td></tr>`;
    }).join("")}</tbody></table>`;
  }

  function renderStyleTable() {
    const rows = STYLES.map(style => ({ style, routes: state.routes.filter(route => route.styles.includes(style)) })).filter(row => row.routes.length);
    if (!rows.length) return `<div class="empty">本次没有记录线路类型</div>`;
    return `<table class="data-table"><thead><tr><th>Style</th><th>Attempted</th><th>Sent</th><th>Flash</th></tr></thead><tbody>${rows.map(row => { const stats = getStats(row.routes); return `<tr><td>${row.style}</td><td>${stats.attempted}</td><td>${stats.sent}</td><td>${stats.flash}</td></tr>`; }).join("")}</tbody></table>`;
  }

  function exportData(format) {
    if (format === "json") download(`v2-marathon-${dateSlug()}.json`, JSON.stringify(state, null, 2), "application/json");
    else download(`v2-marathon-${dateSlug()}.csv`, makeCSV(), "text/csv;charset=utf-8");
  }

  function makeCSV() {
    const rows = [["record_type", "route_number", "result", "attempts", "styles", "quality", "RPE", "timestamp", "block", "fatigue", "pump", "discomfort", "note"]];
    state.routes.forEach(route => rows.push(["route", route.routeNumber, route.result, route.attempts, route.styles.join("|"), route.quality ?? "", route.rpe ?? "", route.timestamp, route.block, "", "", "", route.note]));
    state.blockChecks.forEach(check => rows.push(["block_fatigue", "", "", "", "", "", "", check.timestamp, check.block, check.fatigue, check.pump, check.discomfort, ""]));
    return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  }

  function csvCell(value) { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
  function download(filename, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("导出已开始"); }

  function newSession() {
    if (!confirm("开始新训练会清空当前训练数据。确定继续？")) return;
    if (!confirm("再次确认：当前训练记录将从此设备删除，建议先导出数据。")) return;
    state = createSession(); saveState(); closeModal(); render(); window.scrollTo(0, 0); showToast("新训练已开始");
  }

  function deleteRoute(id) {
    const route = state.routes.find(item => item.id === id); if (!route) return;
    if (!confirm(`删除 #${String(route.routeNumber).padStart(2, "0")}？`)) return;
    state.routes = state.routes.filter(item => item.id !== id).map((item, index) => ({ ...item, routeNumber: index + 1, block: blockFor(index + 1) }));
    const maxBlock = blockFor(Math.max(1, state.routes.length)); state.blockChecks = state.blockChecks.filter(check => check.block <= maxBlock);
    saveState(); render(); showToast("线路已删除，后续编号已更新");
  }

  function openModal(content) { modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${content}</div></div>`; document.body.style.overflow = "hidden"; }
  function closeModal() { if (restInterval) { clearInterval(restInterval); restInterval = null; } modalRoot.innerHTML = ""; document.body.style.overflow = ""; }
  function showToast(message) { toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800); }
  function formatDate(iso) { return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", weekday: "short" }).format(new Date(iso)); }
  function dateSlug() { return new Date(state.createdAt).toISOString().slice(0, 10); }
  function formatDuration(milliseconds) { const seconds = Math.max(0, Math.floor(milliseconds / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
  function formatSessionDuration() { const end = state.finishedAt ? new Date(state.finishedAt) : new Date(); const minutes = Math.max(1, Math.round((end - new Date(state.createdAt)) / 60000)); return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`; }

  app.addEventListener("click", event => {
    const target = event.target.closest("[data-action], [data-export]"); if (!target) return;
    const action = target.dataset.action;
    if (action === "record") openQuickRecord();
    if (action === "rest") openRestTimer();
    if (action === "finish") finishSession();
    if (action === "edit") openDetails(target.dataset.id);
    if (action === "delete") deleteRoute(target.dataset.id);
    if (action === "new-session") newSession();
    if (action === "resume") { state.status = "active"; state.finishedAt = null; saveState(); render(); }
    if (target.dataset.export) exportData(target.dataset.export);
  });

  modalRoot.addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button) return;
    const modal = button.closest(".modal");
    if (button.hasAttribute("data-close")) closeModal();
    if (button.dataset.result === "flash") addRoute("flash", 1);
    if (button.dataset.result === "skipped") addRoute("skipped", 0);
    if (button.dataset.result === "send" || button.dataset.result === "failed") chooseAttempts(button.dataset.result);
    if (button.dataset.attemptResult) addRoute(button.dataset.attemptResult, Number(button.dataset.attempts), button.dataset.capped === "true");
    if (button.dataset.style) button.classList.toggle("selected");
    if (button.dataset.scale) {
      modal.querySelectorAll(`[data-scale="${button.dataset.scale}"]`).forEach(item => item.classList.remove("selected")); button.classList.add("selected");
      if (button.dataset.scale === "discomfort") modal.querySelector("#pain-warning").innerHTML = Number(button.dataset.value) >= 3 ? `<div class="warning">今天的目标不是一定完成 50 条。如果疼痛正在增加，建议停止本次马拉松。</div>` : "";
    }
    if (button.dataset.editResult) {
      const id = modal.querySelector("[data-save-details]").dataset.saveDetails; const route = state.routes.find(item => item.id === id); route.result = button.dataset.editResult; route.attempts = route.result === "flash" ? 1 : route.result === "skipped" ? 0 : route.result === "send" ? 2 : 1; route.attemptsCapped = false;
      modal.querySelectorAll("[data-edit-result]").forEach(item => item.classList.toggle("selected", item === button)); modal.querySelector("#attempt-editor").innerHTML = renderAttemptEditor(route);
    }
    if (button.dataset.editAttempts) {
      const id = modal.querySelector("[data-save-details]").dataset.saveDetails; const route = state.routes.find(item => item.id === id); route.attempts = Number(button.dataset.editAttempts); route.attemptsCapped = button.dataset.editCapped === "true"; modal.querySelectorAll("[data-edit-attempts]").forEach(item => item.classList.toggle("selected", item === button));
    }
    if (button.dataset.saveDetails) {
      const route = state.routes.find(item => item.id === button.dataset.saveDetails); route.styles = [...modal.querySelectorAll("[data-style].selected")].map(item => item.dataset.style); route.quality = Number(modal.querySelector('[data-scale="quality"].selected')?.dataset.value) || null; route.rpe = Number(modal.querySelector('[data-scale="rpe"].selected')?.dataset.value) || null; saveDetails(route.id, modal);
    }
    if (button.dataset.detailClose) { const routeNumber = state.routes.length; closeModal(); render(); if (button.dataset.detailClose === "new") maybeShowBlockCheck(routeNumber); }
    if (button.dataset.saveCheck) saveBlockCheck(Number(button.dataset.saveCheck), modal);
    if (button.hasAttribute("data-end-from-check")) finishSession();
    if (button.hasAttribute("data-rest-pause")) toggleRest();
    if (button.hasAttribute("data-rest-finish")) finishRest();
  });

  window.addEventListener("storage", event => { if (event.key === STORAGE_KEY) { state = loadState(); render(); } });
  function updateNetworkStatus() { networkStatus.hidden = navigator.onLine; }
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  updateNetworkStatus();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(error => {
        console.warn("Service worker registration failed", error);
      });
    });
  }
  render();
})();
