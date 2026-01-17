
import { 
    SimulationState, 
    SimulationConfig, 
    Server, 
    ServerState, 
    QueueModel, 
    Customer, 
    StatisticalAccumulator,
    TheoreticalMetrics, 
    ServerSelectionStrategy,
    DistributionType, 
    QueueTopology,
    DepartedCustomer,
    CustomerLogEntry,
    ChartDataPoint,
    SkillType,
    SimulationEventType
} from './types';
import { nextDistribution, calculateTheoreticalMetrics, nextExponential, calculateEWT } from './mathUtils';

// Distinct Color Palettes for Customer Types
const NORMAL_COLORS = ['bg-blue-500', 'bg-blue-600', 'bg-indigo-500', 'bg-indigo-600', 'bg-sky-500', 'bg-sky-600'];
const VIP_COLOR = 'bg-amber-400 ring-2 ring-amber-200 border-amber-500'; 
const IMPATIENT_COLOR = 'bg-rose-500 ring-2 ring-rose-200 border-rose-600';

const MAX_HISTORY_POINTS = 100;
// Increased durations to ensure customers complete their walk animation even at high simulation speeds (e.g. 50x)
// At 50x speed, 15 simulation minutes = 18 real seconds, which is plenty for walking to exit.
// Invisible meshes will linger at exit if speed is low, which is acceptable performance-wise.
const VISUAL_DEPARTURE_DURATION = 15.0; 
const VISUAL_BALK_DURATION = 15.0; 

/**
 * A Modular Discrete Event Simulation Engine for Queueing Systems.
 * Encapsulates state, event handling, and time progression.
 * Implements a "next-event" style logic within a fixed time-step tick for React compatibility.
 */
export class SimulationEngine {
    private state: SimulationState;
    private config: SimulationConfig;
    private nextArrivalTime: number = 0;
    private lastChartPointTime: number = 0;
    
    // Trace Data State
    private traceIndex: number = 0;
    
    // UI Constants usually passed or static
    private readonly CHART_UPDATE_INTERVAL = 5; // sim minutes

    constructor(initialConfig: SimulationConfig) {
        this.config = initialConfig;
        this.state = this.getInitialState();
        this.reset();
    }

    /**
     * Updates the configuration. 
     * NOTE: Requires a reset() to take full effect on structural parameters like Server Count.
     */
    public updateConfig(newConfig: SimulationConfig) {
        this.config = newConfig;
    }

    /**
     * Runtime update of server skills.
     * Allows dynamic changing of agent capabilities without resetting the simulation.
     */
    public updateServerSkills(serverId: number, newSkills: SkillType[]) {
        const server = this.state.servers.find(s => s.id === serverId);
        if (server) {
            server.skills = newSkills;
        }
    }

    /**
     * Returns a snapshot of the current state for UI rendering.
     * Arrays are shallow-cloned to trigger React re-renders.
     */
    public getState(): SimulationState {
        // Return a copy of the state where history is also cloned.
        // This is critical for React/Recharts to detect updates to the array.
        return {
            ...this.state,
            history: [...this.state.history],
            orbit: [...this.state.orbit], // Clone orbit
            recentlyDeparted: [...this.state.recentlyDeparted], // copy visual artifacts
            recentlyBalked: [...this.state.recentlyBalked], // copy visual artifacts
            events: [...this.state.events] // Copy event buffer
            // NOTE: We do NOT clone completedCustomers here for performance reasons as it grows unbounded.
            // React state will hold the reference.
        };
    }

    /**
     * Resets the simulation to t=0 based on current config.
     */
    public reset() {
        this.state = this.getInitialState();
        this.lastChartPointTime = 0;
        this.traceIndex = 0;
        
        // Schedule first arrival
        this.scheduleNextArrival();
    }

    // ... (rest of methods)

    private getDynamicLambda(timeInMinutes: number): number {
        if (!this.config.useDynamicMode || !this.config.arrivalSchedule) {
            return this.config.lambda;
        }
        
        const absoluteHour = this.config.openHour + (timeInMinutes / 60);
        // Find current hour index (0-23)
        let hourIndex = Math.floor(absoluteHour) % 24;
        if (hourIndex < 0) hourIndex += 24;
        
        return this.config.arrivalSchedule[hourIndex] || this.config.lambda;
    }

    private getDynamicServerCount(timeInMinutes: number): number {
        if (!this.config.useDynamicMode || !this.config.serverSchedule || this.config.model === QueueModel.MM1 || this.config.model === QueueModel.MMINF) {
            // Respect fixed model constraints
            if (this.config.model === QueueModel.MM1) return 1;
            if (this.config.model === QueueModel.MMINF) return 999;
            return this.config.serverCount;
        }

        const absoluteHour = this.config.openHour + (timeInMinutes / 60);
        let hourIndex = Math.floor(absoluteHour) % 24;
        if (hourIndex < 0) hourIndex += 24;

        return this.config.serverSchedule[hourIndex] || this.config.serverCount;
    }

