/**
 * scheduler.js
 * Pure scheduling logic for OS Process Lifecycle Simulator.
 * Input: array of processes + config.
 * Output: { timeline: Tick[], metrics: ProcessMetrics[], averages: Averages, cpuUtilization: number, throughput: number }
 */

const Scheduler = {
  // Helper to deep copy processes so we don't mutate original inputs
  cloneProcesses(processes) {
    return processes.map(p => ({
      pid: p.pid,
      arrivalTime: Number(p.arrivalTime),
      burstTime: Number(p.burstTime),
      remainingTime: Number(p.burstTime),
      priority: Number(p.priority),
      state: "new",
      startTime: null,
      completionTime: null,
      waitingTime: 0,
      turnaroundTime: 0,
      responseTime: null
    }));
  },

  // Helper to sort PIDs numerically/lexicographically (e.g. P1, P2, P10)
  comparePid(pid1, pid2) {
    return pid1.localeCompare(pid2, undefined, { numeric: true, sensitivity: 'base' });
  },

  // Calculate standard performance metrics once completion times are set
  calculateMetrics(processes, totalTime, idleTimeCount) {
    const metrics = processes.map(p => {
      const turnaroundTime = p.completionTime - p.arrivalTime;
      const waitingTime = turnaroundTime - p.burstTime;
      const responseTime = p.startTime - p.arrivalTime;
      return {
        pid: p.pid,
        arrivalTime: p.arrivalTime,
        burstTime: p.burstTime,
        priority: p.priority,
        startTime: p.startTime,
        completionTime: p.completionTime,
        turnaroundTime: Math.max(0, turnaroundTime),
        waitingTime: Math.max(0, waitingTime),
        responseTime: Math.max(0, responseTime)
      };
    });

    const sumWaiting = metrics.reduce((acc, m) => acc + m.waitingTime, 0);
    const sumTurnaround = metrics.reduce((acc, m) => acc + m.turnaroundTime, 0);
    const sumResponse = metrics.reduce((acc, m) => acc + m.responseTime, 0);
    const count = metrics.length || 1;

    const averages = {
      avgWaitingTime: Number((sumWaiting / count).toFixed(2)),
      avgTurnaroundTime: Number((sumTurnaround / count).toFixed(2)),
      avgResponseTime: Number((sumResponse / count).toFixed(2))
    };

    const cpuBusyTime = totalTime - idleTimeCount;
    const cpuUtilization = totalTime > 0 ? Number(((cpuBusyTime / totalTime) * 100).toFixed(2)) : 0;
    const throughput = totalTime > 0 ? Number((metrics.length / totalTime).toFixed(4)) : 0;

    return {
      metrics,
      averages,
      cpuUtilization,
      throughput
    };
  },

  // Helper to build a timeline tick object
  createTick(time, runningProcess, processes) {
    return {
      time,
      runningPid: runningProcess ? runningProcess.pid : null,
      readyQueue: processes
        .filter(p => p.state === "ready")
        .sort((a, b) => {
          if (a.queueOrder !== undefined && b.queueOrder !== undefined) {
            return a.queueOrder - b.queueOrder;
          }
          return 0;
        })
        .map(p => p.pid),
      waitingQueue: processes.filter(p => p.state === "waiting").map(p => p.pid),
      terminated: processes.filter(p => p.state === "terminated").map(p => p.pid),
      remainingTimes: processes.reduce((acc, p) => {
        acc[p.pid] = p.remainingTime;
        return acc;
      }, {})
    };
  },

  // 1. FCFS (First Come First Served) - Non-Preemptive
  scheduleFCFS(rawProcesses) {
    const processes = this.cloneProcesses(rawProcesses);
    const timeline = [];
    let t = 0;
    let running = null;
    let idleTime = 0;

    while (processes.some(p => p.state !== "terminated")) {
      // 1. Check for new arrivals
      processes.forEach(p => {
        if (p.arrivalTime <= t && p.state === "new") {
          p.state = "ready";
          p.queueOrder = t * 1000 + processes.indexOf(p);
        }
      });

      // 2. Select running process
      if (!running) {
        const ready = processes.filter(p => p.state === "ready");
        if (ready.length > 0) {
          ready.sort((a, b) => {
            if (a.arrivalTime !== b.arrivalTime) {
              return a.arrivalTime - b.arrivalTime;
            }
            return this.comparePid(a.pid, b.pid);
          });
          running = ready[0];
          running.state = "running";
          if (running.startTime === null) {
            running.startTime = t;
          }
        }
      }

      // Record tick
      timeline.push(this.createTick(t, running, processes));

      if (running) {
        running.remainingTime--;
        if (running.remainingTime === 0) {
          running.state = "terminated";
          running.completionTime = t + 1;
          running = null;
        }
      } else {
        idleTime++;
      }
      t++;
    }

    const { metrics, averages, cpuUtilization, throughput } = this.calculateMetrics(processes, t, idleTime);
    return { timeline, metrics, averages, cpuUtilization, throughput };
  },

  // 2. SJF (Shortest Job First) - Non-Preemptive
  scheduleSJF(rawProcesses) {
    const processes = this.cloneProcesses(rawProcesses);
    const timeline = [];
    let t = 0;
    let running = null;
    let idleTime = 0;

    while (processes.some(p => p.state !== "terminated")) {
      processes.forEach(p => {
        if (p.arrivalTime <= t && p.state === "new") {
          p.state = "ready";
        }
      });

      if (!running) {
        const ready = processes.filter(p => p.state === "ready");
        if (ready.length > 0) {
          ready.sort((a, b) => {
            if (a.burstTime !== b.burstTime) {
              return a.burstTime - b.burstTime;
            }
            if (a.arrivalTime !== b.arrivalTime) {
              return a.arrivalTime - b.arrivalTime;
            }
            return this.comparePid(a.pid, b.pid);
          });
          running = ready[0];
          running.state = "running";
          if (running.startTime === null) {
            running.startTime = t;
          }
        }
      }

      timeline.push(this.createTick(t, running, processes));

      if (running) {
        running.remainingTime--;
        if (running.remainingTime === 0) {
          running.state = "terminated";
          running.completionTime = t + 1;
          running = null;
        }
      } else {
        idleTime++;
      }
      t++;
    }

    const { metrics, averages, cpuUtilization, throughput } = this.calculateMetrics(processes, t, idleTime);
    return { timeline, metrics, averages, cpuUtilization, throughput };
  },

  // 3. SRTF (Shortest Remaining Time First) - Preemptive
  scheduleSRTF(rawProcesses) {
    const processes = this.cloneProcesses(rawProcesses);
    const timeline = [];
    let t = 0;
    let running = null;
    let idleTime = 0;

    while (processes.some(p => p.state !== "terminated")) {
      processes.forEach(p => {
        if (p.arrivalTime <= t && p.state === "new") {
          p.state = "ready";
        }
      });

      const ready = processes.filter(p => p.state === "ready" || p.state === "running");
      if (ready.length > 0) {
        ready.sort((a, b) => {
          if (a.remainingTime !== b.remainingTime) {
            return a.remainingTime - b.remainingTime;
          }
          if (a.state === "running") return -1;
          if (b.state === "running") return 1;
          if (a.arrivalTime !== b.arrivalTime) {
            return a.arrivalTime - b.arrivalTime;
          }
          return this.comparePid(a.pid, b.pid);
        });

        const selected = ready[0];
        if (running && running !== selected) {
          running.state = "ready";
        }
        running = selected;
        running.state = "running";
        if (running.startTime === null) {
          running.startTime = t;
        }
      }

      timeline.push(this.createTick(t, running, processes));

      if (running) {
        running.remainingTime--;
        if (running.remainingTime === 0) {
          running.state = "terminated";
          running.completionTime = t + 1;
          running = null;
        }
      } else {
        idleTime++;
      }
      t++;
    }

    const { metrics, averages, cpuUtilization, throughput } = this.calculateMetrics(processes, t, idleTime);
    return { timeline, metrics, averages, cpuUtilization, throughput };
  },

  // 4. Priority Scheduling - Non-Preemptive
  schedulePriorityNP(rawProcesses) {
    const processes = this.cloneProcesses(rawProcesses);
    const timeline = [];
    let t = 0;
    let running = null;
    let idleTime = 0;

    while (processes.some(p => p.state !== "terminated")) {
      processes.forEach(p => {
        if (p.arrivalTime <= t && p.state === "new") {
          p.state = "ready";
        }
      });

      if (!running) {
        const ready = processes.filter(p => p.state === "ready");
        if (ready.length > 0) {
          ready.sort((a, b) => {
            if (a.priority !== b.priority) {
              return a.priority - b.priority;
            }
            if (a.arrivalTime !== b.arrivalTime) {
              return a.arrivalTime - b.arrivalTime;
            }
            return this.comparePid(a.pid, b.pid);
          });
          running = ready[0];
          running.state = "running";
          if (running.startTime === null) {
            running.startTime = t;
          }
        }
      }

      timeline.push(this.createTick(t, running, processes));

      if (running) {
        running.remainingTime--;
        if (running.remainingTime === 0) {
          running.state = "terminated";
          running.completionTime = t + 1;
          running = null;
        }
      } else {
        idleTime++;
      }
      t++;
    }

    const { metrics, averages, cpuUtilization, throughput } = this.calculateMetrics(processes, t, idleTime);
    return { timeline, metrics, averages, cpuUtilization, throughput };
  },

  // 5. Priority Scheduling - Preemptive
  schedulePriorityP(rawProcesses) {
    const processes = this.cloneProcesses(rawProcesses);
    const timeline = [];
    let t = 0;
    let running = null;
    let idleTime = 0;

    while (processes.some(p => p.state !== "terminated")) {
      processes.forEach(p => {
        if (p.arrivalTime <= t && p.state === "new") {
          p.state = "ready";
        }
      });

      const ready = processes.filter(p => p.state === "ready" || p.state === "running");
      if (ready.length > 0) {
        ready.sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }
          if (a.state === "running") return -1;
          if (b.state === "running") return 1;
          if (a.arrivalTime !== b.arrivalTime) {
            return a.arrivalTime - b.arrivalTime;
          }
          return this.comparePid(a.pid, b.pid);
        });

        const selected = ready[0];
        if (running && running !== selected) {
          running.state = "ready";
        }
        running = selected;
        running.state = "running";
        if (running.startTime === null) {
          running.startTime = t;
        }
      }

      timeline.push(this.createTick(t, running, processes));

      if (running) {
        running.remainingTime--;
        if (running.remainingTime === 0) {
          running.state = "terminated";
          running.completionTime = t + 1;
          running = null;
        }
      } else {
        idleTime++;
      }
      t++;
    }

    const { metrics, averages, cpuUtilization, throughput } = this.calculateMetrics(processes, t, idleTime);
    return { timeline, metrics, averages, cpuUtilization, throughput };
  },

  // 6. Round Robin (RR)
  scheduleRR(rawProcesses, config) {
    const quantum = config && config.timeQuantum ? Number(config.timeQuantum) : 2;
    const processes = this.cloneProcesses(rawProcesses);
    const timeline = [];
    let t = 0;
    let running = null;
    let idleTime = 0;
    let quantumTimer = 0;

    const readyQueue = [];

    const checkArrivals = (currentTime) => {
      const arrivals = processes.filter(p => p.arrivalTime === currentTime && p.state === "new");
      arrivals.sort((a, b) => this.comparePid(a.pid, b.pid));
      arrivals.forEach(p => {
        p.state = "ready";
        readyQueue.push(p);
      });
    };

    checkArrivals(0);

    while (processes.some(p => p.state !== "terminated")) {
      if (!running && readyQueue.length > 0) {
        running = readyQueue.shift();
        running.state = "running";
        quantumTimer = 0;
        if (running.startTime === null) {
          running.startTime = t;
        }
      }

      processes.forEach(p => {
        if (p.state === "ready") {
          p.queueOrder = readyQueue.indexOf(p);
        }
      });

      timeline.push(this.createTick(t, running, processes));

      if (running) {
        running.remainingTime--;
        quantumTimer++;

        const nextTime = t + 1;
        checkArrivals(nextTime);

        if (running.remainingTime === 0) {
          running.state = "terminated";
          running.completionTime = nextTime;
          running = null;
        } else if (quantumTimer === quantum) {
          running.state = "ready";
          readyQueue.push(running);
          running = null;
        }
      } else {
        idleTime++;
        checkArrivals(t + 1);
      }

      t++;
    }

    const { metrics, averages, cpuUtilization, throughput } = this.calculateMetrics(processes, t, idleTime);
    return { timeline, metrics, averages, cpuUtilization, throughput };
  },

  // 7. Multilevel Feedback Queue (MLFQ)
  scheduleMLFQ(rawProcesses, config) {
    const q0Quantum = config && config.q0Quantum ? Number(config.q0Quantum) : 2;
    const q1Quantum = config && config.q1Quantum ? Number(config.q1Quantum) : 4;

    const processes = this.cloneProcesses(rawProcesses);
    const timeline = [];
    let t = 0;
    let running = null;
    let idleTime = 0;
    let quantumTimer = 0;

    const queues = [[], [], []];

    processes.forEach(p => {
      p.mlfqLevel = 0;
    });

    const checkArrivals = (currentTime) => {
      const arrivals = processes.filter(p => p.arrivalTime === currentTime && p.state === "new");
      arrivals.sort((a, b) => this.comparePid(a.pid, b.pid));
      arrivals.forEach(p => {
        p.state = "ready";
        p.mlfqLevel = 0;
        queues[0].push(p);
      });
    };

    checkArrivals(0);

    while (processes.some(p => p.state !== "terminated")) {
      // 1. Preemption check across queues
      if (running) {
        let hasHigherPriorityReady = false;
        for (let i = 0; i < running.mlfqLevel; i++) {
          if (queues[i].length > 0) {
            hasHigherPriorityReady = true;
            break;
          }
        }

        if (hasHigherPriorityReady) {
          running.state = "ready";
          queues[running.mlfqLevel].push(running);
          running = null;
        }
      }

      // 2. Select running if CPU is idle
      if (!running) {
        for (let q = 0; q < 3; q++) {
          if (queues[q].length > 0) {
            running = queues[q].shift();
            running.state = "running";
            quantumTimer = 0;
            if (running.startTime === null) {
              running.startTime = t;
            }
            break;
          }
        }
      }

      let idx = 0;
      for (let q = 0; q < 3; q++) {
        queues[q].forEach(p => {
          p.queueOrder = idx++;
        });
      }

      timeline.push(this.createTick(t, running, processes));

      if (running) {
        running.remainingTime--;
        quantumTimer++;

        const nextTime = t + 1;
        checkArrivals(nextTime);

        if (running.remainingTime === 0) {
          running.state = "terminated";
          running.completionTime = nextTime;
          running = null;
        } else {
          if (running.mlfqLevel === 0 && quantumTimer === q0Quantum) {
            running.state = "ready";
            running.mlfqLevel = 1;
            queues[1].push(running);
            running = null;
          } else if (running.mlfqLevel === 1 && quantumTimer === q1Quantum) {
            running.state = "ready";
            running.mlfqLevel = 2;
            queues[2].push(running);
            running = null;
          }
        }
      } else {
        idleTime++;
        checkArrivals(t + 1);
      }

      t++;
    }

    const { metrics, averages, cpuUtilization, throughput } = this.calculateMetrics(processes, t, idleTime);
    return { timeline, metrics, averages, cpuUtilization, throughput };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Scheduler;
}