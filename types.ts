

/**
 * Represents the current operational status of a Server (Teller).
 */
export enum ServerState {
  /** The server is available to take a new customer immediately. */
  IDLE = 'IDLE',
  /** The server is currently processing a customer's request. */
  BUSY = 'BUSY',
  /** The server is down due to breakdown or break. */
  OFFLINE = 'OFFLINE'
}

/**
 * Represents a specific time segment in a server's activity log.
 */
export interface ServerStatusSegment {
    /** The state during this segment */
    state: ServerState;
    /** Start time in simulation minutes */
    start: number;
    /** End time in simulation minutes (null if currently active) */
    end: number | null;
}

/**
 * High-level environment preset that dictates defaults and visuals.
 */
export enum Environment {
  BANK = 'Bank Branch',
  MARKET = 'Grocery Store',
  CALL_CENTER = 'Call Center'
}

/**
 * Skill types for routing logic.
 */
export enum SkillType {
  GENERAL = 'General',
  SALES = 'Sales',
  SUPPORT = 'Support',
  TECH = 'Tech'
}

/**
 * Strategy for selecting a server when multiple are IDLE.
 */
export enum ServerSelectionStrategy {
  /** Pick a random available server. */
  RANDOM = 'Random',
  /** Pick the server with the highest efficiency rating. */
  EFFICIENCY = 'Efficiency'
}

export enum QueueModel {
  MM1 = 'M/M/1',
  MMS = 'M/M/s',
  MMSK = 'M/M/s/K',
  MMS_N_POP = 'M/M/s//N',
  MMINF = 'M/M/inf'
}

export enum DistributionType {
  POISSON = 'Poisson',
  DETERMINISTIC = 'Deterministic',
  UNIFORM = 'Uniform',
  ERLANG = 'Erlang',
  TRACE = 'Trace'
}

export enum QueueTopology {
    COMMON = 'Common',
    DEDICATED = 'Dedicated'
}

export enum SimulationEventType {
    VIP_ARRIVAL = 'VIP_ARRIVAL',
    RENEGE = 'RENEGE',
    BALK = 'BALK',
    ORBIT_ENTRY = 'ORBIT_ENTRY',
    ORBIT_RETRY = 'ORBIT_RETRY',
    BREAKDOWN = 'BREAKDOWN',
    REPAIR = 'REPAIR'
}

export enum RoutingStrategy {
    PROBABILISTIC = 'PROBABILISTIC',
    SHORTEST_QUEUE = 'SHORTEST_QUEUE'
}

export interface TheoreticalMetrics {
  rho: number;
  p0: number;
  lq: number;
  l: number;
  wq: number;
  w: number;
  isStable: boolean;
  isApproximate?: boolean;
  approxNote?: string;
  heavyTrafficLq?: number;
  heavyTrafficWq?: number;
  lambdaEff?: number;
}

export interface CostOptimizationData {
  servers: number;
  costServers: number;
  costWaiting: number;
  totalCost: number;
  isStable: boolean;
}

export interface TraceEntry {
    arrivalTime: number;
    serviceTime: number;
}

export interface Customer {
    id: string;
    arrivalTime: number;
    serviceTime: number;
    priority: number; // 0 or 1
    color: string;
    patienceTime?: number;
    requiredSkill: SkillType;
    classType: 'A' | 'B';
    
    // Runtime
    startTime?: number;
    finishTime?: number;
    balkTime?: number;
    estimatedWaitTime?: number;
    
    // Retrial
    nextRetryTime?: number;
    isRetrial?: boolean;

    // Network Global Tracking
    systemArrivalTime?: number;

    // Workload
    workloadItems?: number;
}

export interface DepartedCustomer extends Customer {
    serverId: number;
    departureTime: number;
}

export interface Server {
    id: number;
    state: ServerState;
    efficiency: number;
    typeLabel: 'Senior' | 'Junior' | 'Normal';
    skills: SkillType[];
    nextBreakdownTime?: number;
    repairTime?: number;
    queue: Customer[]; // Dedicated queue
    _activeBatch: Customer[];
    _activeCustomer?: Customer; // Legacy/Compat
    currentCustomerId?: string; // Legacy
    utilizationHistory: number[]; // 0 or 1
    totalBusyTime: number;
    startTime: number;
    timeline: ServerStatusSegment[];
    shouldRemove?: boolean; // For dynamic staffing attrition
}

export interface StatisticalAccumulator {
    count: number;
    sum: number;
    sumSq: number;
}

export interface SimulationEvent {
    id: string;
    type: SimulationEventType;
    entityId: string | number;
    time: number;
}

export interface NetworkRoutingEvent {
    sourceId: string;
    targetId: string;
    timestamp: number;
    classType: 'A' | 'B';
    color: string;
}

export interface CustomerLogEntry {
    id: string;
    arrivalTime: number;
    startTime: number;
    finishTime: number;
    waitTime: number;
    serviceTime: number;
    serverId: number;
    type: string;
    requiredSkill: SkillType;
    estimatedWaitTime: number;
    workloadItems?: number;
}

export interface ChartDataPoint {
    time: number;
    wq: number;
    w: number;
    wqTheor: number;
    wTheor: number;
    wqApprox?: number;
    lqApprox?: number;
    served: number;
    lqActual: number;
    lqTheor: number;
    wqLower: number;
    wqUpper: number;
    varianceWq: number;
    lObs: number;
    lambdaW: number;
    currentLambda: number;
    currentServers: number;
    utilization: number; // Observed Utilization % (0-100)
    visualSnapshot?: any;
}