    private scheduleNextArrival() {
        // TRACE MODE OVERRIDE
        if (this.config.arrivalType === DistributionType.TRACE && this.config.traceData && this.config.traceData.length > 0) {
            if (this.traceIndex < this.config.traceData.length) {
                // In trace mode, nextArrivalTime is absolute from the log
                this.nextArrivalTime = this.config.traceData[this.traceIndex].arrivalTime;
            } else {
                // End of Trace
                this.nextArrivalTime = Infinity;
            }
            return;
        }

        // --- FINITE POPULATION LOGIC (M/M/s//N) ---
        if (this.config.model === QueueModel.MMS_N_POP) {
            // Count total current customers in system
            let currentInSystem = this.state.queue.length;
            this.state.servers.forEach(s => {
                if (s.state === ServerState.BUSY) {
                    currentInSystem += s._activeBatch ? s._activeBatch.length : 1;
                }
                currentInSystem += s.queue.length;
            });

            // If system has full population, no more arrivals possible
            if (currentInSystem >= this.config.populationSize) {
                this.nextArrivalTime = Infinity;
                return;
            }

            // Effective Lambda = (N - n) * lambda_per_customer
            const lambdaPerUser = this.config.lambda; // user config is lambda per person/hour usually for this model, or aggregate?
            // Standard convention: Input is usually "Arrival Rate per User" or "Mean Time to Arrive per User (1/lambda)".
            // Let's assume input lambda is "Arrivals/hr per customer" for scaling consistency.
            
            const n = currentInSystem;
            const N = this.config.populationSize;
            const effectiveLambda = (N - n) * lambdaPerUser;
            
            if (effectiveLambda <= 0) {
                 this.nextArrivalTime = Infinity;
                 return;
            }

            const meanInterArrival = 60 / effectiveLambda;
            // Assuming Exponential for Finite Pop model (Standard Machine Repair)
            // Even if User selected Erlang, applying (N-n) scaling to Erlang is complex. 
            // We use Exponential for the "next event" logic of a pooled process.
            const delay = nextExponential(effectiveLambda / 60); 
            
            // Note: Since rate is state-dependent, we calculate next arrival from NOW.
            this.nextArrivalTime = this.state.currentTime + delay;
            return;
        }

        // --- STANDARD INFINITE POPULATION LOGIC ---
        // Determine lambda based on CURRENT time
        const currentLambda = this.getDynamicLambda(this.state.currentTime);
        
        if (currentLambda <= 0) {
            this.nextArrivalTime = this.state.currentTime + 99999; // Effectively no arrival
            return;
        }

        const meanInterArrival = 60 / currentLambda;
        const delay = nextDistribution(this.config.arrivalType, meanInterArrival, this.config.arrivalK);
        this.nextArrivalTime += delay;
    }

    /**
     * Main Simulation Tick.
     * Advances time by `deltaTimeMinutes` and processes all events (Arrivals, Departures, etc.)
     */
    public tick(deltaTimeMinutes: number) {
        // Reset Event Buffer for this tick
        this.state.events = [];

        let newTime = this.state.currentTime + deltaTimeMinutes;
        
        // Wall Clock Time calculation
        const absCurrentTime = this.config.openHour + (this.state.currentTime / 60);

        // Check Closing Time
        if (absCurrentTime >= this.config.closeHour) {
            this.state.isBankClosed = true;
        } else {
            this.state.isBankClosed = false;
        }

        // 1. Manage Dynamic Staffing (Hire/Fire based on schedule)
        this.adjustStaffingLevels(this.state.currentTime);

        // 2. Integration for Little's Law (L = λW) AND State Dependent Rates Check
        // Need to sum Common Queue + All Dedicated Queues
        let nInSystem = this.state.queue.length; // Common queue
        let totalQueueLength = this.state.queue.length;

        this.state.servers.forEach(s => {
            // If batch service, count all in batch
            if (s.state === ServerState.BUSY && s._activeBatch) nInSystem += s._activeBatch.length;
            else if (s.state === ServerState.BUSY) nInSystem++;
            
            nInSystem += s.queue.length; // Dedicated queues
            totalQueueLength += s.queue.length;
        });
        
        this.state.integralL += nInSystem * deltaTimeMinutes;

        // -- STATE DEPENDENT RATES (PANIC MODE) CHECK --
        if (this.config.stateDependentMode) {
            this.state.isPanic = totalQueueLength >= this.config.panicThreshold;
        } else {
            this.state.isPanic = false;
        }

        // 3. Process BREAKDOWNS & REPAIRS
        if (this.config.breakdownMode) {
            this.handleBreakdowns(newTime);
        }

        // 3.5 Process RETRIALS (Orbit)
        if (this.state.orbit.length > 0) {
            for (let i = this.state.orbit.length - 1; i >= 0; i--) {
                const c = this.state.orbit[i];
                if (c.nextRetryTime !== undefined && newTime >= c.nextRetryTime) {
                    // Remove from orbit
                    this.state.orbit.splice(i, 1);
                    
                    // Re-enter system
                    c.isRetrial = true;
                    c.balkTime = undefined; // clear balk marker for visual
                    // Update arrival time to now for statistics calculation (Wait Time is per-attempt)
                    c.arrivalTime = newTime; 
                    
                    this.state.events.push({
                        id: Math.random().toString(),
                        type: SimulationEventType.ORBIT_RETRY,
                        entityId: c.id,
                        time: newTime
                    });

                    // We call processSingleArrival but avoid double counting the *attempt* if tracking unique visitors,
                    // but for load analysis, every attempt is an arrival.
                    this.processSingleArrival(newTime, c);
                }
            }
        }

        // 4. Process ARRIVALS
        if (!this.state.isBankClosed) {
            while (this.nextArrivalTime <= newTime) {
                // Abort if arrival is exactly after close (Only for Generated, Trace might want to finish)
                const arrivalAbsHour = this.config.openHour + (this.nextArrivalTime / 60);
                if (this.config.arrivalType !== DistributionType.TRACE && arrivalAbsHour >= this.config.closeHour) {
                    this.state.isBankClosed = true;
                    break;
                }

                // Move simulation time temporarily to arrival moment for accurate recording
                const prevTime = this.state.currentTime;
                this.state.currentTime = this.nextArrivalTime; 
                
                this.handleArrival(this.nextArrivalTime);
                
                this.state.currentTime = prevTime;

                // Schedule next
                if (this.config.arrivalType === DistributionType.TRACE) {
                    this.traceIndex++; // Move to next line in file
                    this.scheduleNextArrival(); // Will peek traceIndex
                    if (this.nextArrivalTime === Infinity) break; // End of file
                } else if (this.config.model === QueueModel.MMS_N_POP) {
                    // For Finite Population, we reschedule based on new state n+1
                    // Since one arrived, n increased, rate decreased.
                    this.scheduleNextArrival();
                } else {
                    // Standard Infinite Population
                    // Use the rate AT the time of this arrival to schedule the next one
                    const currentLambda = this.getDynamicLambda(this.nextArrivalTime);
                    const meanInterArrival = 60 / Math.max(0.1, currentLambda);
                    const delay = nextDistribution(this.config.arrivalType, meanInterArrival, this.config.arrivalK);
                    this.nextArrivalTime += delay;
                }
            }
        }

        // 5. JOCKEYING (Psychology: Switching Lines)
        if (this.config.queueTopology === QueueTopology.DEDICATED && this.config.jockeyingEnabled) {
            this.handleJockeying();
        }

        // 6. Process RENIGING (Impatient customers leaving queue)
        this.handleReneging(newTime);

        // 7. Process SERVICE STARTS (Queue -> Server)
        this.assignServers();

        // 8. Process DEPARTURES (Server -> Out)
        this.handleDepartures(newTime);

        // 9. CLEANUP VISUAL ARTIFACTS
        // Remove customers who have finished their "exit animation" time window
        if (this.state.recentlyDeparted.length > 0) {
            this.state.recentlyDeparted = this.state.recentlyDeparted.filter(c => 
                (newTime - c.departureTime) < VISUAL_DEPARTURE_DURATION
            );
        }
        // Remove balked customers after animation
        if (this.state.recentlyBalked.length > 0) {
            this.state.recentlyBalked = this.state.recentlyBalked.filter(c => 
                c.balkTime && (newTime - c.balkTime) < VISUAL_BALK_DURATION
            );
        }

        // Advance Clock
        this.state.currentTime = newTime;

        // 10. Update Charts (Periodically)
        if (newTime >= this.lastChartPointTime + this.CHART_UPDATE_INTERVAL) {
            this.recordHistorySnapshot();
            this.lastChartPointTime = newTime;
        }

        // 11. Update Server Utilization Stats (Per Tick)
        this.state.servers.forEach(s => {
            const isBusy = s.state === ServerState.BUSY ? 1 : 0;
            
            // Update Cumulative Time
            if (isBusy) {
                s.totalBusyTime += deltaTimeMinutes;
            }

            // Update Sliding Window (Visual)
            s.utilizationHistory.push(isBusy);
            if (s.utilizationHistory.length > 60) {
                s.utilizationHistory.shift();
            }
        });
    }

