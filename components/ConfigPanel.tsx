
import React, { useState, useMemo } from 'react';
import { 
    SimulationUIConfig, 
    TheoreticalMetrics, 
    Environment, 
    QueueModel, 
    DistributionType, 
    ServerSelectionStrategy, 
    QueueTopology, 
    SkillType 
} from '../types';
import ScheduleEditor from './ScheduleEditor';

interface ConfigPanelProps {
    config: SimulationUIConfig;
    onConfigChange: (updates: Partial<SimulationUIConfig>) => void;
    theoretical: TheoreticalMetrics | null;
    onAutoStaff: () => void;
    onReset: () => void;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ 
    config, 
    onConfigChange, 
    theoretical, 
    onAutoStaff,
    onReset
}) => {
    const [infoTab, setInfoTab] = useState<'model' | 'features' | 'about'>('model');

    // Helper to update a single key
    const updateField = <K extends keyof SimulationUIConfig>(key: K, value: SimulationUIConfig[K]) => {
        onConfigChange({ [key]: value });
    };

    // Label Helpers
    const getResourceName = () => {
        switch(config.environment) {
            case Environment.CALL_CENTER: return 'Agents';
            case Environment.MARKET: return 'Cashiers';
            default: return 'Tellers';
        }
    };

    const getCustomerName = () => {
        switch(config.environment) {
            case Environment.CALL_CENTER: return 'Callers';
            case Environment.MARKET: return 'Shoppers';
            default: return 'Customers';
        }
    };

    const getWorkloadLabel = () => {
        switch(config.environment) {
            case Environment.MARKET: return 'Items / Cart';
            case Environment.CALL_CENTER: return 'Concerns / Call';
            default: return 'Transact / Visit';
        }
    };

    // Handle Environment Changes
    const handleEnvironmentChange = (newEnv: Environment) => {
        const updates: Partial<SimulationUIConfig> = { environment: newEnv };
        
        if (newEnv === Environment.MARKET) {
            updates.queueTopology = QueueTopology.DEDICATED;
            updates.impatientMode = false;
        } else if (newEnv === Environment.CALL_CENTER) {
            updates.queueTopology = QueueTopology.COMMON;
            updates.impatientMode = true; 
            updates.avgPatienceTime = 2;
            updates.serviceTimeInput = 5;
            updates.serverCountInput = 10;
            updates.lambdaInput = 80;
            updates.serviceType = DistributionType.ERLANG;
            updates.erlangServiceK = 3;
        } else {
            // BANK
            updates.queueTopology = QueueTopology.COMMON;
            updates.impatientMode = false;
            updates.serviceTimeInput = 15;
            updates.serverCountInput = 3;
        }
        
        onConfigChange(updates);
        setTimeout(() => onReset(), 50);
    };

    // --- DOCUMENTATION GENERATION ---
    const modelNotation = useMemo(() => {
        const a = config.arrivalType === DistributionType.POISSON ? 'M' : config.arrivalType === DistributionType.DETERMINISTIC ? 'D' : config.arrivalType === DistributionType.TRACE ? 'Trace' : config.arrivalType === DistributionType.ERLANG ? `E${config.erlangK}` : 'G';
        const s = config.serviceType === DistributionType.POISSON ? 'M' : config.serviceType === DistributionType.DETERMINISTIC ? 'D' : config.serviceType === DistributionType.TRACE ? 'Trace' : config.serviceType === DistributionType.ERLANG ? `E${config.erlangServiceK}` : 'G';
        const servers = config.selectedModel === QueueModel.MMINF ? '∞' : config.selectedModel === QueueModel.MM1 ? '1' : (config.useDynamicMode ? 's(t)' : config.serverCountInput);
        
        let suffix = '';
        if (config.selectedModel === QueueModel.MMSK) suffix = `/${config.capacityK} (Cap)`;
        if (config.selectedModel === QueueModel.MMS_N_POP) suffix = `//${config.populationSize} (Pop)`;

        const bulk = config.bulkArrivalMode ? `^(${config.minGroupSize},${config.maxGroupSize})` : '';
        const batch = config.batchServiceMode ? `^(1,${config.maxBatchSize})` : '';

        return `${a}${bulk}/${s}${batch}/${servers}${suffix}`;
    }, [config]);

    const documentationContent = useMemo(() => {
        const assumptions: string[] = [];
        
        if (config.selectedModel === QueueModel.MMS_N_POP) {
            assumptions.push(`Finite Calling Population (N=${config.populationSize}): Arrival rate decreases as more customers enter.`);
        } else {
            assumptions.push("Infinite Calling Population: Arrivals do not deplete the source pool.");
        }

        if (config.selectedModel === QueueModel.MMSK) {
            assumptions.push(`Finite System Capacity (K=${config.capacityK}): Arrivals when full are blocked (Loss System).`);
        } else {
            assumptions.push("Infinite Queue Capacity: No blocking limit.");
        }

        if (config.arrivalType === DistributionType.POISSON) {
            assumptions.push("Arrivals: Independent, Memoryless (Poisson Process).");
        } else if (config.arrivalType === DistributionType.TRACE) {
            assumptions.push("Arrivals: Replay of historical trace data (Empirical).");
        }

        if (config.serviceType === DistributionType.POISSON) {
            assumptions.push("Service: Independent, Memoryless (Exponential).");
        }

        if (config.variableWorkloadMode) assumptions.push(`Variable Workload: Service time scales with ${getWorkloadLabel().toLowerCase()} (Compound Distribution).`);
        if (config.impatientMode) assumptions.push("Impatience: Customers renege if wait > patience threshold.");
        if (config.vipProbability > 0) assumptions.push("Priority: VIP customers bypass standard queue.");
        if (config.bulkArrivalMode) assumptions.push(`Bulk Arrivals: Groups of ${config.minGroupSize}-${config.maxGroupSize} arrive together.`);
        if (config.batchServiceMode) assumptions.push(`Batch Service: Servers process up to ${config.maxBatchSize} customers at once.`);

        const limitations: string[] = [];
        if (config.useDynamicMode) {
            limitations.push("Dynamic Mode: System is Non-Stationary. Steady-state formulas do not apply.");
        } else if (theoretical?.isStable === false) {
            limitations.push("UNSTABLE: Traffic intensity ρ ≥ 1. Queue grows indefinitely.");
        } else if (theoretical?.isApproximate) {
            limitations.push(`Approximation: ${theoretical.approxNote}`);
        } else {
            limitations.push("Scope: Valid for steady-state equilibrium.");
        }

        return {
            arrivals: {
                title: "Arrival Process",
                desc: config.useDynamicMode 
                    ? "Non-Stationary Process λ(t). Arrival rates vary hourly according to the user-defined schedule."
                    : config.selectedModel === QueueModel.MMS_N_POP
                    ? `Finite Population (N=${config.populationSize}). State-dependent arrival rate.`
                    : config.arrivalType === DistributionType.POISSON 
                    ? "Independent Poisson arrivals (Markovian)."
                    : `User defined: ${config.arrivalType}`
            },
            service: {
                title: "Service Process",
                desc: config.variableWorkloadMode 
                ? `Compound Distribution. Time = Sum of ${getWorkloadLabel().split(' ')[0]} (Mean N=${(config.minWorkloadItems + config.maxWorkloadItems)/2}) each taking Avg ${config.serviceTimeInput}m.`
                : config.serviceType === DistributionType.POISSON
                ? "Exponential service times (Markovian)."
                : config.serviceType === DistributionType.DETERMINISTIC
                ? "Deterministic (Constant) service times."
                : `User defined: ${config.serviceType}`
            },
            discipline: {
                title: "Queue Discipline",
                desc: "FIFO" + (config.vipProbability > 0 ? " + Priority" : "") + (config.impatientMode ? " + Balking/Reneging" : "")
            },
            scope: {
                items: [...assumptions, ...limitations]
            }
        };
    }, [config, theoretical]);

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Model Configuration</h2>
                
                {/* Environment Selector */}
                <div className="flex p-1 bg-slate-100 rounded-lg mb-4">
                    {Object.values(Environment).map(env => (
                        <button 
                            key={env}
                            onClick={() => handleEnvironmentChange(env)}
                            className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${config.environment === env ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
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
                                onClick={() => updateField('useDynamicMode', !config.useDynamicMode)}
                                className={`w-10 h-5 rounded-full relative transition-colors ${config.useDynamicMode ? 'bg-blue-600' : 'bg-slate-300'}`}
                            >
                                <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${config.useDynamicMode ? 'left-6' : 'left-1'}`}></div>
                            </button>
                        </div>
                        <p className="text-[9px] text-slate-500 mt-2 leading-tight">
                            {config.useDynamicMode 
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
                                    type="number" min="0" max="23" value={config.openHour} onChange={(e) => updateField('openHour', Number(e.target.value))}
                                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:ring-1 focus:ring-blue-400"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Close (Hour)</label>
                                <input 
                                    type="number" min="1" max="24" value={config.closeHour} onChange={(e) => updateField('closeHour', Number(e.target.value))}
                                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center outline-none focus:ring-1 focus:ring-blue-400"
                                />
                            </div>
                        </div>
                    </div>
                    
                    {/* Queue Model Selection */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wide text-[10px]">Queueing Model</label>
                        <select value={config.selectedModel} onChange={(e) => updateField('selectedModel', e.target.value as QueueModel)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value={QueueModel.MM1}>M/M/1 (Single {getResourceName().slice(0, -1)})</option>
                            <option value={QueueModel.MMS}>M/M/s (Multiple {getResourceName()})</option>
                            <option value={QueueModel.MMSK}>M/M/s/N (Finite Capacity / M/M/s/K)</option>
                            <option value={QueueModel.MMS_N_POP}>M/M/s/N/N (Finite Population / Repair)</option>
                            <option value={QueueModel.MMINF}>M/M/inf (Infinite / G/G/∞)</option>
                        </select>
                    </div>

                    {/* Arrival Process Config */}
                    <div className={`p-3 rounded-xl border space-y-3 transition-colors ${config.useDynamicMode ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-blue-50/5 border-blue-100'}`}>
                        <div className="flex justify-between items-center">
                            <label className="block text-xs font-bold text-blue-800 uppercase tracking-wide"><i className="fa-solid fa-users-line mr-1"></i> {getCustomerName()} Arrival</label>
                            {config.useDynamicMode && <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1 rounded">SCHEDULED</span>}
                        </div>
                        
                        {config.useDynamicMode ? (
                            <ScheduleEditor 
                                title="Arrival Rate λ(t)"
                                data={config.arrivalSchedule}
                                onChange={(val) => updateField('arrivalSchedule', val)}
                                min={0}
                                max={100}
                                colorClass="border-blue-200"
                                barColorClass="bg-blue-400"
                                unit="/hr"
                            />
                        ) : (
                            <>
                                <select 
                                    value={config.arrivalType} 
                                    onChange={(e) => updateField('arrivalType', e.target.value as DistributionType)} 
                                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs mb-2"
                                >
                                    {Object.values(DistributionType).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                {config.arrivalType === DistributionType.ERLANG && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-500">Shape k: {config.erlangK}</span>
                                        <input type="range" min="1" max="10" value={config.erlangK} onChange={(e) => updateField('erlangK', Number(e.target.value))} className="w-20 accent-blue-600" />
                                    </div>
                                )}
                                <label className="block text-[10px] text-slate-500 font-bold uppercase">
                                    {config.selectedModel === QueueModel.MMS_N_POP ? "Rate per Person (λ)" : "Arrival Rate (λ)"}
                                </label>
                                <div className="flex items-center justify-between">
                                    <input type="range" min="1" max={config.selectedModel === QueueModel.MMS_N_POP ? 20 : 200} value={config.lambdaInput} onChange={(e) => updateField('lambdaInput', Number(e.target.value))} className="flex-1 mr-2 accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                                    <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{config.lambdaInput}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 text-right">
                                    {config.selectedModel === QueueModel.MMS_N_POP ? "requests / hr / person" : "arrivals / hr"}
                                </p>
                            </>
                        )}
                    </div>

                    {/* Service Process Config */}
                    <div className="p-3 bg-emerald-50/10 rounded-xl border border-emerald-100 space-y-3">
                        <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wide"><i className="fa-solid fa-stopwatch mr-1"></i> {config.environment === Environment.CALL_CENTER ? 'Call Duration' : 'Service Time'}</label>
                        <select 
                            value={config.serviceType} 
                            onChange={(e) => updateField('serviceType', e.target.value as DistributionType)} 
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs mb-2"
                        >
                            {Object.values(DistributionType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        {config.serviceType === DistributionType.ERLANG && (
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500">Shape k: {config.erlangServiceK}</span>
                                <input type="range" min="1" max="10" value={config.erlangServiceK} onChange={(e) => updateField('erlangServiceK', Number(e.target.value))} className="w-20 accent-emerald-600" />
                            </div>
                        )}
                        
                        <label className="block text-[10px] text-slate-500 font-bold uppercase">
                            Avg Duration {config.variableWorkloadMode ? `per ${getWorkloadLabel().split(' ')[0].slice(0,-1)}` : '(1/μ)'}
                        </label>
                        <div className="flex items-center justify-between">
                            <input type="range" min="1" max="60" value={config.serviceTimeInput} onChange={(e) => updateField('serviceTimeInput', Number(e.target.value))} className="flex-1 mr-2 accent-emerald-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                            <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{config.serviceTimeInput}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 text-right">minutes</p>
                    </div>

                    {/* Resource Config */}
                    <div className="p-3 bg-purple-50/10 rounded-xl border border-purple-100 space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="block text-xs font-bold text-purple-800 uppercase tracking-wide"><i className="fa-solid fa-user-tie mr-1"></i> {getResourceName()}</label>
                            {config.useDynamicMode && <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1 rounded">SCHEDULED</span>}
                        </div>
                        
                        {config.useDynamicMode && config.selectedModel !== QueueModel.MM1 && config.selectedModel !== QueueModel.MMINF ? (
                            <ScheduleEditor 
                                title={`Staff Count s(t)`}
                                data={config.serverSchedule}
                                onChange={(val) => updateField('serverSchedule', val)}
                                min={1}
                                max={50}
                                colorClass="border-purple-200"
                                barColorClass="bg-purple-400"
                                unit="staff"
                                onAutoStaff={onAutoStaff}
                            />
                        ) : (
                            <>
                                {(config.selectedModel === QueueModel.MMS || config.selectedModel === QueueModel.MMSK || config.selectedModel === QueueModel.MMS_N_POP) && (
                                    <>
                                        <label className="block text-[10px] text-slate-500 font-bold uppercase">Number of {getResourceName()} (s)</label>
                                        <div className="flex items-center justify-between">
                                            <input type="range" min="1" max="50" value={config.serverCountInput} onChange={(e) => updateField('serverCountInput', Number(e.target.value))} className="flex-1 mr-2 accent-purple-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                                            <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{config.serverCountInput}</span>
                                        </div>
                                    </>
                                )}
                                {config.selectedModel === QueueModel.MMSK && (
                                    <>
                                        <label className="block text-[10px] text-slate-500 font-bold uppercase mt-2">System Capacity (K)</label>
                                        <div className="flex items-center justify-between">
                                            <input type="range" min={config.serverCountInput} max="50" value={config.capacityK} onChange={(e) => updateField('capacityK', Number(e.target.value))} className="flex-1 mr-2 accent-purple-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                                            <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{config.capacityK}</span>
                                        </div>
                                    </>
                                )}
                                {config.selectedModel === QueueModel.MMS_N_POP && (
                                    <>
                                        <label className="block text-[10px] text-slate-500 font-bold uppercase mt-2">Population Size (N)</label>
                                        <div className="flex items-center justify-between">
                                            <input type="range" min={config.serverCountInput} max="200" value={config.populationSize} onChange={(e) => updateField('populationSize', Number(e.target.value))} className="flex-1 mr-2 accent-purple-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                                            <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border min-w-[3rem] text-center">{config.populationSize}</span>
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
                                <input type="checkbox" checked={config.vipProbability > 0} onChange={(e) => updateField('vipProbability', e.target.checked ? 0.2 : 0)} className="accent-amber-500" />
                            </label>
                            {config.vipProbability > 0 && (
                                <div className="pl-4 pb-2">
                                    <div className="flex justify-between text-[10px] text-slate-400">
                                        <span>Ratio: {(config.vipProbability * 100).toFixed(0)}%</span>
                                    </div>
                                    <input type="range" min="0" max="1" step="0.05" value={config.vipProbability} onChange={(e) => updateField('vipProbability', Number(e.target.value))} className="w-full h-1 accent-amber-500 bg-slate-200 appearance-none rounded" />
                                </div>
                            )}

                            {/* Variable Workload (Multi-Item) */}
                            <div>
                                <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                                    <span>Variable Workload (Multi-Item)</span>
                                    <input type="checkbox" checked={config.variableWorkloadMode} onChange={(e) => updateField('variableWorkloadMode', e.target.checked)} className="accent-lime-600" />
                                </label>
                                {config.variableWorkloadMode && (
                                    <div className="pl-4 pt-2 space-y-2 animate-fade-in border-l-2 border-lime-100 ml-1">
                                        <h4 className="text-[10px] font-bold text-lime-700 uppercase">{getWorkloadLabel()}</h4>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <label className="block text-[9px] text-slate-400">Min</label>
                                                <input type="number" min="1" max={config.maxWorkloadItems} value={config.minWorkloadItems} onChange={(e) => updateField('minWorkloadItems', Math.min(Number(e.target.value), config.maxWorkloadItems))} className="w-full text-xs p-1 border rounded text-center" />
                                            </div>
                                            <span className="text-slate-300">-</span>
                                            <div className="flex-1">
                                                <label className="block text-[9px] text-slate-400">Max</label>
                                                <input type="number" min={config.minWorkloadItems} max="50" value={config.maxWorkloadItems} onChange={(e) => updateField('maxWorkloadItems', Math.max(Number(e.target.value), config.minWorkloadItems))} className="w-full text-xs p-1 border rounded text-center" />
                                            </div>
                                        </div>
                                        <p className="text-[9px] text-slate-400 italic">Total service time = Sum of individual item times.</p>
                                    </div>
                                )}
                            </div>

                            {/* Skill Based Routing */}
                            <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                                <span>Skill-Based Routing</span>
                                <input type="checkbox" checked={config.skillBasedRouting} onChange={(e) => updateField('skillBasedRouting', e.target.checked)} className="accent-indigo-500" />
                            </label>
                            {config.skillBasedRouting && (
                                <div className="pl-4 pt-2 space-y-2 animate-fade-in border-l-2 border-indigo-100 ml-1">
                                    <h4 className="text-[10px] font-bold text-indigo-700 uppercase">Customer Needs</h4>
                                    
                                    {/* Sales Ratio */}
                                    <div>
                                        <div className="flex justify-between text-[10px] text-slate-400">
                                            <span>Sales Need</span>
                                            <span className="font-mono">{((config.skillRatios[SkillType.SALES] || 0)*100).toFixed(0)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="1" step="0.1" 
                                            value={config.skillRatios[SkillType.SALES]} 
                                            onChange={(e) => updateField('skillRatios', {...config.skillRatios, [SkillType.SALES]: parseFloat(e.target.value)})} 
                                            className="w-full h-1 accent-emerald-500 bg-slate-200 appearance-none rounded" 
                                        />
                                    </div>

                                    {/* Tech Ratio */}
                                    <div>
                                        <div className="flex justify-between text-[10px] text-slate-400">
                                            <span>Tech Support Need</span>
                                            <span className="font-mono">{((config.skillRatios[SkillType.TECH] || 0)*100).toFixed(0)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="1" step="0.1" 
                                            value={config.skillRatios[SkillType.TECH]} 
                                            onChange={(e) => updateField('skillRatios', {...config.skillRatios, [SkillType.TECH]: parseFloat(e.target.value)})} 
                                            className="w-full h-1 accent-blue-500 bg-slate-200 appearance-none rounded" 
                                        />
                                    </div>

                                    {/* Support Ratio */}
                                    <div>
                                        <div className="flex justify-between text-[10px] text-slate-400">
                                            <span>General Support Need</span>
                                            <span className="font-mono">{((config.skillRatios[SkillType.SUPPORT] || 0)*100).toFixed(0)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="1" step="0.1" 
                                            value={config.skillRatios[SkillType.SUPPORT]} 
                                            onChange={(e) => updateField('skillRatios', {...config.skillRatios, [SkillType.SUPPORT]: parseFloat(e.target.value)})} 
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
                                    <input type="checkbox" checked={config.retrialMode} onChange={(e) => updateField('retrialMode', e.target.checked)} className="accent-cyan-500" />
                                </label>
                                {config.retrialMode && (
                                    <div className="pl-4 pt-2 space-y-2 animate-fade-in border-l-2 border-cyan-100 ml-1">
                                        <h4 className="text-[10px] font-bold text-cyan-700 uppercase">Avg Retry Delay</h4>
                                        <div className="flex items-center justify-between">
                                            <input type="range" min="1" max="60" value={config.avgRetrialDelay} onChange={(e) => updateField('avgRetrialDelay', Number(e.target.value))} className="flex-1 mr-2 accent-cyan-600 h-1 bg-slate-200 rounded-lg" />
                                            <span className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border">{config.avgRetrialDelay}m</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Breakdown Mode */}
                            <div>
                                <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                                    <span>Equipment Breakdowns</span>
                                    <input type="checkbox" checked={config.breakdownMode} onChange={(e) => updateField('breakdownMode', e.target.checked)} className="accent-red-500" />
                                </label>
                                {config.breakdownMode && (
                                    <div className="pl-4 pt-2 space-y-2 animate-fade-in border-l-2 border-red-100 ml-1">
                                        <div>
                                            <label className="block text-[9px] text-slate-400">Mean Time Between Failures (min)</label>
                                            <input type="number" value={config.mtbf} onChange={(e) => updateField('mtbf', Number(e.target.value))} className="w-full text-xs p-1 border rounded text-center" />
                                        </div>
                                        <div>
                                            <label className="block text-[9px] text-slate-400">Mean Repair Time (min)</label>
                                            <input type="number" value={config.mttr} onChange={(e) => updateField('mttr', Number(e.target.value))} className="w-full text-xs p-1 border rounded text-center" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Impatient Mode */}
                            <div>
                                <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                                    <span>Impatient Customers (Balk/Renege)</span>
                                    <input type="checkbox" checked={config.impatientMode} onChange={(e) => updateField('impatientMode', e.target.checked)} className="accent-rose-500" />
                                </label>
                                {config.impatientMode && (
                                    <div className="pl-4 pt-2 space-y-2 animate-fade-in border-l-2 border-rose-100 ml-1">
                                        <div>
                                            <label className="block text-[9px] text-slate-400">Balk Threshold (Queue Length)</label>
                                            <input type="number" value={config.balkThreshold} onChange={(e) => updateField('balkThreshold', Number(e.target.value))} className="w-full text-xs p-1 border rounded text-center" />
                                        </div>
                                        <div>
                                            <label className="block text-[9px] text-slate-400">Avg Patience Time (min)</label>
                                            <input type="number" value={config.avgPatienceTime} onChange={(e) => updateField('avgPatienceTime', Number(e.target.value))} className="w-full text-xs p-1 border rounded text-center" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Efficiency Mode */}
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Staff Efficiency Model</label>
                                <select 
                                    value={config.efficiencyMode} 
                                    onChange={(e) => updateField('efficiencyMode', e.target.value as any)} 
                                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                                >
                                    <option value="UNIFORM">Uniform (All Standard)</option>
                                    <option value="MIXED">Mixed (Senior / Junior)</option>
                                </select>
                                {config.efficiencyMode === 'MIXED' && (
                                    <div className="mt-2 pl-2 border-l-2 border-slate-200">
                                        <label className="block text-[9px] text-slate-400">Senior Ratio ({config.seniorityRatio*100}%)</label>
                                        <input type="range" min="0" max="1" step="0.1" value={config.seniorityRatio} onChange={(e) => updateField('seniorityRatio', Number(e.target.value))} className="w-full h-1 bg-slate-200 accent-slate-500 rounded" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Model Description Box */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex border-b border-slate-100 mb-4">
                    <button onClick={() => setInfoTab('model')} className={`flex-1 text-xs font-bold uppercase py-2 border-b-2 transition-colors ${infoTab === 'model' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Notation</button>
                    <button onClick={() => setInfoTab('features')} className={`flex-1 text-xs font-bold uppercase py-2 border-b-2 transition-colors ${infoTab === 'features' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Assumptions</button>
                </div>
                
                {infoTab === 'model' ? (
                    <div className="text-center">
                        <div className="text-3xl font-black text-slate-800 tracking-tighter mb-1">{modelNotation}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Kendall's Notation</div>
                        
                        <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                            <div className="p-2 bg-slate-50 rounded">
                                <div className="text-[9px] font-bold text-slate-400 uppercase">Arrivals</div>
                                <div className="text-xs font-bold text-slate-700">{documentationContent.arrivals.desc}</div>
                            </div>
                            <div className="p-2 bg-slate-50 rounded">
                                <div className="text-[9px] font-bold text-slate-400 uppercase">Service</div>
                                <div className="text-xs font-bold text-slate-700">{documentationContent.service.desc}</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {documentationContent.scope.items.map((item, i) => (
                            <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                                <i className="fa-solid fa-check text-[10px] text-blue-400 mt-0.5"></i>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default ConfigPanel;
