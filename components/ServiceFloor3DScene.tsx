
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Html, SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import { 
    SimulationState, 
    QueueTopology, 
    SkillType, 
    Customer, 
    ServerState,
    Environment
} from '../types';

// Constants for positioning
const ENTRANCE_POS: [number, number, number] = [-12, 0, 12];
const EXIT_POS: [number, number, number] = [12, 0, 8]; // Updated to match text label

// Helper for skill colors
const getSkillColorHex = (skill: SkillType) => {
    switch (skill) {
        case SkillType.SALES: return '#34d399'; // emerald-400
        case SkillType.TECH: return '#60a5fa'; // blue-400
        case SkillType.SUPPORT: return '#f472b6'; // pink-400
        case SkillType.GENERAL: return '#94a3b8'; // slate-400
        default: return '#94a3b8';
    }
};

// Helper for customer color class to hex
const tailwindColorToHex = (className: string) => {
    if (className.includes('bg-amber-400')) return '#fbbf24';
    if (className.includes('bg-rose-500')) return '#f43f5e';
    if (className.includes('bg-blue-500')) return '#3b82f6';
    if (className.includes('bg-blue-600')) return '#2563eb';
    if (className.includes('bg-indigo-500')) return '#6366f1';
    if (className.includes('bg-indigo-600')) return '#4f46e5';
    if (className.includes('bg-sky-500')) return '#0ea5e9';
    if (className.includes('bg-sky-600')) return '#0284c7';
    return '#3b82f6'; // Default blue
};

// --- Reusable Humanoid Figure ---
const HumanFigure = ({ color, isVip, opacity = 1, scale = 1, walkCycle = 0, isMoving = false }: { color: string, isVip?: boolean, opacity?: number, scale?: number, walkCycle?: number, isMoving?: boolean }) => {
    const materialProps = { color, roughness: 0.5, transparent: opacity < 1, opacity };
    
    // Leg rotation logic
    const leftLegRot = isMoving ? Math.sin(walkCycle * 15) * 0.5 : 0;
    const rightLegRot = isMoving ? Math.sin(walkCycle * 15 + Math.PI) * 0.5 : 0;
    
    // Arm rotation (opposite to legs)
    const leftArmRot = isMoving ? Math.sin(walkCycle * 15 + Math.PI) * 0.3 : 0.1; // slight natural bend
    const rightArmRot = isMoving ? Math.sin(walkCycle * 15) * 0.3 : -0.1;

    return (
        <group scale={[scale, scale, scale]}>
            {/* Head */}
            <mesh position={[0, 1.45, 0]} castShadow>
                <sphereGeometry args={[0.25, 16, 16]} />
                <meshStandardMaterial {...materialProps} />
            </mesh>
            {/* Torso */}
            <mesh position={[0, 0.85, 0]} castShadow>
                <capsuleGeometry args={[0.22, 0.55, 4, 8]} />
                <meshStandardMaterial {...materialProps} />
            </mesh>
            {/* Legs */}
            <group position={[-0.12, 0.55, 0]} rotation={[leftLegRot, 0, 0]}>
                <mesh position={[0, -0.25, 0]} castShadow>
                    <capsuleGeometry args={[0.09, 0.6, 4, 8]} />
                    <meshStandardMaterial {...materialProps} />
                </mesh>
            </group>
            <group position={[0.12, 0.55, 0]} rotation={[rightLegRot, 0, 0]}>
                <mesh position={[0, -0.25, 0]} castShadow>
                    <capsuleGeometry args={[0.09, 0.6, 4, 8]} />
                    <meshStandardMaterial {...materialProps} />
                </mesh>
            </group>
            {/* Arms */}
            <group position={[-0.28, 1.1, 0]} rotation={[leftArmRot, 0, 0.2]}>
                <mesh position={[0, -0.2, 0]} castShadow>
                    <capsuleGeometry args={[0.08, 0.5, 4, 8]} />
                    <meshStandardMaterial {...materialProps} />
                </mesh>
            </group>
            <group position={[0.28, 1.1, 0]} rotation={[rightArmRot, 0, -0.2]}>
                <mesh position={[0, -0.2, 0]} castShadow>
                    <capsuleGeometry args={[0.08, 0.5, 4, 8]} />
                    <meshStandardMaterial {...materialProps} />
                </mesh>
            </group>
            
            {/* VIP Crown */}
            {isVip && (
                <mesh position={[0, 1.8, 0]} rotation={[0.1,0,0]}>
                    <cylinderGeometry args={[0.15, 0.05, 0.15, 6]} />
                    <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.6} />
                </mesh>
            )}
        </group>
    );
};