    // ... (intermediate methods: isDayComplete, setServerState, createNewServer, getInitialState, handleBreakdowns, adjustStaffingLevels, createFactoryCustomer, handleArrival, processSingleArrival, handleJockeying, handleReneging, checkQueueForReneging, assignServers, startServiceBatch, handleDepartures)

    public isDayComplete(): boolean {
        // Check Common Queue
        if (this.state.queue.length > 0) return false;
        
        // Check Dedicated Queues and Busy State
        for (const s of this.state.servers) {
            if (s.queue.length > 0) return false;
            if (s.state === ServerState.BUSY) return false;
        }
        
        // Check Orbit
        if (this.state.orbit.length > 0) return false;

        // Special handling for Trace: if trace finished, day complete?
        if (this.config.arrivalType === DistributionType.TRACE) {
             if (this.nextArrivalTime === Infinity) return true;
        }

        return this.state.isBankClosed;
    }

    private setServerState(server: Server, newState: ServerState, time: number) {
        if (server.state === newState) return;

        // Close the current timeline segment
        if (server.timeline.length > 0) {
            const lastSegment = server.timeline[server.timeline.length - 1];
            if (lastSegment.end === null) {
                lastSegment.end = time;
            }
        }

        // Start a new timeline segment
        server.timeline.push({
            state: newState,
            start: time,
            end: null
        });

        server.state = newState;
    }

    private createNewServer(id: number): Server {
        // Handle Heterogeneous Efficiency Logic
        let efficiency = 1.0;
        let typeLabel: 'Senior' | 'Junior' | 'Normal' = 'Normal';

        if (this.config.efficiencyMode === 'MIXED') {
            const isSenior = Math.random() < this.config.seniorityRatio;
            if (isSenior) {
                efficiency = 1.5; // Seniors work 50% faster
                typeLabel = 'Senior';
            } else {
                efficiency = 0.7; // Juniors work 30% slower
                typeLabel = 'Junior';
            }
        }

        // Handle Skill Assignment
        let skills: SkillType[] = [SkillType.GENERAL];
        if (this.config.skillBasedRouting) {
            // Distribute skills deterministically based on ID to ensure coverage for small teams
            // But include randomness for variety
            const roll = Math.random();
            if (id % 4 === 0) skills = [SkillType.SALES, SkillType.GENERAL];
            else if (id % 4 === 1) skills = [SkillType.TECH, SkillType.GENERAL];
            else if (id % 4 === 2) skills = [SkillType.SUPPORT, SkillType.GENERAL];
            else skills = [SkillType.GENERAL, SkillType.SALES, SkillType.SUPPORT, SkillType.TECH]; // Super agent
        }

        // Initialize Breakdown Schedule
        let nextBreakdownTime = undefined;
        if (this.config.breakdownMode) {
             // Start random time in future
             nextBreakdownTime = this.state ? this.state.currentTime + nextExponential(1/this.config.mtbf) : nextExponential(1/this.config.mtbf);
        }

        // Ensure we capture start time
        const startTime = this.state ? this.state.currentTime : 0;

        return {
            id,
            state: ServerState.IDLE,
            efficiency,
            typeLabel,
            skills,
            nextBreakdownTime,
            queue: [], // Each server starts with empty dedicated line
            _activeBatch: [],
            utilizationHistory: [],
            totalBusyTime: 0,
            startTime,
            // Initialize timeline with IDLE state
            timeline: [{
                state: ServerState.IDLE,
                start: startTime,
                end: null
            }]
        };
    }

    private getInitialState(): SimulationState {
        // Initial server count calculation
        const initialCount = this.getDynamicServerCount(0);
        
        let initialServers: Server[] = [];
        if (this.config.model === QueueModel.MMINF) {
            initialServers = [];
        } else {
            initialServers = Array.from({ length: initialCount }, (_, i) => this.createNewServer(i));
        }

        return {
            currentTime: 0,
            queue: [],
            orbit: [],
            servers: initialServers,
            customersServed: 0,
            customersServedWithinTarget: 0,
            customersArrivals: 0,
            customersImpatient: 0,
            totalWaitTime: 0,
            totalSystemTime: 0,
            maxQueueLength: 0,
            history: [],
            statsWq: { count: 0, sum: 0, sumSq: 0 },
            statsW: { count: 0, sum: 0, sumSq: 0 },
            integralL: 0,
            lastEventTime: 0,
            isBankClosed: false,
            isPanic: false,
            recentlyDeparted: [],
            recentlyBalked: [],
            completedCustomers: [],
            events: []
        };
    }

