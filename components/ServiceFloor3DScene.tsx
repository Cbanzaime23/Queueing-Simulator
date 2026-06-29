
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

// Constants for positioning - Unified with Visual Labels
const ENTRANCE_POS: [number, number, number] = [-14, 0, 10];
const EXIT_POS: [number, number, number] = [14, 0, 10];
const COUNTER_Z = -2.5;
const QUEUE_START_Z = 6.0;

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
    const legSwing = isMoving ? Math.sin(walkCycle * 12) * 0.4 : 0;
    const leftLegRot = legSwing;
    const rightLegRot = -legSwing;
    
    // Arm rotation (opposite to legs)
    const armSwing = isMoving ? Math.sin(walkCycle * 12) * 0.3 : 0;
    const leftArmRot = -armSwing + 0.1; 
    const rightArmRot = armSwing - 0.1;

    // Head bob
    const headBob = isMoving ? Math.abs(Math.cos(walkCycle * 24)) * 0.05 : 0;

    return (
        <group scale={[scale, scale, scale]}>
            {/* Head */}
            <mesh position={[0, 1.45 + headBob, 0]} castShadow>
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
                <mesh position={[0, 1.8 + headBob, 0]} rotation={[0.1,0,0]}>
                    <cylinderGeometry args={[0.15, 0.05, 0.15, 6]} />
                    <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.6} />
                </mesh>
            )}
        </group>
    );
};

interface Customer3DProps {
    customer: Customer;
    startPosition: [number, number, number];
    targetPosition: [number, number, number];
    currentTime: number;
    isDeparting?: boolean;
    statusLabel?: string;
    agentPositionsRef: React.MutableRefObject<Map<string, THREE.Vector3>>;
}