interface Customer3DProps {
    customer: Customer;
    targetPosition: [number, number, number];
    currentTime: number;
    isDeparting?: boolean;
    statusLabel?: string;
    agentPositionsRef: React.MutableRefObject<Map<string, THREE.Vector3>>;
}

const Customer3D: React.FC<Customer3DProps> = ({ customer, targetPosition, currentTime, isDeparting, statusLabel, agentPositionsRef }) => {
    const groupRef = useRef<THREE.Group>(null);
    // Initialize position at entrance for new customers
    // We use a ref for current position to decouple from React render cycle for smooth animation
    const currentPos = useRef(new THREE.Vector3(...ENTRANCE_POS));
    const [isMoving, setIsMoving] = useState(false);
    
    // Store walk cycle time
    const walkTime = useRef(0);
    // Store current opacity for fading
    const opacity = useRef(1);

    const color = customer.priority === 1 ? '#fbbf24' : tailwindColorToHex(customer.color);
    
    // Impatience Calculation
    const impatienceRatio = customer.patienceTime ? Math.min(1, (currentTime - customer.arrivalTime) / customer.patienceTime) : 0;
    const displayColor = (impatienceRatio > 0.9 || statusLabel) ? '#ef4444' : color;

    // Register initial position
    useEffect(() => {
        return () => {
            if (agentPositionsRef.current) {
                agentPositionsRef.current.delete(customer.id);
            }
        };
    }, [customer.id]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        const targetVec = new THREE.Vector3(...targetPosition);
        
        // Calculate distance ignoring Y (flat plane check)
        const dx = targetVec.x - currentPos.current.x;
        const dz = targetVec.z - currentPos.current.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        // Base Speed: 8 units per second roughly
        const moveSpeed = 8 * delta;

        if (dist > 0.1) {
            // --- STEERING BEHAVIOR ---
            // 1. Seek Force: Vector towards target
            const seekVector = new THREE.Vector3(dx, 0, dz).normalize();

            // 2. Separation Force: Avoid other agents
            const separationVector = new THREE.Vector3(0, 0, 0);
            let neighbors = 0;
            const separationRadius = 1.5; // "Personal space"

            agentPositionsRef.current.forEach((otherPos, otherId) => {
                if (otherId === customer.id) return;
                
                const distToNeighbor = currentPos.current.distanceTo(otherPos);
                if (distToNeighbor < separationRadius) {
                    // Vector pointing AWAY from neighbor
                    const push = new THREE.Vector3().subVectors(currentPos.current, otherPos);
                    push.y = 0; // Keep flat
                    push.normalize();
                    // Weight by distance (closer = stronger push)
                    push.divideScalar(distToNeighbor); 
                    separationVector.add(push);
                    neighbors++;
                }
            });

            if (neighbors > 0) {
                separationVector.divideScalar(neighbors);
                separationVector.multiplyScalar(2.0); // Weight of avoidance
            }

            // Combine Forces: Seek + Separation
            const moveDirection = new THREE.Vector3().addVectors(seekVector, separationVector).normalize();

            // Apply movement
            const moveStep = moveDirection.multiplyScalar(Math.min(dist, moveSpeed));
            
            currentPos.current.x += moveStep.x;
            currentPos.current.z += moveStep.z;
            
            // Safe LookAt: Look at immediate next step to face walking direction
            const lookTarget = currentPos.current.clone().add(moveDirection);
            groupRef.current.up.set(0, 1, 0); 
            groupRef.current.lookAt(lookTarget.x, currentPos.current.y, lookTarget.z);
            
            setIsMoving(true);
            walkTime.current += delta;
        } else {
            // Snap to exact target if very close to stop jitter
            if (isMoving) {
                currentPos.current.x = targetVec.x;
                currentPos.current.z = targetVec.z;
                
                setIsMoving(false);
                walkTime.current = 0;
                
                // Force reset rotation to upright facing generally "forward" or towards counter
                groupRef.current.rotation.x = 0;
                groupRef.current.rotation.z = 0;
                // Ideally face the desk if at desk, but keeping rotation simple for now
            }
            
            // Impatience shake (Only Z rotation)
            if (impatienceRatio > 0.8) {
                groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 20) * 0.1;
            } else {
                groupRef.current.rotation.z = 0;
            }
            
            // Hard reset X rotation to prevent "lying on floor"
            groupRef.current.rotation.x = 0;
        }

        // Fading Logic for Departing Customers
        if (isDeparting) {
            const fadeStartDist = 3.0;
            if (dist < fadeStartDist) {
                opacity.current = Math.max(0, dist / fadeStartDist);
            } else {
                opacity.current = 1;
            }
        }

        // Update shared position map
        agentPositionsRef.current.set(customer.id, currentPos.current.clone());

        // Apply position to mesh
        groupRef.current.position.copy(currentPos.current);
        
        // Add Bobbing to Y (Customer breathing/idle or walking bob)
        const bob = isMoving ? 0 : Math.sin(state.clock.elapsedTime * 3) * 0.02;
        groupRef.current.position.y = bob;
    });

    return (
        <group ref={groupRef} position={ENTRANCE_POS}>
            <HumanFigure 
                color={displayColor} 
                isVip={customer.priority === 1} 
                isMoving={isMoving}
                walkCycle={walkTime.current}
                opacity={isDeparting ? opacity.current : 1}
            />
            {statusLabel && (
                <Html position={[0, 2.2, 0]} center zIndexRange={[50, 0]}>
                    <div className="text-[8px] font-bold text-white bg-red-600 px-1 py-0.5 rounded shadow-sm whitespace-nowrap opacity-90">
                        {statusLabel}
                    </div>
                </Html>
            )}
        </group>
    );
};

