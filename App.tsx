
import React from 'react';
import { calculateTheoreticalMetrics, formatTime, generateCostOptimizationData, generateCSV, downloadCSV, calculateSensitivity, calculateRequiredServers } from './mathUtils';
import { 
    SimulationState, 
    TheoreticalMetrics, 
    QueueModel, 
    DistributionType, 
    SimulationConfig,
    ServerState,
    ServerSelectionStrategy,
    QueueTopology,
    TraceEntry,
    SavedScenario,
    CustomerLogEntry,
    ChartDataPoint,
    Environment,
    SkillType
} from './types';
import { SimulationEngine } from './SimulationEngine';
import MetricsCard from './components/MetricsCard';
import ScheduleEditor from './components/ScheduleEditor';
import NetworkSimulator from './components/NetworkSimulator';
import DataLab from './components/DataLab';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  ReferenceLine
} from 'recharts';

// Destructure hooks from default export to ensure runtime safety in ESM environments
const { useState, useEffect, useRef, useCallback, useMemo } = React;

/**
 * UI Constants
 */
const MAX_HISTORY_POINTS = 100;
const SCENARIO_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];

/**
 * Helper to get icon for skill
 */
const getSkillIcon = (skill: SkillType) => {
    switch (skill) {
        case SkillType.SALES: return 'fa-dollar-sign';
        case SkillType.TECH: return 'fa-wrench';
        case SkillType.SUPPORT: return 'fa-life-ring';
        case SkillType.GENERAL: return 'fa-user';
        default: return 'fa-user';
    }
};

/**
 * Helper to get color for skill dot
 */
const getSkillColor = (skill: SkillType) => {
    switch (skill) {
        case SkillType.SALES: return 'bg-emerald-400';
        case SkillType.TECH: return 'bg-blue-400';
        case SkillType.SUPPORT: return 'bg-pink-400';
        case SkillType.GENERAL: return 'bg-slate-400';
        default: return 'bg-slate-400';
    }
};

/**
 * Main Application Component.
 * Orchestrates the Queueing Simulator, Theoretical Calculations, and UI Rendering.
 */
