/**
 * app.js
 * Controller and DOM driver for the CPU Scheduling Visualizer.
 * Wires up form actions, runs the tick loop, manages state, and renders animations.
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- State Variables ---
  let processes = [];
  let timeline = [];
  let metrics = [];
  let averages = {};
  let cpuUtilization = 0;
  let throughput = 0;

  let currentTickIndex = 0;
  let isPlaying = false;
  let playbackIntervalId = null;
  let pidCounter = 1;

  // --- DOM Elements ---
  const processForm = document.getElementById("process-form");
  const inputArrival = document.getElementById("input-arrival");
  const inputBurst = document.getElementById("input-burst");
  const inputPriority = document.getElementById("input-priority");
  const registryTableBody = document.querySelector("#registry-table tbody");
  const btnRandom = document.getElementById("btn-random-processes");
  const btnClear = document.getElementById("btn-clear-processes");

  const selectAlgorithm = document.getElementById("select-algorithm");
  const configRR = document.getElementById("config-rr");
  const configMLFQ = document.getElementById("config-mlfq");
  const inputQuantum = document.getElementById("input-quantum");
  const inputMlfqQ0 = document.getElementById("input-mlfq-q0");
  const inputMlfqQ1 = document.getElementById("input-mlfq-q1");

  const btnSaveSet = document.getElementById("btn-save-set");
  const btnLoadSet = document.getElementById("btn-load-set");

  const btnPlay = document.getElementById("btn-play");
  const btnPause = document.getElementById("btn-pause");
  const btnStep = document.getElementById("btn-step");
  const btnReset = document.getElementById("btn-reset");
  const sliderSpeed = document.getElementById("slider-speed");
  const speedValue = document.getElementById("speed-value");

  const simIndicator = document.getElementById("sim-indicator");
  const currentTimeEl = document.getElementById("current-time");

  const containerNew = document.getElementById("container-new");
  const containerReady = document.getElementById("container-ready");
  const containerRunning = document.getElementById("running-process-target");
  const containerTerminated = document.getElementById("container-terminated");
  const cpuCore = document.getElementById("cpu-core");
  const cpuStatusText = document.getElementById("cpu-status-text");

  const badgeNew = document.getElementById("badge-new");
  const badgeReady = document.getElementById("badge-ready");
  const badgeTerminated = document.getElementById("badge-terminated");

  const ganttChartBlocks = document.getElementById("gantt-chart-blocks");
  const metricsTableBody = document.querySelector("#metrics-table tbody");

  const statCpu = document.getElementById("stat-cpu");
  const statThroughput = document.getElementById("stat-throughput");
  const statAvgWaiting = document.getElementById("stat-avg-waiting");
  const statAvgTurnaround = document.getElementById("stat-avg-turnaround");

  const btnRunComparison = document.getElementById("btn-run-comparison");
  const comparisonPlaceholder = document.getElementById("comparison-placeholder");
  const comparisonResultsPanel = document.getElementById("comparison-results-panel");
  const comparisonTableBody = document.querySelector("#comparison-table tbody");
  const chartWaiting = document.getElementById("chart-waiting");
  const chartTurnaround = document.getElementById("chart-turnaround");

  const themeToggle = document.getElementById("theme-toggle");

  // --- Setup & Initialization ---
  loadTheme();
  loadSavedProcessesOnStartup();
  toggleAlgorithmConfig();

  // --- Theme Toggle ---
  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("antigravity_cpu_theme", newTheme);
    showToast(`Switched to ${newTheme} mode`, "success");
  });

  function loadTheme() {
    const savedTheme = localStorage.getItem("antigravity_cpu_theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }

  // --- Helper: Toast Notification ---
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(20px)";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- Helper: Process Colors ---
  function getProcessColor(pid) {
    let hash = 0;
    for (let i = 0; i < pid.length; i++) {
      hash = pid.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 75%, 60%)`;
  }

  function getProcessColorRgb(pid) {
    let hash = 0;
    for (let i = 0; i < pid.length; i++) {
      hash = pid.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const h = hue / 360;
    const s = 0.75;
    const l = 0.60;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return `${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}`;
  }

  // --- FLIP Animation Utility ---
  function moveCardWithFLIP(cardId, targetContainer) {
    const cardEl = document.getElementById(cardId);
    if (!cardEl) return;
    
    const first = cardEl.getBoundingClientRect();
    targetContainer.appendChild(cardEl);
    const last = cardEl.getBoundingClientRect();
    
    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;
    
    if (deltaX !== 0 || deltaY !== 0) {
      cardEl.style.transition = "none";
      cardEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      cardEl.offsetWidth; // Force reflow
      
      cardEl.style.transition = "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease";
      cardEl.style.transform = "none";
    }
  }

  // --- Algorithm Selection Handling ---
  selectAlgorithm.addEventListener("change", toggleAlgorithmConfig);

  function toggleAlgorithmConfig() {
    const algo = selectAlgorithm.value;
    configRR.style.display = algo === "RoundRobin" ? "block" : "none";
    configMLFQ.style.display = algo === "MLFQ" ? "block" : "none";
    resetSimulation();
  }

  // --- Registry Management ---
  processForm.addEventListener("submit", (e) => {
    e.preventDefault();

    if (isPlaying) {
      showToast("Cannot add processes while simulation is running!", "warning");
      return;
    }

    const arrival = parseInt(inputArrival.value);
    const burst = parseInt(inputBurst.value);
    const priority = parseInt(inputPriority.value) || 0;

    if (isNaN(arrival) || arrival < 0) {
      showToast("Arrival time must be a non-negative integer", "danger");
      return;
    }
    if (isNaN(burst) || burst <= 0) {
      showToast("Burst time must be greater than 0", "danger");
      return;
    }

    const pid = `P${pidCounter++}`;
    const newProcess = { pid, arrivalTime: arrival, burstTime: burst, priority };
    processes.push(newProcess);
    
    addProcessToRegistryTable(newProcess);
    showToast(`Process ${pid} registered!`, "success");
    resetSimulation();

    inputBurst.value = 5;
    inputPriority.value = 1;
    inputArrival.focus();
  });

  function addProcessToRegistryTable(proc) {
    const row = document.createElement("tr");
    row.id = `registry-row-${proc.pid}`;
    row.innerHTML = `
      <td class="mono font-bold" style="color: ${getProcessColor(proc.pid)}">${proc.pid}</td>
      <td class="mono">${proc.arrivalTime}</td>
      <td class="mono">${proc.burstTime}</td>
      <td class="mono">${proc.priority}</td>
      <td>
        <button class="btn-delete" data-pid="${proc.pid}" title="Remove process">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </td>
    `;
    
    row.querySelector(".btn-delete").addEventListener("click", (e) => {
      if (isPlaying) {
        showToast("Cannot modify registry during execution!", "warning");
        return;
      }
      const pidToDelete = e.currentTarget.getAttribute("data-pid");
      processes = processes.filter(p => p.pid !== pidToDelete);
      row.remove();
      showToast(`Removed process ${pidToDelete}`, "info");
      resetSimulation();
    });

    registryTableBody.appendChild(row);
  }

  btnRandom.addEventListener("click", () => {
    if (isPlaying) return;
    
    const count = Math.floor(Math.random() * 3) + 3;
    for (let i = 0; i < count; i++) {
      const pid = `P${pidCounter++}`;
      const arrivalTime = Math.floor(Math.random() * 6);
      const burstTime = Math.floor(Math.random() * 8) + 2;
      const priority = Math.floor(Math.random() * 5) + 1;
      
      const proc = { pid, arrivalTime, burstTime, priority };
      processes.push(proc);
      addProcessToRegistryTable(proc);
    }
    showToast(`Added ${count} random processes!`, "success");
    resetSimulation();
  });

  btnClear.addEventListener("click", () => {
    if (isPlaying) return;
    processes = [];
    pidCounter = 1;
    registryTableBody.innerHTML = "";
    showToast("Registry cleared", "info");
    resetSimulation();
  });

  // --- Save / Load Config sets ---
  btnSaveSet.addEventListener("click", () => {
    if (processes.length === 0) {
      showToast("Cannot save empty registry!", "warning");
      return;
    }
    localStorage.setItem("antigravity_cpu_processes", JSON.stringify(processes));
    localStorage.setItem("antigravity_cpu_pid_counter", pidCounter.toString());
    showToast("Process configuration saved to disk!", "success");
  });

  btnLoadSet.addEventListener("click", () => {
    if (isPlaying) return;
    loadSavedProcesses();
  });

  function loadSavedProcesses() {
    const saved = localStorage.getItem("antigravity_cpu_processes");
    const counter = localStorage.getItem("antigravity_cpu_pid_counter");
    if (saved) {
      processes = JSON.parse(saved);
      pidCounter = counter ? parseInt(counter) : processes.length + 1;
      registryTableBody.innerHTML = "";
      processes.forEach(p => addProcessToRegistryTable(p));
      showToast("Configuration loaded successfully", "success");
      resetSimulation();
    } else {
      showToast("No saved configurations found", "warning");
    }
  }

  function loadSavedProcessesOnStartup() {
    const saved = localStorage.getItem("antigravity_cpu_processes");
    if (saved) {
      loadSavedProcesses();
    } else {
      const defaults = [
        { pid: "P1", arrivalTime: 0, burstTime: 5, priority: 3 },
        { pid: "P2", arrivalTime: 1, burstTime: 3, priority: 1 },
        { pid: "P3", arrivalTime: 2, burstTime: 8, priority: 2 },
        { pid: "P4", arrivalTime: 3, burstTime: 6, priority: 4 }
      ];
      processes = defaults;
      pidCounter = 5;
      processes.forEach(p => addProcessToRegistryTable(p));
    }
  }

  // --- Speed Slider ---
  sliderSpeed.addEventListener("input", () => {
    playbackSpeed = parseInt(sliderSpeed.value);
    speedValue.textContent = `${playbackSpeed} Hz`;
    if (isPlaying) {
      pauseSimulation();
      playSimulation();
    }
  });
  let playbackSpeed = parseInt(sliderSpeed.value);

  // --- Simulation Management ---
  function compileSimulation() {
    if (processes.length === 0) {
      showToast("No processes to schedule. Registry is empty!", "warning");
      return false;
    }

    const algo = selectAlgorithm.value;
    const config = {
      timeQuantum: parseInt(inputQuantum.value) || 2,
      q0Quantum: parseInt(inputMlfqQ0.value) || 2,
      q1Quantum: parseInt(inputMlfqQ1.value) || 4
    };

    let result;
    try {
      if (algo === "FCFS") {
        result = Scheduler.scheduleFCFS(processes);
      } else if (algo === "SJF") {
        result = Scheduler.scheduleSJF(processes);
      } else if (algo === "SRTF") {
        result = Scheduler.scheduleSRTF(processes);
      } else if (algo === "PriorityNP") {
        result = Scheduler.schedulePriorityNP(processes);
      } else if (algo === "PriorityP") {
        result = Scheduler.schedulePriorityP(processes);
      } else if (algo === "RoundRobin") {
        result = Scheduler.scheduleRR(processes, config);
      } else if (algo === "MLFQ") {
        result = Scheduler.scheduleMLFQ(processes, config);
      }
    } catch (err) {
      console.error(err);
      showToast("Scheduler error! Check console details.", "danger");
      return false;
    }

    timeline = result.timeline;
    metrics = result.metrics;
    averages = result.averages;
    cpuUtilization = result.cpuUtilization;
    throughput = result.throughput;

    return true;
  }

  function createProcessCards() {
    containerNew.innerHTML = "";
    containerReady.innerHTML = "";
    containerRunning.innerHTML = "";
    containerTerminated.innerHTML = "";

    processes.forEach(p => {
      const card = document.createElement("div");
      card.className = "process-card";
      card.id = `card-${p.pid}`;
      card.style.setProperty("--proc-color", getProcessColor(p.pid));
      card.style.setProperty("--proc-color-rgb", getProcessColorRgb(p.pid));
      
      card.innerHTML = `
        <div class="card-top">
          <span class="card-pid mono">${p.pid}</span>
          <span class="priority-badge mono" title="Priority">Prio: ${p.priority}</span>
        </div>
        <div class="card-metrics">
          <span>Arr: ${p.arrivalTime}s</span>
          <span id="card-rem-label-${p.pid}">Burst: ${p.burstTime}s</span>
        </div>
        <div class="card-progress">
          <div class="card-progress-bar" id="card-progress-bar-${p.pid}"></div>
        </div>
      `;
      containerNew.appendChild(card);
    });

    badgeNew.textContent = processes.length;
    badgeReady.textContent = "0";
    badgeTerminated.textContent = "0";
  }

  function prepareExecutionUI() {
    createProcessCards();
    ganttChartBlocks.innerHTML = "";
    metricsTableBody.innerHTML = "";
    
    statCpu.textContent = "0.00%";
    statThroughput.textContent = "0.0000 P/s";
    statAvgWaiting.textContent = "0.00s";
    statAvgTurnaround.textContent = "0.00s";

    btnPlay.disabled = false;
    btnPause.disabled = true;
    btnStep.disabled = false;

    cpuCore.className = "cpu-core idle-pulse";
    cpuStatusText.textContent = "IDLE";
    cpuCore.removeAttribute("style");
  }

  function resetSimulation() {
    pauseSimulation();
    currentTickIndex = 0;
    timeline = [];
    metrics = [];
    currentTimeEl.textContent = "0";
    simIndicator.className = "status-indicator";
    simIndicator.textContent = "Idle";
    
    if (processes.length > 0) {
      if (compileSimulation()) {
        prepareExecutionUI();
      }
    } else {
      containerNew.innerHTML = "";
      containerReady.innerHTML = "";
      containerRunning.innerHTML = "";
      containerTerminated.innerHTML = "";
      badgeNew.textContent = "0";
      badgeReady.textContent = "0";
      badgeTerminated.textContent = "0";
      ganttChartBlocks.innerHTML = "";
      metricsTableBody.innerHTML = "";
      
      statCpu.textContent = "0.00%";
      statThroughput.textContent = "0.0000 P/s";
      statAvgWaiting.textContent = "0.00s";
      statAvgTurnaround.textContent = "0.00s";

      cpuCore.className = "cpu-core idle-pulse";
      cpuStatusText.textContent = "IDLE";
      cpuCore.removeAttribute("style");
    }
  }

  function playSimulation() {
    if (timeline.length === 0) {
      if (!compileSimulation()) return;
      prepareExecutionUI();
    }

    isPlaying = true;
    btnPlay.disabled = true;
    btnPause.disabled = false;
    btnStep.disabled = true;
    
    simIndicator.className = "status-indicator running";
    simIndicator.textContent = "Running";

    const msPerTick = 1000 / playbackSpeed;
    playbackIntervalId = setInterval(() => {
      runTick();
    }, msPerTick);
  }

  function pauseSimulation() {
    isPlaying = false;
    btnPlay.disabled = false;
    btnPause.disabled = true;
    btnStep.disabled = false;
    
    simIndicator.className = "status-indicator paused";
    simIndicator.textContent = "Paused";

    if (playbackIntervalId) {
      clearInterval(playbackIntervalId);
      playbackIntervalId = null;
    }
  }

  function stepSimulation() {
    if (timeline.length === 0) {
      if (!compileSimulation()) return;
      prepareExecutionUI();
    }
    runTick();
  }

  function runTick() {
    if (currentTickIndex >= timeline.length) {
      finishSimulation();
      return;
    }

    const tick = timeline[currentTickIndex];
    currentTimeEl.textContent = tick.time;

    // --- 1. DOM Card Management via FLIP ---
    processes.forEach(p => {
      const isReady = tick.readyQueue.includes(p.pid);
      const isRunning = tick.runningPid === p.pid;
      const isTerminated = tick.terminated.includes(p.pid);

      const cardId = `card-${p.pid}`;
      const remainingTime = tick.remainingTimes[p.pid];
      
      const progressBar = document.getElementById(`card-progress-bar-${p.pid}`);
      const remLabel = document.getElementById(`card-rem-label-${p.pid}`);
      if (progressBar) {
        const pct = p.burstTime > 0 ? (remainingTime / p.burstTime) * 100 : 0;
        progressBar.style.width = `${pct}%`;
      }
      if (remLabel) {
        remLabel.textContent = `Rem: ${remainingTime}s / ${p.burstTime}s`;
      }

      if (isRunning) {
        moveCardWithFLIP(cardId, containerRunning);
      } else if (isReady) {
        moveCardWithFLIP(cardId, containerReady);
      } else if (isTerminated) {
        moveCardWithFLIP(cardId, containerTerminated);
      } else {
        moveCardWithFLIP(cardId, containerNew);
      }
    });

    tick.readyQueue.forEach(pid => {
      const card = document.getElementById(`card-${pid}`);
      if (card) containerReady.appendChild(card);
    });

    const newCount = processes.filter(p => !tick.readyQueue.includes(p.pid) && tick.runningPid !== p.pid && !tick.terminated.includes(p.pid)).length;
    badgeNew.textContent = newCount;
    badgeReady.textContent = tick.readyQueue.length;
    badgeTerminated.textContent = tick.terminated.length;

    // --- 2. Update CPU Core Box Styles ---
    if (tick.runningPid) {
      cpuCore.className = "cpu-core busy";
      cpuStatusText.textContent = `Running: ${tick.runningPid}`;
      const color = getProcessColor(tick.runningPid);
      const rgb = getProcessColorRgb(tick.runningPid);
      cpuCore.style.borderColor = color;
      cpuCore.style.boxShadow = `0 0 20px rgba(${rgb}, 0.25)`;
      cpuCore.style.backgroundColor = `rgba(${rgb}, 0.05)`;
    } else {
      cpuCore.className = "cpu-core idle-pulse";
      cpuStatusText.textContent = "IDLE";
      cpuCore.removeAttribute("style");
    }

    // --- 3. Dynamic Gantt Chart Creation ---
    updateGanttChart(tick.time, tick.runningPid);

    currentTickIndex++;
  }

  function updateGanttChart(time, runningPid) {
    const lastBlock = ganttChartBlocks.lastElementChild;
    const key = runningPid || "idle";

    if (lastBlock && lastBlock.getAttribute("data-key") === key) {
      const duration = parseInt(lastBlock.getAttribute("data-duration")) + 1;
      lastBlock.setAttribute("data-duration", duration.toString());
      lastBlock.style.width = `${duration * 30}px`;
      
      const endTimeLabel = lastBlock.querySelector(".gantt-block-end-time");
      if (endTimeLabel) endTimeLabel.textContent = (time + 1).toString();
    } else {
      const block = document.createElement("div");
      block.className = `gantt-block ${runningPid ? "" : "idle"}`;
      block.setAttribute("data-key", key);
      block.setAttribute("data-duration", "1");
      block.style.width = "30px";
      
      if (runningPid) {
        block.style.setProperty("--proc-color", getProcessColor(runningPid));
        block.innerHTML = `
          <span>${runningPid}</span>
          <span class="gantt-block-start-time">${time}</span>
          <span class="gantt-block-end-time">${time + 1}</span>
        `;
      } else {
        block.innerHTML = `
          <span>IDLE</span>
          <span class="gantt-block-start-time">${time}</span>
          <span class="gantt-block-end-time">${time + 1}</span>
        `;
      }
      
      ganttChartBlocks.appendChild(block);
      ganttChartBlocks.parentElement.scrollLeft = ganttChartBlocks.parentElement.scrollWidth;
    }
  }

  function finishSimulation() {
    pauseSimulation();
    simIndicator.className = "status-indicator";
    simIndicator.textContent = "Completed";
    showToast("Execution simulation finished!", "success");

    btnPlay.disabled = true;
    btnPause.disabled = true;
    btnStep.disabled = true;

    renderMetricsTable();
    renderGlobalMetrics();
  }

  function renderMetricsTable() {
    metricsTableBody.innerHTML = "";
    metrics.forEach(m => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="mono font-bold" style="color: ${getProcessColor(m.pid)}">${m.pid}</td>
        <td class="mono">${m.arrivalTime}</td>
        <td class="mono">${m.burstTime}</td>
        <td class="mono">${m.priority}</td>
        <td class="mono">${m.startTime}</td>
        <td class="mono">${m.completionTime}</td>
        <td class="mono">${m.turnaroundTime}</td>
        <td class="mono">${m.waitingTime}</td>
        <td class="mono">${m.responseTime}</td>
      `;
      metricsTableBody.appendChild(row);
    });
  }

  function renderGlobalMetrics() {
    statCpu.textContent = `${cpuUtilization}%`;
    statThroughput.textContent = `${throughput} P/s`;
    statAvgWaiting.textContent = `${averages.avgWaitingTime}s`;
    statAvgTurnaround.textContent = `${averages.avgTurnaroundTime}s`;
  }

  btnPlay.addEventListener("click", playSimulation);
  btnPause.addEventListener("click", pauseSimulation);
  btnStep.addEventListener("click", stepSimulation);
  btnReset.addEventListener("click", resetSimulation);

  // --- Benchmark Comparison Mode ---
  btnRunComparison.addEventListener("click", () => {
    if (processes.length === 0) {
      showToast("Cannot benchmark an empty registry!", "warning");
      return;
    }

    showToast("Benchmarking algorithms...", "info");
    
    const config = {
      timeQuantum: parseInt(inputQuantum.value) || 2,
      q0Quantum: parseInt(inputMlfqQ0.value) || 2,
      q1Quantum: parseInt(inputMlfqQ1.value) || 4
    };

    const benchmarks = [
      { name: "FCFS", res: Scheduler.scheduleFCFS(processes) },
      { name: "SJF [NP]", res: Scheduler.scheduleSJF(processes) },
      { name: "SRTF [P]", res: Scheduler.scheduleSRTF(processes) },
      { name: "Priority [NP]", res: Scheduler.schedulePriorityNP(processes) },
      { name: "Priority [P]", res: Scheduler.schedulePriorityP(processes) },
      { name: "Round Robin", res: Scheduler.scheduleRR(processes, config) },
      { name: "MLFQ", res: Scheduler.scheduleMLFQ(processes, config) }
    ];

    comparisonTableBody.innerHTML = "";
    benchmarks.forEach(b => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="font-bold">${b.name}</td>
        <td class="mono">${b.res.averages.avgWaitingTime}s</td>
        <td class="mono">${b.res.averages.avgTurnaroundTime}s</td>
        <td class="mono">${b.res.averages.avgResponseTime}s</td>
        <td class="mono">${b.res.cpuUtilization}%</td>
        <td class="mono">${b.res.throughput} P/s</td>
      `;
      comparisonTableBody.appendChild(row);
    });

    // 1. Waiting Time Chart
    chartWaiting.innerHTML = "";
    const maxWait = Math.max(...benchmarks.map(b => b.res.averages.avgWaitingTime)) || 1;
    benchmarks.forEach(b => {
      const wt = b.res.averages.avgWaitingTime;
      const pct = (wt / maxWait) * 100;
      
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <div class="bar-label">${b.name}</div>
        <div class="bar-wrapper">
          <div class="bar-fill" style="width: 0%; background-color: var(--primary)"></div>
        </div>
        <div class="bar-value">${wt}s</div>
      `;
      chartWaiting.appendChild(row);
      
      setTimeout(() => {
        row.querySelector(".bar-fill").style.width = `${pct}%`;
      }, 50);
    });

    // 2. Turnaround Time Chart
    chartTurnaround.innerHTML = "";
    const maxTurnaround = Math.max(...benchmarks.map(b => b.res.averages.avgTurnaroundTime)) || 1;
    benchmarks.forEach(b => {
      const tat = b.res.averages.avgTurnaroundTime;
      const pct = (tat / maxTurnaround) * 100;
      
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <div class="bar-label">${b.name}</div>
        <div class="bar-wrapper">
          <div class="bar-fill" style="width: 0%; background-color: var(--success)"></div>
        </div>
        <div class="bar-value">${tat}s</div>
      `;
      chartTurnaround.appendChild(row);
      
      setTimeout(() => {
        row.querySelector(".bar-fill").style.width = `${pct}%`;
      }, 50);
    });

    comparisonPlaceholder.style.display = "none";
    comparisonResultsPanel.style.display = "block";
    showToast("Benchmark complete!", "success");
  });
});