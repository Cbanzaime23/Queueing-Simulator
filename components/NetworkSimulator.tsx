

import React, { useState, useEffect, useRef } from 'react';
import { NetworkNode, NetworkLink, QueueModel, RoutingStrategy, ResourcePool } from '../types';
import { NetworkEngine } from '../NetworkEngine';
import { solveJacksonNetwork, calculateTheoreticalMetrics } from '../mathUtils';

interface VisualParticle {
    id: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    color: string;
    startTime: number;
}

interface ViewState {
    x: number;
    y: number;
    scale: number;
}

const getHeatmapColor = (utilization: number) => {
    // Clamp 0-1
    const u = Math.max(0, Math.min(1, utilization));
    
    // Green (34, 197, 94) -> Yellow (234, 179, 8) -> Red (239, 68, 68)
    let r, g, b;
    if (u < 0.5) {
        // Green to Yellow
        const t = u * 2;
        r = 34 + (234 - 34) * t;
        g = 197 + (179 - 197) * t;
        b = 94 + (8 - 94) * t;
    } else {
        // Yellow to Red
        const t = (u - 0.5) * 2;
        r = 234 + (239 - 234) * t;
        g = 179 + (68 - 179) * t;
        b = 8 + (68 - 8) * t;
    }
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
};

const NetworkSimulator: React.FC = () => {
    // --- State ---
    const [nodes, setNodes] = useState<NetworkNode[]>([]);
    const [links, setLinks] = useState<NetworkLink[]>([]);
    const [resourcePools, setResourcePools] = useState<ResourcePool[]>([]);

    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [engine, setEngine] = useState<NetworkEngine | null>(null);
    const [simState, setSimState] = useState<any>(null);
    const [isRunning, setIsRunning] = useState(false);
    
    // Heatmap Toggle
    const [isHeatmapMode, setIsHeatmapMode] = useState(false);
    
    // Visual Particle State
    const [particles, setParticles] = useState<VisualParticle[]>([]);
    
    // File Input Ref for loading scenarios
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Canvas View State (Pan & Zoom)
    const [viewState, setViewState] = useState<ViewState>({ x: 0, y: 0, scale: 1 });
    
    // Canvas Interaction State
    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const dragNodeRef = useRef<string | null>(null);
    const lastMousePos = useRef<{x: number, y: number} | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // Theoretical State
    const [effLambdas, setEffLambdas] = useState<Map<string, number>>(new Map());

    // --- Scenario Loader ---
    const loadScenario = (type: 'AIRPORT' | 'HOSPITAL' | 'EMPTY') => {
        setIsRunning(false);
        setSimState(null);
        setSelectedNodeId(null);
        setParticles([]);
        // Reset View
        setViewState({ x: 0, y: 0, scale: 1 });

        if (type === 'EMPTY') {
            setNodes([]);
            setLinks([]);
            setResourcePools([]);
        } else if (type === 'AIRPORT') {
            setResourcePools([
                { id: 'r1', name: 'Supervisors', totalCount: 2, availableCount: 2, color: 'bg-pink-500' },
                { id: 'r2', name: 'Scanners', totalCount: 1, availableCount: 1, color: 'bg-teal-500' }
            ]);
            setNodes([
                { id: 'n1', name: 'Check-In', x: 50, y: 100, serverCount: 2, avgServiceTime: 5, capacity: 9999, isSource: true, externalLambda: 20, classARatio: 0.3, routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } },
                { id: 'n2', name: 'Security', x: 300, y: 100, serverCount: 3, avgServiceTime: 4, capacity: 10, isSource: false, externalLambda: 0, classARatio: 0.5, routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } },
                { id: 'n3', name: 'Manual Check', x: 300, y: 350, serverCount: 1, avgServiceTime: 10, capacity: 5, isSource: false, externalLambda: 0, classARatio: 0.5, routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } },
            ]);
            setLinks([
                { id: 'l1', sourceId: 'n1', targetId: 'n2', probability: 1.0, probA: 1.0, probB: 1.0, condition: 'ALL' },
                { id: 'l2', sourceId: 'n2', targetId: 'n3', probability: 0.2, probA: 0.05, probB: 0.3, condition: 'ALL' }, 
            ]);
        } else if (type === 'HOSPITAL') {
            setResourcePools([
                { id: 'rp_doc', name: 'Doctors', totalCount: 5, availableCount: 5, color: 'bg-indigo-500' },
                { id: 'rp_nurse', name: 'Nurses', totalCount: 4, availableCount: 4, color: 'bg-rose-500' },
                { id: 'rp_tech', name: 'Lab Techs', totalCount: 2, availableCount: 2, color: 'bg-cyan-500' }
            ]);
            setNodes([
                // Registration
                { id: 'h1', name: 'Registration', x: 20, y: 150, serverCount: 2, avgServiceTime: 3, capacity: 50, isSource: true, externalLambda: 15, routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, classARatio: 0.1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } },
                // Triage (Requires Nurse)
                { id: 'h2', name: 'Triage Nurse', x: 250, y: 150, serverCount: 3, avgServiceTime: 5, capacity: 20, isSource: false, externalLambda: 0, resourcePoolId: 'rp_nurse', routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } },
                // GP (Requires Doctor)
                { id: 'h3', name: 'Gen. Practice', x: 500, y: 50, serverCount: 4, avgServiceTime: 15, capacity: 20, isSource: false, externalLambda: 0, resourcePoolId: 'rp_doc', routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } },
                // Lab (Requires Tech)
                { id: 'h4', name: 'X-Ray / Lab', x: 500, y: 300, serverCount: 2, avgServiceTime: 10, capacity: 10, isSource: false, externalLambda: 0, resourcePoolId: 'rp_tech', routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } },
                // Pharmacy
                { id: 'h5', name: 'Pharmacy', x: 750, y: 150, serverCount: 1, avgServiceTime: 4, capacity: 15, isSource: false, externalLambda: 0, routingStrategy: RoutingStrategy.PROBABILISTIC, arrivalBatchSize: 1, serviceBatchSize: 1, queue: [], servers: [], stats: { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 } }
            ]);
            setLinks([
                { id: 'l_h1_h2', sourceId: 'h1', targetId: 'h2', probability: 1.0, probA: 1.0, probB: 1.0, condition: 'ALL' },
                { id: 'l_h2_h3', sourceId: 'h2', targetId: 'h3', probability: 0.7, probA: 0.9, probB: 0.65, condition: 'ALL' }, // Most go to GP
                { id: 'l_h2_h4', sourceId: 'h2', targetId: 'h4', probability: 0.3, probA: 0.1, probB: 0.35, condition: 'ALL' }, // Some go straight to lab
                { id: 'l_h4_h3', sourceId: 'h4', targetId: 'h3', probability: 1.0, probA: 1.0, probB: 1.0, condition: 'ALL' }, // Lab results go to GP
                { id: 'l_h3_h5', sourceId: 'h3', targetId: 'h5', probability: 0.6, probA: 0.8, probB: 0.5, condition: 'ALL' }, // 60% need meds
                // Remainder of h3 (40%) exits system
            ]);
        }
    };

    // --- Save / Load Handlers ---
    const handleSaveNetwork = () => {
        const data = {
            nodes,
            links,
            resourcePools,
            timestamp: Date.now()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'network_config.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleLoadNetwork = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                const data = JSON.parse(content);

                if (Array.isArray(data.nodes) && Array.isArray(data.links)) {
                    // Stop any running sim
                    setIsRunning(false);
                    setEngine(null);
                    setSimState(null);
                    setSelectedNodeId(null);
                    setParticles([]);
                    
                    // Reset engine explicitly to null first to ensure clean state
                    setEngine(null);

                    // Load Data
                    setNodes(data.nodes);
                    setLinks(data.links);
                    setResourcePools(data.resourcePools || []);
                    setViewState({ x: 0, y: 0, scale: 1 });
                    
                    // Reset input so same file works again
                    if (fileInputRef.current) fileInputRef.current.value = '';
                } else {
                    alert("Invalid JSON format: Missing 'nodes' or 'links' arrays.");
                }
            } catch (err) {
                console.error(err);
                alert("Error parsing JSON file. Please check the file format.");
            }
        };
        reader.readAsText(file);
    };

    // --- Effects ---
    useEffect(() => {
        // Initial load
        loadScenario('HOSPITAL');
    }, []);

    useEffect(() => {
        // When running, update state in loop
        let frameId: number;
        if (isRunning && engine) {
            const loop = () => {
                engine.tick(0.1); // 0.1 min per tick
                const newState = engine.getState();
                setSimState({ ...newState });
                
                // --- Process Visualization Particles ---
                const now = performance.now();
                if (newState.routingEvents && newState.routingEvents.length > 0) {
                    const newParticles: VisualParticle[] = [];
                    
                    newState.routingEvents.forEach((evt: any) => {
                         const source = nodes.find(n => n.id === evt.sourceId);
                         const target = nodes.find(n => n.id === evt.targetId);
                         if (source && target) {
                             newParticles.push({
                                 id: Math.random().toString(36).substr(2, 9),
                                 startX: source.x + 72, // Center offset
                                 startY: source.y + 60,
                                 endX: target.x + 72,
                                 endY: target.y + 60,
                                 // Class A = Amber, Class B = Grey
                                 color: evt.classType === 'A' ? '#fbbf24' : '#94a3b8', 
                                 startTime: now
                             });
                         }
                    });

                    setParticles(prev => {
                        // Filter out old ones (> 500ms) and add new ones
                        const active = prev.filter(p => now - p.startTime < 500);
                        return [...active, ...newParticles];
                    });
                } else {
                    // Cleanup old particles even if no new events
                    setParticles(prev => {
                        const active = prev.filter(p => now - p.startTime < 500);
                        return active.length !== prev.length ? active : prev;
                    });
                }

                frameId = requestAnimationFrame(loop);
            };
            frameId = requestAnimationFrame(loop);
        } else if (!engine && nodes.length > 0) {
            // Re-init engine if nodes changed but not running
             const eng = new NetworkEngine(nodes, links, resourcePools);
             setEngine(eng);
             setSimState(eng.getState());
        }
        return () => cancelAnimationFrame(frameId);
    }, [isRunning, engine, nodes, links, resourcePools]); // dependencies ensure fresh closure

    // Recalculate theoreticals when structure changes
    useEffect(() => {
        const lambdaMap = solveJacksonNetwork(nodes, links);
        setEffLambdas(lambdaMap);
        
        // Re-create engine to reflect structural changes immediately
        if (!isRunning) {
            const eng = new NetworkEngine(nodes, links, resourcePools);
            setEngine(eng);
            setSimState(eng.getState());
        }
    }, [nodes, links, resourcePools]);


    // --- Interaction Handlers (Canvas) ---

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        // Middle mouse or Space+Left usually pan, but here we treat background drag as pan
        // unless a node was clicked (which stops propagation to here)
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        
        // PANNING
        if (isPanning && lastMousePos.current) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            
            setViewState(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        // NODE DRAGGING
        if (isDraggingNode && dragNodeRef.current && lastMousePos.current) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            
            // Adjust delta by zoom scale so node follows mouse speed exactly
            const worldDx = dx / viewState.scale;
            const worldDy = dy / viewState.scale;

            setNodes(prev => prev.map(n => 
                n.id === dragNodeRef.current ? { ...n, x: n.x + worldDx, y: n.y + worldDy } : n
            ));
            
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleCanvasMouseUp = () => {
        setIsDraggingNode(false);
        setIsPanning(false);
        dragNodeRef.current = null;
        lastMousePos.current = null;
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        const newScale = Math.min(Math.max(0.2, viewState.scale + scaleAmount), 3);
        setViewState(prev => ({ ...prev, scale: newScale }));
    };

    // --- Interaction Handlers (Nodes) ---

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setSelectedNodeId(id);
        setIsDraggingNode(true);
        dragNodeRef.current = id;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    // --- Interaction Handlers (Touch) ---

    const handleCanvasTouchStart = (e: React.TouchEvent) => {
        // 1 finger on background = Pan
        if (e.touches.length === 1) {
            setIsPanning(true);
            const t = e.touches[0];
            lastMousePos.current = { x: t.clientX, y: t.clientY };
        }
    };

    const handleNodeTouchStart = (e: React.TouchEvent, id: string) => {
        e.stopPropagation();
        setSelectedNodeId(id);
        setIsDraggingNode(true);
        dragNodeRef.current = id;
        const t = e.touches[0];
        lastMousePos.current = { x: t.clientX, y: t.clientY };
    };

    const handleCanvasTouchMove = (e: React.TouchEvent) => {
        // e.preventDefault(); // Handled by CSS touch-action: none
        if (!lastMousePos.current) return;
        const t = e.touches[0];

        if (isPanning) {
            const dx = t.clientX - lastMousePos.current.x;
            const dy = t.clientY - lastMousePos.current.y;
            setViewState(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            lastMousePos.current = { x: t.clientX, y: t.clientY };
        } else if (isDraggingNode && dragNodeRef.current) {
            const dx = t.clientX - lastMousePos.current.x;
            const dy = t.clientY - lastMousePos.current.y;
            const worldDx = dx / viewState.scale;
            const worldDy = dy / viewState.scale;
            
            setNodes(prev => prev.map(n => 
                n.id === dragNodeRef.current ? { ...n, x: n.x + worldDx, y: n.y + worldDy } : n
            ));
            lastMousePos.current = { x: t.clientX, y: t.clientY };
        }
    };

    const resetSim = () => {
        setIsRunning(false);
        setParticles([]);
        const eng = new NetworkEngine(nodes, links, resourcePools);
        setEngine(eng);
        setSimState(eng.getState());
    };

    const addLink = (sourceId: string, targetId: string) => {
        // Prevent duplicates
        if (links.some(l => l.sourceId === sourceId && l.targetId === targetId)) return;

        const newLink: NetworkLink = {
            id: Math.random().toString(36).substr(2, 5),
            sourceId,
            targetId,
            probability: 1.0,
            probA: 1.0,
            probB: 1.0,
            condition: 'ALL'
        };
        setLinks([...links, newLink]);
        resetSim();
    };

    // --- Render Helpers ---
    const renderNode = (node: NetworkNode) => {
        // Live State if available, else Config State
        // Safe access to simState.nodes with fallback to config node
        const liveNode = (simState?.nodes?.find((n: NetworkNode) => n.id === node.id)) || node;
        
        // Safe access to array lengths
        const qLength = liveNode.queue?.length || 0;
        const busyServers = liveNode.servers?.filter((s: any) => s.state === 'BUSY').length || 0;
        const blockedCount = liveNode.stats?.blockedCount || 0;
        
        // Heatmap Logic
        const utilization = liveNode.stats?.utilization || 0;
        const isHighBlocking = blockedCount > 5;
        
        // Styles
        const baseClasses = "absolute w-36 rounded-lg shadow-lg border-2 select-none group transition-colors z-10 touch-none";
        let borderClass = selectedNodeId === node.id ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-200';
        
        // Apply Heatmap Overrides
        if (isHeatmapMode) {
             if (isHighBlocking) {
                 borderClass = 'border-red-600 animate-pulse ring-4 ring-red-400 ring-opacity-30';
             } else {
                 borderClass = selectedNodeId === node.id ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-600';
             }
        }

        const bgStyle = isHeatmapMode ? { backgroundColor: getHeatmapColor(utilization) } : {};
        const bgClass = isHeatmapMode ? '' : 'bg-white';
        const headerClass = isHeatmapMode ? 'bg-black/20' : (node.isSource ? 'bg-emerald-500' : 'bg-slate-500');
        const textClass = isHeatmapMode ? 'text-white drop-shadow-md' : 'text-slate-700';
        const subTextClass = isHeatmapMode ? 'text-white/90 drop-shadow-md' : 'text-slate-500';

        // Theoretical Metrics
        const lambdaEff = effLambdas.get(node.id) || 0;
        const mu = 60 / node.avgServiceTime;
        const theorMetrics = calculateTheoreticalMetrics(lambdaEff, mu, node.serverCount);

        // Resolve Resource Color
        const reqResource = resourcePools.find(r => r.id === node.resourcePoolId);

        return (
            <div 
                key={node.id}
                className={`${baseClasses} ${borderClass} ${bgClass}`}
                style={{ left: node.x, top: node.y, ...bgStyle }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onTouchStart={(e) => handleNodeTouchStart(e, node.id)}
            >
                {/* Header */}
                <div className={`px-3 py-2 rounded-t-md text-xs font-bold text-white flex justify-between items-center ${headerClass}`}>
                    <span>{node.name}</span>
                    {node.isSource && <i className="fa-solid fa-right-to-bracket"></i>}
                </div>

                {/* Body */}
                <div className="p-3 space-y-2">
                    {/* Visual Queue (Hide dots in heatmap to reduce noise, or keep simple) */}
                    {!isHeatmapMode && (
                        <div className="flex gap-1 h-3 items-end">
                            {Array.from({ length: Math.min(8, qLength) }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 rounded-full ${liveNode.queue && liveNode.queue[i] ? liveNode.queue[i].color : 'bg-red-400'}`}></div>
                            ))}
                            {qLength > 8 && <span className="text-[9px] text-slate-400">+{qLength - 8}</span>}
                        </div>
                    )}
                    
                    {/* Simplified Stats for Heatmap */}
                    <div className={`grid grid-cols-2 gap-1 text-[9px] ${subTextClass}`}>
                        <div>Srv: <span className={`font-bold ${textClass}`}>{busyServers}/{node.serverCount}</span></div>
                        <div>Q: <span className={`font-bold ${qLength + busyServers >= node.capacity ? 'text-red-600' : textClass}`}>{qLength}</span></div>
                    </div>
                    
                    {isHeatmapMode && (
                         <div className="text-[9px] font-bold text-white drop-shadow-md">
                             Util: {(utilization * 100).toFixed(0)}%
                         </div>
                    )}

                    {/* Blocked Stats (Only if non-zero) */}
                    {blockedCount > 0 && (
                        <div className={`text-[9px] font-bold flex items-center justify-between ${isHeatmapMode ? 'text-white' : 'text-red-500'}`}>
                            <span>Blocked:</span>
                            <span>{blockedCount}</span>
                        </div>
                    )}

                    {/* Resource Dependency Indicator */}
                    {reqResource && (
                         <div className={`text-[9px] font-bold px-1 rounded text-white flex items-center gap-1 ${reqResource.color} shadow-sm`}>
                             <i className="fa-solid fa-user-doctor"></i> Req: {reqResource.name}
                         </div>
                    )}

                    {/* Theoretical Badge / Strategy Badge */}
                    <div className="flex justify-between items-center mt-1">
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

                    // Simple center-to-center line with offset for width (36*4 = 144px width approx, center is 72)
                    const x1 = source.x + 72; 
                    const y1 = source.y + 60; 
                    const x2 = target.x + 72;
                    const y2 = target.y + 60;

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
                            {/* Class Condition Badge */}
                            {link.condition === 'CLASS_A_ONLY' && (
                                <g transform={`translate(${(x1+x2)/2 - 15}, ${(y1+y2)/2 - 10})`}>
                                    <circle r="6" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
                                    <text x="0" y="3" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#78350f">A</text>
                                </g>
                            )}
                            {link.condition === 'CLASS_B_ONLY' && (
                                <g transform={`translate(${(x1+x2)/2 - 15}, ${(y1+y2)/2 - 10})`}>
                                    <circle r="6" fill="#94a3b8" stroke="#475569" strokeWidth="1" />
                                    <text x="0" y="3" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#ffffff">B</text>
                                </g>
                            )}
                            
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
        <div className="flex flex-col lg:flex-row min-h-screen lg:h-[calc(100vh-100px)] gap-4 pb-4 lg:pb-0">
            {/* Sidebar Controls */}
            <div className="w-full lg:w-80 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col shrink-0 lg:max-h-full">
                <div className="p-4 border-b bg-slate-50 space-y-3">
                    <h2 className="text-sm font-black uppercase text-slate-700 tracking-wider hidden lg:block">Network Builder</h2>
                    
                    {/* Scenario Selector */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Scenario Preset</label>
                        <select 
                            onChange={(e) => loadScenario(e.target.value as any)} 
                            className="w-full text-xs font-bold text-slate-700 p-2 border rounded bg-white"
                            defaultValue="HOSPITAL"
                        >
                            <option value="HOSPITAL">🏥 Hospital Outpatient (Resource Pools)</option>
                            <option value="AIRPORT">✈️ Airport Security (Multi-Stage)</option>
                            <option value="EMPTY">⚪ Blank Canvas</option>
                        </select>
                    </div>
                    
                    {/* Heatmap Toggle */}
                    <div className="flex items-center justify-between bg-slate-100 p-2 rounded border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-600 uppercase">Heatmap Mode</span>
                        <button 
                            onClick={() => setIsHeatmapMode(!isHeatmapMode)}
                            className={`w-10 h-5 rounded-full relative transition-colors ${isHeatmapMode ? 'bg-orange-500' : 'bg-slate-300'}`}
                        >
                            <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${isHeatmapMode ? 'left-6' : 'left-1'}`}></div>
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={() => setIsRunning(!isRunning)} className={`flex-1 py-2 rounded text-xs font-bold text-white transition-colors ${isRunning ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                            <i className={`fa-solid ${isRunning ? 'fa-pause' : 'fa-play'} mr-2`}></i> {isRunning ? 'Pause' : 'Simulate'}
                        </button>
                        <button onClick={resetSim} className="px-4 py-2 bg-slate-200 text-slate-600 rounded text-xs font-bold hover:bg-slate-300">
                            <i className="fa-solid fa-rotate-left"></i>
                        </button>
                    </div>

                    {/* SAVE / LOAD JSON */}
                     <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                         <input 
                            type="file" 
                            ref={fileInputRef} 
                            style={{ display: 'none' }} 
                            accept=".json" 
                            onChange={handleLoadNetwork} 
                         />
                         <button onClick={handleSaveNetwork} className="px-2 py-1.5 bg-white border border-slate-300 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1">
                             <i className="fa-solid fa-download"></i> Save JSON
                         </button>
                         <button onClick={() => fileInputRef.current?.click()} className="px-2 py-1.5 bg-white border border-slate-300 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1">
                             <i className="fa-solid fa-upload"></i> Load JSON
                         </button>
                     </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6 max-h-[40vh] lg:max-h-none">
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
                            {/* NEW STAT */}
                            <div className="flex justify-between text-xs text-blue-700 mt-1 border-t border-blue-200 pt-1">
                                <span>Avg System Time:</span>
                                <span className="font-mono">
                                    {simState.totalExits > 0 
                                        ? (simState.totalGlobalSystemTime / simState.totalExits).toFixed(2) 
                                        : '0.00'} min
                                </span>
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
                                    {/* Resource Editor Mini (Only when stopped) */}
                                    {!isRunning && (
                                        <div className="flex justify-between items-center px-1">
                                            <button 
                                                onClick={() => {
                                                    setResourcePools(prev => prev.map(p => p.id === pool.id ? {...p, totalCount: Math.max(1, p.totalCount - 1), availableCount: Math.max(1, p.totalCount - 1)} : p));
                                                }}
                                                className="text-[10px] text-slate-400 hover:text-red-500"
                                            >-</button>
                                            <button 
                                                onClick={() => {
                                                    setResourcePools(prev => prev.map(p => p.id === pool.id ? {...p, totalCount: p.totalCount + 1, availableCount: p.totalCount + 1} : p));
                                                }}
                                                className="text-[10px] text-slate-400 hover:text-green-500"
                                            >+</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        
                        {/* Resource Editor (Simple) */}
                        <div className="mt-3 pt-3 border-t border-slate-200">
                            <button className="text-[10px] text-blue-600 font-bold hover:underline" onClick={() => {
                                const newId = `r${resourcePools.length + 1}`;
                                setResourcePools([...resourcePools, { id: newId, name: `Resource ${newId}`, totalCount: 2, availableCount: 2, color: 'bg-indigo-500' }]);
                            }}>+ Add Resource Type</button>
                        </div>
                    </div>

                    {/* Node Editor */}
                    {selectedNodeId ? (
                        <div className="space-y-4 animate-fade-in bg-slate-50 p-3 rounded-lg border border-slate-200">
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
                                                }} className="w-full p-2 border rounded text-xs" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase">Capacity</label>
                                                <input type="number" min="1" max="9999" value={node.capacity} onChange={(e) => {
                                                    setNodes(nodes.map(n => n.id === node.id ? {...n, capacity: parseInt(e.target.value)} : n));
                                                }} className="w-full p-2 border rounded text-xs" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase">Avg Svc Time (min)</label>
                                            <input type="number" min="0.1" max="60" value={node.avgServiceTime} onChange={(e) => {
                                                setNodes(nodes.map(n => n.id === node.id ? {...n, avgServiceTime: parseFloat(e.target.value)} : n));
                                            }} className="w-full p-2 border rounded text-xs" />
                                        </div>

                                        {/* Resource Requirement Selector */}
                                        <div className="pt-2 border-t">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Required Resource</label>
                                            <select 
                                                value={node.resourcePoolId || ''} 
                                                onChange={(e) => {
                                                    setNodes(nodes.map(n => n.id === node.id ? {...n, resourcePoolId: e.target.value || undefined} : n));
                                                }}
                                                className="w-full p-2 bg-white border border-slate-200 rounded text-xs"
                                            >
                                                <option value="">None (Standard)</option>
                                                {resourcePools.map(pool => (
                                                    <option key={pool.id} value={pool.id}>{pool.name} ({pool.totalCount})</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Routing Strategy Selector */}
                                        <div className="pt-2 border-t">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Routing Strategy</label>
                                            <select 
                                                value={node.routingStrategy} 
                                                onChange={(e) => {
                                                    setNodes(nodes.map(n => n.id === node.id ? {...n, routingStrategy: e.target.value as RoutingStrategy} : n));
                                                }}
                                                className="w-full p-2 bg-white border border-slate-200 rounded text-xs"
                                            >
                                                <option value={RoutingStrategy.PROBABILISTIC}>Probabilistic (Random)</option>
                                                <option value={RoutingStrategy.SHORTEST_QUEUE}>Join Shortest Queue (JSQ)</option>
                                            </select>
                                        </div>
                                        
                                        <div className="pt-2 border-t">
                                            <label className="flex items-center gap-2">
                                                <input type="checkbox" checked={node.isSource} onChange={(e) => {
                                                    setNodes(nodes.map(n => n.id === node.id ? {...n, isSource: e.target.checked} : n));
                                                }} />
                                                <span className="text-xs font-bold text-slate-600">Is External Source?</span>
                                            </label>
                                            {node.isSource && (
                                                <div className="mt-2 space-y-2 pl-4 border-l-2 border-slate-200">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Arrivals (λ/hr)</label>
                                                        <input type="number" min="1" value={node.externalLambda} onChange={(e) => {
                                                            setNodes(nodes.map(n => n.id === node.id ? {...n, externalLambda: parseInt(e.target.value)} : n));
                                                        }} className="w-full p-2 border rounded text-xs" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Gold Class Ratio</label>
                                                        <div className="flex items-center gap-2">
                                                            <input type="range" min="0" max="1" step="0.1" value={node.classARatio || 0.5} onChange={(e) => {
                                                                setNodes(nodes.map(n => n.id === node.id ? {...n, classARatio: parseFloat(e.target.value)} : n));
                                                            }} className="w-full accent-amber-500" />
                                                            <span className="text-[10px] font-mono">{(node.classARatio || 0.5).toFixed(1)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-2 border-t">
                                            <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2">Connections (Out)</h4>
                                            {links.filter(l => l.sourceId === node.id).map(l => (
                                                <div key={l.id} className={`mb-3 p-2 bg-white rounded border border-slate-200 ${node.routingStrategy === RoutingStrategy.SHORTEST_QUEUE ? 'opacity-80' : ''}`}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[10px] font-bold text-slate-600">To: {nodes.find(n => n.id === l.targetId)?.name}</span>
                                                        <button onClick={() => {
                                                            setLinks(links.filter(link => link.id !== l.id));
                                                        }} className="text-red-400 hover:text-red-600"><i className="fa-solid fa-trash text-xs"></i></button>
                                                    </div>
                                                    
                                                    {/* Condition Selector */}
                                                    <div className="mb-2">
                                                        <label className="text-[8px] uppercase font-bold text-slate-400 block mb-1">Routing Condition</label>
                                                        <select 
                                                            value={l.condition || 'ALL'} 
                                                            onChange={(e) => {
                                                                setLinks(links.map(link => link.id === l.id ? {...link, condition: e.target.value as any} : link));
                                                            }}
                                                            className="w-full p-1 border rounded text-[9px] bg-slate-50"
                                                        >
                                                            <option value="ALL">All Classes (Standard)</option>
                                                            <option value="CLASS_A_ONLY">Class A Only (VIP)</option>
                                                            <option value="CLASS_B_ONLY">Class B Only (Standard)</option>
                                                        </select>
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

            {/* Canvas Container */}
            <div 
                ref={canvasRef}
                className="flex-1 bg-slate-50 rounded-xl border border-slate-200 relative overflow-hidden min-h-[400px]"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                onTouchStart={handleCanvasTouchStart}
                onTouchMove={handleCanvasTouchMove}
                onTouchEnd={handleCanvasMouseUp}
                onWheel={handleWheel}
                style={{ touchAction: 'none', cursor: isPanning ? 'grabbing' : 'grab' }}
            >
                {/* Background Dot Grid */}
                <div 
                    className="absolute inset-0 pointer-events-none opacity-20"
                    style={{
                        backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
                        backgroundSize: `${20 * viewState.scale}px ${20 * viewState.scale}px`,
                        backgroundPosition: `${viewState.x}px ${viewState.y}px`
                    }}
                ></div>

                {/* Info Text (Fixed) */}
                <div className="absolute top-4 left-4 z-30 bg-white/80 p-2 rounded text-[10px] text-slate-400 font-mono pointer-events-none shadow-sm backdrop-blur">
                    Pan: Drag Background • Zoom: Wheel / Pinch
                </div>

                {/* View Controls (Zoom) */}
                <div className="absolute top-4 right-4 z-40 flex flex-col gap-2">
                    <button 
                        onClick={() => setViewState(p => ({...p, scale: Math.min(p.scale + 0.2, 3)}))}
                        className="w-8 h-8 bg-white rounded shadow text-slate-600 hover:bg-slate-50 flex items-center justify-center font-bold"
                    >
                        +
                    </button>
                    <button 
                        onClick={() => setViewState(p => ({...p, scale: Math.max(p.scale - 0.2, 0.2)}))}
                        className="w-8 h-8 bg-white rounded shadow text-slate-600 hover:bg-slate-50 flex items-center justify-center font-bold"
                    >
                        -
                    </button>
                    <button 
                        onClick={() => setViewState({x:0, y:0, scale: 1})}
                        className="w-8 h-8 bg-white rounded shadow text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex items-center justify-center"
                        title="Reset View"
                    >
                        <i className="fa-solid fa-expand text-xs"></i>
                    </button>
                </div>
                
                {/* Transformed World Container */}
                <div 
                    style={{ 
                        transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`,
                        transformOrigin: '0 0',
                        width: '100%',
                        height: '100%'
                    }}
                >
                    {renderLinks()}
                    
                    {/* Visual Particles Layer */}
                    <div className="absolute inset-0 pointer-events-none overflow-visible z-20">
                        {particles.map(p => (
                            <div 
                                key={p.id}
                                className="absolute w-3 h-3 rounded-full border border-white shadow-sm particle-anim"
                                style={{
                                    backgroundColor: p.color,
                                    // CSS Variables for the animation
                                    '--start-x': `${p.startX}px`,
                                    '--start-y': `${p.startY}px`,
                                    '--end-x': `${p.endX}px`,
                                    '--end-y': `${p.endY}px`,
                                } as React.CSSProperties}
                            ></div>
                        ))}
                    </div>

                    {nodes.map(renderNode)}
                </div>

                {/* Heatmap Legend (Fixed) */}
                {isHeatmapMode && (
                    <div className="absolute bottom-4 left-4 bg-white/90 p-3 rounded-lg border border-slate-200 shadow-sm z-30 backdrop-blur">
                        <h4 className="text-[10px] font-bold uppercase text-slate-500 mb-2">Heatmap (Utilization)</h4>
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                            <span>0%</span>
                            <div className="w-24 h-2 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"></div>
                            <span>100%</span>
                        </div>
                        <div className="mt-2 text-[9px] text-slate-400 flex items-center gap-1">
                            <div className="w-2 h-2 border border-red-500 rounded animate-pulse"></div>
                            <span>Pulse = High Blocking</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NetworkSimulator;