    private handleBreakdowns(newTime: number) {
        this.state.servers.forEach(server => {
            // Check for BREAKDOWN start
            if (server.state !== ServerState.OFFLINE && 
                server.nextBreakdownTime !== undefined && 
                newTime >= server.nextBreakdownTime) {
                
                const repairDuration = nextExponential(1/this.config.mttr);
                server.repairTime = newTime + repairDuration;
                
                // If busy, extend customer service time (Preemptive Resume)
                // Handle BATCH Delay
                if (server.state === ServerState.BUSY && server._activeBatch && server._activeBatch.length > 0) {
                    server._activeBatch.forEach(c => {
                        if (c.finishTime) c.finishTime += repairDuration;
                    });
                } 
                // Fallback for single mode (sanity check)
                else if (server.state === ServerState.BUSY && server._activeCustomer) {
                    server._activeCustomer.finishTime! += repairDuration;
                }
                
                this.setServerState(server, ServerState.OFFLINE, newTime);
                server.nextBreakdownTime = server.repairTime + nextExponential(1/this.config.mtbf);

                // EMIT EVENT
                this.state.events.push({
                    id: Math.random().toString(),
                    type: SimulationEventType.BREAKDOWN,
                    entityId: server.id,
                    time: newTime
                });
            }
            
            // Check for REPAIR finish
            else if (server.state === ServerState.OFFLINE &&
                     server.repairTime !== undefined &&
                     newTime >= server.repairTime) {
                
                if (server._activeCustomer || (server._activeBatch && server._activeBatch.length > 0)) {
                    this.setServerState(server, ServerState.BUSY, newTime);
                } else {
                    this.setServerState(server, ServerState.IDLE, newTime);
                }
            }
        });
    }

    private adjustStaffingLevels(time: number) {
        if (this.config.model === QueueModel.MMINF) return; // Infinite servers manages itself

        const targetCount = this.getDynamicServerCount(time);
        
        // Count active servers (excluding those marked for removal)
        const activeServers = this.state.servers.filter(s => !s.shouldRemove);
        const currentCount = activeServers.length;

        if (currentCount < targetCount) {
            // HIRE: Add new servers
            const deficit = targetCount - currentCount;
            // Find highest current ID to increment from
            let maxId = -1;
            this.state.servers.forEach(s => maxId = Math.max(maxId, s.id));

            for (let i = 1; i <= deficit; i++) {
                this.state.servers.push(this.createNewServer(maxId + i));
            }
        } else if (currentCount > targetCount) {
            // FIRE: Mark servers for removal (Attrition)
            const surplus = currentCount - targetCount;
            
            // Prefer removing IDLE servers first, then high ID busy servers
            const candidates = this.state.servers.filter(s => !s.shouldRemove);
            
            // Sort: IDLE first, then by ID descending (Last In, First Out logic usually)
            candidates.sort((a, b) => {
                if (a.state === ServerState.IDLE && b.state !== ServerState.IDLE) return -1;
                if (a.state !== ServerState.IDLE && b.state === ServerState.IDLE) return 1;
                return b.id - a.id;
            });

            for (let i = 0; i < surplus; i++) {
                const serverToRemove = candidates[i];
                if (!serverToRemove) break;

                // Find actual reference in main array
                const realServerRef = this.state.servers.find(s => s.id === serverToRemove.id);
                if (realServerRef) {
                    if (realServerRef.state === ServerState.IDLE && realServerRef.queue.length === 0) {
                        // Remove immediately ONLY if queue is empty too (for Dedicated mode)
                        this.state.servers = this.state.servers.filter(s => s.id !== realServerRef.id);
                    } else {
                        // Mark for removal after service
                        realServerRef.shouldRemove = true;
                    }
                }
            }
        }
    }

    private createFactoryCustomer(arrivalTime: number, existingId?: string): Customer {
        // VARIABLE WORKLOAD LOGIC (Multi-Item)
        let workloadItems = 1;
        if (this.config.variableWorkloadMode) {
            // Random integer between min and max (inclusive)
            const min = this.config.minWorkloadItems || 1;
            const max = this.config.maxWorkloadItems || 5;
            workloadItems = Math.floor(Math.random() * (max - min + 1)) + min;
        }

        // SERVICE TIME LOGIC
        // If Trace, we use trace. If Variable Workload, we sum multiple samples.
        let customerServiceTime = 0;
        
        if (this.config.serviceType === DistributionType.TRACE && this.config.traceData && this.config.traceData[this.traceIndex]) {
            customerServiceTime = this.config.traceData[this.traceIndex].serviceTime;
        } else {
            // Generate 'workloadItems' independent service samples
            for (let i = 0; i < workloadItems; i++) {
                customerServiceTime += nextDistribution(this.config.serviceType, this.config.avgServiceTime, this.config.serviceK);
            }
        }

        const isVip = Math.random() < this.config.vipProbability;
        const priority = isVip ? 1 : 0; 
        const classType = isVip ? 'A' : 'B';

        let patienceTime: number | undefined = undefined;
        if (this.config.impatientMode && this.config.model !== QueueModel.MMINF) {
             patienceTime = -Math.log(Math.random()) * this.config.avgPatienceTime;
        }

        // Determine Color based on Customer Type
        let color = NORMAL_COLORS[Math.floor(Math.random() * NORMAL_COLORS.length)];
        if (isVip) {
            color = VIP_COLOR;
        } else if (patienceTime !== undefined) {
             color = IMPATIENT_COLOR;
        }

        // Determine Required Skill based on Config Ratios
        let requiredSkill = SkillType.GENERAL;
        if (this.config.skillBasedRouting) {
            const roll = Math.random();
            const pSales = this.config.skillRatios[SkillType.SALES] || 0;
            const pTech = this.config.skillRatios[SkillType.TECH] || 0;
            const pSupport = this.config.skillRatios[SkillType.SUPPORT] || 0;
            
            // If sum > 1, this logic still holds (first match)
            // If sum < 1, remainder is GENERAL
            if (roll < pSales) requiredSkill = SkillType.SALES;
            else if (roll < pSales + pTech) requiredSkill = SkillType.TECH;
            else if (roll < pSales + pTech + pSupport) requiredSkill = SkillType.SUPPORT;
            else requiredSkill = SkillType.GENERAL;
        }

        return {
            id: existingId || Math.random().toString(36).substr(2, 9),
            arrivalTime,
            serviceTime: customerServiceTime,
            priority,
            color,
            patienceTime,
            requiredSkill,
            classType,
            workloadItems
        };
    }

