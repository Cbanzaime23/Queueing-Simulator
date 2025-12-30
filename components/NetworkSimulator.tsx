
import React, { useState, useEffect, useRef } from 'react';
import { NetworkNode, NetworkLink, QueueModel, RoutingStrategy, ResourcePool } from '../types';
import { NetworkEngine } from '../NetworkEngine';
import { solveJacksonNetwork, calculateTheoreticalMetrics } from '../mathUtils';

const NetworkSimulator: React.FC = () => {
    // --- State ---
    const [nodes, setNodes] = useState<NetworkNode[]>([
        { id: 'n1', name: 'Check-In', x: 100, y: 150, serverCount: 2, avgServiceTime: 5, capacity: 9999, isSource: true, externalLambda: 20, classARatio: 0.3, routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } },
        { id: 'n2', name: 'Security', x: 400, y: 150, serverCount: 3, avgServiceTime: 4, capacity: 10, isSource: false, externalLambda: 0, classARatio: 0.5, routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } },
        { id: 'n3', name: 'Manual Check', x: 400, y: 350, serverCount: 1, avgServiceTime: 10, capacity: 5, isSource: false, externalLambda: 0, classARatio: 0.5, routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } },
    ]);
    
    const [links, setLinks] = useState<NetworkLink[]>([
        { id: 'l1', sourceId: 'n1', targetId: 'n2', probability: 1.0, probA: 1.0, probB: 1.0 },
        { id: 'l2', sourceId: 'n2', targetId: 'n3', probability: 0.2, probA: 0.05, probB: 0.3 }, // VIPs (A) skip manual check mostly
    ]);

    const [resourcePools, setResourcePools] = useState<ResourcePool[]>([
        { id: 'r1', name: 'Doctors', totalCount: 2, availableCount: 2, color: 'bg-pink-500' },
        { id: 'r2', name: 'Scanners', totalCount: 1, availableCount: 1, color: 'bg-teal-500' }
    ]);

    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [engine, setEngine] = useState<NetworkEngine | null>(null);
    const [simState, setSimState] = useState<any>(null);
    const [isRunning, setIsRunning] = useState(false);
    
    // Canvas State
    const [isDragging, setIsDragging] = useState(false);
    const dragNodeRef = useRef<string | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // Theoretical State
    const [effLambdas, setEffLambdas] = useState<Map<string, number>>(new Map());

    // --- Effects ---
    useEffect(() => {
        // Init engine
        const eng = new NetworkEngine(nodes, links, resourcePools);
        setEngine(eng);
        setSimState(eng.getState());
        
        // Calculate Theoreticals
        const lambdaMap = solveJacksonNetwork(nodes, links);
        setEffLambdas(lambdaMap);
    }, []); // Run once on mount

    useEffect(() => {
        let frameId: number;
        if (isRunning && engine) {
            const loop = () => {
                engine.tick(0.1); // 0.1 min per tick
                setSimState({ ...engine.getState() });
                frameId = requestAnimationFrame(loop);
            };
            frameId = requestAnimationFrame(loop);
        }
        return () => cancelAnimationFrame(frameId);
    }, [isRunning, engine]);

    // Recalculate theoreticals when structure changes
    useEffect(() => {
        const lambdaMap = solveJacksonNetwork(nodes, links);
        setEffLambdas(lambdaMap);
    }, [nodes, links]);

    // --- Handlers ---
    const handleNodeDragStart = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setIsDragging(true);
        dragNodeRef.current = id;
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !dragNodeRef.current || !canvasRef.current) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setNodes(prev => prev.map(n => 
            n.id === dragNodeRef.current ? { ...n, x: x - 50, y: y - 30 } : n
        ));
    };

    const handleCanvasMouseUp = () => {
        setIsDragging(false);
        dragNodeRef.current = null;
    };

    const resetSim = () => {
        setIsRunning(false);
        const eng = new NetworkEngine(nodes, links, resourcePools);
        setEngine(eng);
        setSimState(eng.getState());
    };

    const addLink = (sourceId: string, targetId: string) => {
        const newLink: NetworkLink = {
            id: Math.random().toString(36).substr(2, 5),
            sourceId,
            targetId,
            probability: 1.0,
            probA: 1.0,
            probB: 1.0
        };
        setLinks([...links, newLink]);
        resetSim();
    };

    // --- Render Helpers ---
    const renderNode = (node: NetworkNode) => {
        // Live State if available, else Config State
        const liveNode = simState ? simState.nodes.find((n: NetworkNode) => n.id === node.id) : node;
        const qLength = liveNode.queue.length;
        const busyServers = liveNode.servers.filter((s: any) => s.state === 'BUSY').length;
        
        // Theoretical Metrics
        const lambdaEff = effLambdas.get(node.id) || 0;
        const mu = 60 / node.avgServiceTime;
        const theorMetrics = calculateTheoreticalMetrics(lambdaEff, mu, node.serverCount);

        // Resolve Resource Color
        const reqResource = resourcePools.find(r => r.id === node.resourcePoolId);

        return (
            <div 
                key={node.id}
                className={`absolute w-32 bg-white rounded-lg shadow-lg border-2 select-none group hover:border-blue-400 transition-colors ${selectedNodeId === node.id ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-200'}`}
                style={{ left: node.x, top: node.y }}
                onMouseDown={(e) => { handleNodeDragStart(e, node.id); setSelectedNodeId(node.id); }}
            >
                {/* Header */}
                <div className={`px-3 py-2 rounded-t-md text-xs font-bold text-white flex justify-between items-center ${node.isSource ? 'bg-emerald-500' : 'bg-slate-500'}`}>
                    <span>{node.name}</span>
                    {node.isSource && <i className="fa-solid fa-right-to-bracket"></i>}
                </div>

                {/* Body */}
                <div className="p-3 space-y-2">
                    {/* Visual Queue */}
                    <div className="flex gap-1 h-3 items-end">
                        {Array.from({ length: Math.min(8, qLength) }).map((_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full ${liveNode.queue[i] ? liveNode.queue[i].color : 'bg-red-400'}`}></div>
                        ))}
                        {qLength > 8 && <span className="text-[9px] text-slate-400">+{qLength - 8}</span>}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-1 text-[9px] text-slate-500">
                        <div>Srv: <span className="font-bold text-slate-700">{busyServers}/{node.serverCount}</span></div>
                        <div>Q: <span className={`font-bold ${qLength + busyServers >= node.capacity ? 'text-red-600' : 'text-slate-700'}`}>{qLength}</span></div>
                    </div>

                    {/* Blocked Stats (Only if non-zero) */}
                    {liveNode.stats.blockedCount > 0 && (
                        <div className="text-[9px] font-bold text-red-500 flex items-center justify-between">
                            <span>Blocked:</span>
                            <span>{liveNode.stats.blockedCount}</span>
                        </div>
                    )}

                    {/* Batch Indicators */}
                    <div className="flex gap-1">
                        {node.serviceBatchSize && node.serviceBatchSize > 1 && (
                            <span className="text-[8px] bg-indigo-100 text-indigo-700 px-1 rounded font-bold">
                                Batch:{node.serviceBatchSize}
                            </span>
                        )}
                    </div>

                    {/* Resource Dependency Indicator */}
                    {reqResource && (
                         <div className={`text-[9px] font-bold px-1 rounded text-white flex items-center gap-1 ${reqResource.color}`}>
                             <i className="fa-solid fa-user-doctor"></i> Req: {reqResource.name}
                         </div>
                    )}

                    {/* Theoretical Badge / Strategy Badge */}
                    <div className="flex justify-between items-center">
                        <div className={`text-[8px] px-1 py-0.5 rounded text-center font-mono ${theorMetrics.rho >= 1 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                            ρ={theorMetrics.rho.toFixed(2)}
                        </div>
                        {node.routingStrategy === RoutingStrategy.SHORTEST_QUEUE && (
                            <div className="text-[8px] font-bold text-purple-600" title="Shortest Queue Routing">
                                <i className="fa-solid fa-share-nodes"></i> JSQ
                            </div>
                        )}
                    </div>
                </div>

                {/* Ports */}
                <div className="absolute -right-2 top-1/2 w-4 h-4 bg-slate-300 rounded-full cursor-pointer hover:bg-blue-500" title="Drag to connect (Not impl in this basic view)"></div>
            </div>
        );
    };

    const renderLinks = () => {
        return (
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                    </marker>
                    <marker id="arrowhead-red" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
                    </marker>
                </defs>
                {links.map(link => {
                    const source = nodes.find(n => n.id === link.sourceId);
                    const target = nodes.find(n => n.id === link.targetId);
                    if (!source || !target) return null;

                    // Simple center-to-center line
                    const x1 = source.x + 64; // Center width
                    const y1 = source.y + 50; // Center height
                    const x2 = target.x + 64;
                    const y2 = target.y + 50;

                    // Visual Feedback for Blocking
                    const isBlocked = simState?.recentBlockedLinks?.includes(link.id);

                    // Probability Label: Hide if JSQ is active on source
                    const isJSQ = source.routingStrategy === RoutingStrategy.SHORTEST_QUEUE;
                    const probLabel = isJSQ 
                        ? 'JSQ' 
                        : `A:${((link.probA ?? link.probability) * 100).toFixed(0)} B:${((link.probB ?? link.probability) * 100).toFixed(0)}`;

                    return (
                        <g key={link.id}>
                            <line 
                                x1={x1} y1={y1} x2={x2} y2={y2} 
                                stroke={isBlocked ? "#ef4444" : "#94a3b8"} 
                                strokeWidth={isBlocked ? "4" : "2"}
                                strokeOpacity={isBlocked ? "0.8" : "1"}
                                markerEnd={isBlocked ? "url(#arrowhead-red)" : "url(#arrowhead)"} 
                                className="transition-all duration-75"
                            />
                            <text x={(x1+x2)/2} y={(y1+y2)/2 - 5} className={`text-[8px] font-bold bg-white/90 px-1 rounded border border-slate-100 ${isBlocked ? 'fill-red-500' : 'fill-slate-500'}`}>
                                {probLabel}
                            </text>
                        </g>
                    );
                })}
            </svg>
        );
    };

    // Live Resource Pools (from simState if running, else config)
    const liveResourcePools = simState ? simState.resourcePools : resourcePools;

    return (
        <div className="flex h-[calc(100vh-100px)] gap-4">
            {/* Sidebar Controls */}
            <div className="w-80 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                <div className="p-4 border-b bg-slate-50">
                    <h2 className="text-sm font-black uppercase text-slate-700 tracking-wider">Network Builder</h2>
                    <div className="flex gap-2 mt-4">
                        <button onClick={() => setIsRunning(!isRunning)} className={`flex-1 py-2 rounded text-xs font-bold text-white transition-colors ${isRunning ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                            <i className={`fa-solid ${isRunning ? 'fa-pause' : 'fa-play'} mr-2`}></i> {isRunning ? 'Pause' : 'Simulate'}
                        </button>
                        <button onClick={resetSim} className="px-4 py-2 bg-slate-200 text-slate-600 rounded text-xs font-bold hover:bg-slate-300">
                            <i className="fa-solid fa-rotate-left"></i>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Global Stats */}
                    {simState && (
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <h3 className="text-xs font-bold text-blue-800 uppercase mb-2">Network Stats</h3>
                            <div className="flex justify-between text-xs text-blue-700">
                                <span>Time:</span>
                                <span className="font-mono">{simState.currentTime.toFixed(1)} min</span>
                            </div>
                            <div className="flex justify-between text-xs text-blue-700 mt-1">
                                <span>Throughput:</span>
                                <span className="font-mono">{simState.totalExits} cust</span>
                            </div>
                        </div>
                    )}

                    {/* Global Resources Dashboard */}
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                            <i className="fa-solid fa-layer-group"></i> Global Resources
                        </h3>
                        <div className="space-y-3">
                            {liveResourcePools.map((pool: ResourcePool) => (
                                <div key={pool.id} className="space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold text-slate-600">
                                        <span>{pool.name}</span>
                                        <span>{pool.availableCount} / {pool.totalCount} Avail</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full ${pool.color} transition-all duration-300`} 
                                            style={{ width: `${(pool.availableCount / pool.totalCount) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Resource Editor (Simple) */}
                        <div className="mt-3 pt-3 border-t border-slate-200">
                            <button className="text-[10px] text-blue-600 font-bold hover:underline" onClick={() => {
                                // Add dummy resource logic for prototype
                                const newId = `r${resourcePools.length + 1}`;
                                setResourcePools([...resourcePools, { id: newId, name: `Resource ${newId}`, totalCount: 2, availableCount: 2, color: 'bg-indigo-500' }]);
                                resetSim();
                            }}>+ Add Resource Type</button>
                        </div>
                    </div>

                    {/* Node Editor */}
                    {selectedNodeId ? (
                        <div className="space-y-4 animate-fade-in">
                            <h3 className="text-xs font-bold text-slate-400 uppercase border-b pb-1">Edit Node</h3>
                            {(() => {
                                const node = nodes.find(n => n.id === selectedNodeId)!;
                                return (
                                    <>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase">Name</label>
                                            <input type="text" value={node.name} onChange={(e) => setNodes(nodes.map(n => n.id === node.id ? {...n, name: e.target.value} : n))} className="w-full p-2 border rounded text-xs" />
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase">Servers</label>
                                                <input type="number" min="1" max="20" value={node.serverCount} onChange={(e) => {
                                                    setNodes(nodes.map(n => n.id === node.id ? {...n, serverCount: parseInt(e.target.value)} : n));
                                                    resetSim();
                                                }} className="w-full p-2 border rounded text-xs" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase">Capacity</label>
                                                <input type="number" min="1" max="9999" value={node.capacity} onChange={(e) => {
                                                    setNodes(nodes.map(n => n.id === node.id ? {...n, capacity: parseInt(e.target.value)} : n));
                                                    resetSim();
                                                }} className="w-full p-2 border rounded text-xs" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase">Avg Svc Time (min)</label>
                                            <input type="number" min="0.1" max="60" value={node.avgServiceTime} onChange={(e) => {
                                                setNodes(nodes.map(n => n.id === node.id ? {...n, avgServiceTime: parseFloat(e.target.value)} : n));
                                                resetSim();
                                            }} className="w-full p-2 border rounded text-xs" />
                                        </div>

                                        {/* Resource Requirement Selector */}
                                        <div className="pt-2 border-t">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Required Resource</label>
                                            <select 
                                                value={node.resourcePoolId || ''} 
                                                onChange={(e) => {
                                                    setNodes(nodes.map(n => n.id === node.id ? {...n, resourcePoolId: e.target.value || undefined} : n));
                                                    resetSim();
                                                }}
                                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs"
                                            >
                                                <option value="">None (Standard)</option>
                                                {resourcePools.map(pool => (
                                                    <option key={pool.id} value={pool.id}>{pool.name} ({pool.totalCount})</option>
                                                ))}
                                            </select>
                                            <p className="text-[9px] text-slate-400 mt-1 italic">
                                                Service blocks if resource is unavailable.
                                            </p>
                                        </div>

                                        {/* Batch Config */}
                                        <div className="pt-2 border-t">
                                            <div className="mb-2">
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase">Service Batch Size</label>
                                                <div className="flex gap-2 items-center">
                                                    <input type="number" min="1" max="50" value={node.serviceBatchSize || 1} onChange={(e) => {
                                                        setNodes(nodes.map(n => n.id === node.id ? {...n, serviceBatchSize: parseInt(e.target.value)} : n));
                                                        resetSim();
                                                    }} className="w-full p-2 border rounded text-xs" />
                                                    <span className="text-[9px] text-slate-400">Processed at once</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Routing Strategy Selector */}
                                        <div className="pt-2 border-t">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Routing Strategy</label>
                                            <select 
                                                value={node.routingStrategy} 
                                                onChange={(e) => {
                                                    setNodes(nodes.map(n => n.id === node.id ? {...n, routingStrategy: e.target.value as RoutingStrategy} : n));
                                                    resetSim();
                                                }}
                                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-xs"
                                            >
                                                <option value={RoutingStrategy.PROBABILISTIC}>Probabilistic (Random)</option>
                                                <option value={RoutingStrategy.SHORTEST_QUEUE}>Join Shortest Queue (JSQ)</option>
                                            </select>
                                            {node.routingStrategy === RoutingStrategy.SHORTEST_QUEUE && (
                                                <p className="text-[9px] text-purple-600 mt-1 italic">
                                                    Ignores link probabilities. Balances load among connected nodes.
                                                </p>
                                            )}
                                        </div>
                                        
                                        <div className="pt-2 border-t">
                                            <label className="flex items-center gap-2">
                                                <input type="checkbox" checked={node.isSource} onChange={(e) => {
                                                    setNodes(nodes.map(n => n.id === node.id ? {...n, isSource: e.target.checked} : n));
                                                    resetSim();
                                                }} />
                                                <span className="text-xs font-bold text-slate-600">Is External Source?</span>
                                            </label>
                                            {node.isSource && (
                                                <div className="mt-2 space-y-2 pl-4 border-l-2 border-slate-200">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Arrivals (λ/hr)</label>
                                                        <input type="number" min="1" value={node.externalLambda} onChange={(e) => {
                                                            setNodes(nodes.map(n => n.id === node.id ? {...n, externalLambda: parseInt(e.target.value)} : n));
                                                            resetSim();
                                                        }} className="w-full p-2 border rounded text-xs" />
                                                    </div>
                                                    
                                                    {/* Arrival Batch Size */}
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Arrival Group Size</label>
                                                        <input type="number" min="1" max="50" value={node.arrivalBatchSize || 1} onChange={(e) => {
                                                            setNodes(nodes.map(n => n.id === node.id ? {...n, arrivalBatchSize: parseInt(e.target.value)} : n));
                                                            resetSim();
                                                        }} className="w-full p-2 border rounded text-xs" />
                                                    </div>

                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Class A Ratio (Gold)</label>
                                                        <div className="flex items-center gap-2">
                                                            <input type="range" min="0" max="1" step="0.1" value={node.classARatio || 0.5} onChange={(e) => {
                                                                setNodes(nodes.map(n => n.id === node.id ? {...n, classARatio: parseFloat(e.target.value)} : n));
                                                                resetSim();
                                                            }} className="w-full" />
                                                            <span className="text-[10px] font-mono">{(node.classARatio || 0.5).toFixed(1)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-2 border-t">
                                            <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2">Connections (Out)</h4>
                                            {links.filter(l => l.sourceId === node.id).map(l => (
                                                <div key={l.id} className={`mb-3 p-2 bg-slate-50 rounded border border-slate-200 ${node.routingStrategy === RoutingStrategy.SHORTEST_QUEUE ? 'opacity-50 grayscale' : ''}`}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[10px] font-bold text-slate-600">To: {nodes.find(n => n.id === l.targetId)?.name}</span>
                                                        <button onClick={() => {
                                                            setLinks(links.filter(link => link.id !== l.id));
                                                            resetSim();
                                                        }} className="text-red-400 hover:text-red-600"><i className="fa-solid fa-trash text-xs"></i></button>
                                                    </div>
                                                    {node.routingStrategy === RoutingStrategy.PROBABILISTIC && (
                                                        <div className="flex gap-2">
                                                            <div className="flex-1">
                                                                <label className="text-[8px] uppercase font-bold text-amber-600">Prob A</label>
                                                                <input 
                                                                    type="number" step="0.1" min="0" max="1"
                                                                    value={l.probA ?? l.probability} 
                                                                    onChange={(e) => {
                                                                        setLinks(links.map(link => link.id === l.id ? {...link, probA: parseFloat(e.target.value)} : link));
                                                                        resetSim();
                                                                    }}
                                                                    className="w-full p-1 border rounded text-xs" 
                                                                />
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="text-[8px] uppercase font-bold text-slate-500">Prob B</label>
                                                                <input 
                                                                    type="number" step="0.1" min="0" max="1"
                                                                    value={l.probB ?? l.probability} 
                                                                    onChange={(e) => {
                                                                        setLinks(links.map(link => link.id === l.id ? {...link, probB: parseFloat(e.target.value)} : link));
                                                                        resetSim();
                                                                    }}
                                                                    className="w-full p-1 border rounded text-xs" 
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            
                                            {/* Add Connection */}
                                            <div className="flex gap-2 mt-2">
                                                <select className="flex-1 text-xs border rounded p-1" id="targetSelect">
                                                    {nodes.filter(n => n.id !== node.id).map(n => (
                                                        <option key={n.id} value={n.id}>{n.name}</option>
                                                    ))}
                                                </select>
                                                <button onClick={() => {
                                                    const select = document.getElementById('targetSelect') as HTMLSelectElement;
                                                    addLink(node.id, select.value);
                                                }} className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-xs font-bold">+ Link</button>
                                            </div>
                                        </div>
                                    </>
                                )
                            })()}
                        </div>
                    ) : (
                        <div className="text-center text-slate-400 text-xs py-8 italic">
                            Select a node to edit properties
                        </div>
                    )}
                </div>
            </div>

            {/* Canvas */}
            <div 
                ref={canvasRef}
                className="flex-1 bg-slate-50 rounded-xl border border-slate-200 relative overflow-hidden cursor-move"
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
            >
                <div className="absolute top-4 left-4 z-10 bg-white/80 p-2 rounded text-[10px] text-slate-400 font-mono pointer-events-none">
                    Multi-Stage Canvas • Drag to Move Nodes
                </div>
                
                {renderLinks()}
                {nodes.map(renderNode)}
            </div>
        </div>
    );
};

export default NetworkSimulator;
