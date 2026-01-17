
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter } from 'recharts';
import { NetworkNode, ServerState } from '../types';
import { formatTime } from '../mathUtils';

interface NetworkAnalyticsProps {
    simState: any;
    nodes: NetworkNode[];
}

const COLORS = [
    '#3b82f6', // blue-500
    '#ef4444', // red-500
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#06b6d4', // cyan-500
    '#6366f1', // indigo-500
];

const NetworkAnalytics: React.FC<NetworkAnalyticsProps> = ({ simState, nodes }) => {
    // We use a Ref to store history to persist across renders without causing dependency loops,
    // and to allow imperative mutation (push/shift) before syncing to state.
    const historyRef = useRef<any[]>([]);
    const lastTimeRef = useRef<number>(-1);
    const lastExitsRef = useRef<number>(0);
    
    // State to force re-render for Recharts
    const [chartData, setChartData] = useState<any[]>([]);
    const [scatterData, setScatterData] = useState<any[]>([]);

    useEffect(() => {
        if (!simState) {
            // Reset if simulation stops/clears
            if (historyRef.current.length > 0) {
                historyRef.current = [];
                setChartData([]);
                setScatterData([]);
                lastTimeRef.current = -1;
                lastExitsRef.current = 0;
            }
            return;
        }

        const currentTime = simState.currentTime;

        // Reset if time goes backwards (Reset clicked)
        if (currentTime < lastTimeRef.current) {
            historyRef.current = [];
            setScatterData([]);
            lastTimeRef.current = -1;
            lastExitsRef.current = 0;
        }

        // Avoid duplicate points or extremely frequent updates (throttle to ~0.1 min sim time)
        if (currentTime - lastTimeRef.current < 0.1) return;

        const dt = currentTime - lastTimeRef.current;
        lastTimeRef.current = currentTime;

        // Build Data Point
        // Structure: { time: 10.5, "Node A": 5, "Node B": 2 ... }
        const dataPoint: any = { 
            time: currentTime,
            formattedTime: currentTime.toFixed(1)
        };

        let totalWip = 0;

        // Iterate through LIVE nodes in simState to get current WIP
        if (simState.nodes) {
            simState.nodes.forEach((liveNode: NetworkNode) => {
                let nodeWip = liveNode.queue.length;
                
                // Add Busy Servers (accounting for batches)
                liveNode.servers.forEach(s => {
                    if (s.state === ServerState.BUSY) {
                        nodeWip += (s._activeBatch && s._activeBatch.length > 0) ? s._activeBatch.length : 1;
                    }
                });

                dataPoint[liveNode.name] = nodeWip;
                totalWip += nodeWip;
            });

            // Calculate Throughput (Instantaneous rate per hour)
            const currentExits = simState.totalExits || 0;
            const dExits = currentExits - lastExitsRef.current;
            const throughput = dt > 0 ? (dExits / dt) * 60 : 0;
            lastExitsRef.current = currentExits;

            // Update History Buffer
            const newHistory = [...historyRef.current, dataPoint];
            
            // Limit to last 50 points
            if (newHistory.length > 50) {
                newHistory.shift();
            }
            
            historyRef.current = newHistory;
            setChartData(newHistory);

            // Update Scatter Data (WIP vs Throughput)
            if (dt > 0) {
                setScatterData(prev => {
                    // Keep recent 100 points to show cloud/trend
                    const newData = [...prev, { wip: totalWip, throughput: parseFloat(throughput.toFixed(1)) }];
                    if (newData.length > 100) return newData.slice(newData.length - 100);
                    return newData;
                });
            }
        }

    }, [simState]);

    const latencyData = useMemo(() => {
        if (!simState || !simState.nodes) return [];
        return simState.nodes.map((node: NetworkNode) => {
            const served = node.stats.servedCount || 0;
            const avgWait = served > 0 ? node.stats.totalWait / served : 0;
            return {
                name: node.name,
                avgWait: parseFloat(avgWait.toFixed(2)),
                avgService: node.avgServiceTime
            };
        });
    }, [simState]);

    const radarData = useMemo(() => {
        if (!simState || !simState.nodes) return [];
        return simState.nodes.map((node: NetworkNode) => ({
            subject: node.name,
            A: Math.min(100, (node.stats.utilization || 0) * 100),
            fullMark: 100,
        }));
    }, [simState]);

    const blockingData = useMemo(() => {
        if (!simState || !simState.nodes) return [];
        
        return simState.nodes
            .filter((node: NetworkNode) => node.stats.blockedCount > 0)
            .map((node: NetworkNode) => {
                const totalAttempts = (node.stats.servedCount || 0) + node.stats.blockedCount;
                const rate = totalAttempts > 0 ? node.stats.blockedCount / totalAttempts : 0;
                return {
                    name: node.name,
                    blockedCount: node.stats.blockedCount,
                    rate: rate,
                    pct: (rate * 100).toFixed(1)
                };
            })
            .sort((a: any, b: any) => b.rate - a.rate);
    }, [simState]);

    if (!simState || chartData.length === 0) return null;

    return (
        <div className="space-y-4">
            {/* WIP Composition Chart */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <i className="fa-solid fa-layer-group text-indigo-500"></i>
                    WIP Composition
                </h3>
                
                <div className="h-[150px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <defs>
                                {nodes.map((node, i) => (
                                    <linearGradient key={node.id} id={`color-${node.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.1}/>
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="formattedTime" 
                                tick={{fontSize: 9, fill: '#94a3b8'}} 
                                axisLine={false} 
                                tickLine={false}
                                interval="preserveStartEnd"
                            />
                            <YAxis 
                                tick={{fontSize: 9, fill: '#94a3b8'}} 
                                axisLine={false} 
                                tickLine={false} 
                            />
                            <Tooltip 
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px'}}
                                itemStyle={{padding: 0}}
                            />
                            {nodes.map((node, i) => (
                                <Area
                                    key={node.id}
                                    type="monotone"
                                    dataKey={node.name}
                                    stackId="1"
                                    stroke={COLORS[i % COLORS.length]}
                                    fill={`url(#color-${node.id})`}
                                    strokeWidth={1}
                                    isAnimationActive={false}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Latency Decomposition Chart */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <i className="fa-solid fa-hourglass-half text-amber-500"></i>
                    Latency Decomposition (Avg)
                </h3>
                <div className="h-[150px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={latencyData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="name" 
                                tick={{fontSize: 9, fill: '#94a3b8'}} 
                                axisLine={false} 
                                tickLine={false} 
                                interval={0}
                            />
                            <YAxis 
                                tick={{fontSize: 9, fill: '#94a3b8'}} 
                                axisLine={false} 
                                tickLine={false} 
                                width={30}
                            />
                            <Tooltip 
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px'}}
                                cursor={{fill: 'transparent'}}
                            />
                            <Legend iconSize={8} wrapperStyle={{fontSize: '9px'}} />
                            <Bar dataKey="avgWait" name="Avg Wait (min)" stackId="a" fill="#f59e0b" />
                            <Bar dataKey="avgService" name="Avg Service (min)" stackId="a" fill="#10b981" radius={[2, 2, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Traffic Balance Radar */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <i className="fa-solid fa-satellite-dish text-sky-500"></i>
                    Traffic Balance (Utilization %)
                </h3>
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#64748b' }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8, fill: '#94a3b8' }} />
                            <Radar
                                name="Utilization"
                                dataKey="A"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="#3b82f6"
                                fillOpacity={0.4}
                            />
                            <Tooltip 
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px'}}
                                itemStyle={{padding: 0}}
                                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Utilization']}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Blocking Analysis Grid */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <i className="fa-solid fa-ban text-red-500"></i>
                    Blocking Analysis (Loss Rate)
                </h3>
                {blockingData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[80px] text-slate-400">
                        <i className="fa-regular fa-circle-check text-2xl text-emerald-500 mb-1"></i>
                        <span className="text-[10px] font-bold">System Healthy (No Blocking)</span>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {blockingData.map((item: any) => (
                            <div key={item.name} className="flex flex-col gap-1">
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span className="text-slate-600">{item.name}</span>
                                    <span className="text-red-600">{item.pct}% ({item.blockedCount} lost)</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-orange-400 to-red-600 rounded-full transition-all duration-300" 
                                        style={{ width: `${item.pct}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Throughput vs WIP Scatter */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <i className="fa-solid fa-chart-line text-emerald-500"></i>
                    Throughput vs. WIP (Penny Game Curve)
                </h3>
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                type="number" 
                                dataKey="wip" 
                                name="WIP" 
                                tick={{fontSize: 9, fill: '#94a3b8'}} 
                                label={{ value: 'Total WIP (Items)', position: 'insideBottom', offset: -5, fontSize: 9, fill: '#94a3b8' }}
                                domain={[0, 'auto']}
                            />
                            <YAxis 
                                type="number" 
                                dataKey="throughput" 
                                name="Throughput" 
                                tick={{fontSize: 9, fill: '#94a3b8'}} 
                                label={{ value: 'Throughput (Cust/Hr)', angle: -90, position: 'insideLeft', style: {fontSize: 9, fill: '#94a3b8'} }}
                            />
                            <Tooltip 
                                cursor={{ strokeDasharray: '3 3' }} 
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '10px'}}
                            />
                            <Scatter name="Throughput" data={scatterData} fill="#10b981" />
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default NetworkAnalytics;