interface ServerStation3DProps {
    server: any;
    position: [number, number, number];
    currentTime: number;
    onEdit: () => void;
    isEditing: boolean;
    skillBasedRouting: boolean;
    handleToggleSkill: (id: number, skill: SkillType) => void;
    environment: Environment;
}

const ServerStation3D: React.FC<ServerStation3DProps> = ({ 
    server, 
    position, 
    currentTime, 
    onEdit, 
    isEditing, 
    skillBasedRouting, 
    handleToggleSkill,
    environment
}) => {
    const isBusy = server.state === ServerState.BUSY;
    const isOffline = server.state === ServerState.OFFLINE;
    
    // Progress calculation
    let progress = 0;
    if (isBusy && server._activeCustomer?.startTime && server._activeCustomer?.finishTime) {
        const total = server._activeCustomer.finishTime - server._activeCustomer.startTime;
        const elapsed = currentTime - server._activeCustomer.startTime;
        progress = Math.min(1, Math.max(0, elapsed / total));
    }

    const serverColor = isOffline ? '#ef4444' : (isBusy ? '#10b981' : '#cbd5e1');

    return (
        <group position={position}>
            {/* Desk Counter - Varies by Environment */}
            <group onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                {environment === Environment.MARKET ? (
                    // MARKET COUNTER
                    <group>
                        {/* Main Body */}
                        <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
                            <boxGeometry args={[1.8, 0.9, 1.2]} />
                            <meshStandardMaterial color="#f1f5f9" />
                        </mesh>
                        {/* Counter Top */}
                        <mesh position={[0, 0.95, 0]} receiveShadow>
                            <boxGeometry args={[2.0, 0.1, 1.3]} />
                            <meshStandardMaterial color="#334155" />
                        </mesh>
                        {/* Conveyor Belt Area */}
                        <mesh position={[0, 1.01, 0.3]}>
                            <boxGeometry args={[1.8, 0.02, 0.5]} />
                            <meshStandardMaterial color="#0f172a" />
                        </mesh>
                        {/* Register Screen (Back facing server) */}
                        <mesh position={[-0.5, 1.3, -0.4]}>
                            <boxGeometry args={[0.4, 0.3, 0.1]} />
                            <meshStandardMaterial color="#1e293b" />
                        </mesh>
                        <mesh position={[-0.5, 1.1, -0.4]}>
                            <cylinderGeometry args={[0.05, 0.05, 0.3]} />
                            <meshStandardMaterial color="#94a3b8" />
                        </mesh>
                    </group>
                ) : environment === Environment.CALL_CENTER ? (
                    // CALL CENTER CUBICLE
                    <group>
                        {/* Desk */}
                        <mesh position={[0, 0.4, -0.2]} castShadow receiveShadow>
                            <boxGeometry args={[1.6, 0.8, 0.8]} />
                            <meshStandardMaterial color="#e2e8f0" />
                        </mesh>
                        {/* Partition Back */}
                        <mesh position={[0, 1.0, -0.65]} castShadow>
                            <boxGeometry args={[1.8, 2.0, 0.1]} />
                            <meshStandardMaterial color="#94a3b8" />
                        </mesh>
                        {/* Partition Sides */}
                        <mesh position={[-0.85, 1.0, 0]} castShadow>
                            <boxGeometry args={[0.1, 2.0, 1.4]} />
                            <meshStandardMaterial color="#94a3b8" />
                        </mesh>
                        <mesh position={[0.85, 1.0, 0]} castShadow>
                            <boxGeometry args={[0.1, 2.0, 1.4]} />
                            <meshStandardMaterial color="#94a3b8" />
                        </mesh>
                        {/* Monitor */}
                        <mesh position={[0, 1.1, -0.3]}>
                            <boxGeometry args={[0.6, 0.4, 0.05]} />
                            <meshStandardMaterial color="#0f172a" />
                        </mesh>
                    </group>
                ) : (
                    // BANK TELLER (Default)
                    <group>
                        {/* Main Desk Body */}
                        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                            <boxGeometry args={[1.8, 1, 0.8]} />
                            <meshStandardMaterial color="#ffffff" />
                        </mesh>
                        {/* Desk Top */}
                        <mesh position={[0, 1.05, 0]} receiveShadow>
                            <boxGeometry args={[2.0, 0.1, 1.0]} />
                            <meshStandardMaterial color="#e2e8f0" />
                        </mesh>
                        {/* Glass Barrier */}
                        <mesh position={[0, 1.35, 0.45]}>
                            <boxGeometry args={[1.8, 0.5, 0.05]} />
                            <meshStandardMaterial color="#cbd5e1" transparent opacity={0.3} />
                        </mesh>
                    </group>
                )}
            </group>

            {/* Server Avatar (Standing/Sitting) */}
            <group position={[0, 0, -1.0]}>
                {isOffline ? (
                    // Empty chair
                    <mesh position={[0, 0.25, 0]}>
                        <cylinderGeometry args={[0.2, 0.2, 0.5, 16]} />
                        <meshStandardMaterial color="#94a3b8" />
                    </mesh>
                ) : (
                    <HumanFigure color={serverColor} />
                )}
            </group>

            {/* HTML Overlay for UI */}
            <Html position={[0, 2.5, 0]} center transform sprite zIndexRange={[100, 0]}>
                <div className="flex flex-col items-center pointer-events-none">
                    <div className={`text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg mb-1 whitespace-nowrap ${isOffline ? 'bg-red-500' : 'bg-slate-800'}`}>
                        {isOffline ? 'OFFLINE' : `Server ${server.id + 1}`}
                    </div>
                    
                    {/* Skills Dots */}
                    <div className="flex gap-1 mb-1">
                        {server.skills.map((s: SkillType) => (
                            <div key={s} className="w-2 h-2 rounded-full border border-white" style={{ backgroundColor: getSkillColorHex(s) }} />
                        ))}
                    </div>

                    {/* Progress Bar */}
                    {isBusy && (
                        <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden border border-white shadow-sm">
                            <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${progress * 100}%` }} />
                        </div>
                    )}

                    {/* Editor Popup */}
                    {isEditing && (
                        <div className="mt-2 bg-white p-2 rounded-lg shadow-xl border border-slate-200 pointer-events-auto text-left min-w-[120px]">
                            <div className="text-[10px] font-bold text-slate-500 mb-1 uppercase border-b pb-1">Edit Skills</div>
                            {[SkillType.SALES, SkillType.TECH, SkillType.SUPPORT].map(skill => (
                                <button 
                                    key={skill}
                                    onClick={() => handleToggleSkill(server.id, skill)}
                                    className={`w-full text-[10px] font-bold py-1 px-2 rounded flex items-center justify-between mb-1 ${server.skills.includes(skill) ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                >
                                    <span>{skill}</span>
                                    {server.skills.includes(skill) && <i className="fa-solid fa-check"></i>}
                                </button>
                            ))}
                            <button onClick={onEdit} className="w-full text-[9px] text-center text-slate-400 hover:text-slate-600 mt-1">Close</button>
                        </div>
                    )}
                </div>
            </Html>
        </group>
    );
};

