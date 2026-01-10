
import React, { useState, useRef, useEffect } from 'react';
import { 
    SimulationState, 
    Environment, 
    QueueTopology, 
    SkillType, 
    Customer, 
    ServerState, 
    FloatingEffect 
} from '../types';
import { formatTime } from '../mathUtils';

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
 * Helper: Calculate Dynamic Mood Color
 */
const getCustomerMoodStyle = (
    customer: Customer, 
    currentTime: number, 
    impatientMode: boolean, 
    avgPatienceTime: number
): { style: React.CSSProperties, className: string } => {
    if (!impatientMode) {
        return { style: {}, className: customer.color };
    }
    const waitedTime = currentTime - customer.arrivalTime;
    const patienceLimit = customer.patienceTime || avgPatienceTime;
    const ratio = Math.min(1.0, waitedTime / patienceLimit);
    let r, g, b;
    if (ratio < 0.5) {
        const t = ratio * 2;
        r = 34 + (234 - 34) * t;
        g = 197 + (179 - 197) * t;
        b = 94 + (8 - 94) * t;
    } else {
        const t = (ratio - 0.5) * 2;
        r = 234 + (239 - 234) * t;
        g = 179 + (68 - 179) * t;
        b = 8 + (68 - 8) * t;
    }
    const isAngry = ratio > 0.9;
    return {
        style: { backgroundColor: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})` },
        className: isAngry ? 'animate-stress' : ''
    };
};

/**
 * Helper: Get Thematic Environment Styles
 */
const getEnvironmentStyles = (env: Environment) => {
    switch (env) {
        case Environment.MARKET:
            return {
                bgClass: 'bg-orange-50/50',
                borderClass: 'border-amber-200',
                patternStyle: {
                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(217, 119, 6, 0.05) 10px, rgba(217, 119, 6, 0.05) 20px)',
                },
                columnClass: 'bg-amber-50/90 border-amber-200',
                iconColor: 'text-amber-500'
            };
        case Environment.CALL_CENTER:
            return {
                bgClass: 'bg-slate-100',
                borderClass: 'border-indigo-200',
                patternStyle: {
                    backgroundImage: 'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)',
                    backgroundSize: '15px 15px',
                },
                columnClass: 'bg-slate-100/90 border-indigo-200',
                iconColor: 'text-indigo-500'
            };
        case Environment.BANK:
        default:
            return {
                bgClass: 'bg-slate-50',
                borderClass: 'border-blue-200',
                patternStyle: {
                    backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                },
                columnClass: 'bg-slate-50/90 border-blue-200',
                iconColor: 'text-blue-500'
            };
    }
};

interface ServiceFloorProps {
    activeState: SimulationState;
    environment: Environment;
    queueTopology: QueueTopology;
    impatientMode: boolean;
    avgPatienceTime: number;
    scrubbedSnapshot: SimulationState | null;
    floatingEffects: FloatingEffect[];
    skillBasedRouting: boolean;
    editingServerId: number | null;
    setEditingServerId: (id: number | null) => void;
    handleToggleServerSkill: (serverId: number, skill: SkillType) => void;
    simSpeed: number;
    setSimSpeed: (speed: number) => void;
    openHour: number;
    currentClockTime: string;
    isPaused: boolean;
    onTogglePause: () => void;
    onReset: () => void;
}

export const ServiceFloor: React.FC<ServiceFloorProps> = ({
    activeState,
    environment,
    queueTopology,
    impatientMode,
    avgPatienceTime,
    scrubbedSnapshot,
    floatingEffects,
    skillBasedRouting,
    editingServerId,
    setEditingServerId,
    handleToggleServerSkill,
    simSpeed,
    setSimSpeed,
    openHour,
    currentClockTime,
    isPaused,
    onTogglePause,
    onReset
}) => {
    // View State for Pan/Zoom
    const [floorViewState, setFloorViewState] = useState({ x: 0, y: 0, scale: 1 });
    const [isFloorPanning, setIsFloorPanning] = useState(false);
    const floorLastMousePos = useRef<{x: number, y: number} | null>(null);
    const [hoveredServerId, setHoveredServerId] = useState<number | null>(null);

    // Get Current Theme
    const envStyles = getEnvironmentStyles(environment);

    // Determines if we show the physical waiting area
    const showWaitingArea = environment === Environment.BANK;

    /**
     * Floor Pan/Zoom Handlers
     */
    const handleFloorMouseDown = (e: React.MouseEvent) => {
        setIsFloorPanning(true);
        floorLastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleFloorMouseMove = (e: React.MouseEvent) => {
        if (isFloorPanning && floorLastMousePos.current) {
            const dx = e.clientX - floorLastMousePos.current.x;
            const dy = e.clientY - floorLastMousePos.current.y;
            setFloorViewState(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            floorLastMousePos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleFloorMouseUp = () => {
        setIsFloorPanning(false);
        floorLastMousePos.current = null;
    };

    const handleFloorWheel = (e: React.WheelEvent) => {
        if (Math.abs(e.deltaY) < 0.1) return; 
        const scaleAmount = -e.deltaY * 0.001;
        setFloorViewState(prev => ({ 
            ...prev, 
            scale: Math.min(Math.max(0.2, prev.scale + scaleAmount), 3) 
        }));
    };

    return (
        <div 
            className={`rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative w-full h-[540px] flex flex-col bg-white transition-all duration-300 ${envStyles.borderClass}`}
        >
            
            {/* --- HUD: CONTROL ISLAND --- */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
                <div className="bg-white/90 backdrop-blur-md shadow-lg border border-slate-200 rounded-2xl px-4 py-2 flex items-center gap-4 pointer-events-auto transition-all hover:scale-105">
                    {/* Clock */}
                    <div className="flex flex-col items-center border-r pr-4 border-slate-200">
                        <span className="text-xl font-black text-slate-700 font-mono leading-none">{currentClockTime}</span>
                        <span className="text-[9px] uppercase font-bold text-slate-400 mt-1">Sim Time</span>
                    </div>

                    {/* Playback Controls */}
                    <div className="flex items-center gap-3">
                         <button 
                            onClick={onTogglePause}
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-all active:scale-95 ${isPaused ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'}`}
                            title={isPaused ? "Resume Simulation" : "Pause Simulation"}
                         >
                             <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'} text-sm`}></i>
                         </button>

                         <div className="flex flex-col w-24">
                             <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1">
                                 <span>Speed</span>
                                 <span>{simSpeed}x</span>
                             </div>
                             <input 
                                type="range" min="1" max="50" 
                                value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))} 
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none accent-slate-600 cursor-pointer" 
                             />
                         </div>

                         <button 
                            onClick={onReset}
                            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                            title="Reset Simulation"
                         >
                             <i className="fa-solid fa-rotate-left text-xs"></i>
                         </button>
                    </div>
                </div>

                {/* Status Badge (Panic Mode) */}
                {activeState.isPanic && (
                    <div className="bg-orange-500 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-md animate-pulse border border-white/20">
                        <i className="fa-solid fa-gauge-high mr-1"></i> HIGH TRAFFIC MODE
                    </div>
                )}
            </div>

            {/* Orbit / Scrubbing Indicators */}
            {!scrubbedSnapshot && activeState.orbit.length > 0 && (
                <div className="absolute top-4 left-4 z-40 animate-float pointer-events-none">
                    <div className="bg-white/90 backdrop-blur border border-cyan-200 text-cyan-600 px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-2">
                        <div className="bg-cyan-50 p-1.5 rounded-lg">
                            <i className="fa-solid fa-cloud text-sm"></i>
                        </div>
                        <div>
                            <span className="text-[9px] font-bold uppercase block leading-none text-slate-400">Orbit</span>
                            <span className="text-xs font-bold">{activeState.orbit.length} Waiting</span>
                        </div>
                    </div>
                </div>
            )}
            
            {scrubbedSnapshot && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-bounce pointer-events-none border-2 border-white">
                    <i className="fa-solid fa-clock-rotate-left text-xs"></i>
                    <div className="text-[10px] font-bold uppercase">Scrubbing History</div>
                </div>
            )}

            {/* Legend (Global Overlay) */}
            <div className="absolute bottom-4 left-4 flex gap-3 opacity-60 hover:opacity-100 transition-opacity z-40 pointer-events-auto bg-white/70 backdrop-blur-sm px-2 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div> Normal
                </div>
                <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500">
                    <div className="w-2 h-2 rounded-full bg-amber-400 border border-amber-500"></div> VIP
                </div>
                {impatientMode && (
                    <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500">
                        <div className="w-2 h-2 rounded-full border-2 border-red-500"></div> Patience
                    </div>
                )}
            </div>

            {/* Zoom Controls */}
            <div 
                className="absolute bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <button onClick={() => setFloorViewState(p => ({...p, scale: Math.min(p.scale + 0.2, 3)}))} className="w-8 h-8 bg-white rounded-lg shadow border border-slate-100 text-slate-600 hover:bg-slate-50 font-bold">+</button>
                <button onClick={() => setFloorViewState(p => ({...p, scale: Math.max(p.scale - 0.2, 0.5)}))} className="w-8 h-8 bg-white rounded-lg shadow border border-slate-100 text-slate-600 hover:bg-slate-50 font-bold">-</button>
                <button onClick={() => setFloorViewState({x:0, y:0, scale: 1})} className="w-8 h-8 bg-white rounded-lg shadow border border-slate-100 text-slate-400 hover:text-slate-600" title="Reset View"><i className="fa-solid fa-expand text-xs"></i></button>
            </div>

            {/* FLEX CONTAINER FOR COLUMNS */}
            <div className="flex h-full relative">

                {/* 1. ARRIVAL ZONE */}
                <div className={`w-16 md:w-24 border-r flex flex-col items-center justify-center relative shadow-inner z-20 shrink-0 ${envStyles.columnClass}`}>
                    <div className="relative z-10 flex flex-col items-center opacity-40">
                        <i className={`fa-solid ${environment === Environment.CALL_CENTER ? 'fa-phone-volume' : 'fa-door-open'} text-3xl text-slate-400 mb-2`}></i>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 -rotate-90 mt-4 whitespace-nowrap">
                            {environment === Environment.CALL_CENTER ? 'Inbound' : 'Entrance'}
                        </span>
                    </div>
                    <div className="absolute bottom-0 w-full h-2 bg-emerald-500/20"></div>
                </div>

                {/* 2. MAIN SERVICE FLOOR */}
                <div 
                    className={`flex-1 relative overflow-hidden cursor-move ${envStyles.bgClass}`}
                    onMouseDown={handleFloorMouseDown}
                    onMouseMove={handleFloorMouseMove}
                    onMouseUp={handleFloorMouseUp}
                    onMouseLeave={handleFloorMouseUp}
                    onWheel={handleFloorWheel}
                    style={{ touchAction: 'none', cursor: isFloorPanning ? 'grabbing' : 'grab' }}
                >
                    <div 
                        style={{ 
                            transform: `translate(${floorViewState.x}px, ${floorViewState.y}px) scale(${floorViewState.scale})`,
                            transformOrigin: 'center center',
                            width: '100%',
                            height: '100%',
                            ...envStyles.patternStyle
                        }}
                        className="w-full h-full flex flex-col transition-colors duration-500"
                    >
                        {/* Red Vignette for Panic Mode */}
                        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 z-0 ${activeState.isPanic ? 'opacity-100 animate-pulse-slow' : 'opacity-0'}`}
                             style={{ background: 'radial-gradient(circle, transparent 60%, rgba(239, 68, 68, 0.15) 100%)' }}></div>

                        {/* Floating Effects */}
                        <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
                            {floatingEffects.filter(e => !e.serverId).map(e => (
                                <div key={e.id} style={{left: `${e.x}%`, top: `${e.y}%`}} className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-float-fade">
                                    <div className={`text-2xl drop-shadow-md ${e.color}`}><i className={`fa-solid ${e.icon}`}></i></div>
                                    <div className={`text-[9px] font-black uppercase bg-white/90 px-2 py-0.5 rounded shadow-sm border border-slate-100 ${e.color}`}>{e.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* TOP HALF: SERVERS (Expands if waiting area is hidden) */}
                        <div className={`flex-1 flex flex-col items-center justify-center p-4 relative z-10 transition-all duration-500`}>
                            <div className="flex justify-center flex-wrap w-full gap-4">
                                {activeState.servers.map((server) => {
                                    const isPanic = activeState.isPanic;
                                    const isEditing = editingServerId === server.id;
                                    const isHovered = hoveredServerId === server.id;
                                    
                                    // Focus Mode Logic: 
                                    // If ANY server is hovered (or editing), dim all others.
                                    const isDimmed = (hoveredServerId !== null && !isHovered) || (editingServerId !== null && !isEditing);

                                    // Progress Bar & Status Calculation
                                    let progressPct = 0;
                                    let remainingText = '';
                                    let barClass = 'bg-slate-200';
                                    let barStyle: React.CSSProperties = {};

                                    if (server.state === ServerState.OFFLINE) {
                                        progressPct = 100;
                                        barStyle = { 
                                            backgroundImage: 'repeating-linear-gradient(45deg, #ef4444, #ef4444 8px, #fee2e2 8px, #fee2e2 16px)' 
                                        };
                                        remainingText = 'FIXING';
                                    } else if (server.state === ServerState.BUSY && server._activeCustomer && server._activeCustomer.startTime !== undefined && server._activeCustomer.finishTime !== undefined) {
                                        const total = server._activeCustomer.finishTime - server._activeCustomer.startTime;
                                        const elapsed = activeState.currentTime - server._activeCustomer.startTime;
                                        progressPct = Math.min(100, Math.max(0, (elapsed / total) * 100));
                                        
                                        const rem = Math.max(0, server._activeCustomer.finishTime - activeState.currentTime);
                                        remainingText = `${rem.toFixed(1)}m`;
                                        
                                        barClass = isPanic ? 'bg-amber-500' : 'bg-emerald-500';
                                    }

                                    return (
                                    <div 
                                        key={server.id} 
                                        className={`flex flex-col items-center relative group transition-all duration-300 
                                            ${isDimmed ? 'opacity-40 grayscale scale-95' : 'opacity-100 scale-100'} 
                                            ${isHovered || isEditing ? 'z-20 scale-105' : ''}`
                                        }
                                        onMouseEnter={() => setHoveredServerId(server.id)}
                                        onMouseLeave={() => setHoveredServerId(null)}
                                        onClick={(e) => {
                                            if (skillBasedRouting) {
                                                e.stopPropagation();
                                                setEditingServerId(isEditing ? null : server.id);
                                            }
                                        }}
                                    >
                                        {/* Server Card */}
                                        <div className={`w-20 h-28 rounded-xl border-2 transition-all duration-300 relative flex flex-col items-center justify-between p-2 shadow-sm ${server.state === ServerState.BUSY ? 'bg-white border-emerald-400' : 'bg-white border-slate-200'} ${isHovered || isEditing ? 'shadow-lg ring-4 ring-blue-100' : ''}`}>
                                            
                                            {/* Progress Bar (Dynamic) */}
                                            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-1 relative border border-slate-200">
                                                <div 
                                                    className={`h-full transition-all duration-200 ${barClass}`} 
                                                    style={{ 
                                                        width: `${progressPct}%`,
                                                        ...barStyle
                                                    }}
                                                ></div>
                                                
                                                {/* Text Overlay */}
                                                {remainingText && (
                                                    <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-slate-700 uppercase tracking-tight drop-shadow-sm leading-none z-10">
                                                        {remainingText}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Editing Overlay (Skill Selector) */}
                                            {isEditing && skillBasedRouting ? (
                                                <div className="absolute inset-0 bg-slate-800/90 rounded-lg z-20 flex flex-col items-center justify-center gap-1 p-2 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                                                    <div className="text-[9px] font-bold text-white mb-1">SKILLS</div>
                                                    {[SkillType.SALES, SkillType.TECH, SkillType.SUPPORT].map(skill => (
                                                        <button 
                                                            key={skill}
                                                            onClick={() => handleToggleServerSkill(server.id, skill)}
                                                            className={`w-full text-[8px] font-bold py-1 px-2 rounded flex items-center justify-between ${server.skills.includes(skill) ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                                                        >
                                                            <span>{skill}</span>
                                                            {server.skills.includes(skill) && <i className="fa-solid fa-check"></i>}
                                                        </button>
                                                    ))}
                                                    <button onClick={() => setEditingServerId(null)} className="mt-1 text-[8px] text-slate-400 hover:text-white">Done</button>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Avatar */}
                                                    <div className={`text-3xl z-10 transition-colors ${server.state === ServerState.OFFLINE ? 'text-red-300 opacity-50' : (server.state === ServerState.BUSY ? envStyles.iconColor : 'text-slate-200')}`}>
                                                        {environment === Environment.CALL_CENTER && <i className="fa-solid fa-headset"></i>}
                                                        {environment === Environment.MARKET && <i className="fa-solid fa-cart-shopping"></i>}
                                                        {environment === Environment.BANK && <i className="fa-solid fa-user-tie"></i>}
                                                    </div>

                                                    {/* Skills Dots */}
                                                    <div className="flex gap-1 mt-auto">
                                                        {server.skills.slice(0, 3).map((skill, i) => (
                                                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${getSkillColor(skill)}`}></div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Active Customer Bubble (Hidden when editing) */}
                                        {!isEditing && server.state === ServerState.BUSY && server._activeCustomer && (
                                            <div className="absolute top-10 left-1/2 -translate-x-1/2 z-20">
                                                <div className={`w-8 h-8 rounded-full shadow-lg border-2 border-white flex items-center justify-center text-[10px] text-white ${server._activeCustomer.color} animate-pop-in`}>
                                                    <i className={`fa-solid ${getSkillIcon(server._activeCustomer.requiredSkill)}`}></i>
                                                </div>
                                            </div>
                                        )}

                                        {/* Status Text (or "Edit" hint on hover) */}
                                        <div className="mt-1 bg-white/80 px-2 py-0.5 rounded text-[9px] font-bold uppercase text-slate-500 shadow-sm border border-slate-100 transition-all">
                                            {isHovered && skillBasedRouting ? 'Edit' : server.state}
                                        </div>

                                        {/* Dedicated Queue Render (ALWAYS VISIBLE if applicable) */}
                                        {queueTopology === QueueTopology.DEDICATED && (
                                            <div className="mt-2 flex flex-col gap-1 items-center">
                                                {server.queue.map((c, i) => {
                                                    const mood = getCustomerMoodStyle(c, activeState.currentTime, impatientMode, avgPatienceTime);
                                                    const patiencePct = c.patienceTime ? Math.max(0, 1 - ((activeState.currentTime - c.arrivalTime) / c.patienceTime)) : 1;
                                                    
                                                    return (
                                                        <div key={c.id} className="relative group">
                                                            {/* Patience Ring */}
                                                            {impatientMode && c.patienceTime && (
                                                                <svg className="absolute -top-1 -left-1 w-5 h-5 pointer-events-none" viewBox="0 0 36 36">
                                                                    <path className="text-slate-200" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                                                                    <path className={`${patiencePct < 0.2 ? 'text-red-500 animate-pulse' : (patiencePct > 0.5 ? 'text-emerald-500' : 'text-amber-500')} transition-all duration-500`} strokeDasharray={`${patiencePct*100}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                                                                </svg>
                                                            )}
                                                            <div className={`w-3 h-3 rounded-full shadow-sm z-10 relative ${mood.className} ${!impatientMode ? c.color : ''}`} style={mood.style}></div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )})}
                            </div>
                        </div>

                        {/* BOTTOM HALF: WAITING AREA (Conditionally Rendered) */}
                        {showWaitingArea && (
                            <div className={`min-h-[140px] bg-white/40 border-t-2 border-dashed ${envStyles.borderClass} p-4 flex flex-col justify-end items-center relative z-10 backdrop-blur-sm`}>
                                 <div className="absolute top-2 left-4 text-[9px] font-black tracking-widest text-slate-400 uppercase">Waiting Area</div>
                                 
                                 {/* Common Queue Visualization */}
                                 {queueTopology === QueueTopology.COMMON && (
                                     <div className="flex flex-wrap gap-2 justify-center max-w-3xl">
                                         {activeState.queue.slice(0, 50).map((c, i) => {
                                             const mood = getCustomerMoodStyle(c, activeState.currentTime, impatientMode, avgPatienceTime);
                                             const patiencePct = c.patienceTime ? Math.max(0, 1 - ((activeState.currentTime - c.arrivalTime) / c.patienceTime)) : 1;
                                             
                                             // Focus Mode: Highlight if matches hovered server
                                             const hoveredServer = hoveredServerId !== null ? activeState.servers.find(s => s.id === hoveredServerId) : null;
                                             const isHighlighted = hoveredServer && hoveredServer.skills.includes(c.requiredSkill);
                                             
                                             // Opacity & Scale logic
                                             let opacityClass = 'opacity-100 scale-100';
                                             if (hoveredServerId !== null) {
                                                 if (isHighlighted) opacityClass = 'opacity-100 scale-110 z-20';
                                                 else opacityClass = 'opacity-30 grayscale scale-90';
                                             }

                                             return (
                                                 <div key={c.id} className={`relative group transition-all duration-300 ${opacityClass}`} title={`Skill: ${c.requiredSkill}`}>
                                                     {/* Patience Ring */}
                                                     {impatientMode && c.patienceTime && (
                                                         <svg className="absolute -top-1 -left-1 w-6 h-6 pointer-events-none z-0" viewBox="0 0 36 36">
                                                             <path className="text-slate-200" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                                             <path className={`${patiencePct < 0.2 ? 'text-red-500 animate-pulse' : (patiencePct > 0.5 ? 'text-emerald-500' : 'text-amber-500')} transition-all duration-500`} strokeDasharray={`${patiencePct*100}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                                         </svg>
                                                     )}
                                                     
                                                     <div 
                                                        className={`w-4 h-4 rounded-full shadow-sm flex items-center justify-center text-[8px] text-white z-10 relative ${mood.className} ${!impatientMode ? c.color : ''} ${!scrubbedSnapshot ? 'animate-walk-in' : ''}`}
                                                        style={mood.style}
                                                     >
                                                         {skillBasedRouting && <i className={`fa-solid ${getSkillIcon(c.requiredSkill)}`}></i>}
                                                     </div>
                                                 </div>
                                             );
                                         })}
                                         {activeState.queue.length > 50 && (
                                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                                +{activeState.queue.length - 50}
                                            </div>
                                         )}
                                     </div>
                                 )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. DEPARTURE ZONE */}
                <div className={`w-16 md:w-24 border-l flex flex-col items-center justify-center relative shadow-inner z-20 shrink-0 ${envStyles.columnClass}`}>
                    <div className="relative z-10 flex flex-col items-center opacity-40">
                        <i className={`fa-solid ${environment === Environment.CALL_CENTER ? 'fa-check-double' : 'fa-person-walking-arrow-right'} text-3xl text-slate-400 mb-2`}></i>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 rotate-90 mt-4 whitespace-nowrap">
                            {environment === Environment.CALL_CENTER ? 'Handled' : 'Exit'}
                        </span>
                    </div>
                    <div className="absolute bottom-0 w-full h-2 bg-red-500/20"></div>
                </div>

            </div>
        </div>
    );
};
