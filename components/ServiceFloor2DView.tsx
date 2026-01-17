
import React, { useState, useRef } from 'react';
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
    // Viewport Transformation State
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef<{ x: number, y: number } | null>(null);
    const dragDistance = useRef(0);

    // -- Handlers --

    const handleZoom = (delta: number) => {
        setTransform(prev => ({
            ...prev,
            scale: Math.max(0.2, Math.min(3, prev.scale + delta))
        }));
    };

    const handleReset = () => {
        setTransform({ x: 0, y: 0, scale: 1 });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Allow interaction with controls/servers to bubble, but capture background for pan
        if (e.button !== 0) return;
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        dragDistance.current = 0;
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning || !lastMousePos.current) return;
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        
        dragDistance.current += Math.abs(dx) + Math.abs(dy);
        
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        setIsPanning(false);
        lastMousePos.current = null;
    };

    const handleWheel = (e: React.WheelEvent) => {
        // Simple zoom on wheel
        const scaleChange = -e.deltaY * 0.001;
        setTransform(prev => ({
            ...prev,
            scale: Math.max(0.2, Math.min(3, prev.scale + scaleChange))
        }));
    };

    const handleClick = () => {
        // Only clear selection if it was a click (not a drag)
        if (dragDistance.current < 5) {
            setEditingServerId(null);
        }
    };
    
    // Render a single customer dot
    const renderCustomer = (c: Customer, index: number) => {
        const impatienceRatio = c.patienceTime ? Math.min(1, (activeState.currentTime - c.arrivalTime) / c.patienceTime) : 0;
        const isAngry = impatienceRatio > 0.8;
        const isVip = c.priority === 1;
        
        return (
            <div 
                key={c.id} 
                className={`w-6 h-6 rounded-full flex items-center justify-center shadow-sm border-2 transition-all relative ${c.color} ${isAngry ? 'animate-stress' : 'animate-pop-in'}`}
                title={`Waited: ${(activeState.currentTime - c.arrivalTime).toFixed(1)}m`}
            >
                {isVip && <i className="fa-solid fa-crown text-[8px] text-white"></i>}
                {isAngry && !isVip && <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-ping absolute -top-1 -right-1"></div>}
            </div>
        );
    };

    return (
        <div 
            className="w-full h-full relative overflow-hidden bg-slate-50/50 select-none cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onClick={handleClick}
        >
            {/* View Controls */}
            <div 
                className="absolute top-16 right-4 z-40 flex flex-col gap-1 bg-white/90 backdrop-blur p-1.5 rounded-lg shadow-md border border-slate-200"
                onMouseDown={e => e.stopPropagation()} // Prevent pan start on buttons
                onClick={e => e.stopPropagation()}
            >
                <button 
                    onClick={() => handleZoom(0.2)} 
                    className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-600 font-bold transition-colors" 
                    title="Zoom In"
                >
                    <i className="fa-solid fa-plus"></i>
                </button>
                <button 
                    onClick={() => handleZoom(-0.2)} 
                    className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-600 font-bold transition-colors" 
                    title="Zoom Out"
                >
                    <i className="fa-solid fa-minus"></i>
                </button>
                <button 
                    onClick={handleReset} 
                    className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-500 transition-colors" 
                    title="Center View"
                >
                    <i className="fa-solid fa-compress"></i>
                </button>
            </div>

            {/* Transformable Content */}
            <div 
                className="w-full h-full p-6 flex flex-col gap-8 transition-transform duration-75 origin-center"
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            >
                {/* Servers Section */}
                <div className="flex justify-center gap-4 flex-wrap min-h-[140px]">
                    {activeState.servers.map(server => {
                        const isBusy = server.state === ServerState.BUSY;
                        const isOffline = server.state === ServerState.OFFLINE;
                        
                        // Calculate progress
                        let progress = 0;
                        if (isBusy && server._activeCustomer?.startTime && server._activeCustomer?.finishTime) {
                            const total = server._activeCustomer.finishTime - server._activeCustomer.startTime;
                            const elapsed = activeState.currentTime - server._activeCustomer.startTime;
                            progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
                        }

                        const isEditing = editingServerId === server.id;

                        return (
                            <div 
                                key={server.id} 
                                onClick={(e) => { e.stopPropagation(); if(skillBasedRouting) setEditingServerId(isEditing ? null : server.id); }}
                                className={`w-28 relative flex flex-col items-center p-2 rounded-xl border-2 transition-all cursor-pointer select-none
                                    ${isOffline ? 'bg-red-50 border-red-200 opacity-80' : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-md'}
                                    ${isBusy ? 'shadow-sm border-b-4' : ''}
                                `}
                            >
                                {/* Server Avatar */}
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors
                                    ${isOffline ? 'bg-red-100 text-red-400' : (isBusy ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400')}
                                `}>
                                    <i className={`fa-solid ${isOffline ? 'fa-triangle-exclamation' : 'fa-user-tie'} text-lg`}></i>
                                </div>

                                {/* Label */}
                                <div className="text-[10px] font-bold text-slate-600 mb-1">
                                    {isOffline ? 'OFFLINE' : `Server ${server.id + 1}`}
                                </div>

                                {/* Skills Indicator */}
                                <div className="flex gap-1 mb-2 h-2">
                                    {server.skills.map((s: SkillType) => (
                                        <div key={s} className={`w-2 h-2 rounded-full ${getSkillColorClass(s)}`} />
                                    ))}
                                </div>

                                {/* Progress Bar or Status */}
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    {isBusy && <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>}
                                </div>

                                {/* Edit Popup */}
                                {isEditing && (
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white p-2 rounded-lg shadow-xl border border-slate-200 z-50 w-32">
                                        <div className="text-[10px] font-bold text-slate-500 mb-1 border-b pb-1">Toggle Skills</div>
                                        {[SkillType.SALES, SkillType.TECH, SkillType.SUPPORT].map(skill => (
                                            <button 
                                                key={skill}
                                                onClick={(e) => { e.stopPropagation(); handleToggleServerSkill(server.id, skill); }}
                                                className={`w-full text-[9px] font-bold py-1 px-2 rounded flex items-center justify-between mb-1 ${server.skills.includes(skill) ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                            >
                                                <span>{skill}</span>
                                                {server.skills.includes(skill) && <i className="fa-solid fa-check"></i>}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Active Customer Badge */}
                                {isBusy && server._activeCustomer && (
                                    <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${server._activeCustomer.color} animate-pop-in z-10`}>
                                        <span className="text-[8px] text-white font-bold">{server._activeCustomer.id.substr(0,1)}</span>
                                    </div>
                                )}

                                {/* Dedicated Queue (Vertical) */}
                                {queueTopology === QueueTopology.DEDICATED && server.queue.length > 0 && (
                                    <div className="absolute top-full mt-2 flex flex-col gap-1 items-center">
                                        {server.queue.map((c: Customer, i: number) => renderCustomer(c, i))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Common Queue Section */}
                {queueTopology === QueueTopology.COMMON && (
                    <div className="flex-1 flex flex-col">
                        <div className="flex items-center gap-2 mb-2 px-4">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Waiting Area</h4>
                            <div className="h-[1px] flex-1 bg-slate-200"></div>
                            <span className="text-[10px] font-mono text-slate-400">{activeState.queue.length}</span>
                        </div>
                        
                        <div className="flex-1 rounded-2xl bg-white/50 border-2 border-dashed border-slate-200 p-4 flex content-start flex-wrap gap-2 min-h-[120px]">
                            {activeState.queue.length === 0 ? (
                                <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs italic">
                                    Queue is empty
                                </div>
                            ) : (
                                activeState.queue.map((c, i) => renderCustomer(c, i))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
