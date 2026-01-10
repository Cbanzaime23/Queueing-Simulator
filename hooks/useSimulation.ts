
import { useState, useEffect, useRef, useCallback } from 'react';
import { SimulationEngine } from '../SimulationEngine';
import { 
    SimulationConfig, 
    SimulationState, 
    FloatingEffect, 
    SimulationEventType,
    SkillType
} from '../types';

interface UseSimulationReturn {
    simState: SimulationState | null;
    floatingEffects: FloatingEffect[];
    controls: {
        start: () => void;
        pause: () => void;
        toggle: () => void;
        reset: () => void;
        setSpeed: (speed: number) => void;
        updateServerSkills: (serverId: number, skills: SkillType[]) => void;
    };
    status: {
        isPaused: boolean;
        dayComplete: boolean;
        simSpeed: number;
    };
}

export const useSimulation = (config: SimulationConfig): UseSimulationReturn => {
    const engineRef = useRef<SimulationEngine | null>(null);
    const [simState, setSimState] = useState<SimulationState | null>(null);
    const [isPaused, setIsPaused] = useState<boolean>(true);
    const [dayComplete, setDayComplete] = useState<boolean>(false);
    const [simSpeed, setSimSpeed] = useState<number>(5);
    const [floatingEffects, setFloatingEffects] = useState<FloatingEffect[]>([]);
    
    // Time tracking for delta calculations
    const lastUpdateRef = useRef<number>(0);

    // Initialize Engine
    useEffect(() => {
        if (!engineRef.current) {
            engineRef.current = new SimulationEngine(config);
            setSimState(engineRef.current.getState());
        }
    }, []);

    // Sync Config updates
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.updateConfig(config);
        }
    }, [config]);

    // Reset Handler
    const reset = useCallback(() => {
        if (!engineRef.current) {
            engineRef.current = new SimulationEngine(config);
        } else {
            engineRef.current.updateConfig(config);
            engineRef.current.reset();
        }
        
        setSimState({ ...engineRef.current.getState() });
        setDayComplete(false);
        setIsPaused(true);
        setFloatingEffects([]);
        lastUpdateRef.current = performance.now();
    }, [config]);

    // Skill Update Handler
    const updateServerSkills = useCallback((serverId: number, skills: SkillType[]) => {
        if (engineRef.current) {
            engineRef.current.updateServerSkills(serverId, skills);
            // Force state update to reflect changes immediately in UI
            setSimState({ ...engineRef.current.getState() });
        }
    }, []);

    // Animation Loop
    useEffect(() => {
        if (isPaused || !engineRef.current || dayComplete) return;
        
        let requestRef: number;
        // Ensure lastUpdate is fresh when starting
        if (lastUpdateRef.current === 0) lastUpdateRef.current = performance.now();

        const animate = (time: number) => {
            const dtMs = time - lastUpdateRef.current;
            lastUpdateRef.current = time;
            
            // Prevent huge jumps if tab was inactive
            if (dtMs > 1000) {
                requestRef = requestAnimationFrame(animate);
                return;
            }

            const simDeltaMinutes = (dtMs / 1000) * simSpeed;
            
            const engine = engineRef.current!;
            engine.tick(simDeltaMinutes);
            
            const state = engine.getState();
            setSimState({ ...state });
            
            // Process Events for Floating Effects
            if (state.events && state.events.length > 0) {
                const newEffects: FloatingEffect[] = state.events.map(evt => {
                    const baseEffect = {
                        id: evt.id,
                        timestamp: performance.now(),
                    };

                    switch(evt.type) {
                        case SimulationEventType.VIP_ARRIVAL:
                            return { ...baseEffect, icon: 'fa-crown', label: 'VIP Arrival!', color: 'text-amber-500', x: 10, y: 50 };
                        case SimulationEventType.RENEGE:
                            return { ...baseEffect, icon: 'fa-person-walking-arrow-right', label: 'Reneged', color: 'text-rose-500', x: 50, y: 80 };
                        case SimulationEventType.BALK:
                            return { ...baseEffect, icon: 'fa-ban', label: 'Balked', color: 'text-red-500', x: 10, y: 80 };
                        case SimulationEventType.ORBIT_ENTRY:
                            return { ...baseEffect, icon: 'fa-rotate-right', label: 'To Orbit', color: 'text-cyan-500', x: 50, y: 20 };
                        case SimulationEventType.ORBIT_RETRY:
                            return { ...baseEffect, icon: 'fa-arrow-down', label: 'Retrying', color: 'text-blue-500', x: 50, y: 10 };
                        case SimulationEventType.BREAKDOWN:
                            return { ...baseEffect, icon: 'fa-triangle-exclamation', label: 'Breakdown!', color: 'text-red-600', x: 0, y: 0, serverId: typeof evt.entityId === 'number' ? evt.entityId : undefined };
                        case SimulationEventType.REPAIR:
                            return { ...baseEffect, icon: 'fa-wrench', label: 'Repaired', color: 'text-green-500', x: 0, y: 0, serverId: typeof evt.entityId === 'number' ? evt.entityId : undefined };
                        default:
                            return { ...baseEffect, icon: 'fa-info', label: 'Event', color: 'text-slate-500', x: 50, y: 50 };
                    }
                });
                setFloatingEffects(prev => [...prev, ...newEffects]);
            }

            // Cleanup old effects
            setFloatingEffects(prev => {
                const now = performance.now();
                return prev.filter(e => now - e.timestamp < 2000);
            });

            if (engine.isDayComplete()) {
                setIsPaused(true);
                setDayComplete(true);
            } else {
                requestRef = requestAnimationFrame(animate);
            }
        };
        
        requestRef = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef);
    }, [isPaused, simSpeed, dayComplete]);

    const start = () => {
        setIsPaused(false);
        lastUpdateRef.current = performance.now();
    };

    const pause = () => setIsPaused(true);
    const toggle = () => {
        if (isPaused) start();
        else pause();
    };

    return {
        simState,
        floatingEffects,
        controls: {
            start,
            pause,
            toggle,
            reset,
            setSpeed: setSimSpeed,
            updateServerSkills
        },
        status: {
            isPaused,
            dayComplete,
            simSpeed
        }
    };
};