export const App: React.FC = () => {
  // --- GLOBAL MODE STATE ---
  const [appMode, setAppMode] = useState<'SINGLE' | 'NETWORK' | 'DATALAB'>('SINGLE');

  // --- CONFIGURATION STATE (Single Queue) ---
  const [environment, setEnvironment] = useState<Environment>(Environment.BANK);
  const [selectedModel, setSelectedModel] = useState<QueueModel>(QueueModel.MMS);
  
  // Arrival Config
  const [arrivalType, setArrivalType] = useState<DistributionType>(DistributionType.POISSON);
  const [erlangK, setErlangK] = useState<number>(2);
  const [lambdaInput, setLambdaInput] = useState<number>(10);
  const [vipProbability, setVipProbability] = useState<number>(0); // 0 to 1

  // Trace Data Config
  const [traceData, setTraceData] = useState<TraceEntry[]>([]);

  // Dynamic Schedule State
  const [useDynamicMode, setUseDynamicMode] = useState<boolean>(false);
  // Default Arrival Schedule: Lunch Rush curve
  const [arrivalSchedule, setArrivalSchedule] = useState<number[]>(Array.from({length: 24}, (_, i) => {
    // Simple "Lunch Rush" pattern
    if (i >= 11 && i <= 13) return 25;
    if (i >= 9 && i <= 17) return 15;
    return 2;
  }));
  // Default Server Schedule: 9-5 shift
  const [serverSchedule, setServerSchedule] = useState<number[]>(Array.from({length: 24}, (_, i) => {
    if (i >= 9 && i <= 16) return 3;
    if (i >= 8 && i <= 18) return 1;
    return 1;
  }));

  // Impatient Customer Config (Psychology)
  const [impatientMode, setImpatientMode] = useState<boolean>(false);
  const [balkThreshold, setBalkThreshold] = useState<number>(5);
  const [avgPatienceTime, setAvgPatienceTime] = useState<number>(5);

  // Heterogeneous Efficiency Config
  const [efficiencyMode, setEfficiencyMode] = useState<'UNIFORM' | 'MIXED'>('UNIFORM');
  const [seniorityRatio, setSeniorityRatio] = useState<number>(0.5); // 50% Seniors
  const [serverSelectionStrategy, setServerSelectionStrategy] = useState<ServerSelectionStrategy>(ServerSelectionStrategy.RANDOM);

  // Skill Based Routing
  const [skillBasedRouting, setSkillBasedRouting] = useState<boolean>(false);
  const [skillRatios, setSkillRatios] = useState<{ [key in SkillType]?: number }>({
      [SkillType.SALES]: 0.2,
      [SkillType.TECH]: 0.2,
      [SkillType.SUPPORT]: 0.2
  });

  // Retrial / Orbit
  const [retrialMode, setRetrialMode] = useState<boolean>(false);
  const [avgRetrialDelay, setAvgRetrialDelay] = useState<number>(2);

  // State Dependent Rates (Panic Mode)
  const [stateDependentMode, setStateDependentMode] = useState<boolean>(false);
  const [panicThreshold, setPanicThreshold] = useState<number>(10);
  const [panicEfficiencyMultiplier, setPanicEfficiencyMultiplier] = useState<number>(1.5);

  // Breakdown Config
  const [breakdownMode, setBreakdownMode] = useState<boolean>(false);
  const [mtbf, setMtbf] = useState<number>(60);
  const [mttr, setMttr] = useState<number>(10);

  // Topology Config
  const [queueTopology, setQueueTopology] = useState<QueueTopology>(QueueTopology.COMMON);
  const [jockeyingEnabled, setJockeyingEnabled] = useState<boolean>(true);

  // Bulk & Batch Config
  const [bulkArrivalMode, setBulkArrivalMode] = useState<boolean>(false);
  const [minGroupSize, setMinGroupSize] = useState<number>(2);
  const [maxGroupSize, setMaxGroupSize] = useState<number>(6);
  const [batchServiceMode, setBatchServiceMode] = useState<boolean>(false);
  const [maxBatchSize, setMaxBatchSize] = useState<number>(4);

  // Service Config
  const [serviceType, setServiceType] = useState<DistributionType>(DistributionType.POISSON);
  const [erlangServiceK, setErlangServiceK] = useState<number>(2);
  const [serviceTimeInput, setServiceTimeInput] = useState<number>(15);

  // Call Center Specifics
  const [slTargetSec, setSlTargetSec] = useState<number>(20); // Seconds
  const [slTargetPercent, setSlTargetPercent] = useState<number>(80); // Percent

  // Resource Config
  const [serverCountInput, setServerCountInput] = useState<number>(3);
  const [capacityK, setCapacityK] = useState<number>(10);
  const [simSpeed, setSimSpeed] = useState<number>(5);

  // Operation Config (Day Simulation)
  const [openHour, setOpenHour] = useState<number>(9);
  const [closeHour, setCloseHour] = useState<number>(17);

  // Economic Parameters
  const [costPerServer, setCostPerServer] = useState<number>(20);
  const [costPerWait, setCostPerWait] = useState<number>(50);

  // Sensitivity Lab State
  const [sensParam, setSensParam] = useState<'serverCount' | 'lambda' | 'avgServiceTime'>('serverCount');
  const [sensMetric, setSensMetric] = useState<'totalCost' | 'wq' | 'rho'>('totalCost');
  const [sensRange, setSensRange] = useState<[number, number]>([1, 20]);

  // UI Local State
  const [editingServerId, setEditingServerId] = useState<number | null>(null);

  // --- DERIVED STATE ---
  const [theoretical, setTheoretical] = useState<TheoreticalMetrics | null>(null);
  const [infoTab, setInfoTab] = useState<'model' | 'features' | 'about'>('model');

  // --- SCENARIO STATE ---
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);

  // --- SIMULATION ENGINE ---
  // The engine instance is persisted across renders via useRef
  const engineRef = useRef<SimulationEngine | null>(null);
  
  // React state for rendering the UI (synchronized from engine)
  const [simState, setSimState] = useState<SimulationState | null>(null);
  
  // SCRUBBING STATE: Holds a historical snapshot if user is hovering over chart
  const [scrubbedSnapshot, setScrubbedSnapshot] = useState<SimulationState | null>(null);

  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [dayComplete, setDayComplete] = useState<boolean>(false);
  const lastUpdateRef = useRef<number>(0);

  // Handle Environment Changes
  const handleEnvironmentChange = (newEnv: Environment) => {
      setEnvironment(newEnv);
      if (newEnv === Environment.MARKET) {
          setQueueTopology(QueueTopology.DEDICATED);
          setImpatientMode(false);
      } else if (newEnv === Environment.CALL_CENTER) {
          setQueueTopology(QueueTopology.COMMON);
          setImpatientMode(true); // Default enabled for call center
          setAvgPatienceTime(2); // Short patience
          setServiceTimeInput(5); // Shorter calls
          setServerCountInput(10); // More agents typically
          setLambdaInput(80); // Higher volume
          setServiceType(DistributionType.ERLANG); // Call centers often modeled with Erlang
          setErlangServiceK(3);
      } else {
          // BANK
          setQueueTopology(QueueTopology.COMMON);
          setImpatientMode(false);
          setServiceTimeInput(15);
          setServerCountInput(3);
      }
      // Trigger reset via effect dependency? No, best to explicit reset
      // We will let the effect handle the config update, but we should reset to see changes cleanly
      setTimeout(() => resetSimulation(), 50);
  };

  /**
   * Auto-Staffing Logic (Erlang-C Calculator)
   */
  const handleAutoStaff = () => {
      const mu = 60 / serviceTimeInput; // Service rate per hour
      const targetPercent = slTargetPercent / 100;
      
      const newSchedule = arrivalSchedule.map(lambda => {
          if (lambda === 0) return 0;
          // Calculate required servers for this hour's arrival rate
          // Constraint: Max 50 servers to fit UI
          const req = calculateRequiredServers(lambda, mu, slTargetSec / 60, targetPercent);
          return Math.min(50, req);
      });
      
      setServerSchedule(newSchedule);
      // Optional: Reset sim to apply immediately?
      // resetSimulation(); 
  };

  // Helper to create config object
  const getSimConfig = useCallback((): SimulationConfig => ({
      model: selectedModel,
      lambda: lambdaInput,
      avgServiceTime: serviceTimeInput,
      serverCount: serverCountInput,
      capacity: capacityK,
      arrivalType,
      arrivalK: erlangK,
      serviceType,
      serviceK: erlangServiceK,
      openHour,
      closeHour,
      vipProbability,
      impatientMode,
      balkThreshold,
      avgPatienceTime,
      useDynamicMode,
      arrivalSchedule,
      serverSchedule,
      efficiencyMode,
      seniorityRatio,
      serverSelectionStrategy,
      breakdownMode,
      mtbf,
      mttr,
      queueTopology,
      jockeyingEnabled,
      bulkArrivalMode,
      minGroupSize,
      maxGroupSize,
      batchServiceMode,
      maxBatchSize,
      traceData,
      slTarget: slTargetSec / 60, // Convert seconds to minutes for engine
      stateDependentMode,
      panicThreshold,
      panicEfficiencyMultiplier,
      skillBasedRouting,
      skillRatios: skillRatios as any,
      retrialMode,
      avgRetrialDelay
  }), [selectedModel, lambdaInput, serviceTimeInput, serverCountInput, capacityK, arrivalType, erlangK, serviceType, erlangServiceK, openHour, closeHour, vipProbability, impatientMode, balkThreshold, avgPatienceTime, useDynamicMode, arrivalSchedule, serverSchedule, efficiencyMode, seniorityRatio, serverSelectionStrategy, breakdownMode, mtbf, mttr, queueTopology, jockeyingEnabled, bulkArrivalMode, minGroupSize, maxGroupSize, batchServiceMode, maxBatchSize, traceData, slTargetSec, stateDependentMode, panicThreshold, panicEfficiencyMultiplier, skillBasedRouting, skillRatios, retrialMode, avgRetrialDelay]);

  /**
   * Initialize or Reset Simulation
   */
  const resetSimulation = useCallback(() => {
    const config = getSimConfig();
    if (!engineRef.current) {
        engineRef.current = new SimulationEngine(config);
    } else {
        engineRef.current.updateConfig(config);
        engineRef.current.reset();
    }
    
    // Sync initial state
    setSimState({ ...engineRef.current.getState() });
    setDayComplete(false);
    setScrubbedSnapshot(null); // Clear any scrub state
    lastUpdateRef.current = performance.now();
  }, [getSimConfig]);

  /**
   * Scenario Snapshot Logic
   */
  const handleSnapshot = () => {
    if (!simState) return;
    const count = savedScenarios.length;
    const color = SCENARIO_COLORS[count % SCENARIO_COLORS.length];
    
    // Create descriptive name
    let name = `${selectedModel}`;
    if (useDynamicMode) {
        name += ` (Dynamic)`;
    } else {
        name += ` (s=${serverCountInput}, λ=${lambdaInput})`;
    }
    
    const newScenario: SavedScenario = {
        id: Date.now().toString(),
        name,
        history: JSON.parse(JSON.stringify(simState.history)), // Deep copy history
        color,
        visible: true
    };
    setSavedScenarios([...savedScenarios, newScenario]);
  };

  const toggleScenario = (id: string) => {
    setSavedScenarios(savedScenarios.map(s => s.id === id ? { ...s, visible: !s.visible } : s));
  };

  const deleteScenario = (id: string) => {
     setSavedScenarios(savedScenarios.filter(s => s.id !== id));
  };

  /**
   * Report Export Logic
   */
  const handleExportReport = () => {
    if (!simState || !engineRef.current) return;
    
    const ts = new Date().toISOString().slice(0, 19).replace('T', '_');

    // 1. Generate Summary Stats CSV
    const avgWq = simState.statsWq.count > 0 ? simState.statsWq.sum / simState.statsWq.count : 0;
    const avgSys = simState.statsW.count > 0 ? simState.statsW.sum / simState.statsW.count : 0;
    const utilization = simState.history.length > 0 ? simState.history[simState.history.length - 1].lObs / (serverCountInput || 1) : 0; // rough approx

    const summaryData = [{
        simulationTime: simState.currentTime,
        totalArrivals: simState.customersArrivals,
        totalServed: simState.customersServed,
        totalReneged: simState.customersImpatient,
        avgWaitTime: avgWq,
        avgSystemTime: avgSys,
        model: selectedModel,
        lambda: lambdaInput,
        servers: serverCountInput,
        timestamp: ts
    }];
    const summaryCSV = generateCSV(summaryData, Object.keys(summaryData[0]));
    downloadCSV(summaryCSV, `queue_summary_${ts}.csv`);

    // 2. Generate Customer Logs CSV
    const logs = simState.completedCustomers;
    if (logs.length > 0) {
        const logCSV = generateCSV(logs, ['id', 'arrivalTime', 'startTime', 'finishTime', 'waitTime', 'serviceTime', 'serverId', 'type', 'requiredSkill', 'estimatedWaitTime']);
        downloadCSV(logCSV, `queue_logs_${ts}.csv`);
    } else {
        alert("No completed customers to export yet.");
    }
  };

  /**
   * Server Skill Toggling
   */
  const handleToggleServerSkill = (serverId: number, skill: SkillType) => {
      if (!engineRef.current || !simState) return;
      const server = simState.servers.find(s => s.id === serverId);
      if (!server) return;

      let newSkills = [...server.skills];
      if (newSkills.includes(skill)) {
          newSkills = newSkills.filter(s => s !== skill);
      } else {
          newSkills.push(skill);
      }
      // Ensure at least one skill or handle empty? 
      if (newSkills.length === 0) newSkills = [SkillType.GENERAL];

      // Update Engine
      engineRef.current.updateServerSkills(serverId, newSkills);
      // Force UI refresh (engine tick will eventually do it but immediate response is better)
      setSimState({ ...engineRef.current.getState() });
  };

  /**
   * Effect: Handle Input Changes
   * Updates theoretical metrics and resets simulation when structural parameters change.
   */
  useEffect(() => {
    const mu = 60 / serviceTimeInput;
    // Calculate effective average efficiency for theoretical baseline
    const avgEff = efficiencyMode === 'MIXED' ? (seniorityRatio * 1.5) + ((1 - seniorityRatio) * 0.7) : 1.0;

    // Note: Theoretical metrics only apply to the STATIC input values. 
    // In dynamic mode, these serve as a "Reference Point" for the sliders.
    const metrics = calculateTheoreticalMetrics(
      lambdaInput, mu, serverCountInput, selectedModel, capacityK, 
      arrivalType, erlangK, serviceType, erlangServiceK, avgEff, 
      breakdownMode, mtbf, mttr
    );
    setTheoretical(metrics);
    
    // Pass updated config to engine even if we don't reset fully
    if (engineRef.current) {
        engineRef.current.updateConfig(getSimConfig());
    }
  }, [lambdaInput, serviceTimeInput, serverCountInput, selectedModel, capacityK, arrivalType, erlangK, serviceType, erlangServiceK, openHour, closeHour, vipProbability, impatientMode, balkThreshold, avgPatienceTime, useDynamicMode, arrivalSchedule, serverSchedule, efficiencyMode, seniorityRatio, serverSelectionStrategy, breakdownMode, mtbf, mttr, queueTopology, jockeyingEnabled, bulkArrivalMode, minGroupSize, maxGroupSize, batchServiceMode, maxBatchSize, getSimConfig, traceData, slTargetSec, stateDependentMode, panicThreshold, panicEfficiencyMultiplier, skillBasedRouting, skillRatios, retrialMode, avgRetrialDelay]);

  // Initial load
  useEffect(() => {
      resetSimulation();
  }, []); // Run once on mount to ensure engine is init

  /**
   * ANIMATION LOOP
   * Uses requestAnimationFrame to drive the engine.
   */
  useEffect(() => {
    if (isPaused || !engineRef.current) return;
    
    let requestRef: number;
    const animate = (time: number) => {
      const dtMs = time - lastUpdateRef.current;
      lastUpdateRef.current = time;
      
      const simDeltaMinutes = (dtMs / 1000) * simSpeed;
      
      const engine = engineRef.current!;
      engine.tick(simDeltaMinutes);
      
      // Sync state for React render
      // Note: We shallow copy to trigger re-render
      const state = engine.getState();
      setSimState({ ...state });
      
      // If we are actively scrubbing (scrubbedSnapshot is set),
      // we do NOT update scrubbedSnapshot here, so the user sees frozen history while simulation runs in background.

      if (engine.isDayComplete()) {
          setIsPaused(true);
          setDayComplete(true);
      } else {
          requestRef = requestAnimationFrame(animate);
      }
    };
    
    requestRef = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef);
  }, [isPaused, simSpeed]);

  // Sensitivity Analysis Data Calculation
  const sensitivityData = useMemo(() => {
    const config = getSimConfig();
    const step = sensParam === 'serverCount' ? 1 : (sensParam === 'avgServiceTime' ? 0.5 : 2);
    
    // Auto-adjust range defaults if they don't make sense for the param
    let actualRange = sensRange;
    if (sensParam === 'serverCount' && sensRange[1] > 50) actualRange = [1, 20];
    if (sensParam === 'avgServiceTime' && sensRange[1] > 60) actualRange = [1, 60];
    
    return calculateSensitivity(
        config,
        sensParam,
        actualRange,
        step,
        costPerServer,
        costPerWait
    );
  }, [getSimConfig, sensParam, sensRange, costPerServer, costPerWait]);

  // Handler for loading trace data from DataLab
  const handleTraceDataLoaded = (data: TraceEntry[]) => {
      setTraceData(data);
      setArrivalType(DistributionType.TRACE);
      setServiceType(DistributionType.TRACE);
      setAppMode('SINGLE');
      
      // Auto-set open/close to cover the data range
      const minTime = data[0].arrivalTime;
      const maxTime = data[data.length - 1].arrivalTime;
      
      // Assuming data starts near 0 relative, just ensure duration is covered
      setOpenHour(0);
      setCloseHour(Math.ceil((maxTime / 60) + 1));
      
      // Need to defer reset to allow state updates to propagate
      setTimeout(() => {
          resetSimulation();
      }, 100);
  };

  /**
   * Chart Interaction Handlers (Scrubbing)
   */
  const handleChartHover = useCallback((e: any) => {
    if (e && e.activePayload && e.activePayload.length > 0) {
        const payload = e.activePayload[0].payload as ChartDataPoint;
        if (payload && payload.visualSnapshot && simState) {
            // Construct a temporary SimulationState for display based on historical snapshot
            const tempState: SimulationState = {
                ...simState, // Inherit base properties
                currentTime: payload.time * 60, // Approximate
                queue: payload.visualSnapshot.queue,
                servers: payload.visualSnapshot.servers,
                customersImpatient: payload.visualSnapshot.customersImpatient,
                customersServed: payload.visualSnapshot.customersServed,
                customersServedWithinTarget: payload.visualSnapshot.customersServed, // Approx
                isPanic: false, // Don't guess panic state for history
                recentlyDeparted: [], // Clear animation ghosts when scrubbing
                recentlyBalked: [], // Clear animation ghosts
                orbit: payload.visualSnapshot.orbit || [], // Fallback for old history
                history: simState.history // Keep history for context
            };
            setScrubbedSnapshot(tempState);
        }
    }
  }, [simState]);

  const handleChartLeave = useCallback(() => {
      setScrubbedSnapshot(null);
  }, []);

  // Determine which state to display (Live vs Historical)
  const displayState = useMemo(() => {
      return scrubbedSnapshot || simState;
  }, [scrubbedSnapshot, simState]);

  // Helper for safe access
  const avgWaitSim = displayState && displayState.statsWq.count > 0 ? displayState.statsWq.sum / displayState.statsWq.count : 0;
  const currentClockTime = displayState ? formatTime(openHour + (displayState.currentTime / 60)) : "00:00 AM";

  // Calculate Impatience Percentage
  const impatientPercent = displayState && displayState.customersArrivals > 0 
    ? (displayState.customersImpatient / displayState.customersArrivals) * 100 
    : 0;

  // Calculate Service Level Percentage
  const serviceLevelPct = displayState && displayState.customersServed > 0
    ? (displayState.customersServedWithinTarget / displayState.customersServed) * 100
    : 100;

  // Calculate Total Queue (Summing Dedicated Queues if needed)
  const currentTotalQueue = useMemo(() => {
      if (!displayState) return 0;
      let total = displayState.queue.length;
      displayState.servers.forEach(s => total += s.queue.length);
      return total;
  }, [displayState]);

  // Merge Chart Data for Comparison
  const chartData = useMemo(() => {
    if (!simState) return [];
    
    const dataMap = new Map<number, any>();
    
    // Add current history
    simState.history.forEach(pt => {
        dataMap.set(pt.time, { ...pt, isCurrent: true });
    });
    
    // Add saved scenarios history (merged by time index)
    savedScenarios.forEach(scen => {
        if (!scen.visible) return;
        scen.history.forEach(pt => {
            const existing = dataMap.get(pt.time) || { time: pt.time };
            existing[`scenario_${scen.id}_wq`] = pt.wq;
            existing[`scenario_${scen.id}_lq`] = pt.lqActual;
            dataMap.set(pt.time, existing);
        });
    });
    
    return Array.from(dataMap.values()).sort((a, b) => a.time - b.time);
  }, [simState?.history, savedScenarios]);

  // --- DOCUMENTATION GENERATION ---
  const modelNotation = useMemo(() => {
    const a = arrivalType === DistributionType.POISSON ? 'M' : arrivalType === DistributionType.DETERMINISTIC ? 'D' : arrivalType === DistributionType.TRACE ? 'Trace' : arrivalType === DistributionType.ERLANG ? `E${erlangK}` : 'G';
    const s = serviceType === DistributionType.POISSON ? 'M' : serviceType === DistributionType.DETERMINISTIC ? 'D' : serviceType === DistributionType.TRACE ? 'Trace' : serviceType === DistributionType.ERLANG ? `E${erlangServiceK}` : 'G';
    const servers = selectedModel === QueueModel.MMINF ? '∞' : selectedModel === QueueModel.MM1 ? '1' : (useDynamicMode ? 's(t)' : serverCountInput);
    const capacity = selectedModel === QueueModel.MMSK ? `/${capacityK}` : '';
    
    // Notation for Bulk/Batch
    const bulk = bulkArrivalMode ? `^(${minGroupSize},${maxGroupSize})` : '';
    const batch = batchServiceMode ? `^(1,${maxBatchSize})` : '';

    return `${a}${bulk}/${s}${batch}/${servers}${capacity}`;
  }, [arrivalType, serviceType, selectedModel, serverCountInput, capacityK, erlangK, erlangServiceK, useDynamicMode, bulkArrivalMode, minGroupSize, maxGroupSize, batchServiceMode, maxBatchSize]);

  const documentationContent = useMemo(() => {
    let validityDesc = "Results are based on standard steady-state queueing theory.";
    const isGGS = arrivalType !== DistributionType.POISSON || serviceType !== DistributionType.POISSON;
    
    if (arrivalType === DistributionType.TRACE || serviceType === DistributionType.TRACE) {
        validityDesc = "Trace Mode Active: Simulation is replaying historical data. Analytical formulas are disabled as the input distribution is empirical.";
    } else if (useDynamicMode) {
        validityDesc = "Dynamic Mode Active: Stationary steady-state formulas do not apply. Simulation results reflect transient behavior of time-varying parameters.";
    } else if (theoretical?.rho && theoretical.rho >= 1) {
       validityDesc = "SYSTEM UNSTABLE. Traffic intensity ρ ≥ 1. Steady-state formulas do not apply. Simulation will show unbounded queue growth.";
    } else if (selectedModel === QueueModel.MMSK && isGGS) {
       validityDesc = "G/G/s/K metrics are heuristic approximations. Simulation results should be prioritized.";
    } else if (bulkArrivalMode || batchServiceMode) {
       validityDesc = "Bulk/Batch modes active. Standard M/M/s formulas are not applicable approximations. Rely on simulation stats.";
    }

    return {
      arrivals: {
        title: "Arrival Process",
        desc: useDynamicMode 
            ? "Non-Stationary Process λ(t). Arrival rates vary hourly according to the user-defined schedule."
            : arrivalType === DistributionType.POISSON 
            ? "Independent Poisson arrivals (Markovian). Inter-arrival times are Exponentially distributed."
            : `User defined: ${arrivalType}`
      },
      service: {
        title: "Service Process",
        desc: serviceType === DistributionType.POISSON
          ? "Exponential service times (Markovian)."
          : serviceType === DistributionType.DETERMINISTIC
          ? "Deterministic (Constant) service times."
          : `User defined: ${serviceType}`
      },
      discipline: {
        title: "Queue Discipline",
        desc: "FIFO" + (vipProbability > 0 ? " with Priority" : "") + (impatientMode ? " + Balking/Reneging" : "")
      },
      validity: {
        title: "Validity & Limitations",
        desc: validityDesc
      }
    };
  }, [arrivalType, serviceType, selectedModel, erlangK, erlangServiceK, theoretical, capacityK, vipProbability, serverCountInput, useDynamicMode, impatientMode, bulkArrivalMode, batchServiceMode]);

  // Formatter for Chart X-Axis
  const xAxisFormatter = (timeValue: number) => {
    return formatTime(openHour + timeValue);
  };

  // Label Helpers
  const getResourceName = () => {
      switch(environment) {
          case Environment.CALL_CENTER: return 'Agents';
          case Environment.MARKET: return 'Cashiers';
          default: return 'Tellers';
      }
  };

  const getCustomerName = () => {
      switch(environment) {
          case Environment.CALL_CENTER: return 'Callers';
          case Environment.MARKET: return 'Shoppers';
          default: return 'Customers';
      }
  };

  const getImpatientLabel = () => {
      return environment === Environment.CALL_CENTER ? 'Abandoned' : 'Reneged';
  }

  // --- RENDER ROUTERS ---

  if (appMode === 'NETWORK') {
      return (
          <div className="min-h-screen p-4 bg-slate-100">
               <header className="mb-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                            <i className="fa-solid fa-diagram-project text-purple-600"></i>
                            Jackson Network Builder
                        </h1>
                        <p className="text-xs text-slate-500">Design multi-stage stochastic networks</p>
                    </div>
                    <div className="bg-white rounded-full p-1 border shadow-sm flex">
                        <button onClick={() => setAppMode('SINGLE')} className="px-4 py-1 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-50">Single Node</button>
                        <button onClick={() => setAppMode('NETWORK')} className="px-4 py-1 rounded-full text-xs font-bold text-white bg-purple-600 shadow-sm">Network Mode</button>
                        <button onClick={() => setAppMode('DATALAB')} className="px-4 py-1 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-50">Data Lab</button>
                    </div>
               </header>
               <NetworkSimulator />
          </div>
      )
  }

  if (appMode === 'DATALAB') {
      return (
          <div className="min-h-screen p-4 bg-slate-100">
               <header className="mb-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                            <i className="fa-solid fa-flask text-purple-600"></i>
                            Data Lab
                        </h1>
                        <p className="text-xs text-slate-500">Analyze raw data and prepare traces</p>
                    </div>
                    <div className="bg-white rounded-full p-1 border shadow-sm flex">
                        <button onClick={() => setAppMode('SINGLE')} className="px-4 py-1 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-50">Single Node</button>
                        <button onClick={() => setAppMode('NETWORK')} className="px-4 py-1 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-50">Network Mode</button>
                        <button onClick={() => setAppMode('DATALAB')} className="px-4 py-1 rounded-full text-xs font-bold text-white bg-purple-600 shadow-sm">Data Lab</button>
                    </div>
               </header>
               <DataLab onDataLoaded={handleTraceDataLoaded} />
          </div>
      )
  }

  // --- SINGLE QUEUE MODE (Classic App) ---

  if (!simState) return <div className="min-h-screen flex items-center justify-center text-slate-500">Initializing Engine...</div>;

  // IMPORTANT: Use displayState instead of simState for visual rendering to support scrubbing
  // If displayState is null (rare race condition during reset), fallback to simState
  const activeState = displayState || simState;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Custom Styles for Balk Animation */}
      <style>{`
        @keyframes balkShake {
          0% { transform: translateX(0); opacity: 1; }
          25% { transform: translateX(-4px) rotate(-5deg); }
          50% { transform: translateX(4px) rotate(5deg); }
          75% { transform: translateX(-4px); }
          100% { transform: scale(0.8); opacity: 0; }
        }
        .animate-balk {
          animation: balkShake 0.5s ease-out forwards;
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
          100% { transform: translateY(0px); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in {
          animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        .bg-grid-pattern {
            background-color: #f8fafc;
            background-image: linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px);
            background-size: 20px 20px;
        }
        .bg-striped {
            background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(239, 68, 68, 0.1) 5px, rgba(239, 68, 68, 0.1) 10px);
        }
        @keyframes walkIn {
            0% { opacity: 0; transform: translateX(-200px) translateY(20px) scale(0.5); }
            100% { opacity: 1; transform: translateX(0) translateY(0) scale(1); }
        }
        .animate-walk-in {
            animation: walkIn 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        @keyframes walkOut {
            0% { opacity: 1; transform: translate(0, 0) scale(1); }
            20% { transform: translate(0, -10px) scale(1.1); } /* Jump off chair */
            100% { opacity: 0; transform: translate(400px, 100px) scale(0.5); } /* Walk to exit */
        }
        .animate-walk-out {
            animation: walkOut 0.8s ease-in forwards;
        }
      `}</style>

      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <i className="fa-solid fa-building-columns text-blue-600"></i>
            Queueing Simulator Pro <span className="text-blue-500 font-normal">v3.5</span>
          </h1>
          <p className="text-slate-500 mt-1">Multi-Distribution Analytical Validation & Dynamic Staffing</p>
        </div>
        
        <div className="flex gap-4 items-center">
            {/* Mode Switcher */}
            <div className="bg-white rounded-full p-1 border shadow-sm flex">
                <button onClick={() => setAppMode('SINGLE')} className="px-4 py-2 rounded-full text-xs font-bold text-white bg-blue-600 shadow-sm transition-all">Single Node</button>
                <button onClick={() => setAppMode('NETWORK')} className="px-4 py-2 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-50 transition-all">Network Mode</button>
                <button onClick={() => setAppMode('DATALAB')} className="px-4 py-2 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-50 transition-all">Data Lab</button>
            </div>

            <div className="flex gap-2">
            
            {/* Snapshot Button */}
            <button 
                onClick={handleSnapshot} 
                className="px-4 py-2 rounded-lg font-bold text-white bg-indigo-500 hover:bg-indigo-600 transition-all shadow-md flex items-center gap-2"
                title="Save current metrics as a scenario for comparison"
            >
                <i className="fa-solid fa-camera"></i> Snapshot
            </button>

            {/* Export Button */}
            <button 
                onClick={handleExportReport} 
                className="px-4 py-2 rounded-lg font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-md flex items-center gap-2"
                title="Download Simulation Data (CSV)"
            >
                <i className="fa-solid fa-file-csv"></i> Export
            </button>

            {!dayComplete ? (
                <button onClick={() => setIsPaused(!isPaused)} className={`px-6 py-2 rounded-lg font-bold text-white transition-all shadow-md flex items-center gap-2 ${isPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
                <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}`}></i> {isPaused ? 'Resume' : 'Pause'}
                </button>
            ) : (
                <div className="px-6 py-2 rounded-lg font-bold text-white bg-slate-700 flex items-center gap-2 shadow-md cursor-default">
                <i className="fa-solid fa-check-circle"></i> Day Complete
                </div>
            )}
            <button onClick={resetSimulation} className="px-6 py-2 rounded-lg font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 transition-all flex items-center gap-2">
                <i className="fa-solid fa-rotate-left"></i> Reset
            </button>
            </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Configuration Controls */}
        <section className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Model Configuration</h2>
            
            {/* Environment Selector */}
            <div className="flex p-1 bg-slate-100 rounded-lg mb-4">
                {Object.values(Environment).map(env => (
                    <button 
                        key={env}
                        onClick={() => handleEnvironmentChange(env)}
                        className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${environment === env ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        {env}
                    </button>
                ))}
            </div>

            <div className="space-y-4">
              {/* Dynamic Toggle */}
              <div className="p-3 bg-gradient-to-r from-slate-100 to-slate-50 rounded-xl border border-slate-200">
                 <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                       <i className="fa-solid fa-stopwatch-20"></i> Dynamic Schedule
                    </label>
                    <button 
                       onClick={() => setUseDynamicMode(!useDynamicMode)}
                       className={`w-10 h-5 rounded-full relative transition-colors ${useDynamicMode ? 'bg-blue-600' : 'bg-slate-300'}`}
                    >
                       <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${useDynamicMode ? 'left-6' : 'left-1'}`}></div>
                    </button>
                 </div>
                 <p className="text-[9px] text-slate-500 mt-2 leading-tight">
                    {useDynamicMode 
                        ? "Simulation uses hourly schedules for Arrival Rate λ(t) and Staff Counts s(t)." 
                        : "Simulation uses constant Arrival Rate and Staff Count all day."}
                 </p>
              </div>

              {/* Day Schedule Configuration */}
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 space-y-3">
                 <label className="block text-xs font-black text-slate-600 uppercase tracking-widest">Operating Hours</label>
                 <div className="flex gap-2">
                   <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Open (Hour)</label>
                      <input 
                        type="number" min="0" max="23" value={openHour} onChange={(e) => setOpenHour(Number(e.target.value))}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:ring-1 focus:ring-blue-400"
                      />
                   </div>
                   <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Close (Hour)</label>
                      <input 
                        type="number" min="1" max="24" value={closeHour} onChange={(e) => setCloseHour(Number(e.target.value))}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:ring-1 focus:ring-blue-400"
                      />
                   </div>
                 </div>
              </div>
              
              {/* Queue Model Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wide text-[10px]">Queueing Model</label>
                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value as QueueModel)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value={QueueModel.MM1}>M/M/1 (Single {getResourceName().slice(0, -1)})</option>
                  <option value={QueueModel.MMS}>M/M/s (Multiple {getResourceName()})</option>
                  <option value={QueueModel.MMINF}>M/M/inf (Infinite {getResourceName()})</option>
                  <option value={QueueModel.MMSK}>M/M/s/K (Finite Capacity)</option>
                </select>
              </div>

              {/* Arrival Process Config */}
              <div className={`p-3 rounded-xl border space-y-3 transition-colors ${useDynamicMode ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-blue-50/5 border-blue-100'}`}>
                <div className="flex justify-between items-center">
                   <label className="block text-xs font-bold text-blue-800 uppercase tracking-wide"><i className="fa-solid fa-users-line mr-1"></i> {getCustomerName()} Arrival</label>
                   {useDynamicMode && <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1 rounded">SCHEDULED</span>}
                </div>
                
                {useDynamicMode ? (
                    <ScheduleEditor 
                        title="Arrival Rate λ(t)"
                        data={arrivalSchedule}
                        onChange={setArrivalSchedule}
                        min={0}
                        max={100}
                        colorClass="border-blue-200"
                        barColorClass="bg-blue-400"
                        unit="/hr"
                    />
                ) : (
                    <>
                        <select 
                            value={arrivalType} 
                            onChange={(e) => setArrivalType(e.target.value as DistributionType)} 
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs mb-2"
                        >
                            {Object.values(DistributionType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        {arrivalType === DistributionType.ERLANG && (
                           <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500">Shape k: {erlangK}</span>
                              <input type="range" min="1" max="10" value={erlangK} onChange={(e) => setErlangK(Number(e.target.value))} className="w-20 accent-blue-600" />
                           </div>
                        )}
                        <label className="block text-[10px] text-slate-500 font-bold uppercase">Arrival Rate (λ)</label>
                        <div className="flex items-center justify-between">
                        <input type="range" min="1" max="200" value={lambdaInput} onChange={(e) => setLambdaInput(Number(e.target.value))} className="flex-1 mr-2 accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                        <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{lambdaInput}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 text-right">arrivals / hr</p>
                    </>
                )}
              </div>

              {/* Service Process Config */}
              <div className="p-3 bg-emerald-50/10 rounded-xl border border-emerald-100 space-y-3">
                <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wide"><i className="fa-solid fa-stopwatch mr-1"></i> {environment === Environment.CALL_CENTER ? 'Call Duration' : 'Service Time'}</label>
                <select 
                    value={serviceType} 
                    onChange={(e) => setServiceType(e.target.value as DistributionType)} 
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs mb-2"
                >
                    {Object.values(DistributionType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {serviceType === DistributionType.ERLANG && (
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">Shape k: {erlangServiceK}</span>
                        <input type="range" min="1" max="10" value={erlangServiceK} onChange={(e) => setErlangServiceK(Number(e.target.value))} className="w-20 accent-emerald-600" />
                    </div>
                )}
                <label className="block text-[10px] text-slate-500 font-bold uppercase">Avg Duration (1/μ)</label>
                <div className="flex items-center justify-between">
                  <input type="range" min="1" max="60" value={serviceTimeInput} onChange={(e) => setServiceTimeInput(Number(e.target.value))} className="flex-1 mr-2 accent-emerald-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                  <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{serviceTimeInput}</span>
                </div>
                <p className="text-[10px] text-slate-400 text-right">minutes</p>
              </div>

              {/* Resource Config */}
              <div className="p-3 bg-purple-50/10 rounded-xl border border-purple-100 space-y-3">
                 <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-purple-800 uppercase tracking-wide"><i className="fa-solid fa-user-tie mr-1"></i> {getResourceName()}</label>
                    {useDynamicMode && <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1 rounded">SCHEDULED</span>}
                 </div>
                
                 {useDynamicMode && selectedModel !== QueueModel.MM1 && selectedModel !== QueueModel.MMINF ? (
                     <ScheduleEditor 
                         title={`Staff Count s(t)`}
                         data={serverSchedule}
                         onChange={setServerSchedule}
                         min={1}
                         max={50}
                         colorClass="border-purple-200"
                         barColorClass="bg-purple-400"
                         unit="staff"
                         onAutoStaff={handleAutoStaff}
                     />
                 ) : (
                     <>
                        {(selectedModel === QueueModel.MMS || selectedModel === QueueModel.MMSK) && (
                            <>
                            <label className="block text-[10px] text-slate-500 font-bold uppercase">Number of {getResourceName()} (s)</label>
                            <div className="flex items-center justify-between">
                                <input type="range" min="1" max="50" value={serverCountInput} onChange={(e) => setServerCountInput(Number(e.target.value))} className="flex-1 mr-2 accent-purple-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                                <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{serverCountInput}</span>
                            </div>
                            </>
                        )}
                        {selectedModel === QueueModel.MMSK && (
                            <>
                            <label className="block text-[10px] text-slate-500 font-bold uppercase mt-2">System Capacity (K)</label>
                            <div className="flex items-center justify-between">
                                <input type="range" min={serverCountInput} max="50" value={capacityK} onChange={(e) => setCapacityK(Number(e.target.value))} className="flex-1 mr-2 accent-purple-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                                <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{capacityK}</span>
                            </div>
                            </>
                        )}
                     </>
                 )}
              </div>

              {/* Advanced Config Section */}
              <div className="border-t pt-4">
                  <h3 className="text-xs font-black uppercase text-slate-400 mb-2">Advanced Scenarios</h3>
                  <div className="space-y-2">
                      {/* Priority / VIP */}
                      <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                          <span>VIP Priority (High Priority)</span>
                          <input type="checkbox" checked={vipProbability > 0} onChange={(e) => setVipProbability(e.target.checked ? 0.2 : 0)} className="accent-amber-500" />
                      </label>
                      {vipProbability > 0 && (
                          <div className="pl-4 pb-2">
                              <div className="flex justify-between text-[10px] text-slate-400">
                                  <span>Ratio: {(vipProbability * 100).toFixed(0)}%</span>
                              </div>
                              <input type="range" min="0" max="1" step="0.05" value={vipProbability} onChange={(e) => setVipProbability(Number(e.target.value))} className="w-full h-1 accent-amber-500 bg-slate-200 appearance-none rounded" />
                          </div>
                      )}

                      {/* Skill Based Routing */}
                      <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                          <span>Skill-Based Routing</span>
                          <input type="checkbox" checked={skillBasedRouting} onChange={(e) => setSkillBasedRouting(e.target.checked)} className="accent-indigo-500" />
                      </label>
                      {skillBasedRouting && (
                          <div className="pl-4 pt-2 space-y-2 animate-fade-in border-l-2 border-indigo-100 ml-1">
                              <h4 className="text-[10px] font-bold text-indigo-700 uppercase">Customer Needs</h4>
                              
                              {/* Sales Ratio */}
                              <div>
                                  <div className="flex justify-between text-[10px] text-slate-400">
                                      <span>Sales Need</span>
                                      <span className="font-mono">{((skillRatios[SkillType.SALES] || 0)*100).toFixed(0)}%</span>
                                  </div>
                                  <input 
                                      type="range" min="0" max="1" step="0.1" 
                                      value={skillRatios[SkillType.SALES]} 
                                      onChange={(e) => setSkillRatios({...skillRatios, [SkillType.SALES]: parseFloat(e.target.value)})} 
                                      className="w-full h-1 accent-emerald-500 bg-slate-200 appearance-none rounded" 
                                  />
                              </div>

                              {/* Tech Ratio */}
                              <div>
                                  <div className="flex justify-between text-[10px] text-slate-400">
                                      <span>Tech Support Need</span>
                                      <span className="font-mono">{((skillRatios[SkillType.TECH] || 0)*100).toFixed(0)}%</span>
                                  </div>
                                  <input 
                                      type="range" min="0" max="1" step="0.1" 
                                      value={skillRatios[SkillType.TECH]} 
                                      onChange={(e) => setSkillRatios({...skillRatios, [SkillType.TECH]: parseFloat(e.target.value)})} 
                                      className="w-full h-1 accent-blue-500 bg-slate-200 appearance-none rounded" 
                                  />
                              </div>

                              {/* Support Ratio */}
                              <div>
                                  <div className="flex justify-between text-[10px] text-slate-400">
                                      <span>General Support Need</span>
                                      <span className="font-mono">{((skillRatios[SkillType.SUPPORT] || 0)*100).toFixed(0)}%</span>
                                  </div>
                                  <input 
                                      type="range" min="0" max="1" step="0.1" 
                                      value={skillRatios[SkillType.SUPPORT]} 
                                      onChange={(e) => setSkillRatios({...skillRatios, [SkillType.SUPPORT]: parseFloat(e.target.value)})} 
                                      className="w-full h-1 accent-pink-500 bg-slate-200 appearance-none rounded" 
                                  />
                              </div>
                              <p className="text-[9px] text-slate-400 italic">Remaining % are "General" inquiries.</p>
                          </div>
                      )}

                      {/* Retrial / Orbit */}
                      <div>
                        <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                            <span>Retrial Logic (Orbit)</span>
                            <input type="checkbox" checked={retrialMode} onChange={(e) => setRetrialMode(e.target.checked)} className="accent-cyan-500" />
                        </label>
                        {retrialMode && (
                            <div className="pl-4 pt-2 space-y-2 animate-fade-in">
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-400">
                                        <span>Retry Delay (Avg)</span>
                                        <span className="font-mono">{avgRetrialDelay}m</span>
                                    </div>
                                    <input type="range" min="0.5" max="10" step="0.5" value={avgRetrialDelay} onChange={(e) => setAvgRetrialDelay(Number(e.target.value))} className="w-full h-1 accent-cyan-500 bg-slate-200 appearance-none rounded" />
                                </div>
                            </div>
                        )}
                      </div>

                      {/* State Dependent Service Rates */}
                      <div>
                        <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                            <span>State Dependent Rates (Panic Mode)</span>
                            <input type="checkbox" checked={stateDependentMode} onChange={(e) => setStateDependentMode(e.target.checked)} className="accent-orange-500" />
                        </label>
                        {stateDependentMode && (
                            <div className="pl-4 pt-2 space-y-2 animate-fade-in">
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-400">
                                        <span>Panic Threshold (Queue Size)</span>
                                        <span className="font-mono">{panicThreshold}</span>
                                    </div>
                                    <input type="range" min="1" max="50" value={panicThreshold} onChange={(e) => setPanicThreshold(Number(e.target.value))} className="w-full h-1 accent-orange-500 bg-slate-200 appearance-none rounded" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-400">
                                        <span>Efficiency Multiplier</span>
                                        <span className="font-mono">{panicEfficiencyMultiplier}x</span>
                                    </div>
                                    <input type="range" min="1.1" max="3.0" step="0.1" value={panicEfficiencyMultiplier} onChange={(e) => setPanicEfficiencyMultiplier(Number(e.target.value))} className="w-full h-1 accent-orange-500 bg-slate-200 appearance-none rounded" />
                                </div>
                            </div>
                        )}
                      </div>

                      {/* Impatience */}
                      <div>
                        <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                            <span>Impatience ({getImpatientLabel()})</span>
                            <input type="checkbox" checked={impatientMode} onChange={(e) => setImpatientMode(e.target.checked)} className="accent-red-500" />
                        </label>
                        {impatientMode && (
                            <div className="pl-4 pt-2 space-y-2 animate-fade-in">
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-400">
                                        <span>Balk Threshold (Queue Limit)</span>
                                        <span className="font-mono">{balkThreshold}</span>
                                    </div>
                                    <input type="range" min="1" max="20" value={balkThreshold} onChange={(e) => setBalkThreshold(Number(e.target.value))} className="w-full h-1 accent-red-500 bg-slate-200 appearance-none rounded" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-400">
                                        <span>Avg Patience (min)</span>
                                        <span className="font-mono">{avgPatienceTime}</span>
                                    </div>
                                    <input type="range" min="0.1" max="30" step="0.1" value={avgPatienceTime} onChange={(e) => setAvgPatienceTime(Number(e.target.value))} className="w-full h-1 accent-red-500 bg-slate-200 appearance-none rounded" />
                                </div>
                            </div>
                        )}
                      </div>

                      {/* Call Center specific SL Target */}
                      {environment === Environment.CALL_CENTER && (
                          <div className="pt-2 border-t border-slate-100">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Service Level Target (SLA)</label>
                              <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] text-slate-400">Time (T)</span>
                                  <div className="flex items-center w-2/3">
                                    <input type="range" min="5" max="120" step="5" value={slTargetSec} onChange={(e) => setSlTargetSec(Number(e.target.value))} className="flex-1 mr-2 accent-teal-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                                    <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{slTargetSec}s</span>
                                  </div>
                              </div>
                              <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-slate-400">Target %</span>
                                  <div className="flex items-center w-2/3">
                                    <input type="range" min="50" max="99" step="1" value={slTargetPercent} onChange={(e) => setSlTargetPercent(Number(e.target.value))} className="flex-1 mr-2 accent-teal-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                                    <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{slTargetPercent}%</span>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* Breakdowns */}
                      <div>
                        <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                            <span>{environment === Environment.CALL_CENTER ? 'System Outage' : 'Server Breakdowns'}</span>
                            <input type="checkbox" checked={breakdownMode} onChange={(e) => setBreakdownMode(e.target.checked)} className="accent-slate-700" />
                        </label>
                        {breakdownMode && (
                            <div className="pl-4 pt-2 space-y-2 animate-fade-in">
                                <div className="flex gap-2">
                                   <div className="flex-1">
                                      <label className="block text-[9px] text-slate-400 font-bold uppercase">MTBF (min)</label>
                                      <input type="number" min="10" value={mtbf} onChange={(e) => setMtbf(Number(e.target.value))} className="w-full p-1 border rounded text-xs text-center" />
                                   </div>
                                   <div className="flex-1">
                                      <label className="block text-[9px] text-slate-400 font-bold uppercase">MTTR (min)</label>
                                      <input type="number" min="1" value={mttr} onChange={(e) => setMttr(Number(e.target.value))} className="w-full p-1 border rounded text-xs text-center" />
                                   </div>
                                </div>
                            </div>
                        )}
                      </div>

                       {/* Topology */}
                       <div>
                        <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                            <span>Topology: Dedicated Queues</span>
                            <input 
                                type="checkbox" 
                                checked={queueTopology === QueueTopology.DEDICATED} 
                                onChange={(e) => setQueueTopology(e.target.checked ? QueueTopology.DEDICATED : QueueTopology.COMMON)} 
                                className="accent-blue-500" 
                                disabled={environment === Environment.MARKET} // Enforce default for market
                            />
                        </label>
                        {queueTopology === QueueTopology.DEDICATED && (
                             <div className="pl-4 pt-2 animate-fade-in">
                                <label className="flex items-center justify-between text-[10px] text-slate-500 cursor-pointer">
                                    <span>Enable Jockeying (Line Switching)</span>
                                    <input type="checkbox" checked={jockeyingEnabled} onChange={(e) => setJockeyingEnabled(e.target.checked)} className="accent-blue-400" />
                                </label>
                             </div>
                        )}
                       </div>
                  </div>
              </div>
            </div>
          </div>
          
          {/* Documentation Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-sm">
             <div className="flex border-b border-slate-100 mb-4">
                <button onClick={() => setInfoTab('model')} className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wide ${infoTab === 'model' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>Current Model</button>
                <button onClick={() => setInfoTab('features')} className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wide ${infoTab === 'features' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>Stats</button>
             </div>

             <div className="min-h-[150px]">
                 {infoTab === 'model' && (
                     <div className="space-y-3 animate-fade-in">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-mono font-bold text-slate-800">{modelNotation}</h3>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${theoretical?.isStable === false ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                {theoretical?.isStable === false ? 'Unstable' : 'Stable'}
                            </span>
                        </div>
                        {Object.values(documentationContent).slice(0, 3).map((item: {title: string; desc: string}, i) => ( // Show first 3 sections
                            <div key={i}>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase">{item.title}</h4>
                                <p className="text-xs text-slate-600">{item.desc}</p>
                            </div>
                        ))}
                        {theoretical?.isApproximate && (
                            <div className="mt-2 bg-amber-50 p-2 rounded border border-amber-100">
                                <p className="text-[10px] text-amber-700 font-medium">Note: {theoretical.approxNote}</p>
                            </div>
                        )}
                     </div>
                 )}
                 {infoTab === 'features' && theoretical && (
                     <div className="space-y-2 animate-fade-in">
                         <div className="flex justify-between text-xs">
                             <span className="text-slate-500">Traffic Intensity (ρ)</span>
                             <span className="font-mono font-bold">{theoretical.rho.toFixed(2)}</span>
                         </div>
                         <div className="flex justify-between text-xs">
                             <span className="text-slate-500">Prob(Empty) P₀</span>
                             <span className="font-mono font-bold">{theoretical.p0.toFixed(4)}</span>
                         </div>
                         <div className="flex justify-between text-xs">
                             <span className="text-slate-500">Avg Efficiency</span>
                             <span className="font-mono font-bold">{(efficiencyMode === 'MIXED' ? (seniorityRatio * 1.5 + (1-seniorityRatio)*0.7) : 1).toFixed(2)}x</span>
                         </div>
                     </div>
                 )}
             </div>
          </div>
        </section>

        {/* Center & Right: Simulation Visualization */}
        <div className="lg:col-span-3 space-y-6">
           {/* Top Stats Row */}
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricsCard 
                label="Wait Time (Wq)" 
                value={avgWaitSim} 
                unit="min" 
                icon="fa-regular fa-clock"
                subtext={`Theor: ${theoretical?.isStable ? (theoretical.wq * 60).toFixed(2) : '∞'}`}
              />
              <MetricsCard 
                label="Queue Length (Lq)" 
                value={currentTotalQueue} 
                unit={getCustomerName()} 
                icon="fa-solid fa-people-group"
                colorClass="text-purple-600"
                subtext={`Max: ${activeState.maxQueueLength}`}
              />
              {environment === Environment.CALL_CENTER ? (
                  <MetricsCard 
                    label="Service Level" 
                    value={serviceLevelPct} 
                    unit={`% < ${slTargetSec}s`}
                    icon="fa-solid fa-stopwatch"
                    colorClass={serviceLevelPct > 80 ? "text-teal-600" : "text-amber-600"}
                    subtext={`Throughput: ${activeState.customersServed}`}
                  />
              ) : (
                  <MetricsCard 
                    label="Throughput" 
                    value={activeState.customersServed} 
                    unit={getCustomerName()} 
                    icon="fa-solid fa-right-from-bracket"
                    colorClass="text-emerald-600"
                    subtext={`${((activeState.customersServed / (activeState.currentTime || 1)) * 60).toFixed(1)} /hr`}
                  />
              )}
              
              <MetricsCard 
                label="Clock" 
                value={currentClockTime} 
                icon="fa-regular fa-calendar"
                colorClass="text-slate-700"
                subtext={dayComplete ? "Closed" : "Open"}
              />
           </div>

           {/* Visualization Area */}
           <div className="rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[400px] flex flex-col bg-white">
              
              {/* SERVICE FLOOR CONTAINER */}
              <div className="flex-1 flex relative">
                  
                  {/* ARRIVAL ZONE (LEFT) */}
                  <div className="w-24 bg-slate-50 border-r border-slate-200 flex flex-col items-center justify-center relative shadow-inner z-10">
                      <div className="absolute inset-0 bg-slate-100/50"></div>
                      <div className="relative z-10 flex flex-col items-center opacity-50">
                          <i className="fa-solid fa-door-open text-4xl text-slate-400 mb-2"></i>
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 -rotate-90 mt-4 whitespace-nowrap">Entrance</span>
                      </div>
                      <div className="absolute bottom-0 w-full h-2 bg-emerald-500/20"></div>
                  </div>

                  {/* MAIN SERVICE FLOOR */}
                  <div className="flex-1 bg-grid-pattern relative flex flex-col">
                      
                      {/* --- OVERLAYS --- */}
                      
                      {/* Status Badge */}
                      <div className={`absolute top-4 left-4 z-10 backdrop-blur px-3 py-1 rounded-full text-xs font-bold border transition-colors duration-500 ${activeState.isPanic ? 'bg-orange-500/90 text-white border-orange-600 animate-pulse' : 'bg-white/80 text-slate-500 border-slate-200'}`}>
                          {activeState.isPanic ? (
                              <>
                                <i className="fa-solid fa-gauge-high mr-2 text-white"></i> HIGH PRESSURE
                              </>
                          ) : (
                              <>
                                <i className="fa-solid fa-video mr-2 text-blue-500"></i> Live Floor View
                              </>
                          )}
                      </div>

                      {/* Orbit Cloud Visualization */}
                      {!scrubbedSnapshot && activeState.orbit.length > 0 && (
                          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center animate-float">
                              <div className="bg-white/80 backdrop-blur border border-cyan-200 text-cyan-600 px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                                  <i className="fa-solid fa-cloud text-lg"></i>
                                  <div>
                                      <span className="text-[10px] font-bold uppercase block leading-none text-slate-400">Orbit (Retry)</span>
                                      <span className="text-xs font-bold">{activeState.orbit.length} Waiting</span>
                                  </div>
                              </div>
                              <div className="flex -space-x-1 mt-1 overflow-hidden max-w-[200px]">
                                  {activeState.orbit.slice(0, 8).map((c, i) => (
                                      <div key={c.id + '_orbit'} className={`w-3 h-3 rounded-full border border-white ${c.color}`}></div>
                                  ))}
                                  {activeState.orbit.length > 8 && <div className="w-3 h-3 rounded-full bg-slate-200 border border-white flex items-center justify-center text-[6px] text-slate-500">+</div>}
                              </div>
                          </div>
                      )}

                      {/* Scrubbing Indicator Banner */}
                      {scrubbedSnapshot && (
                          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-bounce">
                              <i className="fa-solid fa-clock-rotate-left"></i>
                              <div className="text-xs font-bold">
                                  SCRUBBING MODE: {currentClockTime}
                                  <span className="block text-[9px] font-normal opacity-90">Move mouse off chart to resume live view</span>
                              </div>
                          </div>
                      )}

                      {/* Speed Control Overlay (Only visible when not scrubbing) */}
                      {!scrubbedSnapshot && (
                          <div className="absolute top-4 right-4 z-10 w-32">
                             <label className="block text-[9px] font-bold text-slate-400 uppercase text-right mb-1">Sim Speed</label>
                             <input type="range" min="1" max="50" value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))} className="w-full h-1 accent-slate-600 bg-slate-200 rounded appearance-none" />
                          </div>
                      )}

                      {/* --- FLOOR CONTENT --- */}

                      {/* TOP HALF: SERVERS */}
                      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
                          <div className="flex justify-center flex-wrap w-full">
                              
                              {/* Dedicated Queue: Balked Customers Area */}
                              {queueTopology === QueueTopology.DEDICATED && activeState.recentlyBalked.length > 0 && !scrubbedSnapshot && (
                                  <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-red-100/80 px-4 py-2 rounded-full border border-red-200 flex items-center gap-2 z-20">
                                      <span className="text-[10px] font-bold text-red-500 uppercase">Rejected Entry</span>
                                      <div className="flex -space-x-2">
                                          {activeState.recentlyBalked.map(c => (
                                              <div key={c.id} className="w-6 h-6 rounded-full bg-red-500 border-2 border-white flex items-center justify-center text-[10px] text-white animate-balk">
                                                  <i className="fa-solid fa-xmark"></i>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              )}

                              {activeState.servers.map((server) => {
                                  // Server Profile Card Logic
                                  const uptime = activeState.currentTime - server.startTime;
                                  const utilizationPct = uptime > 0 ? (server.totalBusyTime / uptime) * 100 : 0;
                                  const isPanic = activeState.isPanic;
                                  const isEditing = editingServerId === server.id;

                                  // Dynamic Styles based on State
                                  let cardBg = "bg-white";
                                  let cardBorder = "border-slate-200";
                                  if (server.state === ServerState.BUSY) {
                                      if (isPanic) {
                                          cardBg = "bg-orange-50";
                                          cardBorder = "border-orange-300";
                                      } else {
                                          cardBg = "bg-emerald-50";
                                          cardBorder = "border-emerald-200";
                                      }
                                  } else if (server.state === ServerState.OFFLINE) {
                                      cardBg = "bg-red-50 bg-striped";
                                      cardBorder = "border-red-200";
                                  }

                                  // Seniority Styles
                                  let badgeColor = "text-slate-400 border-slate-300 bg-slate-100";
                                  let badgeIcon = "fa-user";
                                  if (server.typeLabel === 'Senior') {
                                      badgeColor = "text-yellow-600 border-yellow-300 bg-yellow-50";
                                      badgeIcon = "fa-star";
                                  } else if (server.typeLabel === 'Junior') {
                                      badgeColor = "text-amber-700 border-amber-400 bg-amber-100";
                                      badgeIcon = "fa-graduation-cap"; 
                                  }

                                  return (
                                  <div key={server.id} className="flex flex-col items-center relative group mx-2 mb-4">
                                      {/* Batch / Multi-Customer indicator - Absolute over Card */}
                                      {server._activeBatch && server._activeBatch.length > 1 && (
                                          <div className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[9px] font-bold w-5 h-5 flex items-center justify-center rounded-full z-20 border-2 border-white">
                                              {server._activeBatch.length}
                                          </div>
                                      )}

                                      {/* Breakdown Indicator */}
                                      {server.state === ServerState.OFFLINE && (
                                          <div className="absolute -top-4 z-20 text-red-500 animate-bounce">
                                              <i className="fa-solid fa-triangle-exclamation text-xl"></i>
                                          </div>
                                      )}
                                      
                                      {/* Departing Customers (Animation Layer) - MOVING TO EXIT */}
                                      {!scrubbedSnapshot && activeState.recentlyDeparted.filter(c => c.serverId === server.id).map(c => (
                                           <div 
                                              key={`depart-${c.id}`} 
                                              className={`absolute top-4 w-4 h-4 rounded-full shadow-sm z-30 animate-walk-out ${c.color} flex items-center justify-center text-[10px] text-white/80`}
                                              style={{ left: '50%', marginLeft: '-0.5rem' }} 
                                           >
                                              {environment === Environment.CALL_CENTER && <i className="fa-solid fa-phone"></i>}
                                           </div>
                                      ))}

                                      {/* SERVER PROFILE CARD */}
                                      <div className={`w-20 h-28 rounded-xl border-2 transition-all duration-300 relative flex flex-col items-center justify-between p-2 shadow-sm ${cardBg} ${cardBorder}`}>

                                          {/* EDIT MODE OVERLAY */}
                                          {isEditing ? (
                                              <div className="absolute inset-0 bg-white z-50 rounded-lg flex flex-col p-1 animate-fade-in">
                                                  <div className="flex justify-between items-center mb-1 pb-1 border-b">
                                                      <span className="text-[8px] font-bold uppercase">Skills</span>
                                                      <button onClick={() => setEditingServerId(null)} className="text-green-600 hover:bg-green-50 rounded px-1">
                                                          <i className="fa-solid fa-check text-[10px]"></i>
                                                      </button>
                                                  </div>
                                                  <div className="flex-1 overflow-y-auto space-y-1">
                                                      {[SkillType.SALES, SkillType.TECH, SkillType.SUPPORT].map(skill => (
                                                          <button 
                                                              key={skill}
                                                              onClick={() => handleToggleServerSkill(server.id, skill)}
                                                              className={`w-full text-[8px] font-bold py-1 rounded flex items-center gap-1 px-1 ${server.skills.includes(skill) ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-400'}`}
                                                          >
                                                              <div className={`w-1.5 h-1.5 rounded-full ${server.skills.includes(skill) ? getSkillColor(skill) : 'bg-slate-300'}`}></div>
                                                              {skill}
                                                          </button>
                                                      ))}
                                                  </div>
                                              </div>
                                          ) : (
                                            <>
                                              {/* Header: Badge & Settings */}
                                              <div className="w-full flex justify-between items-center z-10">
                                                  {/* Seniority Badge */}
                                                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] ${badgeColor}`} title={server.typeLabel}>
                                                      <i className={`fa-solid ${badgeIcon}`}></i>
                                                  </div>
                                                  
                                                  {/* Settings Gear (Visible on Hover/Touch if Skill Routing is On) */}
                                                  {skillBasedRouting && (
                                                      <button 
                                                          onClick={() => setEditingServerId(server.id)}
                                                          className="text-slate-300 hover:text-slate-600 transition-colors"
                                                      >
                                                          <i className="fa-solid fa-gear text-[10px]"></i>
                                                      </button>
                                                  )}
                                              </div>

                                              {/* Avatar (Center) */}
                                              <div className={`text-3xl z-10 transition-colors ${server.state === ServerState.OFFLINE ? 'opacity-20' : (server.state === ServerState.BUSY ? 'text-slate-700' : 'text-slate-300')}`}>
                                                  {environment === Environment.CALL_CENTER && <i className="fa-solid fa-headset"></i>}
                                                  {environment === Environment.MARKET && <i className="fa-solid fa-cart-shopping"></i>}
                                                  {environment === Environment.BANK && <i className="fa-solid fa-user-tie"></i>}
                                              </div>

                                              {/* Active Customer Overlay (if busy) */}
                                              {server.state === ServerState.BUSY && server._activeCustomer && (
                                                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-2 z-20">
                                                      <div className={`w-6 h-6 rounded-full shadow-md border-2 border-white flex items-center justify-center text-[10px] text-white ${server._activeCustomer.color} animate-pop-in`}>
                                                          {skillBasedRouting ? (
                                                                <i className={`fa-solid ${getSkillIcon(server._activeCustomer.requiredSkill)}`}></i>
                                                            ) : (
                                                                environment === Environment.CALL_CENTER ? <i className="fa-solid fa-phone"></i> : <i className="fa-solid fa-user"></i>
                                                            )}
                                                      </div>
                                                  </div>
                                              )}

                                              {/* Footer: Skills & Load */}
                                              <div className="w-full flex flex-col gap-1 items-center z-10">
                                                  {/* Skills Row */}
                                                  {skillBasedRouting && (
                                                      <div className="flex gap-0.5 justify-center flex-wrap">
                                                          {server.skills.map((skill, i) => (
                                                              <div key={i} className={`w-1.5 h-1.5 rounded-full ${getSkillColor(skill)}`} title={skill}></div>
                                                          ))}
                                                      </div>
                                                  )}

                                                  {/* Stress/Load Bar */}
                                                  <div className="w-full h-1.5 bg-slate-200/50 rounded-full overflow-hidden mt-1 relative border border-black/5">
                                                      {isPanic ? (
                                                          <div className="h-full bg-red-500 animate-pulse w-full"></div>
                                                      ) : (
                                                          <div className="h-full bg-emerald-400 transition-all duration-500" style={{width: `${utilizationPct}%`}}></div>
                                                      )}
                                                  </div>
                                              </div>
                                            </>
                                          )}
                                      </div>

                                      {/* State Label */}
                                      <div className={`mt-1 text-[9px] font-bold uppercase tracking-wider ${
                                          server.state === ServerState.BUSY ? (activeState.isPanic ? 'text-orange-600' : 'text-emerald-600') : 
                                          server.state === ServerState.OFFLINE ? 'text-red-400' : 'text-slate-300'
                                      }`}>
                                          {server.state}
                                      </div>

                                      {/* Dedicated Queue (Vertical) */}
                                      {queueTopology === QueueTopology.DEDICATED && (
                                          <div className="mt-1 flex flex-col gap-1 items-center min-h-[40px]">
                                              {server.queue.map((c, i) => (
                                                  <div key={c.id} className={`w-3 h-3 rounded-full shadow-sm transition-all flex items-center justify-center text-[6px] text-white ${c.color} ${!scrubbedSnapshot ? 'animate-walk-in' : ''} ${i === 0 && !scrubbedSnapshot ? 'animate-pulse' : ''} relative group`}>
                                                      {skillBasedRouting && <i className={`fa-solid ${getSkillIcon(c.requiredSkill)}`}></i>}
                                                      
                                                      {/* EWT Badge for last in line */}
                                                      {i === server.queue.length - 1 && c.estimatedWaitTime !== undefined && c.estimatedWaitTime > 0 && !scrubbedSnapshot && (
                                                          <div className="absolute -right-16 top-0 bg-slate-800 text-white text-[9px] px-2 py-0.5 rounded shadow-lg animate-pop-in z-20 whitespace-nowrap">
                                                              Est: {c.estimatedWaitTime.toFixed(1)}m
                                                              <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-y-4 border-y-transparent border-r-4 border-r-slate-800"></div>
                                                          </div>
                                                      )}
                                                  </div>
                                              ))}
                                              {server.queue.length > 0 && <span className="text-[9px] text-slate-400 mt-1 font-mono">{server.queue.length}</span>}
                                          </div>
                                      )}
                                  </div>
                              )})}
                    </div>
                  </div>

                  {/* BOTTOM HALF: QUEUE (WAITING AREA) */}
                  <div className="min-h-[120px] bg-slate-50/50 border-t border-dashed border-slate-200 p-4 flex flex-col justify-end items-center relative">
                      <div className="absolute top-2 left-4 text-[9px] font-bold text-slate-300 uppercase">Waiting Area</div>

                      {/* Common Queue (Horizontal/Snake) */}
                      {queueTopology === QueueTopology.COMMON && (
                          <div className="w-full max-w-2xl">
                              <div className="flex flex-wrap gap-2 justify-center items-center p-2 relative">
                                  {/* Empty State */}
                                  {activeState.queue.length === 0 && activeState.recentlyBalked.length === 0 && (
                                      <span className="text-xs text-slate-300 font-bold uppercase tracking-widest">Queue Empty</span>
                                  )}
                                  
                                  {/* Balked Customers (Common Queue) */}
                                  {!scrubbedSnapshot && activeState.recentlyBalked.map(c => (
                                      <div 
                                          key={c.id}
                                          className={`w-4 h-4 rounded-full shadow-sm flex items-center justify-center text-[10px] text-white bg-red-500 animate-balk`}
                                          title="Left immediately"
                                      >
                                          <i className="fa-solid fa-xmark"></i>
                                      </div>
                                  ))}

                                  {/* Queued Customers */}
                                  {activeState.queue.slice(0, 40).map((customer, idx) => (
                                      <div 
                                        key={customer.id} 
                                        className={`relative w-4 h-4 rounded-full shadow-sm transition-all duration-500 flex items-center justify-center text-[8px] text-white/90 ${customer.color} ${!scrubbedSnapshot ? 'animate-walk-in' : ''} ${idx === 0 && !scrubbedSnapshot ? 'animate-pulse' : ''}`}
                                        title={`Arrived: ${formatTime(openHour + customer.arrivalTime/60)}`}
                                      >
                                          {skillBasedRouting ? (
                                              <i className={`fa-solid ${getSkillIcon(customer.requiredSkill)} text-[6px]`}></i>
                                          ) : (
                                              environment === Environment.CALL_CENTER && <i className="fa-solid fa-phone"></i>
                                          )}

                                          {/* EWT Badge for last in line */}
                                          {idx === activeState.queue.length - 1 && customer.estimatedWaitTime !== undefined && customer.estimatedWaitTime > 0 && !scrubbedSnapshot && (
                                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-2 py-0.5 rounded shadow-lg animate-pop-in z-20 whitespace-nowrap">
                                                  Est: {customer.estimatedWaitTime.toFixed(1)}m
                                                  <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-full border-x-4 border-x-transparent border-t-4 border-t-slate-800"></div>
                                              </div>
                                          )}
                                      </div>
                                  ))}
                                  {activeState.queue.length > 40 && (
                                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-500 font-bold">
                                          +{activeState.queue.length - 40}
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}

                      {/* Customer Legend */}
                      <div className="absolute bottom-2 right-4 flex gap-4 text-[10px] text-slate-500">
                          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Normal</div>
                          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-amber-400 border border-amber-500"></div> VIP</div>
                          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-rose-500 border border-rose-600"></div> Impatient</div>
                      </div>

                      {/* Impatience Indicator */}
                      {activeState.customersImpatient > 0 && (
                          <div className="absolute bottom-2 left-4 text-xs text-red-400 font-bold flex items-center gap-2">
                              <i className="fa-solid fa-person-walking-arrow-right"></i>
                              <span>{activeState.customersImpatient} {getImpatientLabel()} ({impatientPercent.toFixed(1)}%)</span>
                          </div>
                      )}
                  </div>
              </div>

              {/* DEPARTURE ZONE (RIGHT) */}
              <div className="w-24 bg-slate-50 border-l border-slate-200 flex flex-col items-center justify-center relative shadow-inner z-10">
                  <div className="absolute inset-0 bg-slate-100/50"></div>
                  <div className="relative z-10 flex flex-col items-center opacity-50">
                      <i className="fa-solid fa-person-walking-arrow-right text-4xl text-slate-400 mb-2"></i>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 rotate-90 mt-4 whitespace-nowrap">Exit</span>
                  </div>
                  <div className="absolute bottom-0 w-full h-2 bg-red-500/20"></div>
              </div>

              </div>
           </div>

           {/* Graphs Section */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Scenario Legend */}
              {savedScenarios.length > 0 && (
                <div className="md:col-span-2 bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase mr-2">Scenarios:</span>
                    {savedScenarios.map(scen => (
                        <div key={scen.id} className="flex items-center gap-2 px-2 py-1 rounded bg-slate-50 border border-slate-200">
                             <input type="checkbox" checked={scen.visible} onChange={() => toggleScenario(scen.id)} className="accent-slate-500" />
                             <span className="w-2 h-2 rounded-full" style={{backgroundColor: scen.color}}></span>
                             <span className="text-[10px] font-bold text-slate-600">{scen.name}</span>
                             <button onClick={() => deleteScenario(scen.id)} className="text-slate-400 hover:text-red-500 ml-1"><i className="fa-solid fa-times"></i></button>
                        </div>
                    ))}
                </div>
              )}

              {/* Wait Time Chart */}
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 h-[300px]">
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Wait Time Convergence (Wq)</h3>
                  <ResponsiveContainer width="100%" height="90%">
                      <ComposedChart 
                          data={chartData}
                          onMouseMove={handleChartHover}
                          onMouseLeave={handleChartLeave}
                      >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="time" tickFormatter={xAxisFormatter} tick={{fontSize: 10}} stroke="#cbd5e1" />
                          <YAxis tick={{fontSize: 10}} stroke="#cbd5e1" label={{ value: 'min', angle: -90, position: 'insideLeft', fontSize: 10 }}/>
                          <Tooltip 
                            contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                            labelFormatter={xAxisFormatter}
                          />
                          <Legend wrapperStyle={{fontSize: '10px'}} />
                          
                          {/* Saved Scenarios Wq */}
                          {savedScenarios.map(scen => scen.visible && (
                             <Line key={scen.id} type="monotone" dataKey={`scenario_${scen.id}_wq`} stroke={scen.color} strokeDasharray="3 3" strokeWidth={2} dot={false} name={`[Saved] ${scen.name}`} isAnimationActive={false} />
                          ))}

                          {/* Theoretical Reference */}
                          {!useDynamicMode && <Line type="monotone" dataKey="wqTheor" stroke="#94a3b8" strokeDasharray="5 5" name="Theoretical" dot={false} strokeWidth={2} />}
                          
                          {/* Actual Data */}
                          <Line type="monotone" dataKey="wq" stroke="#3b82f6" strokeWidth={2} dot={false} name="Actual Avg" isAnimationActive={false} />
                          
                          {/* Confidence Interval Area */}
                          <Area type="monotone" dataKey="wqUpper" fill="#3b82f6" stroke="none" fillOpacity={0.1} />
                          <Area type="monotone" dataKey="wqLower" fill="#3b82f6" stroke="none" fillOpacity={0.1} />
                      </ComposedChart>
                  </ResponsiveContainer>
              </div>

              {/* Queue Length Chart (Comparison) */}
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 h-[300px]">
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Queue Length Dynamics (Lq)</h3>
                  <ResponsiveContainer width="100%" height="90%">
                      <ComposedChart 
                          data={chartData}
                          onMouseMove={handleChartHover}
                          onMouseLeave={handleChartLeave}
                      >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="time" tickFormatter={xAxisFormatter} tick={{fontSize: 10}} stroke="#cbd5e1" />
                          <YAxis tick={{fontSize: 10}} stroke="#cbd5e1" label={{ value: 'cust', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                          <Tooltip labelFormatter={xAxisFormatter} />
                          <Legend wrapperStyle={{fontSize: '10px'}} />

                          {/* Saved Scenarios Lq */}
                          {savedScenarios.map(scen => scen.visible && (
                             <Line key={scen.id} type="monotone" dataKey={`scenario_${scen.id}_lq`} stroke={scen.color} strokeDasharray="3 3" strokeWidth={2} dot={false} name={`[Saved] ${scen.name}`} isAnimationActive={false} />
                          ))}

                          <Line type="monotone" dataKey="lqActual" stroke="#10b981" strokeWidth={2} dot={false} name="Actual Lq" isAnimationActive={false} />
                          {!useDynamicMode && <Line type="monotone" dataKey="lqTheor" stroke="#94a3b8" strokeDasharray="5 5" name="Theoretical" dot={false} strokeWidth={2} />}

                      </ComposedChart>
                  </ResponsiveContainer>
              </div>
           </div>
           
           {/* Sensitivity Analysis Lab (Replaces Cost Optimization) */}
           {!useDynamicMode && (
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                   <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                       <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
                           <i className="fa-solid fa-flask text-purple-600"></i> Sensitivity Analysis Lab
                       </h3>
                       
                       <div className="flex flex-wrap gap-4 p-2 bg-slate-50 rounded-lg border border-slate-100">
                           {/* X-Axis Control */}
                           <div>
                               <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Vary Parameter (X-Axis)</label>
                               <select 
                                   value={sensParam} 
                                   onChange={(e) => setSensParam(e.target.value as any)} 
                                   className="text-xs border rounded p-1 bg-white outline-none focus:ring-1 focus:ring-purple-400"
                               >
                                   <option value="serverCount">Server Count (s)</option>
                                   <option value="lambda">Arrival Rate (λ)</option>
                                   <option value="avgServiceTime">Avg Service Time</option>
                               </select>
                           </div>

                           {/* Range Control */}
                           <div>
                               <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Range</label>
                               <div className="flex items-center gap-1">
                                   <input type="number" value={sensRange[0]} onChange={(e) => setSensRange([Number(e.target.value), sensRange[1]])} className="w-12 text-xs border rounded p-1 text-center" />
                                   <span className="text-slate-400">-</span>
                                   <input type="number" value={sensRange[1]} onChange={(e) => setSensRange([sensRange[0], Number(e.target.value)])} className="w-12 text-xs border rounded p-1 text-center" />
                               </div>
                           </div>

                           {/* Y-Axis Control */}
                           <div>
                               <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Observe Metric (Y-Axis)</label>
                               <select 
                                   value={sensMetric} 
                                   onChange={(e) => setSensMetric(e.target.value as any)} 
                                   className="text-xs border rounded p-1 bg-white outline-none focus:ring-1 focus:ring-purple-400"
                               >
                                   <option value="totalCost">Total Cost ($)</option>
                                   <option value="wq">Wait Time (Wq)</option>
                                   <option value="rho">Utilization (ρ)</option>
                               </select>
                           </div>
                       </div>
                   </div>

                   <div className="h-[250px]">
                       <ResponsiveContainer width="100%" height="100%">
                           <LineChart data={sensitivityData}>
                               <CartesianGrid strokeDasharray="3 3" vertical={false} />
                               <XAxis 
                                   dataKey="xValue" 
                                   type="number"
                                   domain={['auto', 'auto']}
                                   label={{ value: sensParam === 'serverCount' ? 'Servers (s)' : (sensParam === 'lambda' ? 'Arrival Rate (λ)' : 'Avg Service Time (min)'), position: 'insideBottom', offset: -5, fontSize: 10 }} 
                               />
                               <YAxis 
                                   label={{ value: sensMetric === 'totalCost' ? 'Cost ($)' : (sensMetric === 'wq' ? 'Minutes' : 'Utilization %'), angle: -90, position: 'insideLeft', fontSize: 10 }} 
                               />
                               <Tooltip 
                                   contentStyle={{fontSize: '11px'}}
                                   formatter={(value: number) => [value.toFixed(2), sensMetric]}
                                   labelFormatter={(label) => `${sensParam}: ${label}`}
                               />
                               <Legend wrapperStyle={{fontSize: '10px'}} />
                               
                               <Line 
                                   type="monotone" 
                                   dataKey={sensMetric} 
                                   stroke="#8b5cf6" 
                                   strokeWidth={3} 
                                   dot={{r: 3}} 
                                   name={sensMetric === 'totalCost' ? 'Total Cost' : (sensMetric === 'wq' ? 'Wait Time' : 'Utilization')} 
                               />
                               
                               {/* Critical Threshold Line for Utilization */}
                               {sensMetric === 'rho' && (
                                   <ReferenceLine y={1} stroke="red" strokeDasharray="3 3" label="Unstable" />
                               )}
                           </LineChart>
                       </ResponsiveContainer>
                   </div>
                   <div className="mt-2 text-center">
                        <p className="text-[10px] text-slate-400">
                            Analyzing sensitivity of <span className="font-bold text-slate-600">{sensMetric}</span> to changes in <span className="font-bold text-slate-600">{sensParam}</span>.
                            Values where ρ ≥ 1 are considered unstable.
                        </p>
                   </div>
               </div>
           )}

        </div>
      </div>
    </div>
  );
};
