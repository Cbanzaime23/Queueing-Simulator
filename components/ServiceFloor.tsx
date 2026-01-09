
import React, { useState, useRef } from 'react';
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
 * Interpolates Green -> Yellow -> Red based on wait time vs patience
 */
const getCustomerMoodStyle = (
    customer: Customer, 
    currentTime: number, 
    impatientMode: boolean, 
    avgPatienceTime: number
): { style: React.CSSProperties, className: string } => {
    
    // Fallback if impatient mode is off: Use static type color
    if (!impatientMode) {
        return { style: {}, className: customer.color };
    }

    const waitedTime = currentTime - customer.arrivalTime;
    const patienceLimit = customer.patienceTime || avgPatienceTime;
    
    // Calculate Anger Ratio (0.0 to 1.0)
    const ratio = Math.min(1.0, waitedTime / patienceLimit);
    
    let r, g, b;

    if (ratio < 0.5) {
        // Green to Yellow (0 -> 0.5 maps to 0 -> 1)
        const t = ratio * 2;
        r = 34 + (234 - 34) * t;
        g = 197 + (179 - 197) * t;
        b = 94 + (8 - 94) * t;
    } else {
        // Yellow to Red (0.5 -> 1.0 maps to 0 -> 1)
        const t = (ratio - 0.5) * 2;
        r = 234 + (239 - 234) * t;
        g = 179 + (68 - 179) * t;
        b = 8 + (68 - 8) * t;
    }

    // Add Shake animation if very angry (> 90%)
    const isAngry = ratio > 0.9;
    
    return {
        style: { backgroundColor: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})` },
        className: isAngry ? 'animate-stress' : ''
    };
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
    currentClockTime
}) => {
    // View State for Pan/Zoom
    const [floorViewState, setFloorViewState] = useState({ x: 0, y: 0, scale: 1 });
    const [isFloorPanning, setIsFloorPanning] = useState(false);
    const floorLastMousePos = useRef<{x: number, y: number} | null>(null);

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

    const handleFloorTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            setIsFloorPanning(true);
            const t = e.touches[0];
            floorLastMousePos.current = { x: t.clientX, y: t.clientY };
        }
    };

    const handleFloorTouchMove = (e: React.TouchEvent) => {
        if (isFloorPanning && floorLastMousePos.current) {
            const t = e.touches[0];
            const dx = t.clientX - floorLastMousePos.current.x;
            const dy = t.clientY - floorLastMousePos.current.y;
            setFloorViewState(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            floorLastMousePos.current = { x: t.clientX, y: t.clientY };
        }
    };

    const getImpatientLabel = () => {
        return environment === Environment.CALL_CENTER ? 'Abandoned' : 'Reneged';
    };

    // Calculate Impatience Percentage
    const impatientPercent = activeState.customersArrivals > 0 
        ? (activeState.customersImpatient / activeState.customersArrivals) * 100 
        : 0;

    return (
        <div 
            className="rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[300px] md:min-h-[400px] flex flex-col bg-white"
        >
            
            {/* --- OVERLAYS (HUD) --- */}
            
            {/* Status Badge */}
            <div className={`absolute top-2 left-2 md:top-4 md:left-28 z-50 backdrop-blur px-3 py-1 rounded-full text-[10px] md:text-xs font-bold border transition-colors duration-500 pointer-events-none ${activeState.isPanic ? 'bg-orange-500/90 text-white border-orange-600 animate-pulse' : 'bg-white/80 text-slate-500 border-slate-200'}`}>
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
                <div className="absolute top-2 md:top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center animate-float pointer-events-none">
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
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-bounce pointer-events-none">
                    <i className="fa-solid fa-clock-rotate-left"></i>
                    <div className="text-xs font-bold">
                        SCRUBBING MODE: {currentClockTime}
                        <span className="block text-[9px] font-normal opacity-90">Move mouse off chart to resume live view</span>
                    </div>
                </div>
            )}

            {/* Speed Control Overlay (Only visible when not scrubbing) */}
            {!scrubbedSnapshot && (
                <div 
                    className="absolute top-2 right-16 md:top-4 md:right-28 z-50 w-24 md:w-32"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <label className="block text-[8px] md:text-[9px] font-bold text-slate-400 uppercase text-right mb-1">Sim Speed</label>
                    <input type="range" min="1" max="50" value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))} className="w-full h-1 accent-slate-600 bg-slate-200 rounded appearance-none" />
                </div>
            )}

            {/* Zoom Controls (Fixed to Container) */}
            <div 
                className="absolute bottom-4 right-4 z-50 flex flex-col gap-2"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
            >
                <button 
                    onClick={() => setFloorViewState(p => ({...p, scale: Math.min(p.scale + 0.2, 3)}))}
                    className="w-8 h-8 bg-white rounded shadow text-slate-600 hover:bg-slate-50 flex items-center justify-center font-bold"
                >
                    +
                </button>
                <button 
                    onClick={() => setFloorViewState(p => ({...p, scale: Math.max(p.scale - 0.2, 0.5)}))}
                    className="w-8 h-8 bg-white rounded shadow text-slate-600 hover:bg-slate-50 flex items-center justify-center font-bold"
                >
                    -
                </button>
                <button 
                    onClick={() => setFloorViewState({x:0, y:0, scale: 1})}
                    className="w-8 h-8 bg-white rounded shadow text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex items-center justify-center"
                    title="Reset View"
                >
                    <i className="fa-solid fa-expand text-xs"></i>
                </button>
            </div>

            {/* FLEX CONTAINER FOR COLUMNS */}
            <div className="flex h-full relative">

                {/* 1. ARRIVAL ZONE (LEFT - FIXED) */}
                <div className="w-14 md:w-24 bg-slate-50 border-r border-slate-200 flex flex-col items-center justify-center relative shadow-inner z-20 shrink-0">
                    <div className="absolute inset-0 bg-slate-100/50"></div>
                    <div className="relative z-10 flex flex-col items-center opacity-50">
                        <i className="fa-solid fa-door-open text-2xl md:text-4xl text-slate-400 mb-2"></i>
                        <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 -rotate-90 mt-4 whitespace-nowrap">Entrance</span>
                    </div>
                    <div className="absolute bottom-0 w-full h-2 bg-emerald-500/20"></div>
                </div>

                {/* 2. MAIN SERVICE FLOOR (MIDDLE - PANNABLE/ZOOMABLE) */}
                <div 
                    className="flex-1 relative overflow-hidden bg-slate-100 cursor-move"
                    onMouseDown={handleFloorMouseDown}
                    onMouseMove={handleFloorMouseMove}
                    onMouseUp={handleFloorMouseUp}
                    onMouseLeave={handleFloorMouseUp}
                    onTouchStart={handleFloorTouchStart}
                    onTouchMove={handleFloorTouchMove}
                    onTouchEnd={handleFloorMouseUp}
                    onWheel={handleFloorWheel}
                    style={{ touchAction: 'none', cursor: isFloorPanning ? 'grabbing' : 'grab' }}
                >
                    {/* Transformed World Container */}
                    <div 
                        style={{ 
                            transform: `translate(${floorViewState.x}px, ${floorViewState.y}px) scale(${floorViewState.scale})`,
                            transformOrigin: 'center center',
                            width: '100%',
                            height: '100%'
                        }}
                        className="w-full h-full flex flex-col bg-grid-pattern"
                    >
                        
                        {/* FLOATING GLOBAL EFFECTS LAYER (Inside world space) */}
                        <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
                            {floatingEffects.filter(e => !e.serverId).map(e => (
                                <div 
                                    key={e.id} 
                                    style={{left: `${e.x}%`, top: `${e.y}%`}} 
                                    className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-float-fade"
                                >
                                    <div className={`text-2xl drop-shadow-md ${e.color}`}>
                                        <i className={`fa-solid ${e.icon}`}></i>
                                    </div>
                                    <div className={`text-[10px] font-black uppercase tracking-wider bg-white/90 px-2 py-0.5 rounded shadow-sm border border-slate-100 ${e.color}`}>
                                        {e.label}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* TOP HALF: SERVERS */}
                        <div className="flex-1 flex flex-col items-center justify-center p-2 md:p-4 relative">
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
                                    <div key={server.id} className="flex flex-col items-center relative group mx-1 md:mx-2 mb-2 md:mb-4">
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

                                        {/* FLOATING SERVER EFFECTS */}
                                        {floatingEffects.filter(e => e.serverId === server.id).map(e => (
                                            <div key={e.id} className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center animate-float-fade pointer-events-none whitespace-nowrap">
                                                <div className={`text-xl drop-shadow-md ${e.color}`}>
                                                    <i className={`fa-solid ${e.icon}`}></i>
                                                </div>
                                                <div className={`text-[8px] font-black uppercase tracking-wider bg-white/95 px-1.5 py-0.5 rounded shadow border ${e.color}`}>
                                                    {e.label}
                                                </div>
                                            </div>
                                        ))}
                                        
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
                                        <div className={`w-14 h-20 md:w-20 md:h-28 rounded-xl border-2 transition-all duration-300 relative flex flex-col items-center justify-between p-1.5 md:p-2 shadow-sm ${cardBg} ${cardBorder}`}>

                                            {/* EDIT MODE OVERLAY */}
                                            {isEditing ? (
                                                <div className="absolute inset-0 bg-white z-50 rounded-lg flex flex-col p-1 animate-fade-in" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
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
                                                    <div className={`w-4 h-4 md:w-5 md:h-5 rounded-full border flex items-center justify-center text-[8px] md:text-[9px] ${badgeColor}`} title={server.typeLabel}>
                                                        <i className={`fa-solid ${badgeIcon}`}></i>
                                                    </div>
                                                    
                                                    {/* Settings Gear (Visible on Hover/Touch if Skill Routing is On) */}
                                                    {skillBasedRouting && (
                                                        <button 
                                                            onClick={() => setEditingServerId(server.id)}
                                                            className="text-slate-300 hover:text-slate-600 transition-colors"
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onTouchStart={(e) => e.stopPropagation()}
                                                        >
                                                            <i className="fa-solid fa-gear text-[10px]"></i>
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Avatar (Center) */}
                                                <div className={`text-xl md:text-3xl z-10 transition-colors ${server.state === ServerState.OFFLINE ? 'opacity-20' : (server.state === ServerState.BUSY ? 'text-slate-700' : 'text-slate-300')}`}>
                                                    {environment === Environment.CALL_CENTER && <i className="fa-solid fa-headset"></i>}
                                                    {environment === Environment.MARKET && <i className="fa-solid fa-cart-shopping"></i>}
                                                    {environment === Environment.BANK && <i className="fa-solid fa-user-tie"></i>}
                                                </div>

                                                {/* Active Customer Overlay (if busy) */}
                                                {server.state === ServerState.BUSY && server._activeCustomer && (
                                                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-2 z-20">
                                                        <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full shadow-md border-2 border-white flex items-center justify-center text-[8px] md:text-[10px] text-white ${server._activeCustomer.color} animate-pop-in`}>
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
                                                                <div key={i} className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full ${getSkillColor(skill)}`} title={skill}></div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Stress/Load Bar */}
                                                    <div className="w-full h-1 md:h-1.5 bg-slate-200/50 rounded-full overflow-hidden mt-1 relative border border-black/5">
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
                                        <div className={`mt-1 text-[8px] md:text-[9px] font-bold uppercase tracking-wider ${
                                            server.state === ServerState.BUSY ? (activeState.isPanic ? 'text-orange-600' : 'text-emerald-600') : 
                                            server.state === ServerState.OFFLINE ? 'text-red-400' : 'text-slate-300'
                                        }`}>
                                            {server.state}
                                        </div>

                                        {/* Dedicated Queue (Vertical) */}
                                        {queueTopology === QueueTopology.DEDICATED && (
                                            <div className="mt-1 flex flex-col gap-1 items-center min-h-[40px]">
                                                {server.queue.map((c, i) => {
                                                    // Dynamic Mood Coloring
                                                    const mood = getCustomerMoodStyle(c, activeState.currentTime, impatientMode, avgPatienceTime);
                                                    return (
                                                    <div 
                                                    key={c.id} 
                                                    className={`w-3 h-3 rounded-full shadow-sm transition-all flex items-center justify-center text-[6px] text-white ${mood.className} ${!impatientMode ? c.color : ''} ${!scrubbedSnapshot ? 'animate-walk-in' : ''} ${i === 0 && !scrubbedSnapshot ? 'animate-pulse' : ''} relative group`}
                                                    style={mood.style}
                                                    >
                                                        {skillBasedRouting && <i className={`fa-solid ${getSkillIcon(c.requiredSkill)}`}></i>}
                                                        
                                                        {/* EWT Badge for last in line */}
                                                        {i === server.queue.length - 1 && c.estimatedWaitTime !== undefined && c.estimatedWaitTime > 0 && !scrubbedSnapshot && (
                                                            <div className="absolute -right-16 top-0 bg-slate-800 text-white text-[9px] px-2 py-0.5 rounded shadow-lg animate-pop-in z-20 whitespace-nowrap">
                                                                Est: {c.estimatedWaitTime.toFixed(1)}m
                                                                <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-y-4 border-y-transparent border-r-4 border-r-slate-800"></div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )})}
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
                                    <div className="flex flex-wrap gap-1 md:gap-2 justify-center items-center p-2 relative">
                                        {/* Empty State */}
                                        {activeState.queue.length === 0 && activeState.recentlyBalked.length === 0 && (
                                            <span className="text-xs text-slate-300 font-bold uppercase tracking-widest">Queue Empty</span>
                                        )}
                                        
                                        {/* Balked Customers (Common Queue) */}
                                        {!scrubbedSnapshot && activeState.recentlyBalked.map(c => (
                                            <div 
                                                key={c.id}
                                                className={`w-3 h-3 md:w-4 md:h-4 rounded-full shadow-sm flex items-center justify-center text-[8px] md:text-[10px] text-white bg-red-500 animate-balk`}
                                                title="Left immediately"
                                            >
                                                <i className="fa-solid fa-xmark"></i>
                                            </div>
                                        ))}

                                        {/* Queued Customers */}
                                        {activeState.queue.slice(0, 40).map((customer, idx) => {
                                            const mood = getCustomerMoodStyle(customer, activeState.currentTime, impatientMode, avgPatienceTime);
                                            return (
                                            <div 
                                                key={customer.id} 
                                                className={`relative w-3 h-3 md:w-4 md:h-4 rounded-full shadow-sm transition-all duration-500 flex items-center justify-center text-[6px] md:text-[8px] text-white/90 ${mood.className} ${!impatientMode ? customer.color : ''} ${!scrubbedSnapshot ? 'animate-walk-in' : ''} ${idx === 0 && !scrubbedSnapshot ? 'animate-pulse' : ''}`}
                                                style={mood.style}
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
                                        )})}
                                        {activeState.queue.length > 40 && (
                                            <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-200 flex items-center justify-center text-[8px] md:text-[10px] text-slate-500 font-bold">
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
                </div>

                {/* 3. DEPARTURE ZONE (RIGHT - FIXED) */}
                <div className="w-14 md:w-24 bg-slate-50 border-l border-slate-200 flex flex-col items-center justify-center relative shadow-inner z-20 shrink-0">
                    <div className="absolute inset-0 bg-slate-100/50"></div>
                    <div className="relative z-10 flex flex-col items-center opacity-50">
                        <i className="fa-solid fa-person-walking-arrow-right text-2xl md:text-4xl text-slate-400 mb-2"></i>
                        <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 rotate-90 mt-4 whitespace-nowrap">Exit</span>
                    </div>
                    <div className="absolute bottom-0 w-full h-2 bg-red-500/20"></div>
                </div>

            </div>
        </div>
    );
};