    private handleArrival(arrivalTime: number) {
        // BULK ARRIVAL LOGIC
        let groupSize = 1;
        if (this.config.bulkArrivalMode) {
            // Random uniform integer between min and max
            groupSize = Math.floor(Math.random() * (this.config.maxGroupSize - this.config.minGroupSize + 1)) + this.config.minGroupSize;
        }

        for (let i = 0; i < groupSize; i++) {
            this.processSingleArrival(arrivalTime);
        }
    }

    private processSingleArrival(arrivalTime: number, existingCustomer?: Customer) {
        // Count total servers (including busy ones) for capacity check
        let currentInSystem = this.state.queue.length;
        this.state.servers.forEach(s => {
            if (s.state === ServerState.BUSY) {
                if (s._activeBatch) currentInSystem += s._activeBatch.length;
                else currentInSystem++; // Fallback
            }
            currentInSystem += s.queue.length; // Add dedicated queues
        });
        
        // Blocking Logic for MMSK
        // For MMS_N_POP (Finite Pop), max customers = N. It shouldn't get here if full, but double check.
        // But for Finite Pop, "blocking" usually means they wait outside, which is handled by arrival rate logic.
        const isMMSK = this.config.model === QueueModel.MMSK;
        const isFull = isMMSK && currentInSystem >= this.config.capacity;

        let isBalking = false;
        if (this.config.impatientMode && !isFull && this.config.model !== QueueModel.MMINF) {
            let lineToCheck = this.state.queue.length;
            if (this.config.queueTopology === QueueTopology.DEDICATED) {
                let minLine = Infinity;
                for (const s of this.state.servers) {
                    if (!s.shouldRemove) minLine = Math.min(minLine, s.queue.length);
                }
                lineToCheck = minLine === Infinity ? 0 : minLine;
            }

            if (lineToCheck >= this.config.balkThreshold) {
                isBalking = true;
            }
        }

        if (isFull || isBalking) {
            this.state.customersArrivals += 1;
            
            if (this.config.retrialMode) {
                // ORBIT LOGIC
                let cToOrbit = existingCustomer;
                if (!cToOrbit) {
                    // Create object if fresh arrival balked
                    cToOrbit = this.createFactoryCustomer(arrivalTime);
                }
                
                // Add to visual balk queue for animation first, then move to orbit logic?
                // Or just straight to orbit.
                const delay = nextExponential(1/this.config.avgRetrialDelay);
                cToOrbit.nextRetryTime = arrivalTime + delay;
                cToOrbit.isRetrial = true;
                
                this.state.orbit.push(cToOrbit);

                // EMIT ORBIT ENTRY
                this.state.events.push({
                    id: Math.random().toString(),
                    type: SimulationEventType.ORBIT_ENTRY,
                    entityId: cToOrbit.id,
                    time: arrivalTime
                });
                
                // Still mark as "balked" for UI flash if needed, but not counted as lost
                // We add a visual clone for the balk effect if it was a fresh arrival
                if (!existingCustomer) {
                    this.state.recentlyBalked.push({ ...cToOrbit, id: 'vis-' + cToOrbit.id, balkTime: arrivalTime });
                }
                
            } else {
                // LOSS LOGIC
                if (isBalking || isFull) {
                    this.state.customersImpatient += 1;
                    // Add to visual balk queue to show animation
                    const visCustomer = existingCustomer || this.createFactoryCustomer(arrivalTime);
                    visCustomer.balkTime = arrivalTime;
                    this.state.recentlyBalked.push(visCustomer);
                    
                    // EMIT BALK
                    this.state.events.push({
                        id: Math.random().toString(),
                        type: SimulationEventType.BALK,
                        entityId: visCustomer.id,
                        time: arrivalTime
                    });
                }
            }
            return;
        }

        const newCustomer = existingCustomer || this.createFactoryCustomer(arrivalTime);

        // EMIT VIP ARRIVAL
        if (newCustomer.priority === 1) {
            this.state.events.push({
                id: Math.random().toString(),
                type: SimulationEventType.VIP_ARRIVAL,
                entityId: newCustomer.id,
                time: arrivalTime
            });
        }

        if (this.config.model === QueueModel.MMINF) {
            // Infinite servers always available
            const newId = this.state.servers.length;
            const server: Server = { 
                id: newId, 
                state: ServerState.BUSY, 
                currentCustomerId: newCustomer.id,
                _activeCustomer: newCustomer,
                _activeBatch: [newCustomer],
                efficiency: 1.0,
                typeLabel: 'Normal',
                skills: [newCustomer.requiredSkill],
                queue: [],
                utilizationHistory: [],
                totalBusyTime: 0,
                startTime: arrivalTime,
                timeline: [{
                    state: ServerState.BUSY,
                    start: arrivalTime,
                    end: null
                }]
            };
            newCustomer.startTime = arrivalTime;
            newCustomer.finishTime = arrivalTime + newCustomer.serviceTime;
            newCustomer.estimatedWaitTime = 0; // Immediate service
            this.state.servers.push(server);
            this.updateAccumulator(this.state.statsWq, 0);
            this.state.customersArrivals += 1;
        } else {
            // ROUTING LOGIC
            // EWT Calculation: Determine Avg Efficiency
            let avgEff = 1.0;
            if (this.config.efficiencyMode === 'MIXED') {
                avgEff = (this.config.seniorityRatio * 1.5) + ((1 - this.config.seniorityRatio) * 0.7);
            }

            if (this.config.queueTopology === QueueTopology.DEDICATED) {
                // Join Shortest Queue (JSQ) but ONLY considering compatible servers
                let bestServer: Server | null = null;
                let minLength = Infinity;

                // Find active servers that MATCH skill
                let candidates = this.state.servers.filter(s => !s.shouldRemove);
                
                if (this.config.skillBasedRouting) {
                    candidates = candidates.filter(s => s.skills.includes(newCustomer.requiredSkill));
                }
                
                if (candidates.length === 0) {
                    candidates = this.state.servers.filter(s => !s.shouldRemove && s.skills.includes(SkillType.GENERAL));
                    if (candidates.length === 0) candidates = this.state.servers.filter(s => !s.shouldRemove);
                }

                for (const s of candidates) {
                    const load = s.queue.length + (s.state === ServerState.BUSY ? 1 : 0);
                    if (load < minLength) {
                        minLength = load;
                        bestServer = s;
                    }
                }

                if (bestServer) {
                    // Determine EWT before push
                    if (bestServer.state === ServerState.IDLE && bestServer.queue.length === 0) {
                        newCustomer.estimatedWaitTime = 0;
                    } else {
                        // Estimate based on single server queue
                        newCustomer.estimatedWaitTime = calculateEWT(bestServer.queue.length, 1, this.config.avgServiceTime, bestServer.efficiency);
                    }
                    bestServer.queue.push(newCustomer);
                } else {
                    this.state.queue.push(newCustomer);
                }

            } else {
                // Common Queue (M/M/s standard)
                // Determine EWT before push
                const activeServersCount = this.state.servers.filter(s => !s.shouldRemove).length;
                const idleServersCount = this.state.servers.filter(s => !s.shouldRemove && s.state === ServerState.IDLE).length;
                
                if (idleServersCount > 0 && this.state.queue.length === 0) {
                    newCustomer.estimatedWaitTime = 0;
                } else {
                    newCustomer.estimatedWaitTime = calculateEWT(this.state.queue.length, activeServersCount, this.config.avgServiceTime, avgEff);
                }

                this.state.queue.push(newCustomer);
                this.state.queue.sort((a, b) => {
                    if (b.priority !== a.priority) {
                        return b.priority - a.priority; 
                    }
                    return a.arrivalTime - b.arrivalTime; 
                });
            }

            // Update stats
            let maxLen = this.state.queue.length;
            if (this.config.queueTopology === QueueTopology.DEDICATED) {
                for (const s of this.state.servers) maxLen = Math.max(maxLen, s.queue.length);
            }
            this.state.maxQueueLength = Math.max(this.state.maxQueueLength, maxLen);
            this.state.customersArrivals += 1;
        }
    }

