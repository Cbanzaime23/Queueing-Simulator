
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { 
    SimulationState, 
    QueueTopology, 
    SkillType, 
    ServerState,
    Customer
} from '../types';

interface ServiceFloor2DViewProps {
    activeState: SimulationState;
    queueTopology: QueueTopology;
    impatientMode: boolean;
    avgPatienceTime: number;
    editingServerId: number | null;
    setEditingServerId: (id: number | null) => void;
    skillBasedRouting: boolean;
    handleToggleServerSkill: (serverId: number, skill: SkillType) => void;
}

// Physics Constants
const MAX_SPEED = 1.0; 
const MAX_FORCE = 0.08; 
const SEPARATION_RADIUS = 3.2; 
const ARRIVAL_THRESHOLD = 0.5; 

interface Vector { x: number; y: number; }

interface Agent {
    id: string;
    pos: Vector;
    vel: Vector;
    target: Vector;
    status: 'ENTERING' | 'QUEUING' | 'SERVICE' | 'LEAVING' | 'BALKED';
}

const getSkillColorClass = (skill: SkillType) => {
    switch (skill) {
        case SkillType.SALES: return 'bg-emerald-400 border-emerald-500';
        case SkillType.TECH: return 'bg-blue-400 border-blue-500';
        case SkillType.SUPPORT: return 'bg-pink-400 border-pink-500';
        default: return 'bg-slate-300 border-slate-400';
    }
};

