
import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment as DreiEnvironment } from '@react-three/drei';
import { 
    SimulationState, 
    Environment, 
    QueueTopology, 
    SkillType, 
    FloatingEffect 
} from '../types';
import { ServiceFloor3DScene } from './ServiceFloor3DScene';
import { ServiceFloor2DView } from './ServiceFloor2DView';

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
    const [viewMode, setViewMode] = useState<'3D' | '2D'>('3D');

    return (
        <div className="rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative w-full h-[540px] flex flex-col bg-slate-50">
            
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

            {/* View Toggle Switch */}
            <div className="absolute top-4 right-4 z-50 pointer-events-auto bg-white/90 backdrop-blur rounded-lg shadow-sm border border-slate-200 p-1 flex gap-1">
                <button 
                    onClick={() => setViewMode('2D')}
                    className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${viewMode === '2D' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                    2D
                </button>
                <button 
                    onClick={() => setViewMode('3D')}
                    className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${viewMode === '3D' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                    3D
                </button>
            </div>

            {/* Floating Effects Overlay (Shared for both views) */}
            <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
                {floatingEffects.filter(e => !e.serverId).map(e => (
                    <div key={e.id} style={{left: `${e.x}%`, top: `${e.y}%`}} className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-float-fade">
                        <div className={`text-2xl drop-shadow-md ${e.color}`}><i className={`fa-solid ${e.icon}`}></i></div>
                        <div className={`text-[9px] font-black uppercase bg-white/90 px-2 py-0.5 rounded shadow-sm border border-slate-100 ${e.color}`}>{e.label}</div>
                    </div>
                ))}
                
                {/* Orbit Indicator */}
                {activeState.orbit.length > 0 && (
                    <div className="absolute top-4 left-4 animate-float pointer-events-auto">
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
            </div>

            {/* Main Content Area */}
            <div className="w-full h-full relative" onMouseDown={() => { if(editingServerId) setEditingServerId(null); }}>
                
                {viewMode === '3D' ? (
                    <>
                        <Canvas shadows camera={{ position: [0, 10, 15], fov: 45 }}>
                            <DreiEnvironment preset="city" />
                            <ServiceFloor3DScene 
                                activeState={activeState}
                                queueTopology={queueTopology}
                                impatientMode={impatientMode}
                                avgPatienceTime={avgPatienceTime}
                                editingServerId={editingServerId}
                                setEditingServerId={setEditingServerId}
                                skillBasedRouting={skillBasedRouting}
                                handleToggleServerSkill={handleToggleServerSkill}
                                environment={environment}
                            />
                        </Canvas>
                        {/* 3D Instructions */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 font-mono bg-white/80 px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                            LMB: Rotate • RMB: Pan • Wheel: Zoom
                        </div>
                    </>
                ) : (
                    <ServiceFloor2DView 
                        activeState={activeState}
                        queueTopology={queueTopology}
                        impatientMode={impatientMode}
                        avgPatienceTime={avgPatienceTime}
                        editingServerId={editingServerId}
                        setEditingServerId={setEditingServerId}
                        skillBasedRouting={skillBasedRouting}
                        handleToggleServerSkill={handleToggleServerSkill}
                    />
                )}
            </div>
        </div>
    );
};