    private handleJockeying() {
        const candidates = this.state.servers.filter(s => !s.shouldRemove);
        if (candidates.length < 2) return;

        let maxServer: Server | null = null;
        let minServer: Server | null = null;
        let maxLen = -1;
        let minLen = Infinity;

        for (const s of candidates) {
            const len = s.queue.length;
            if (len > maxLen) {
                maxLen = len;
                maxServer = s;
            }
            if (len < minLen) {
                minLen = len;
                minServer = s;
            }
        }

        if (maxServer && minServer && maxServer.id !== minServer.id) {
            if (maxLen - minLen >= 2) {
                const switcher = maxServer.queue.pop();
                if (switcher) {
                    // Logic check: Does minServer have the skill for switcher?
                    if (this.config.skillBasedRouting && !minServer.skills.includes(switcher.requiredSkill)) {
                        // Revert: Put back in old queue
                        maxServer.queue.push(switcher);
                    } else {
                        // Recalculate EWT on switch? 
                        // Typically EWT is given on arrival, but updated estimates are possible.
                        // For this exercise, we keep the original estimate to check accuracy of initial prediction.
                        minServer.queue.push(switcher);
                    }
                }
            }
        }
    }

    private handleReneging(newTime: number) {
        if (!this.config.impatientMode || this.config.model === QueueModel.MMINF) return;

        // Check Common Queue
        this.checkQueueForReneging(this.state.queue, newTime);

        // Check Dedicated Queues
        if (this.config.queueTopology === QueueTopology.DEDICATED) {
            this.state.servers.forEach(s => {
                this.checkQueueForReneging(s.queue, newTime);
            });
        }
    }

    private checkQueueForReneging(queue: Customer[], newTime: number) {
        for (let i = queue.length - 1; i >= 0; i--) {
            const customer = queue[i];
            if (customer.patienceTime !== undefined) {
                const timeWaited = newTime - customer.arrivalTime;
                if (timeWaited >= customer.patienceTime) {
                    const removed = queue.splice(i, 1)[0];
                    
                    if (this.config.retrialMode) {
                        // Move to Orbit instead of counting as loss
                        const delay = nextExponential(1/this.config.avgRetrialDelay);
                        removed.nextRetryTime = newTime + delay;
                        removed.isRetrial = true;
                        this.state.orbit.push(removed);
                        
                        this.state.events.push({
                            id: Math.random().toString(),
                            type: SimulationEventType.ORBIT_ENTRY,
                            entityId: removed.id,
                            time: newTime
                        });

                        // Optional: Add a visual artifact for "left queue"
                        this.state.recentlyBalked.push({ ...removed, id: 'renege-' + removed.id, balkTime: newTime });
                    } else {
                        this.state.customersImpatient += 1;
                        removed.balkTime = newTime;
                        this.state.recentlyBalked.push(removed);

                        // EMIT RENEGE
                        this.state.events.push({
                            id: Math.random().toString(),
                            type: SimulationEventType.RENEGE,
                            entityId: removed.id,
                            time: newTime
                        });
                    }
                }
            }
        }
    }

    /**
     * Attempts to assign available servers to waiting customers.
     * Handles Skill-Based Routing logic and Batch Service logic.
     */
    private assignServers() {
        if (this.config.model === QueueModel.MMINF) return; 

        if (this.config.queueTopology === QueueTopology.DEDICATED) {
            // DEDICATED MODE
            this.state.servers.forEach(server => {
                if (server.state === ServerState.IDLE && !server.shouldRemove && server.queue.length > 0) {
                    this.startServiceBatch(server, server.queue);
                }
            });
        } else {
            // COMMON QUEUE MODE with Skill Matching
            
            // Get all idle servers
            const availableServers = this.state.servers.filter(s => s.state === ServerState.IDLE && !s.shouldRemove);
            
            // Randomize order to prevent Server 0 from always doing the work if multiple match
            availableServers.sort(() => Math.random() - 0.5);

            for (const server of availableServers) {
                if (this.state.queue.length === 0) break;

                let customerIndex = -1;

                if (this.config.skillBasedRouting) {
                    // Find first customer compatible with this server
                    customerIndex = this.state.queue.findIndex(c => server.skills.includes(c.requiredSkill));
                } else {
                    // Standard FIFO
                    customerIndex = 0;
                }

                if (customerIndex > -1) {
                    // We found a match. 
                    // If Batch Mode is active, we need to find UP TO maxBatchSize matching customers
                    if (this.config.batchServiceMode) {
                        const batch: Customer[] = [];
                        // Iterate and extract
                        let i = 0;
                        while(i < this.state.queue.length && batch.length < this.config.maxBatchSize) {
                            const c = this.state.queue[i];
                            const isMatch = !this.config.skillBasedRouting || server.skills.includes(c.requiredSkill);
                            if (isMatch) {
                                batch.push(this.state.queue.splice(i, 1)[0]);
                                // i stays same because array shifted
                            } else {
                                i++;
                            }
                        }
                        if (batch.length > 0) {
                            this.startServiceBatch(server, [], batch); // Pass explicit batch
                        }
                    } else {
                        // Standard Single Service
                        const [customer] = this.state.queue.splice(customerIndex, 1);
                        this.startServiceBatch(server, [], [customer]);
                    }
                }
            }
        }
    }

