
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
    SkillType,
    Customer,
    SimulationEventType,
    SimulationEvent,
    FloatingEffect,
    SimulationUIConfig
} from './types';
import { SimulationEngine } from './SimulationEngine';
import MetricsCard from './components/MetricsCard';
import { ConfigPanel } from './components/ConfigPanel';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import NetworkSimulator from './components/NetworkSimulator';
import DataLab from './components/DataLab';
import { ServiceFloor } from './components/ServiceFloor';
import { useSimulation } from './hooks/useSimulation';

// Destructure hooks from default export to ensure runtime safety in ESM environments
const { useState, useEffect, useRef, useCallback, useMemo } = React;

/**
 * UI Constants
 */
const SCENARIO_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];

const DEFAULT_UI_CONFIG: SimulationUIConfig = {
    environment: Environment.BANK,
    selectedModel: QueueModel.MMS,
    arrivalType: DistributionType.POISSON,
    erlangK: 2,
    lambdaInput: 10,
    vipProbability: 0,
    traceData: [],
    useDynamicMode: false,
    arrivalSchedule: Array.from({length: 24}, (_, i) => {
        if (i >= 11 && i <= 13) return 25;
        if (i >= 9 && i <= 17) return 15;
        return 2;
    }),
    serverSchedule: Array.from({length: 24}, (_, i) => {
        if (i >= 9 && i <= 16) return 3;
        if (i >= 8 && i <= 18) return 1;
        return 1;
    }),
    impatientMode: false,
    balkThreshold: 5,
    avgPatienceTime: 5,
    efficiencyMode: 'UNIFORM',
    seniorityRatio: 0.5,
    serverSelectionStrategy: ServerSelectionStrategy.RANDOM,
    skillBasedRouting: false,
    skillRatios: {
        [SkillType.SALES]: 0.2,
        [SkillType.TECH]: 0.2,
        [SkillType.SUPPORT]: 0.2
    },
    retrialMode: false,
    avgRetrialDelay: 2,
    stateDependentMode: false,
    panicThreshold: 10,
    panicEfficiencyMultiplier: 1.5,
    variableWorkloadMode: false,
    minWorkloadItems: 1,
    maxWorkloadItems: 5,
    breakdownMode: false,
    mtbf: 60,
    mttr: 10,
    queueTopology: QueueTopology.COMMON,
    jockeyingEnabled: true,
    bulkArrivalMode: false,
    minGroupSize: 2,
    maxGroupSize: 6,
    batchServiceMode: false,
    maxBatchSize: 4,
    serviceType: DistributionType.POISSON,
    erlangServiceK: 2,
    serviceTimeInput: 15,
    slTargetSec: 20,
    slTargetPercent: 80,
    serverCountInput: 3,
    capacityK: 10,
    populationSize: 50,
    openHour: 9,
    closeHour: 17,
    costPerServer: 20,
    costPerWait: 50,
    sensParam: 'serverCount',
    sensMetric: 'totalCost',
    sensRange: [1, 20]
};

/**
 * Main Application Component.
 * Orchestrates the Queueing Simulator, Theoretical Calculations, and UI Rendering.
 */