const Customer3D: React.FC<Customer3DProps> = ({ customer, startPosition, targetPosition, currentTime, isDeparting, statusLabel, agentPositionsRef }) => {
    const groupRef = useRef<THREE.Group>(null);
    // CRITICAL FIX: Initialize position to startPosition instead of ENTRANCE_POS
    const currentPos = useRef(new THREE.Vector3(...startPosition));
    const [isMoving, setIsMoving] = useState(false);
    const walkTime = useRef(0);
    const opacity = useRef(1);

    const color = customer.priority === 1 ? '#fbbf24' : tailwindColorToHex(customer.color);
    const impatienceRatio = customer.patienceTime ? Math.min(1, (currentTime - customer.arrivalTime) / customer.patienceTime) : 0;
    const displayColor = (impatienceRatio > 0.9 || statusLabel) ? '#ef4444' : color;

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
        const dx = targetVec.x - currentPos.current.x;
        const dz = targetVec.z - currentPos.current.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        const moveSpeed = 10 * delta; 

        if (dist > 0.1) {
            const seekVector = new THREE.Vector3(dx, 0, dz).normalize();
            const separationVector = new THREE.Vector3(0, 0, 0);
            let neighbors = 0;
            const separationRadius = 1.2;

            agentPositionsRef.current.forEach((otherPos, otherId) => {
                if (otherId === customer.id) return;
                const distToNeighbor = currentPos.current.distanceTo(otherPos);
                if (distToNeighbor < separationRadius) {
                    const push = new THREE.Vector3().subVectors(currentPos.current, otherPos);
                    push.y = 0;
                    push.normalize().divideScalar(Math.max(0.1, distToNeighbor));
                    separationVector.add(push);
                    neighbors++;
                }
            });

            if (neighbors > 0) {
                separationVector.divideScalar(neighbors).multiplyScalar(1.5);
            }

            const moveDirection = new THREE.Vector3().addVectors(seekVector, separationVector).normalize();
            const moveStep = moveDirection.multiplyScalar(Math.min(dist, moveSpeed));
            
            currentPos.current.x += moveStep.x;
            currentPos.current.z += moveStep.z;
            
            const lookTarget = currentPos.current.clone().add(moveDirection);
            groupRef.current.up.set(0, 1, 0); 
            groupRef.current.lookAt(lookTarget.x, currentPos.current.y, lookTarget.z);
            
            setIsMoving(true);
            walkTime.current += delta;
        } else {
            if (isMoving) {
                currentPos.current.x = targetVec.x;
                currentPos.current.z = targetVec.z;
                setIsMoving(false);
                walkTime.current = 0;
                groupRef.current.rotation.x = 0;
                groupRef.current.rotation.z = 0;
            }
            if (impatienceRatio > 0.8 && !isDeparting) {
                groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 25) * 0.08;
            } else {
                groupRef.current.rotation.z = 0;
            }
            groupRef.current.rotation.x = 0;
        }

        if (isDeparting) {
            const fadeStartDist = 4.0;
            opacity.current = Math.min(1, Math.max(0, dist / fadeStartDist));
        }

        agentPositionsRef.current.set(customer.id, currentPos.current.clone());
        groupRef.current.position.copy(currentPos.current);
        const bob = isMoving ? Math.abs(Math.sin(walkTime.current * 24)) * 0.08 : Math.sin(state.clock.elapsedTime * 2) * 0.01;
        groupRef.current.position.y = bob;
    });

    return (
        <group ref={groupRef} position={startPosition}>
            <HumanFigure 
                color={displayColor} 
                isVip={customer.priority === 1} 
                isMoving={isMoving}
                walkCycle={walkTime.current}
                opacity={isDeparting ? opacity.current : 1}
            />
            {statusLabel && (
                <Html position={[0, 2.2, 0]} center zIndexRange={[50, 0]}>
                    <div className="text-[8px] font-bold text-white bg-red-600 px-1 py-0.5 rounded shadow-sm whitespace-nowrap opacity-90 animate-pulse">
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
    
    let progress = 0;
    if (isBusy && server._activeCustomer?.startTime && server._activeCustomer?.finishTime) {
        const total = server._activeCustomer.finishTime - server._activeCustomer.startTime;
        const elapsed = currentTime - server._activeCustomer.startTime;
        progress = Math.min(1, Math.max(0, elapsed / total));
    }

    const serverColor = isOffline ? '#ef4444' : (isBusy ? '#10b981' : '#cbd5e1');

    return (
        <group position={position}>
            <group onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                {environment === Environment.MARKET ? (
                    <group>
                        <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
                            <boxGeometry args={[1.8, 0.9, 1.2]} />
                            <meshStandardMaterial color="#f1f5f9" />
                        </mesh>
                        <mesh position={[0, 0.95, 0]} receiveShadow>
                            <boxGeometry args={[2.0, 0.1, 1.3]} />
                            <meshStandardMaterial color="#334155" />
                        </mesh>
                        <mesh position={[0, 1.01, 0.3]}>
                            <boxGeometry args={[1.8, 0.02, 0.5]} />
                            <meshStandardMaterial color="#0f172a" />
                        </mesh>
                    </group>
                ) : environment === Environment.CALL_CENTER ? (
                    <group>
                        <mesh position={[0, 0.4, -0.2]} castShadow receiveShadow>
                            <boxGeometry args={[1.6, 0.8, 0.8]} />
                            <meshStandardMaterial color="#e2e8f0" />
                        </mesh>
                        <mesh position={[0, 1.0, -0.65]} castShadow>
                            <boxGeometry args={[1.8, 2.0, 0.1]} />
                            <meshStandardMaterial color="#94a3b8" />
                        </mesh>
                        <mesh position={[-0.85, 1.0, 0]} castShadow>
                            <boxGeometry args={[0.1, 2.0, 1.4]} />
                            <meshStandardMaterial color="#94a3b8" />
                        </mesh>
                        <mesh position={[0.85, 1.0, 0]} castShadow>
                            <boxGeometry args={[0.1, 2.0, 1.4]} />
                            <meshStandardMaterial color="#94a3b8" />
                        </mesh>
                    </group>
                ) : (
                    <group>
                        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                            <boxGeometry args={[1.8, 1, 0.8]} />
                            <meshStandardMaterial color="#ffffff" />
                        </mesh>
                        <mesh position={[0, 1.05, 0]} receiveShadow>
                            <boxGeometry args={[2.0, 0.1, 1.0]} />
                            <meshStandardMaterial color="#e2e8f0" />
                        </mesh>
                    </group>
                )}
            </group>

            <group position={[0, 0, -1.0]}>
                {isOffline ? (
                    <mesh position={[0, 0.25, 0]}>
                        <cylinderGeometry args={[0.2, 0.2, 0.5, 16]} />
                        <meshStandardMaterial color="#94a3b8" />
                    </mesh>
                ) : (
                    <HumanFigure color={serverColor} />
                )}
            </group>

            <Html position={[0, 2.5, 0]} center transform sprite zIndexRange={[100, 0]}>
                <div className="flex flex-col items-center pointer-events-none">
                    <div className={`text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg mb-1 whitespace-nowrap ${isOffline ? 'bg-red-500' : 'bg-slate-800'}`}>
                        {isOffline ? 'OFFLINE' : `Server ${server.id + 1}`}
                    </div>
                    <div className="flex gap-1 mb-1">
                        {server.skills.map((s: SkillType) => (
                            <div key={s} className="w-2 h-2 rounded-full border border-white" style={{ backgroundColor: getSkillColorHex(s) }} />
                        ))}
                    </div>
                    {isBusy && (
                        <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden border border-white shadow-sm">
                            <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${progress * 100}%` }} />
                        </div>
                    )}
                </div>
            </Html>
        </group>
    );
};

const Scenery = ({ environment }: { environment: Environment }) => (
  <group>
     <mesh position={[0, 5, -8]} receiveShadow>
        <boxGeometry args={[40, 10, 1]} />
        <meshStandardMaterial color="#f8fafc" />
     </mesh>
     <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color={environment === Environment.MARKET ? "#e2e8f0" : "#f1f5f9"} />
     </mesh>
     <group position={[-14, 0, 10]}>
        <mesh position={[0, 2.5, 0.5]}>
            <boxGeometry args={[4, 5, 0.1]} />
            <meshStandardMaterial color="#475569" transparent opacity={0.3} />
        </mesh>
     </group>
     <group position={[14, 0, 10]}>
        <mesh position={[0, 2.5, 0.5]}>
            <boxGeometry args={[4, 5, 0.1]} />
            <meshStandardMaterial color="#475569" transparent opacity={0.3} />
        </mesh>
     </group>
  </group>
);

export const ServiceFloor3DScene = ({ activeState, queueTopology, impatientMode, avgPatienceTime, editingServerId, setEditingServerId, skillBasedRouting, handleToggleServerSkill, environment }: any) => {
    const serverCount = activeState.servers.length;
    const serverSpacing = Math.min(3, 16 / Math.max(1, serverCount)); 
    const agentPositionsRef = useRef(new Map<string, THREE.Vector3>());

    const renderList = useMemo(() => {
        const list: { customer: Customer, start: [number, number, number], target: [number, number, number], isDeparting?: boolean, statusLabel?: string }[] = [];

        // 1. Common Queue - Centered Path
        const itemsPerRow = 8;
        const qSpacing = 1.0;
        activeState.queue.forEach((c: Customer, i: number) => {
            const row = Math.floor(i / itemsPerRow);
            const col = i % itemsPerRow;
            const x = (col - (itemsPerRow - 1) / 2) * qSpacing;
            const z = QUEUE_START_Z + (row * qSpacing);
            // Incoming customers always start at Entrance
            list.push({ customer: c, start: ENTRANCE_POS, target: [x, 0, z] });
        });

        // 2. Servers & Dedicated Lines
        activeState.servers.forEach((server: any, i: number) => {
            const sX = (i - (serverCount - 1) / 2) * serverSpacing;
            if (server.state === ServerState.BUSY && server._activeCustomer) {
                list.push({ customer: server._activeCustomer, start: ENTRANCE_POS, target: [sX, 0, COUNTER_Z + 1.2] }); 
            }
            server.queue.forEach((c: Customer, qI: number) => {
                list.push({ customer: c, start: ENTRANCE_POS, target: [sX, 0, COUNTER_Z + 3.0 + (qI * 1.0)] }); 
            });
        });

        // 3. Departures - START AT SERVER POS
        activeState.recentlyDeparted.forEach((c: any) => {
            // Find server position to start from
            const sIdx = activeState.servers.findIndex((s: any) => s.id === c.serverId);
            const sX = sIdx !== -1 ? (sIdx - (serverCount - 1) / 2) * serverSpacing : 0;
            const originPos: [number, number, number] = [sX, 0, COUNTER_Z + 1.2];
            list.push({ customer: c, start: originPos, target: EXIT_POS, isDeparting: true });
        });

        // 4. Balkers & Renegers - LOGICAL START
        activeState.recentlyBalked.forEach((c: Customer) => {
            const waitDuration = (c.balkTime || 0) - c.arrivalTime;
            const isReneger = waitDuration > 0.1;
            
            if (isReneger) {
                // Renegers leave from the queue area
                // Approximate their queue position for visual start
                const originPos: [number, number, number] = [0, 0, QUEUE_START_Z]; 
                list.push({ customer: c, start: originPos, target: EXIT_POS, isDeparting: true, statusLabel: 'Too Slow!' });
            } else {
                // Balkers never joined, they just leave from entrance
                list.push({ customer: c, start: ENTRANCE_POS, target: EXIT_POS, isDeparting: true, statusLabel: 'Full!' }); 
            }
        });

        return list;
    }, [activeState, serverCount, serverSpacing]);

    return (
        <>
            <ambientLight intensity={0.6} />
            <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
            <SoftShadows size={10} samples={12} />
            
            <OrbitControls 
                enablePan={true} 
                enableZoom={true} 
                maxPolarAngle={Math.PI / 2.1}
                minPolarAngle={Math.PI / 6}
                minDistance={10}
                maxDistance={40}
                target={[0, 0, 2]}
            />

            <Scenery environment={environment} />

            <group position={[0, 0, COUNTER_Z]}>
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

            {renderList.map((item) => (
                <Customer3D 
                    key={item.customer.id}
                    customer={item.customer}
                    startPosition={item.start}
                    targetPosition={item.target}
                    currentTime={activeState.currentTime}
                    isDeparting={item.isDeparting}
                    statusLabel={item.statusLabel}
                    agentPositionsRef={agentPositionsRef}
                />
            ))}

            {queueTopology === QueueTopology.COMMON && activeState.queue.length > 0 && (
                <Text position={[0, 3, QUEUE_START_Z - 1]} fontSize={0.6} color="#475569" anchorX="center" anchorY="bottom" font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKboxHMjA.woff">
                    Main Queue Area ({activeState.queue.length})
                </Text>
            )}

            <Text position={[-14, 0.1, 12]} rotation={[-Math.PI/2, 0, 0]} fontSize={1.2} color="#94a3b8" anchorX="center" anchorY="middle">ENTRANCE</Text>
            <Text position={[14, 0.1, 12]} rotation={[-Math.PI/2, 0, 0]} fontSize={1.2} color="#94a3b8" anchorX="center" anchorY="middle">EXIT</Text>
        </>
    );
};