    private startServiceBatch(server: Server, sourceQueue: Customer[], explicitBatch?: Customer[]) {
        let batch: Customer[] = [];

        if (explicitBatch) {
            batch = explicitBatch;
        } else {
            // Pull from sourceQueue head (Used in Dedicated mode)
            const batchLimit = this.config.batchServiceMode ? this.config.maxBatchSize : 1;
            batch = sourceQueue.splice(0, batchLimit);
        }
        
        if (batch.length === 0) return;

        // Determine Service Time (Shared for entire batch)
        const baseDuration = batch[0].serviceTime; 
        
        // -- APPLY EFFICIENCY (Include Panic Multiplier) --
        let effectiveEfficiency = server.efficiency;
        if (this.state.isPanic) {
            effectiveEfficiency *= this.config.panicEfficiencyMultiplier;
        }

        const actualDuration = baseDuration / effectiveEfficiency;
        const startTime = Math.max(this.state.currentTime, batch[0].arrivalTime); // should be current time
        const finishTime = this.state.currentTime + actualDuration;

        // Update all customers in batch
        batch.forEach(c => {
            c.startTime = this.state.currentTime; // Actual start
            c.finishTime = finishTime;
            
            const wait = c.startTime - c.arrivalTime;
            this.state.totalWaitTime += wait;
            this.updateAccumulator(this.state.statsWq, wait);
        });

        this.setServerState(server, ServerState.BUSY, this.state.currentTime);
        server._activeBatch = batch;
        // For backward compatibility / display logic of single active
        server._activeCustomer = batch[0];
        server.currentCustomerId = batch[0].id;
    }

    private handleDepartures(newTime: number) {
        let anyoneDeparted = false;

        for (let i = this.state.servers.length - 1; i >= 0; i--) {
            const server = this.state.servers[i];
            
            // Handle Batch Departure
            if (server.state === ServerState.BUSY && server._activeBatch && server._activeBatch.length > 0) {
                // Check finish time of the batch (all have same finish time)
                const representative = server._activeBatch[0];
                
                if (representative.finishTime! <= newTime) {
                    anyoneDeparted = true;
                    // Process stats for ALL in batch
                    server._activeBatch.forEach(customer => {
                        this.state.customersServed += 1;
                        const waitTime = customer.startTime! - customer.arrivalTime;
                        const systemTime = customer.finishTime! - customer.arrivalTime;
                        this.state.totalSystemTime += systemTime;
                        this.updateAccumulator(this.state.statsW, systemTime);
                        
                        // -- Service Level Tracking --
                        // SL Target in config is in minutes (since sim uses minutes)
                        if (waitTime <= this.config.slTarget) {
                            this.state.customersServedWithinTarget += 1;
                        }

                        // ANIMATION: Track departing customer
                        this.state.recentlyDeparted.push({
                            ...customer,
                            serverId: server.id,
                            departureTime: newTime
                        });

                        // LOGGING: Track completed customer for Export
                        const logEntry: CustomerLogEntry = {
                            id: customer.id,
                            arrivalTime: customer.arrivalTime,
                            startTime: customer.startTime!,
                            finishTime: customer.finishTime!,
                            waitTime: waitTime,
                            serviceTime: customer.serviceTime,
                            serverId: server.id,
                            type: customer.priority === 1 ? 'VIP' : (customer.patienceTime ? 'Impatient' : 'Standard'),
                            requiredSkill: customer.requiredSkill,
                            estimatedWaitTime: customer.estimatedWaitTime || 0,
                            workloadItems: customer.workloadItems
                        };
                        this.state.completedCustomers.push(logEntry);
                    });

                    if (this.config.model === QueueModel.MMINF) {
                        this.state.servers.splice(i, 1);
                    } else {
                        this.setServerState(server, ServerState.IDLE, newTime);
                        server.currentCustomerId = undefined;
                        server._activeCustomer = undefined;
                        server._activeBatch = []; // Clear batch

                        if (server.shouldRemove) {
                            if (this.config.queueTopology !== QueueTopology.DEDICATED || server.queue.length === 0) {
                                this.state.servers.splice(i, 1);
                            }
                        }
                    }
                }
            }
        }

        // --- FINITE POPULATION LOGIC ---
        // If anyone departed, the system size decreased, so the arrival rate increases.
        // We must ensure the next arrival is scheduled according to the new N-n state.
        if (anyoneDeparted && this.config.model === QueueModel.MMS_N_POP) {
            // For simple Poisson thinning/rescheduling, just call schedule.
            // If nextArrivalTime was Infinity (because system was full), this will restart it.
            // If nextArrivalTime was valid but far away (low rate), this might bring it closer.
            // NOTE: Simplest heuristic for this loop-based engine is to re-evaluate.
            this.scheduleNextArrival();
        }
    }