const BankScenery = () => (
  <group>
     {/* Back Wall */}
     <mesh position={[0, 5, -5]} receiveShadow>
        <boxGeometry args={[40, 10, 1]} />
        <meshStandardMaterial color="#f8fafc" />
     </mesh>
     {/* Side Walls */}
     <mesh position={[-20, 5, 5]} rotation={[0, Math.PI/2, 0]} receiveShadow>
        <boxGeometry args={[20, 10, 1]} />
        <meshStandardMaterial color="#f1f5f9" />
     </mesh>
     <mesh position={[20, 5, 5]} rotation={[0, Math.PI/2, 0]} receiveShadow>
        <boxGeometry args={[20, 10, 1]} />
        <meshStandardMaterial color="#f1f5f9" />
     </mesh>
     {/* Door Frame Entrance */}
     <group position={[-12, 0, 8]}>
        <mesh position={[-2, 2.5, 0]}>
            <boxGeometry args={[0.5, 5, 0.5]} />
            <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[2, 2.5, 0]}>
            <boxGeometry args={[0.5, 5, 0.5]} />
            <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[0, 5, 0]}>
            <boxGeometry args={[4.5, 0.5, 0.5]} />
            <meshStandardMaterial color="#475569" />
        </mesh>
     </group>
     {/* Rope Barriers for Queue Area */}
     <group position={[0, 0, 2.5]}>
         <mesh position={[-5, 0.5, 0]}>
             <cylinderGeometry args={[0.05, 0.05, 1]} />
             <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
         </mesh>
         <mesh position={[5, 0.5, 0]}>
             <cylinderGeometry args={[0.05, 0.05, 1]} />
             <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
         </mesh>
         <mesh position={[0, 0.9, 0]} rotation={[0,0,Math.PI/2]}>
             <cylinderGeometry args={[0.03, 0.03, 10]} />
             <meshStandardMaterial color="#ef4444" />
         </mesh>
     </group>
  </group>
);