export const App: React.FC = () => {
  // --- GLOBAL MODE STATE ---
  const [appMode, setAppMode] = useState<string>('SINGLE');

  // --- CONFIGURATION STATE ---
  const [uiConfig, setUiConfig] = useState<SimulationUIConfig>(DEFAULT_UI_CONFIG);

  // Runtime Controls (Not Model Config)
  const [editingServerId, setEditingServerId] = useState<number | null>(null);

  // --- DERIVED STATE ---
  const [theoretical, setTheoretical] = useState<TheoreticalMetrics | null>(null);

  // --- SCENARIO STATE ---
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);

  // --- INTERACTION STATE ---
  const [scrubbedSnapshot, setScrubbedSnapshot] = useState<SimulationState | null>(null);

  // Helper to update config bulk
  const updateConfigBulk = (updates: Partial<SimulationUIConfig>) => {
      setUiConfig(prev => ({ ...prev, ...updates }));
  };

  /**
   * Auto-Staffing Logic (Erlang-C Calculator)
   */
  const handleAutoStaff = () => {
      const mu = 60 / uiConfig.serviceTimeInput; 
      const targetPercent = uiConfig.slTargetPercent / 100;
      
      const newSchedule = uiConfig.arrivalSchedule.map(lambda => {
          if (lambda === 0) return 0;
          const req = calculateRequiredServers(lambda, mu, uiConfig.slTargetSec / 60, targetPercent);
          return Math.min(50, req);
      });
      
      updateConfigBulk({ serverSchedule: newSchedule });
  };

  // Helper to create config object for engine
  const getSimConfig = useCallback((): SimulationConfig => ({
      model: uiConfig.selectedModel,
      lambda: uiConfig.lambdaInput,
      avgServiceTime: uiConfig.serviceTimeInput,
      serverCount: uiConfig.serverCountInput,
      capacity: uiConfig.capacityK,
      populationSize: uiConfig.populationSize,
      arrivalType: uiConfig.arrivalType,
      arrivalK: uiConfig.erlangK,
      serviceType: uiConfig.serviceType,
      serviceK: uiConfig.erlangServiceK,
      openHour: uiConfig.openHour,
      closeHour: uiConfig.closeHour,
      vipProbability: uiConfig.vipProbability,
      impatientMode: uiConfig.impatientMode,
      balkThreshold: uiConfig.balkThreshold,
      avgPatienceTime: uiConfig.avgPatienceTime,
      useDynamicMode: uiConfig.useDynamicMode,
      arrivalSchedule: uiConfig.arrivalSchedule,
      serverSchedule: uiConfig.serverSchedule,
      efficiencyMode: uiConfig.efficiencyMode,
      seniorityRatio: uiConfig.seniorityRatio,
      serverSelectionStrategy: uiConfig.serverSelectionStrategy,
      breakdownMode: uiConfig.breakdownMode,
      mtbf: uiConfig.mtbf,
      mttr: uiConfig.mttr,
      queueTopology: uiConfig.queueTopology,
      jockeyingEnabled: uiConfig.jockeyingEnabled,
      bulkArrivalMode: uiConfig.bulkArrivalMode,
      minGroupSize: uiConfig.minGroupSize,
      maxGroupSize: uiConfig.maxGroupSize,
      batchServiceMode: uiConfig.batchServiceMode,
      maxBatchSize: uiConfig.maxBatchSize,
      traceData: uiConfig.traceData,
      slTarget: uiConfig.slTargetSec / 60,
      stateDependentMode: uiConfig.stateDependentMode,
      panicThreshold: uiConfig.panicThreshold,
      panicEfficiencyMultiplier: uiConfig.panicEfficiencyMultiplier,
      skillBasedRouting: uiConfig.skillBasedRouting,
      skillRatios: uiConfig.skillRatios as any,
      retrialMode: uiConfig.retrialMode,
      avgRetrialDelay: uiConfig.avgRetrialDelay,
      variableWorkloadMode: uiConfig.variableWorkloadMode,
      minWorkloadItems: uiConfig.minWorkloadItems,
      maxWorkloadItems: uiConfig.maxWorkloadItems
  }), [uiConfig]);

  // --- USE SIMULATION HOOK ---
  const { simState, floatingEffects, controls, status } = useSimulation(getSimConfig());

  // Reset scrubbed snapshot when simulation resets or updates
  useEffect(() => {
      if (simState) setScrubbedSnapshot(null);
  }, [simState?.currentTime]);

  /**
   * Scenario Snapshot Logic
   */
  const handleSnapshot = () => {
    if (!simState) return;
    const count = savedScenarios.length;
    const color = SCENARIO_COLORS[count % SCENARIO_COLORS.length];
    
    let name = `${uiConfig.selectedModel}`;
    if (uiConfig.useDynamicMode) {
        name += ` (Dynamic)`;
    } else {
        name += ` (s=${uiConfig.serverCountInput}, λ=${uiConfig.lambdaInput})`;
    }
    
    const newScenario: SavedScenario = {
        id: Date.now().toString(),
        name,
        history: JSON.parse(JSON.stringify(simState.history)),
        color,
        visible: true
    };
    setSavedScenarios([...savedScenarios, newScenario]);
  };

  /**
   * Report Export Logic
   */
  const handleExportReport = () => {
    if (!simState) return;
    
    const ts = new Date().toISOString().slice(0, 19).replace('T', '_');

    const avgWq = simState.statsWq.count > 0 ? simState.statsWq.sum / simState.statsWq.count : 0;
    const avgSys = simState.statsW.count > 0 ? simState.statsW.sum / simState.statsW.count : 0;
    
    const summaryData = [{
        simulationTime: simState.currentTime,
        totalArrivals: simState.customersArrivals,
        totalServed: simState.customersServed,
        totalReneged: simState.customersImpatient,
        avgWaitTime: avgWq,
        avgSystemTime: avgSys,
        model: uiConfig.selectedModel,
        lambda: uiConfig.lambdaInput,
        servers: uiConfig.serverCountInput,
        timestamp: ts
    }];
    const summaryCSV = generateCSV(summaryData, Object.keys(summaryData[0]));
    downloadCSV(summaryCSV, `queue_summary_${ts}.csv`);

    const logs = simState.completedCustomers;
    if (logs.length > 0) {
        const logCSV = generateCSV(logs, ['id', 'arrivalTime', 'startTime', 'finishTime', 'waitTime', 'serviceTime', 'serverId', 'type', 'requiredSkill', 'estimatedWaitTime', 'workloadItems']);
        downloadCSV(logCSV, `queue_logs_${ts}.csv`);
    } else {
        alert("No completed customers to export yet.");
    }
  };

  /**
   * Server Skill Toggling (Restored)
   */
  const handleToggleServerSkill = (serverId: number, skill: SkillType) => {
      const activeState = displayState || simState;
      if (!activeState) return;

      const server = activeState.servers.find(s => s.id === serverId);
      if (!server) return;
      
      let newSkills = [...server.skills];
      if (newSkills.includes(skill)) {
          // Remove skill
          newSkills = newSkills.filter(s => s !== skill);
      } else {
          // Add skill
          newSkills.push(skill);
      }
      
      // Ensure there is at least one skill or default to GENERAL?
      // For now, allow empty (which effectively disables server) or enforce GENERAL if empty
      if (newSkills.length === 0) newSkills = [SkillType.GENERAL];
      
      controls.updateServerSkills(serverId, newSkills);
  };

  /**
   * Effect: Handle Input Changes (Theoreticals)
   */
  useEffect(() => {
    let mu = 60 / uiConfig.serviceTimeInput;
    let customCs2: number | undefined = undefined;

    if (uiConfig.variableWorkloadMode) {
        const minN = uiConfig.minWorkloadItems || 1;
        const maxN = uiConfig.maxWorkloadItems || 1;
        const meanN = (minN + maxN) / 2;
        const varN = (Math.pow(maxN - minN + 1, 2) - 1) / 12;
        const meanS = uiConfig.serviceTimeInput;
        let varS = 0;
        
        if (uiConfig.serviceType === DistributionType.DETERMINISTIC) varS = 0;
        else if (uiConfig.serviceType === DistributionType.ERLANG) varS = (meanS * meanS) / uiConfig.erlangServiceK;
        else varS = meanS * meanS;

        const meanT = meanN * meanS;
        const varT = meanN * varS + (meanS * meanS) * varN;
        mu = 60 / meanT;
        customCs2 = varT / (meanT * meanT);
    }

    const avgEff = uiConfig.efficiencyMode === 'MIXED' ? (uiConfig.seniorityRatio * 1.5) + ((1 - uiConfig.seniorityRatio) * 0.7) : 1.0;

    const metrics = calculateTheoreticalMetrics(
      uiConfig.lambdaInput, mu, uiConfig.serverCountInput, uiConfig.selectedModel, uiConfig.capacityK, uiConfig.populationSize,
      uiConfig.arrivalType, uiConfig.erlangK, uiConfig.serviceType, uiConfig.erlangServiceK, avgEff, 
      uiConfig.breakdownMode, uiConfig.mtbf, uiConfig.mttr,
      customCs2
    );
    setTheoretical(metrics);
  }, [uiConfig]);

  // Sensitivity Analysis Data Calculation
  const sensitivityData = useMemo(() => {
    const config = getSimConfig();
    const step = uiConfig.sensParam === 'serverCount' ? 1 : (uiConfig.sensParam === 'avgServiceTime' ? 0.5 : 2);
    
    let actualRange = uiConfig.sensRange;
    if (uiConfig.sensParam === 'serverCount' && actualRange[1] > 50) actualRange = [1, 20];
    if (uiConfig.sensParam === 'avgServiceTime' && actualRange[1] > 60) actualRange = [1, 60];
    
    return calculateSensitivity(
        config,
        uiConfig.sensParam,
        actualRange,
        step,
        uiConfig.costPerServer,
        uiConfig.costPerWait
    );
  }, [getSimConfig, uiConfig.sensParam, uiConfig.sensRange, uiConfig.costPerServer, uiConfig.costPerWait]);

  // Handler for loading trace data
  const handleTraceDataLoaded = (data: TraceEntry[]) => {
      const maxTime = data[data.length - 1].arrivalTime;
      updateConfigBulk({
          traceData: data,
          arrivalType: DistributionType.TRACE,
          serviceType: DistributionType.TRACE,
          openHour: 0,
          closeHour: Math.ceil((maxTime / 60) + 1)
      });
      setAppMode('SINGLE');
      setTimeout(() => {
          controls.reset();
      }, 100);
  };

  /**
   * Chart Interaction Handlers (Scrubbing)
   */
  const handleChartHover = useCallback((e: any) => {
    if (e && e.activePayload && e.activePayload.length > 0) {
        const payload = e.activePayload[0].payload as ChartDataPoint;
        if (payload && payload.visualSnapshot && simState) {
            const tempState: SimulationState = {
                ...simState, 
                currentTime: payload.time * 60, 
                queue: payload.visualSnapshot.queue,
                servers: payload.visualSnapshot.servers,
                customersImpatient: payload.visualSnapshot.customersImpatient,
                customersServed: payload.visualSnapshot.customersServed,
                customersServedWithinTarget: payload.visualSnapshot.customersServed, 
                isPanic: false, 
                recentlyDeparted: [], 
                recentlyBalked: [], 
                orbit: payload.visualSnapshot.orbit || [], 
                history: simState.history, 
                events: [] 
            };
            setScrubbedSnapshot(tempState);
        }
    }
  }, [simState]);

  const handleChartLeave = useCallback(() => {
      setScrubbedSnapshot(null);
  }, []);

  const displayState = scrubbedSnapshot || simState;
  const activeState = displayState || simState;

  const currentClockTime = displayState ? formatTime(uiConfig.openHour + (displayState.currentTime / 60)) : "00:00 AM";

  // Calculate Total Queue
  const currentTotalQueue = useMemo(() => {
      if (!displayState) return 0;
      let total = displayState.queue.length;
      displayState.servers.forEach(s => total += s.queue.length);
      return total;
  }, [displayState]);

  // Calculate Flow Efficiency
  const flowEfficiency = useMemo(() => {
      if (!activeState || activeState.totalSystemTime <= 0) return 0;
      // Flow Efficiency = (Value Added Time / Total Time) * 100
      // Value Added Time (Service) = Total System Time - Total Wait Time
      const totalService = activeState.totalSystemTime - activeState.totalWaitTime;
      return Math.min(100, Math.max(0, (totalService / activeState.totalSystemTime) * 100));
  }, [activeState?.totalSystemTime, activeState?.totalWaitTime]);

  const flowEffColor = flowEfficiency > 50 ? "text-emerald-600" : (flowEfficiency >= 20 ? "text-yellow-600" : "text-red-600");

  // --- RENDER ROUTERS ---

  if (appMode === 'NETWORK') {
      return (
          <div className="min-h-screen p-4 bg-slate-100">
               <header className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                            <i className="fa-solid fa-diagram-project text-purple-600"></i>
                            Jackson Network Builder
                        </h1>
                        <p className="text-xs text-slate-500">Design multi-stage stochastic networks</p>
                    </div>
                    <div className="bg-white rounded-full p-1 border shadow-sm flex overflow-x-auto max-w-full">
                        <button onClick={() => setAppMode('SINGLE')} className="whitespace-nowrap px-4 py-1 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-50">Single Node</button>
                        <button onClick={() => setAppMode('NETWORK')} className="whitespace-nowrap px-4 py-1 rounded-full text-xs font-bold text-white bg-purple-600 shadow-sm">Network Mode</button>
                        <button onClick={() => setAppMode('DATALAB')} className="whitespace-nowrap px-4 py-1 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-50">Data Lab</button>
                    </div>
               </header>
               <NetworkSimulator />
          </div>
      )
  }

  if (appMode === 'DATALAB') {
      return (
          <div className="min-h-screen p-4 bg-slate-100">
               <header className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                            <i className="fa-solid fa-flask text-purple-600"></i>
                            Data Lab
                        </h1>
                        <p className="text-xs text-slate-500">Analyze raw data and prepare traces</p>
                    </div>
                    <div className="bg-white rounded-full p-1 border shadow-sm flex overflow-x-auto max-w-full">
                        <button onClick={() => setAppMode('SINGLE')} className="whitespace-nowrap px-4 py-1 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-50">Single Node</button>
                        <button onClick={() => setAppMode('NETWORK')} className="whitespace-nowrap px-4 py-1 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-50">Network Mode</button>
                        <button onClick={() => setAppMode('DATALAB')} className="whitespace-nowrap px-4 py-1 rounded-full text-xs font-bold text-white bg-purple-600 shadow-sm">Data Lab</button>
                    </div>
               </header>
               <DataLab onDataLoaded={handleTraceDataLoaded} />
          </div>
      )
  }

  // --- SINGLE QUEUE MODE (Classic App) ---

  if (!simState || !activeState) return <div className="min-h-screen flex items-center justify-center text-slate-500">Initializing Engine...</div>;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Styles omitted for brevity */}
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
      <header className="mb-8 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <i className="fa-solid fa-building-columns text-blue-600"></i>
            Queueing Simulator Pro <span className="text-blue-500 font-normal">v3.7</span>
          </h1>
          <p className="text-slate-500 mt-1 text-sm md:text-base">Finite Population Support & Advanced Analytical Validation</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            {/* Mode Switcher */}
            <div className="bg-white rounded-full p-1 border shadow-sm flex overflow-x-auto max-w-full">
                <button 
                    onClick={() => setAppMode('SINGLE')} 
                    className={`whitespace-nowrap px-3 md:px-4 py-2 rounded-full text-[10px] md:text-xs font-bold transition-all ${appMode === 'SINGLE' ? 'text-white bg-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    Single Node
                </button>
                <button 
                    onClick={() => setAppMode('NETWORK')} 
                    className={`whitespace-nowrap px-3 md:px-4 py-2 rounded-full text-[10px] md:text-xs font-bold transition-all ${appMode === 'NETWORK' ? 'text-white bg-purple-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    Network Mode
                </button>
                <button 
                    onClick={() => setAppMode('DATALAB')} 
                    className={`whitespace-nowrap px-3 md:px-4 py-2 rounded-full text-[10px] md:text-xs font-bold transition-all ${appMode === 'DATALAB' ? 'text-white bg-pink-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    Data Lab
                </button>
            </div>

            <div className="flex gap-2 flex-wrap">
            
            {/* Snapshot Button */}
            <button 
                onClick={handleSnapshot} 
                className="px-3 md:px-4 py-2 rounded-lg font-bold text-white bg-indigo-500 hover:bg-indigo-600 transition-all shadow-md flex items-center gap-2 text-xs md:text-sm whitespace-nowrap"
                title="Save current metrics as a scenario for comparison"
            >
                <i className="fa-solid fa-camera"></i> <span>Snapshot</span>
            </button>

            {/* Export Button */}
            <button 
                onClick={handleExportReport} 
                className="px-3 md:px-4 py-2 rounded-lg font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-md flex items-center gap-2 text-xs md:text-sm"
                title="Download Simulation Data (CSV)"
            >
                <i className="fa-solid fa-file-csv"></i> <span className="hidden md:inline">Export</span>
            </button>
            </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Configuration Controls */}
        <section className="lg:col-span-1 space-y-6">
            <ConfigPanel 
                config={uiConfig}
                onConfigChange={updateConfigBulk}
                theoretical={theoretical}
                onAutoStaff={handleAutoStaff}
                onReset={controls.reset}
            />
        </section>

        {/* Right Column: Visualization & Metrics */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Main Visualization Floor */}
          <ServiceFloor 
              activeState={activeState}
              environment={uiConfig.environment}
              queueTopology={uiConfig.queueTopology}
              impatientMode={uiConfig.impatientMode}
              avgPatienceTime={uiConfig.avgPatienceTime}
              scrubbedSnapshot={scrubbedSnapshot}
              floatingEffects={floatingEffects}
              skillBasedRouting={uiConfig.skillBasedRouting}
              editingServerId={editingServerId}
              setEditingServerId={setEditingServerId}
              handleToggleServerSkill={handleToggleServerSkill}
              simSpeed={status.simSpeed}
              setSimSpeed={controls.setSpeed}
              openHour={uiConfig.openHour}
              currentClockTime={currentClockTime}
              isPaused={status.isPaused}
              onTogglePause={controls.toggle}
              onReset={controls.reset}
          />

          {/* KPI Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricsCard 
                label="Avg Wait (Wq)" 
                value={activeState.statsWq.count > 0 ? (activeState.statsWq.sum / activeState.statsWq.count) : 0} 
                unit="min" 
                icon="fa-regular fa-clock"
                colorClass="text-blue-600"
                subtext={`vs Theor: ${theoretical?.isStable ? (theoretical.wq * 60).toFixed(2) : '∞'}`}
            />
            <MetricsCard 
                label="Avg System Time (W)" 
                value={activeState.statsW.count > 0 ? (activeState.statsW.sum / activeState.statsW.count) : 0} 
                unit="min" 
                icon="fa-solid fa-stopwatch"
                colorClass="text-indigo-600"
                subtext={`vs Theor: ${theoretical?.isStable ? (theoretical.w * 60).toFixed(2) : '∞'}`}
            />
            <MetricsCard 
                label="Flow Efficiency" 
                value={`${flowEfficiency.toFixed(1)}%`} 
                unit="" 
                icon="fa-solid fa-stopwatch-20"
                colorClass={flowEffColor}
                subtext="Value / Lead Time"
            />
            <MetricsCard 
                label="Throughput" 
                value={activeState.customersServed} 
                unit="cust" 
                icon="fa-solid fa-person-walking-arrow-right"
                colorClass="text-emerald-600"
                subtext={`${(activeState.customersServed / (Math.max(1, activeState.currentTime/60))).toFixed(1)}/hr`}
            />
            <MetricsCard 
                label="Queue Length (Lq)" 
                value={currentTotalQueue} 
                unit="ppl" 
                icon="fa-solid fa-people-group"
                colorClass={activeState.isPanic ? "text-red-600 animate-pulse" : "text-slate-600"}
                subtext={`Max Observed: ${activeState.maxQueueLength}`}
            />
          </div>

          {/* Charts & Analytics Dashboard */}
          <AnalyticsDashboard 
              simState={simState}
              activeState={activeState}
              savedScenarios={savedScenarios}
              uiConfig={uiConfig}
              theoretical={theoretical}
              sensitivityData={sensitivityData}
              onSensConfigChange={updateConfigBulk}
              onChartHover={handleChartHover}
              onChartLeave={handleChartLeave}
          />

        </div>
      </div>
    </div>
  );
};