    private recordHistorySnapshot() {
        const currentLambda = this.getDynamicLambda(this.state.currentTime);
        const currentServers = this.getDynamicServerCount(this.state.currentTime);
        // Standard Mu
        let mu = 60 / this.config.avgServiceTime;
        let customCs2: number | undefined = undefined;

        // -- VARIABLE WORKLOAD THEORETICAL ADJUSTMENT --
        if (this.config.variableWorkloadMode) {
            const minN = this.config.minWorkloadItems || 1;
            const maxN = this.config.maxWorkloadItems || 1;
            
            // Moments of N (Discrete Uniform)
            const meanN = (minN + maxN) / 2;
            const varN = (Math.pow(maxN - minN + 1, 2) - 1) / 12;

            // Moments of S (Service Time per Item)
            const meanS = this.config.avgServiceTime; // minutes
            let varS = 0;
            if (this.config.serviceType === DistributionType.DETERMINISTIC) varS = 0;
            else if (this.config.serviceType === DistributionType.ERLANG) varS = (meanS * meanS) / this.config.serviceK;
            else varS = meanS * meanS; // Default Poisson

            // Moments of T (Total Service Time)
            const meanT = meanN * meanS;
            const varT = meanN * varS + (meanS * meanS) * varN;

            // Effective Mu (per hour)
            mu = 60 / meanT;

            // Effective Cs2 = Var(T) / Mean(T)^2
            customCs2 = varT / (meanT * meanT);
        }

        let avgEfficiency = 1.0;
        if (this.config.efficiencyMode === 'MIXED') {
            avgEfficiency = (this.config.seniorityRatio * 1.5) + ((1 - this.config.seniorityRatio) * 0.7);
        }

        const metrics = calculateTheoreticalMetrics(
            currentLambda,
            mu,
            currentServers,
            this.config.model,
            this.config.capacity,
            this.config.populationSize, // Pass population size
            this.config.arrivalType,
            this.config.arrivalK,
            this.config.serviceType,
            this.config.serviceK,
            avgEfficiency,
            this.config.breakdownMode,
            this.config.mtbf,
            this.config.mttr,
            customCs2 // Pass the calculated CV for compound distribution
        );

        const avgWq = this.state.statsWq.count > 0 ? this.state.statsWq.sum / this.state.statsWq.count : 0;
        const avgW = this.state.statsW.count > 0 ? this.state.statsW.sum / this.state.statsW.count : 0;

        // Calc total queue length for snapshot
        let totalQueue = this.state.queue.length;
        this.state.servers.forEach(s => totalQueue += s.queue.length);

        // CI Calculation
        let ciRange = 0;
        let varianceWq = 0;
        if (this.state.statsWq.count > 1) {
            const n = this.state.statsWq.count;
            varianceWq = (this.state.statsWq.sumSq - (this.state.statsWq.sum * this.state.statsWq.sum) / n) / (n - 1);
            const stdDev = Math.sqrt(Math.max(0, varianceWq));
            ciRange = 1.96 * (stdDev / Math.sqrt(n));
        }

        const lObs = this.state.integralL / (this.state.currentTime || 1); 
        const lambdaEffObs = (this.state.customersArrivals / (this.state.currentTime || 1)) * 60;
        const lambdaW = (lambdaEffObs / 60) * avgW;

        // Calculate Utilization
        let totalUtil = 0;
        let activeServerCount = 0;
        this.state.servers.forEach(s => {
            if (!s.shouldRemove) {
                if (s.utilizationHistory.length > 0) {
                    const sum = s.utilizationHistory.reduce((a, b) => a + b, 0);
                    totalUtil += (sum / s.utilizationHistory.length);
                } else {
                    const uptime = this.state.currentTime - s.startTime;
                    if (uptime > 0) totalUtil += (s.totalBusyTime / uptime);
                }
                activeServerCount++;
            }
        });
        const utilization = activeServerCount > 0 ? parseFloat(((totalUtil / activeServerCount) * 100).toFixed(1)) : 0;

        // Calculate SLA Percent
        const slaPercent = this.state.customersServed > 0 
            ? (this.state.customersServedWithinTarget / this.state.customersServed) * 100 
            : 100; // Default to 100% until proven otherwise

        // Calculate Loss Rate (Cumulative)
        const lossRate = this.state.customersArrivals > 0 
            ? (this.state.customersImpatient / this.state.customersArrivals) * 100 
            : 0;

        // Capture Lightweight Visual Snapshot for Scrubbing
        const visualSnapshot = {
            queue: JSON.parse(JSON.stringify(this.state.queue)),
            servers: JSON.parse(JSON.stringify(this.state.servers)),
            customersImpatient: this.state.customersImpatient,
            customersServed: this.state.customersServed,
            orbit: JSON.parse(JSON.stringify(this.state.orbit))
        };

        const point: ChartDataPoint = {
            time: parseFloat((this.state.currentTime / 60).toFixed(2)),
            wq: parseFloat(avgWq.toFixed(2)),
            w: parseFloat(avgW.toFixed(2)),
            wqTheor: metrics.isStable ? parseFloat((metrics.wq * 60).toFixed(2)) : 0,
            wTheor: metrics.isStable ? parseFloat((metrics.w * 60).toFixed(2)) : 0,
            wqApprox: metrics.heavyTrafficWq !== undefined ? parseFloat((metrics.heavyTrafficWq * 60).toFixed(2)) : undefined,
            lqApprox: metrics.heavyTrafficLq !== undefined ? parseFloat(metrics.heavyTrafficLq.toFixed(2)) : undefined,
            served: this.state.customersServed,
            lqActual: totalQueue, // Using total queue count
            lqTheor: metrics.isStable ? parseFloat(metrics.lq.toFixed(2)) : 0,
            wqLower: parseFloat(Math.max(0, avgWq - ciRange).toFixed(2)),
            wqUpper: parseFloat((avgWq + ciRange).toFixed(2)),
            varianceWq: parseFloat(varianceWq.toFixed(4)),
            lObs: parseFloat(lObs.toFixed(2)),
            lambdaW: parseFloat(lambdaW.toFixed(2)),
            currentLambda,
            currentServers,
            utilization,
            slaPercent: parseFloat(slaPercent.toFixed(1)),
            lossRate: parseFloat(lossRate.toFixed(1)), // Calculated cumulative loss
            visualSnapshot
        };

        this.state.history.push(point);
        if (this.state.history.length > MAX_HISTORY_POINTS) {
            this.state.history.shift();
        }
    }

    private updateAccumulator(acc: StatisticalAccumulator, val: number) {
        acc.count += 1;
        acc.sum += val;
        acc.sumSq += (val * val);
    }
}