const MarketScenery = () => (
    <group>
        {/* Aisle Shelves Background */}
        <group position={[0, 0, -6]}>
            <mesh position={[0, 2, 0]} castShadow>
                <boxGeometry args={[30, 4, 1]} />
                <meshStandardMaterial color="#475569" />
            </mesh>
            {/* Products on shelves (abstract) */}
            <mesh position={[0, 1, 0.6]}>
                <boxGeometry args={[28, 0.5, 0.5]} />
                <meshStandardMaterial color="#fca5a5" />
            </mesh>
            <mesh position={[0, 2, 0.6]}>
                <boxGeometry args={[28, 0.5, 0.5]} />
                <meshStandardMaterial color="#93c5fd" />
            </mesh>
            <mesh position={[0, 3, 0.6]}>
                <boxGeometry args={[28, 0.5, 0.5]} />
                <meshStandardMaterial color="#86efac" />
            </mesh>
        </group>
    </group>
);

const CallCenterScenery = () => (
    <group>
        {/* Rear Wall */}
        <mesh position={[0, 2, -5]}>
            <boxGeometry args={[40, 4, 0.2]} />
            <meshStandardMaterial color="#e2e8f0" />
        </mesh>
    </group>
);

export const ServiceFloor3DScene = ({ activeState, queueTopology, impatientMode, avgPatienceTime, editingServerId, setEditingServerId, skillBasedRouting, handleToggleServerSkill, environment }: any) => {
    const serverCount = activeState.servers.length;
    // Dynamic Spacing based on server count
    const serverSpacing = Math.min(3, 15 / Math.max(1, serverCount)); 
    
    // Determine floor color based on environment
    let floorColor = "#f1f5f9"; // Default / Bank Tile
    if (environment === Environment.MARKET) floorColor = "#e2e8f0"; // Concrete
    if (environment === Environment.CALL_CENTER) floorColor = "#cbd5e1"; // Carpet

    // Shared State for Agent Positions (to enable avoidance logic)
    // Key: Customer ID, Value: Current Position Vector3
    const agentPositionsRef = useRef(new Map<string, THREE.Vector3>());

    // --- Flatten Render List for Walking Logic ---
    // We compute the target position for every active customer.
    // By rendering one flat list, customers can "move" between queues without unmounting/remounting components.
    const renderList = useMemo(() => {
        const list: { customer: Customer, target: [number, number, number], isDeparting?: boolean, statusLabel?: string }[] = [];

        // 1. Common Queue
        const itemsPerRow = 10;
        const qSpacing = 0.9;
        
        // Calculate common queue starting position (centered)
        // Shift queue start based on topology to avoid overlapping with servers
        const qStartZ = 3.5;

        activeState.queue.forEach((c: Customer, i: number) => {
            const row = Math.floor(i / itemsPerRow);
            const col = i % itemsPerRow;
            const x = (col - itemsPerRow / 2) * qSpacing;
            const z = qStartZ + (row * qSpacing);
            list.push({ customer: c, target: [x, 0, z] });
        });

        // 2. Server Stations (Busy + Dedicated Queues)
        activeState.servers.forEach((server: any, i: number) => {
            const sX = (i - (serverCount - 1) / 2) * serverSpacing;
            
            // Customer being served (At desk)
            // Fix: Changed target Z from 1.0 to -1.2 to bring customer properly to the counter
            // Server group is at Z=-2. Desk front edge is approx -1.6 (world). 
            // -1.2 world puts them ~0.4 units in front of desk.
            if (server.state === ServerState.BUSY && server._activeCustomer) {
                list.push({ customer: server._activeCustomer, target: [sX, 0, -1.2] }); 
            }
            if (server.state === ServerState.BUSY && server._activeBatch) {
                // Batch handling: stack them slightly or put in same spot
                server._activeBatch.forEach((c: Customer, bI: number) => {
                    if (c.id !== server._activeCustomer?.id) {
                        list.push({ customer: c, target: [sX + 0.5, 0, -1.2 + (bI * 0.2)] }); 
                    }
                });
            }

            // Dedicated Queue
            server.queue.forEach((c: Customer, qI: number) => {
                list.push({ customer: c, target: [sX, 0, 2.0 + (qI * 0.9)] }); // 2.0 = start of line
            });
        });

        // 3. Recently Departed (Walking to Exit)
        activeState.recentlyDeparted.forEach((c: Customer) => {
            list.push({ customer: c, target: EXIT_POS, isDeparting: true });
        });

        // 4. Recently Balked (Walking to Exit/Back)
        activeState.recentlyBalked.forEach((c: Customer) => {
            // Determine if they were waiting (Reneged) or rejected immediately (Balked)
            const waitDuration = (c.balkTime || 0) - c.arrivalTime;
            const isReneger = waitDuration > 0.1; // If waited more than 0.1m, they Reneg-ed
            
            if (isReneger) {
                // Renegers storm out the Exit
                list.push({ 
                    customer: c, 
                    target: EXIT_POS, 
                    isDeparting: true, 
                    statusLabel: 'Tired of Waiting!' 
                });
            } else {
                // Balkers turn around at the Entrance
                list.push({ 
                    customer: c, 
                    target: ENTRANCE_POS, // Go back to start
                    isDeparting: true, 
                    statusLabel: 'Queue Full!' 
                }); 
            }
        });

        return list;
    }, [activeState, serverCount, serverSpacing]);

    return (
        <>
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 20, 10]} intensity={1} castShadow shadow-mapSize={[1024, 1024]} />
            <SoftShadows size={10} samples={8} />
            
            <OrbitControls 
                enablePan={true} 
                enableZoom={true} 
                maxPolarAngle={Math.PI / 2.2} // Don't go below floor
                minPolarAngle={0}
                minDistance={5}
                maxDistance={50}
            />

            {/* Floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[50, 50]} />
                <meshStandardMaterial color={floorColor} roughness={environment === Environment.CALL_CENTER ? 1 : 0.5} />
            </mesh>
            {environment !== Environment.CALL_CENTER && (
                <gridHelper args={[50, 50, 0xe2e8f0, 0xe2e8f0]} position={[0, 0.01, 0]} />
            )}

            {/* Environment Scenery */}
            {environment === Environment.BANK && <BankScenery />}
            {environment === Environment.MARKET && <MarketScenery />}
            {environment === Environment.CALL_CENTER && <CallCenterScenery />}

            {/* Servers (Static Geometry) */}
            <group position={[0, 0, -2]}>
                {activeState.servers.map((server: any, i: number) => {
                    const xPos = (i - (serverCount - 1) / 2) * serverSpacing;
                    return (
                        <ServerStation3D 
                            key={server.id}
                            server={server}
                            position={[xPos, 0, 0]}
                            currentTime={activeState.currentTime}
                            onEdit={() => skillBasedRouting && setEditingServerId(editingServerId === server.id ? null : server.id)}
                            isEditing={editingServerId === server.id}
                            skillBasedRouting={skillBasedRouting}
                            handleToggleSkill={handleToggleServerSkill}
                            environment={environment}
                        />
                    );
                })}
            </group>

            {/* ALL Customers (Flat List for continuous animation) */}
            {renderList.map((item) => (
                <Customer3D 
                    key={item.customer.id}
                    customer={item.customer}
                    targetPosition={item.target}
                    currentTime={activeState.currentTime}
                    isDeparting={item.isDeparting}
                    statusLabel={item.statusLabel}
                    agentPositionsRef={agentPositionsRef}
                />
            ))}

            {/* Queue Label (Static Overlay logic can remain if needed, but text inside 3D scene follows queue) */}
            {queueTopology === QueueTopology.COMMON && activeState.queue.length > 0 && (
                <Text position={[0, 2, 2.5]} fontSize={0.5} color="#94a3b8" anchorX="center" anchorY="bottom">
                    Waiting Area ({activeState.queue.length})
                </Text>
            )}

            {/* Entrance / Exit Indicators */}
            <Text position={[-12, 0.1, 8]} rotation={[-Math.PI/2, 0, 0]} fontSize={2} color="#94a3b8" anchorX="center" anchorY="middle">
                ENTRANCE
            </Text>
            <Text position={[12, 0.1, 8]} rotation={[-Math.PI/2, 0, 0]} fontSize={2} color="#94a3b8" anchorX="center" anchorY="middle">
                EXIT
            </Text>
        </>
    );
};
