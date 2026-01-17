
import React, { useMemo } from 'react';
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
  BarChart,
  ReferenceLine,
  Cell,
  ScatterChart,
  Scatter
} from 'recharts';
import { 
    SimulationState, 
    SavedScenario, 
    SimulationUIConfig, 
    TheoreticalMetrics, 
    SensitivityResult 
} from '../types';
import { formatTime } from '../mathUtils';
import ServerTimeline from './ServerTimeline';

interface AnalyticsDashboardProps {
    simState: SimulationState;
    activeState: SimulationState;
    savedScenarios: SavedScenario[];
    uiConfig: SimulationUIConfig;
    theoretical: TheoreticalMetrics | null;
    sensitivityData: SensitivityResult[];
    onSensConfigChange: (updates: Partial<SimulationUIConfig>) => void;
    onChartHover: (e: any) => void;
    onChartLeave: () => void;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
    simState,
    activeState,
    savedScenarios,
    uiConfig,
    theoretical,
    sensitivityData,
    onSensConfigChange,
    onChartHover,
    onChartLeave
}) => {

    // --- Data Transformations ---

    // Formatter for Chart X-Axis
    const xAxisFormatter = (timeValue: number) => {
        return formatTime(uiConfig.openHour + timeValue);
    };

    // Merge Chart Data for Comparison
    const chartData = useMemo(() => {
        if (!simState) return [];
        
        const dataMap = new Map<number, any>();
        
        simState.history.forEach(pt => {
            dataMap.set(pt.time, { 
                ...pt, 
                isCurrent: true,
                wqRange: [pt.wqLower, pt.wqUpper] // Range for CI area
            });
        });
        
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

    // Prepare Gantt Data
    const ganttData = useMemo(() => {
        if (!activeState) return [];
        
        const finished = activeState.completedCustomers.filter(c => c.finishTime <= activeState.currentTime);
        const recent = finished.slice(-30); 
        
        return recent.map((c, i) => ({
            uniqueKey: c.id,
            displayId: `#${finished.length - recent.length + i + 1}`, // Sequential ID
            arrivalOffset: c.arrivalTime, 
            wait: c.waitTime,
            service: c.serviceTime,
            type: c.type,
            tooltipArrival: formatTime(uiConfig.openHour + c.arrivalTime/60),
            tooltipStart: formatTime(uiConfig.openHour + c.startTime/60),
            tooltipEnd: formatTime(uiConfig.openHour + c.finishTime/60)
        }));
    }, [activeState, uiConfig.openHour]);

    // Calculate Wait Time Histogram
    const histogramData = useMemo(() => {
        const completed = activeState?.completedCustomers || [];
        if (completed.length === 0) return [];

        const waitTimes = completed.map(c => c.waitTime);
        // Find rough max to determine bin sizing, ensure at least some range
        const maxWait = Math.max(Math.max(...waitTimes), uiConfig.slTargetSec / 60 * 2);
        const binCount = 15;
        const binSize = maxWait / binCount;
        
        const slTargetMin = uiConfig.slTargetSec / 60;

        const bins = Array.from({ length: binCount }, (_, i) => ({
            rangeStart: i * binSize,
            rangeEnd: (i + 1) * binSize,
            label: `${(i * binSize).toFixed(1)}-${((i + 1) * binSize).toFixed(1)}m`,
            count: 0,
            // Mark if the start of this bin is already violating the SLA
            isOverTarget: (i * binSize) > slTargetMin
        }));

        waitTimes.forEach(w => {
            let idx = Math.floor(w / binSize);
            if (idx >= binCount) idx = binCount - 1;
            if (idx < 0) idx = 0;
            bins[idx].count++;
        });

        return bins;
    }, [activeState?.completedCustomers, activeState?.customersServed, uiConfig.slTargetSec]);

    // Calculate Service Time Histogram
    const serviceHistogramData = useMemo(() => {
        const completed = activeState?.completedCustomers || [];
        if (completed.length === 0) return [];

        const serviceTimes = completed.map(c => c.serviceTime);
        // Determine max for binning, ensuring range covers typical variability
        const maxVal = Math.max(Math.max(...serviceTimes), uiConfig.serviceTimeInput * 2);
        const binCount = 15;
        const binSize = Math.max(0.1, maxVal / binCount);
        
        const bins = Array.from({ length: binCount }, (_, i) => ({
            label: `${(i * binSize).toFixed(1)}-${((i + 1) * binSize).toFixed(1)}m`,
            count: 0,
            // Highlight if significantly higher than average (e.g., > 1.5x avg)
            isLong: (i * binSize) > (uiConfig.serviceTimeInput * 1.5)
        }));

        serviceTimes.forEach(val => {
            let idx = Math.floor(val / binSize);
            if (idx >= binCount) idx = binCount - 1;
            if (idx < 0) idx = 0;
            bins[idx].count++;
        });

        return bins;
    }, [activeState?.completedCustomers, activeState?.customersServed, uiConfig.serviceTimeInput]);

    const slGradientOffset = useMemo(() => {
        // Calculate the offset for the gradient split based on target percent
        // Recharts gradient goes from 0 (top) to 1 (bottom)
        // We want Green from Top to Target, Red from Target to Bottom
        // If Target is 80%, top is 100%, bottom is 0%. 
        // 80% is at offset (100-80)/100 = 0.2
        return (100 - uiConfig.slTargetPercent) / 100;
    }, [uiConfig.slTargetPercent]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1: Queue Length & Server Usage */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[300px] flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">System Load (Lq) vs Capacity</h3>
                        <div className="flex gap-2 text-[10px]">
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Current</span>
                            {savedScenarios.map(s => s.visible && (
                                <span key={s.id} className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{backgroundColor: s.color}}></div> {s.name}</span>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 w-full" onMouseLeave={onChartLeave}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} onMouseMove={onChartHover}>
                                <defs>
                                    <linearGradient id="colorLq" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                    dataKey="time" 
                                    tickFormatter={xAxisFormatter} 
                                    tick={{fontSize: 10, fill: '#94a3b8'}} 
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={30} />
                                <Tooltip 
                                    labelFormatter={xAxisFormatter}
                                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                    itemStyle={{fontSize: '11px', fontWeight: 'bold'}}
                                />
                                <Legend wrapperStyle={{fontSize: '10px', paddingTop: '10px'}} />
                                
                                {/* Reference Line for Capacity if Finite */}
                                {uiConfig.capacityK < 50 && (
                                    <ReferenceLine y={uiConfig.capacityK} stroke="red" strokeDasharray="3 3" label={{ position: 'insideTopRight',  value: 'Max Capacity', fontSize: 9, fill: 'red' }} />
                                )}

                                <Area 
                                    type="monotone" 
                                    dataKey="lqActual" 
                                    name="Queue Length" 
                                    stroke="#3b82f6" 
                                    strokeWidth={2}
                                    fillOpacity={1} 
                                    fill="url(#colorLq)" 
                                    isAnimationActive={false}
                                />
                                <Line 
                                    type="step" 
                                    dataKey="currentServers" 
                                    name="Staff Count" 
                                    stroke="#a855f7" 
                                    strokeDasharray="4 4" 
                                    dot={false}
                                    strokeWidth={2}
                                    isAnimationActive={false}
                                />

                                {/* Saved Scenarios Lines */}
                                {savedScenarios.map(s => s.visible && (
                                    <Line 
                                        key={s.id}
                                        type="monotone" 
                                        dataKey={`scenario_${s.id}_lq`} 
                                        name={s.name} 
                                        stroke={s.color} 
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={false}
                                        connectNulls
                                    />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Chart 2: Wait Time Analysis */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[300px] flex flex-col">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Wait Time Analysis (Wq)</h3>
                    <div className="flex-1 w-full" onMouseLeave={onChartLeave}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} onMouseMove={onChartHover}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                    dataKey="time" 
                                    tickFormatter={xAxisFormatter} 
                                    tick={{fontSize: 10, fill: '#94a3b8'}} 
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={30} label={{ value: 'Minutes', angle: -90, position: 'insideLeft', style: {fontSize: 10, fill: '#cbd5e1'} }} />
                                <Tooltip 
                                    labelFormatter={xAxisFormatter}
                                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                    itemStyle={{fontSize: '11px', fontWeight: 'bold'}}
                                />
                                <Legend wrapperStyle={{fontSize: '10px', paddingTop: '10px'}} />
                                
                                <Line 
                                    type="monotone" 
                                    dataKey="wq" 
                                    name="Observed Wq" 
                                    stroke="#f59e0b" 
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                                
                                {/* Confidence Intervals Area */}
                                <Area 
                                    type="monotone" 
                                    dataKey="wqRange" 
                                    stroke="none"
                                    fill="#f59e0b" 
                                    fillOpacity={0.1}
                                    name="95% CI"
                                    isAnimationActive={false}
                                />

                                {theoretical && theoretical.isStable && !uiConfig.useDynamicMode && (
                                    <Line 
                                        type="monotone" 
                                        dataKey="wqTheor" 
                                        name="Theoretical Wq" 
                                        stroke="#10b981" 
                                        strokeDasharray="5 5" 
                                        dot={false}
                                        strokeWidth={2}
                                        isAnimationActive={false}
                                    />
                                )}

                                {/* Saved Scenarios Lines */}
                                {savedScenarios.map(s => s.visible && (
                                    <Line 
                                        key={s.id}
                                        type="monotone" 
                                        dataKey={`scenario_${s.id}_wq`} 
                                        name={s.name} 
                                        stroke={s.color} 
                                        strokeWidth={1.5}
                                        strokeDasharray="2 2"
                                        dot={false}
                                        isAnimationActive={false}
                                        connectNulls
                                    />
                                ))}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Server Occupancy Timeline */}
            <ServerTimeline 
                servers={activeState.servers} 
                currentTime={activeState.currentTime}
                openHour={uiConfig.openHour}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Wait Time Histogram (The Long Tail) */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[250px] flex flex-col">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Wait Time Distribution (Long Tail)</h3>
                    <div className="flex-1 w-full relative">
                        {histogramData.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs italic">
                                No customers served yet...
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={histogramData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis 
                                        dataKey="label" 
                                        tick={{fontSize: 9, fill: '#94a3b8'}} 
                                        axisLine={false}
                                        tickLine={false}
                                        interval={1}
                                    />
                                    <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={30} />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                        itemStyle={{fontSize: '11px', fontWeight: 'bold'}}
                                    />
                                    <ReferenceLine x={(uiConfig.slTargetSec / 60).toFixed(1)} stroke="red" strokeDasharray="3 3" label={{ position: 'top',  value: 'SLA', fontSize: 9, fill: 'red' }} />
                                    <Bar dataKey="count" name="Customers" radius={[4, 4, 0, 0]}>
                                        {histogramData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.isOverTarget ? '#ef4444' : '#3b82f6'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Service Time Distribution */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[250px] flex flex-col">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Service Time Distribution</h3>
                    <div className="flex-1 w-full relative">
                        {serviceHistogramData.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs italic">
                                No customers served yet...
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={serviceHistogramData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis 
                                        dataKey="label" 
                                        tick={{fontSize: 9, fill: '#94a3b8'}} 
                                        axisLine={false}
                                        tickLine={false}
                                        interval={1}
                                    />
                                    <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={30} />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                        itemStyle={{fontSize: '11px', fontWeight: 'bold'}}
                                    />
                                    <Bar dataKey="count" name="Customers" radius={[4, 4, 0, 0]}>
                                        {serviceHistogramData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.isLong ? '#f59e0b' : '#10b981'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Chart 3: Server Utilization & Loss Rate */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[250px] flex flex-col">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Utilization & Loss Rate</h3>
                    <div className="flex-1 w-full" onMouseLeave={onChartLeave}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} onMouseMove={onChartHover}>
                                <defs>
                                    <linearGradient id="colorUtil" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                    dataKey="time" 
                                    tickFormatter={xAxisFormatter} 
                                    tick={{fontSize: 10, fill: '#94a3b8'}} 
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis domain={[0, 100]} tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={30} />
                                <Tooltip 
                                    labelFormatter={xAxisFormatter}
                                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                    itemStyle={{fontSize: '11px', fontWeight: 'bold'}}
                                />
                                <Legend wrapperStyle={{fontSize: '10px', paddingTop: '10px'}} />
                                
                                <Area 
                                    type="monotone" 
                                    dataKey="utilization" 
                                    name="Utilization %" 
                                    stroke="#10b981" 
                                    strokeWidth={2}
                                    fillOpacity={1} 
                                    fill="url(#colorUtil)" 
                                    isAnimationActive={false}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="lossRate" 
                                    name="Loss Probability %" 
                                    stroke="#ef4444" 
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                                <ReferenceLine y={80} stroke="orange" strokeDasharray="3 3" label={{ position: 'insideRight',  value: 'Target', fontSize: 9, fill: 'orange' }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            
            {/* NEW: Service Level Agreement (SLA) Trend */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[250px] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Service Level (SLA) Trend</h3>
                    <div className="text-[10px] font-bold text-slate-500">
                        Target: {uiConfig.slTargetPercent}% within {uiConfig.slTargetSec}s
                    </div>
                </div>
                <div className="flex-1 w-full" onMouseLeave={onChartLeave}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} onMouseMove={onChartHover}>
                            <defs>
                                <linearGradient id="splitColorSla" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset={slGradientOffset} stopColor="#10b981" stopOpacity={0.8}/>
                                    <stop offset={slGradientOffset} stopColor="#ef4444" stopOpacity={0.8}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="time" 
                                tickFormatter={xAxisFormatter} 
                                tick={{fontSize: 10, fill: '#94a3b8'}} 
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis domain={[0, 100]} tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={30} />
                            <Tooltip 
                                labelFormatter={xAxisFormatter}
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                itemStyle={{fontSize: '11px', fontWeight: 'bold'}}
                                formatter={(value: number) => [`${value}%`, 'SLA Compliance']}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="slaPercent" 
                                name="SLA %" 
                                stroke="#000" 
                                strokeWidth={1}
                                strokeOpacity={0.2}
                                fill="url(#splitColorSla)" 
                                isAnimationActive={false}
                            />
                            <ReferenceLine y={uiConfig.slTargetPercent} stroke="black" strokeDasharray="3 3" label={{ position: 'insideRight',  value: 'Goal', fontSize: 9, fill: 'black' }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
            
            {/* Gantt / Customer Log Visualization (Limited History) */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Service Gantt (Last 30 Customers)</h3>
                <div className="h-[150px] w-full relative overflow-hidden">
                    {ganttData.length === 0 ? (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs italic">
                            Waiting for completed transactions...
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                layout="vertical" 
                                data={ganttData} 
                                barSize={6}
                                margin={{ top: 0, right: 30, left: 20, bottom: 5 }}
                            >
                                <XAxis type="number" hide />
                                <YAxis dataKey="displayId" type="category" width={30} tick={{fontSize: 8, fill: '#94a3b8'}} interval={0} />
                                <Tooltip 
                                    cursor={{fill: 'transparent'}}
                                    content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg z-50">
                                                    <p className="font-bold border-b border-slate-600 pb-1 mb-1">Customer {label} ({data.type})</p>
                                                    <p>Arrived: {data.tooltipArrival}</p>
                                                    <p>Wait: <span className="text-amber-400">{data.wait.toFixed(2)}m</span></p>
                                                    <p>Service: <span className="text-emerald-400">{data.service.toFixed(2)}m</span></p>
                                                    <p>Departed: {data.tooltipEnd}</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="arrivalOffset" stackId="a" fill="transparent" />
                                <Bar dataKey="wait" stackId="a" fill="#fbbf24" name="Wait Time" radius={[2, 0, 0, 2]} />
                                <Bar dataKey="service" stackId="a" fill="#10b981" name="Service Time" radius={[0, 2, 2, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
                <div className="flex gap-4 justify-center mt-2 text-[10px] text-slate-500">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-400 rounded-sm"></div> Wait Time</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-sm"></div> Service Time</div>
                </div>
            </div>

            {/* SENSITIVITY LAB (Mini) */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 border-dashed">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                        <i className="fa-solid fa-microscope text-purple-600"></i> Sensitivity Lab
                    </h3>
                    <div className="flex gap-2">
                        <select 
                            value={uiConfig.sensParam} 
                            onChange={(e) => onSensConfigChange({ sensParam: e.target.value as any })}
                            className="text-xs p-1 rounded border border-slate-300 bg-white font-bold text-slate-600"
                        >
                            <option value="serverCount">Vary: Server Count</option>
                            <option value="lambda">Vary: Arrival Rate</option>
                            <option value="avgServiceTime">Vary: Service Time</option>
                        </select>
                        <select 
                            value={uiConfig.sensMetric} 
                            onChange={(e) => onSensConfigChange({ sensMetric: e.target.value as any })}
                            className="text-xs p-1 rounded border border-slate-300 bg-white font-bold text-slate-600"
                        >
                            <option value="totalCost">Metric: Total Cost</option>
                            <option value="wq">Metric: Wait Time</option>
                            <option value="rho">Metric: Utilization</option>
                        </select>
                    </div>
                </div>
                
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sensitivityData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis 
                                dataKey="xValue" 
                                type="number" 
                                domain={['dataMin', 'dataMax']} 
                                tick={{fontSize: 10}} 
                                label={{ value: uiConfig.sensParam === 'serverCount' ? 'Servers' : (uiConfig.sensParam === 'lambda' ? 'Lambda' : 'Service Time'), position: 'insideBottom', offset: -5, fontSize: 10 }} 
                            />
                            <YAxis tick={{fontSize: 10}} />
                            <Tooltip 
                                labelFormatter={(val) => `${uiConfig.sensParam}: ${val}`}
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                            />
                            <Line 
                                type="monotone" 
                                dataKey={uiConfig.sensMetric} 
                                stroke="#8b5cf6" 
                                strokeWidth={3} 
                                dot={{r: 3, fill: '#8b5cf6'}} 
                                activeDot={{r: 6}} 
                            />
                            {uiConfig.sensMetric === 'totalCost' && (
                                <ReferenceLine x={sensitivityData.reduce((prev, curr) => prev.totalCost < curr.totalCost ? prev : curr).xValue} stroke="green" strokeDasharray="3 3" label="Optimal" />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 italic text-center">
                    Real-time calculation based on current model config (Economic Params: ${uiConfig.costPerServer}/hr/server, ${uiConfig.costPerWait}/hr/wait)
                </p>
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