export const ServiceFloor2DView: React.FC<ServiceFloor2DViewProps> = ({
    activeState,
    queueTopology,
    impatientMode,
    editingServerId,
    setEditingServerId,
    skillBasedRouting,
    handleToggleServerSkill
}) => {
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef<{ x: number, y: number } | null>(null);
    const agentsRef = useRef<Map<string, Agent>>(new Map());
    const requestRef = useRef<number | null>(null);
    const agentNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());

    const handleZoom = (delta: number) => {
        setTransform(prev => ({
            ...prev,
            scale: Math.max(0.5, Math.min(3, prev.scale + delta))
        }));
    };

    const handleReset = () => {
        setTransform({ x: 0, y: 0, scale: 1 });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning || !lastMousePos.current) return;
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        setIsPanning(false);
        lastMousePos.current = null;
    };

    const handleWheel = (e: React.WheelEvent) => {
        const scaleChange = -e.deltaY * 0.001;
        setTransform(prev => ({
            ...prev,
            scale: Math.max(0.5, Math.min(3, prev.scale + scaleChange))
        }));
    };

    useEffect(() => {
        const agents = agentsRef.current;
        const activeIds = new Set<string>();

        const updateAgent = (customer: Customer, targetX: number, targetY: number, status: Agent['status']) => {
            activeIds.add(customer.id);
            if (!agents.has(customer.id)) {
                agents.set(customer.id, {
                    id: customer.id,
                    pos: { x: 5, y: 80 }, // Entrance: Bottom Left
                    vel: { x: 0, y: 0 },
                    target: { x: targetX, y: targetY },
                    status
                });
            } else {
                const agent = agents.get(customer.id)!;
                agent.target = { x: targetX, y: targetY };
                agent.status = status;
            }
        };

        const serverCount = activeState.servers.length;
        const serverWidthPct = 100 / (serverCount + 1);

        activeState.servers.forEach((server, i) => {
            const serverX = (i + 1) * serverWidthPct;
            const serverY = 20;

            if (server.state === ServerState.BUSY) {
                if (server._activeBatch) {
                    server._activeBatch.forEach(c => updateAgent(c, serverX, serverY + 2, 'SERVICE'));
                } else if (server._activeCustomer) {
                    updateAgent(server._activeCustomer, serverX, serverY + 2, 'SERVICE');
                }
            }

            if (queueTopology === QueueTopology.DEDICATED) {
                server.queue.forEach((c, qIdx) => {
                    updateAgent(c, serverX, serverY + 15 + (qIdx * 4), 'QUEUING');
                });
            }
        });

        if (queueTopology === QueueTopology.COMMON) {
            const itemsPerRow = 8;
            const startX = 50; 
            const startY = 60; 
            const spacing = 4;

            activeState.queue.forEach((c, i) => {
                const row = Math.floor(i / itemsPerRow);
                const col = i % itemsPerRow;
                const rowWidth = Math.min(activeState.queue.length - row * itemsPerRow, itemsPerRow) * spacing;
                const x = startX - (rowWidth / 2) + (col * spacing);
                const y = startY + (row * spacing);
                updateAgent(c, x, y, 'QUEUING');
            });
        }

        activeState.recentlyDeparted.forEach(c => updateAgent(c, 105, 80, 'LEAVING'));
        
        activeState.recentlyBalked.forEach(c => {
            const waitDuration = (c.balkTime || 0) - c.arrivalTime;
            const isReneger = waitDuration > 0.1;
            if (isReneger) {
                updateAgent(c, 105, 80, 'LEAVING'); // Renegers head for the exit
            } else {
                updateAgent(c, -5, 80, 'BALKED'); // Balkers head back to entrance
            }
        });

        for (const id of agents.keys()) {
            if (!activeIds.has(id)) {
                const agent = agents.get(id);
                if (agent && (agent.pos.x > 110 || agent.pos.x < -10)) {
                    agents.delete(id);
                    agentNodesRef.current.delete(id);
                }
            }
        }
    }, [activeState, queueTopology]);

    useLayoutEffect(() => {
        const animate = () => {
            const agents = agentsRef.current;
            agents.forEach(agent => {
                const desiredX = agent.target.x - agent.pos.x;
                const desiredY = agent.target.y - agent.pos.y;
                const dist = Math.sqrt(desiredX*desiredX + desiredY*desiredY);
                let steerX = 0; let steerY = 0;

                if (dist > ARRIVAL_THRESHOLD) {
                    const validDist = Math.max(dist, 0.01);
                    const targetVelX = (desiredX / validDist) * MAX_SPEED;
                    const targetVelY = (desiredY / validDist) * MAX_SPEED;
                    steerX = targetVelX - agent.vel.x;
                    steerY = targetVelY - agent.vel.y;
                } else {
                    steerX = -agent.vel.x * 0.3;
                    steerY = -agent.vel.y * 0.3;
                    if (dist < 0.1 && agent.status !== 'LEAVING' && agent.status !== 'BALKED') {
                        agent.pos.x = agent.target.x;
                        agent.pos.y = agent.target.y;
                    }
                }

                let sepX = 0; let sepY = 0; let count = 0;
                agents.forEach(other => {
                    if (agent.id === other.id) return;
                    const dx = agent.pos.x - other.pos.x;
                    const dy = agent.pos.y - other.pos.y;
                    const d = Math.sqrt(dx*dx + dy*dy);
                    if (d > 0 && d < SEPARATION_RADIUS) {
                        sepX += (dx / d) / d;
                        sepY += (dy / d) / d;
                        count++;
                    }
                });
                if (count > 0) {
                    sepX = (sepX / count) * 2.5;
                    sepY = (sepY / count) * 2.5;
                }

                const totalForceX = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, steerX + sepX));
                const totalForceY = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, steerY + sepY));
                agent.vel.x += totalForceX; agent.vel.y += totalForceY;
                agent.pos.x += agent.vel.x; agent.pos.y += agent.vel.y;

                const node = agentNodesRef.current.get(agent.id);
                if (node) {
                    node.style.left = `${agent.pos.x}%`;
                    node.style.top = `${agent.pos.y}%`;
                    const angle = Math.atan2(agent.vel.y, agent.vel.x);
                    // Fixed speed calculation typo (was using agent.vel.x instead of agent.vel.y)
                    const speed = Math.sqrt(agent.vel.x*agent.vel.x + agent.vel.y*agent.vel.y);
                    if (speed > 0.1) {
                        node.style.transform = `translate(-50%, -50%) rotate(${angle}rad) scale(${1 + Math.sin(performance.now() * 0.01) * 0.05})`;
                    }
                }
            });
            requestRef.current = requestAnimationFrame(animate);
        };
        requestRef.current = requestAnimationFrame(animate);
        return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
    }, []);

    return (
        <div 
            className="w-full h-full relative overflow-hidden bg-slate-100 select-none cursor-grab active:cursor-grabbing border-4 border-slate-300 rounded-xl"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        >
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>

            <div className="absolute top-16 right-4 z-40 flex flex-col gap-1 bg-white/90 backdrop-blur p-1.5 rounded-lg shadow-md border border-slate-200">
                <button onClick={() => handleZoom(0.2)} className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-600 font-bold"><i className="fa-solid fa-plus"></i></button>
                <button onClick={() => handleZoom(-0.2)} className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-600 font-bold"><i className="fa-solid fa-minus"></i></button>
                <button onClick={handleReset} className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-500"><i className="fa-solid fa-expand"></i></button>
            </div>

            <div className="w-full h-full absolute top-0 left-0 transition-transform duration-75 origin-center" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
                
                {activeState.servers.map((server, i) => {
                    const count = activeState.servers.length;
                    const leftPct = (i + 1) * (100 / (count + 1));
                    const isBusy = server.state === ServerState.BUSY;
                    const isOffline = server.state === ServerState.OFFLINE;

                    return (
                        <div key={server.id} className={`absolute w-16 h-20 -ml-8 top-[10%] rounded-lg border-2 flex flex-col items-center justify-start pt-2 bg-white transition-all z-0 ${isOffline ? 'border-red-400 bg-red-50' : (isBusy ? 'border-emerald-500 shadow-lg scale-105' : 'border-slate-400')}`} style={{ left: `${leftPct}%` }} onClick={(e) => { e.stopPropagation(); if(skillBasedRouting) setEditingServerId(editingServerId === server.id ? null : server.id); }}>
                            <i className={`fa-solid ${isOffline ? 'fa-triangle-exclamation' : 'fa-user-tie'} text-2xl ${isOffline ? 'text-red-500' : (isBusy ? 'text-emerald-600' : 'text-slate-400')}`}></i>
                            <div className="text-[10px] font-black text-slate-700 mt-1 uppercase">S{server.id + 1}</div>
                            <div className="flex gap-0.5 mt-1">{server.skills.map((s: SkillType) => ( <div key={s} className={`w-1.5 h-1.5 rounded-full ${getSkillColorClass(s)}`} /> ))}</div>
                        </div>
                    );
                })}

                <div className="absolute left-[5%] top-[80%] text-slate-400 font-black text-xs uppercase tracking-tighter flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-200">
                    <i className="fa-solid fa-door-open"></i> ENTRANCE
                </div>

                <div className="absolute right-[5%] top-[80%] text-slate-400 font-black text-xs uppercase tracking-tighter flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-200">
                    EXIT <i className="fa-solid fa-door-open"></i>
                </div>

                {/* Explicitly typed agent as Agent to resolve TS 'unknown' errors in map callback */}
                {Array.from(agentsRef.current.values()).map((agent: Agent) => {
                    const c = activeState.queue.find(x => x.id === agent.id) || 
                              activeState.servers.flatMap(s => s.queue).find(x => x.id === agent.id) ||
                              activeState.servers.flatMap(s => s._activeBatch || []).find(x => x.id === agent.id) ||
                              activeState.recentlyDeparted.find(x => x.id === agent.id) ||
                              activeState.recentlyBalked.find(x => x.id === agent.id);
                    
                    if (!c) return null;
                    const isVip = c.priority === 1;
                    const impatienceRatio = c.patienceTime ? Math.min(1, (activeState.currentTime - c.arrivalTime) / c.patienceTime) : 0;
                    
                    return (
                        <div key={agent.id} ref={(el) => { if (el) agentNodesRef.current.set(agent.id, el); }} className={`absolute w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center z-10 ${c.color} ${impatienceRatio > 0.8 ? 'animate-stress' : ''}`} style={{ left: `${agent.pos.x}%`, top: `${agent.pos.y}%`, transform: 'translate(-50%, -50%)' }}>
                            {isVip && <i className="fa-solid fa-crown text-[10px] text-white"></i>}
                            {agent.status === 'BALKED' && <i className="fa-solid fa-ban text-[10px] text-white"></i>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