export interface SimulationState {
    currentTime: number;
    queue: Customer[];
    orbit: Customer[];
    servers: Server[];
    customersServed: number;
    customersServedWithinTarget: number;
    customersArrivals: number;
    customersImpatient: number;
    totalWaitTime: number;
    totalSystemTime: number;
    maxQueueLength: number;
    history: ChartDataPoint[];
    statsWq: StatisticalAccumulator;
    statsW: StatisticalAccumulator;
    integralL: number;
    lastEventTime: number;
    isBankClosed: boolean;
    isPanic: boolean;
    recentlyDeparted: DepartedCustomer[];
    recentlyBalked: Customer[];
    completedCustomers: CustomerLogEntry[];
    events: SimulationEvent[];
}

export interface SimulationConfig {
    model: QueueModel;
    lambda: number;
    avgServiceTime: number;
    serverCount: number;
    capacity: number; // K
    populationSize: number; // N
    arrivalType: DistributionType;
    arrivalK: number;
    serviceType: DistributionType;
    serviceK: number;
    openHour: number;
    closeHour: number;
    vipProbability: number;
    impatientMode: boolean;
    balkThreshold: number;
    avgPatienceTime: number;
    useDynamicMode: boolean;
    arrivalSchedule: number[];
    serverSchedule: number[];
    efficiencyMode: 'UNIFORM' | 'MIXED';
    seniorityRatio: number;
    serverSelectionStrategy: ServerSelectionStrategy;
    breakdownMode: boolean;
    mtbf: number;
    mttr: number;
    queueTopology: QueueTopology;
    jockeyingEnabled: boolean;
    bulkArrivalMode: boolean;
    minGroupSize: number;
    maxGroupSize: number;
    batchServiceMode: boolean;
    maxBatchSize: number;
    traceData?: TraceEntry[];
    slTarget: number; // minutes
    stateDependentMode: boolean;
    panicThreshold: number;
    panicEfficiencyMultiplier: number;
    skillBasedRouting: boolean;
    skillRatios: { [key in SkillType]?: number };
    retrialMode: boolean;
    avgRetrialDelay: number;
    
    // Variable Workload
    variableWorkloadMode: boolean;
    minWorkloadItems: number;
    maxWorkloadItems: number;
}

/**
 * Consolidated Configuration for UI State
 */
export interface SimulationUIConfig {
    environment: Environment;
    selectedModel: QueueModel;
    arrivalType: DistributionType;
    erlangK: number;
    lambdaInput: number;
    vipProbability: number;
    traceData: TraceEntry[];
    useDynamicMode: boolean;
    arrivalSchedule: number[];
    serverSchedule: number[];
    impatientMode: boolean;
    balkThreshold: number;
    avgPatienceTime: number;
    efficiencyMode: 'UNIFORM' | 'MIXED';
    seniorityRatio: number;
    serverSelectionStrategy: ServerSelectionStrategy;
    skillBasedRouting: boolean;
    skillRatios: { [key in SkillType]?: number };
    retrialMode: boolean;
    avgRetrialDelay: number;
    stateDependentMode: boolean;
    panicThreshold: number;
    panicEfficiencyMultiplier: number;
    variableWorkloadMode: boolean;
    minWorkloadItems: number;
    maxWorkloadItems: number;
    breakdownMode: boolean;
    mtbf: number;
    mttr: number;
    queueTopology: QueueTopology;
    jockeyingEnabled: boolean;
    bulkArrivalMode: boolean;
    minGroupSize: number;
    maxGroupSize: number;
    batchServiceMode: boolean;
    maxBatchSize: number;
    serviceType: DistributionType;
    erlangServiceK: number;
    serviceTimeInput: number;
    slTargetSec: number;
    slTargetPercent: number;
    serverCountInput: number;
    capacityK: number;
    populationSize: number;
    openHour: number;
    closeHour: number;
    costPerServer: number;
    costPerWait: number;
    // Analysis params
    sensParam: 'serverCount' | 'lambda' | 'avgServiceTime';
    sensMetric: 'totalCost' | 'wq' | 'rho';
    sensRange: [number, number];
}

export interface ResourcePool {
    id: string;
    name: string;
    totalCount: number;
    availableCount: number;
    color: string;
}

export interface NetworkNode {
    id: string;
    name: string;
    x: number;
    y: number;
    serverCount: number;
    avgServiceTime: number;
    capacity: number;
    isSource: boolean;
    externalLambda: number;
    classARatio?: number;
    routingStrategy?: RoutingStrategy;
    arrivalBatchSize?: number;
    serviceBatchSize?: number;
    resourcePoolId?: string;
    
    // Runtime properties
    queue: Customer[];
    servers: Server[];
    stats: {
        totalWait: number;
        servedCount: number;
        currentWq: number;
        utilization: number;
        blockedCount: number;
    };
}

export interface NetworkLink {
    id: string;
    sourceId: string;
    targetId: string;
    probability: number;
    probA?: number; // Class A probability
    probB?: number; // Class B probability
    condition?: 'ALL' | 'CLASS_A_ONLY' | 'CLASS_B_ONLY';
}

export interface SavedScenario {
    id: string;
    name: string;
    history: ChartDataPoint[];
    color: string;
    visible: boolean;
}

export interface SensitivityResult {
  xValue: number;
  wq: number;
  lq: number;
  rho: number;
  totalCost: number;
  isStable: boolean;
}

export interface FloatingEffect {
    id: string;
    x: number; // Percent
    y: number; // Percent
    icon: string;
    label: string;
    color: string;
    timestamp: number;
    serverId?: number; // If attached to a specific server
}