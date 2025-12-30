
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
  FASTEST = 'Fastest Available'
}

/**
 * Routing Strategy for Network Nodes.
 * Determines how a customer chooses the next destination.
 */
export enum RoutingStrategy {
  /** Route based on fixed probabilities (Random Walk). */
  PROBABILISTIC = 'Probabilistic',
  /** Route to the connected node with the shortest queue (Load Balancing). */
  SHORTEST_QUEUE = 'Shortest Queue (JSQ)'
}

/**
 * Queue Topology: How queues are structured.
 */
export enum QueueTopology {
  /** Standard Bank Style: One common line feeds all servers. Most efficient. */
  COMMON = 'Common Queue (Bank)',
  /** Supermarket Style: Each server has their own line. Customers choose shortest. */
  DEDICATED = 'Dedicated Queues (Market)'
}

/**
 * Standard Kendall's Notation models supported by the simulator.
 * Format: A/S/c (Arrival / Service / Server Count)
 */
export enum QueueModel {
  /** Single Server queue (M/M/1). The most basic queueing building block. */
  MM1 = 'M/M/1',
  /** Multi-server queue (M/M/s). Equivalent to a bank with 's' tellers and one line. */
  MMS = 'M/M/s',
  /** Infinite server queue (M/M/∞). Used for modeling self-service or ample-resource systems. */
  MMINF = 'M/M/inf',
  /** Multi-server queue with Finite System Capacity (M/M/s/K). Customers arriving when K are in system are blocked/lost. */
  MMSK = 'M/M/s/K'
}

/**
 * Statistical distributions defining the randomness of arrival and service processes.
 */
export enum DistributionType {
  /** Memoryless distribution. Standard for 'M' in Kendall's notation. C.V. = 1.0 */
  POISSON = 'Poisson (Exponential)',
  /** Fixed constant time. No variance. C.V. = 0.0 */
  DETERMINISTIC = 'Deterministic',
  /** Uniform distribution within a range. Bounded variance. */
  UNIFORM = 'Uniform',
  /** Sum of k exponential variables. Used to model multi-stage processes. C.V. = 1/sqrt(k). */
  ERLANG = 'Erlang-k',
  /** Replay specific timestamped data from a CSV log file. */
  TRACE = 'Trace Data (Log File)'
}

/**
 * Represents a single entry from an uploaded trace log.
 */
export interface TraceEntry {
  /** Absolute arrival time in minutes from simulation start */
  arrivalTime: number;
  /** Duration of service in minutes */
  serviceTime: number;
}

/**
 * Configuration object for the Simulation Engine.
 */
export interface SimulationConfig {
  /** The selected queueing model (determines logic for servers and capacity) */
  model: QueueModel;
  
  /** Base Arrival rate (lambda) per hour (Used in Static Mode) */
  lambda: number;
  /** Average service time (1/mu) in minutes */
  avgServiceTime: number;
  /** Base Number of servers (s) (Used in Static Mode) */
  serverCount: number;
  /** System capacity (K) */
  capacity: number;
  
  // -- Dynamic Schedule Config --
  /** Toggle for Dynamic Schedule Mode */
  useDynamicMode: boolean;
  /** Array of 24 numbers representing Lambda for each hour of the day (0-23) */
  arrivalSchedule?: number[];
  /** Array of 24 numbers representing Server Count for each hour of the day (0-23) */
  serverSchedule?: number[];

  /** Arrival distribution type */
  arrivalType: DistributionType;
  /** Erlang shape parameter for arrivals */
  arrivalK: number;
  /** Service distribution type */
  serviceType: DistributionType;
  /** Erlang shape parameter for service */
  serviceK: number;
  /** Opening hour (0-23) */
  openHour: number;
  /** Closing hour (0-23) */
  closeHour: number;
  /** Probability (0-1) that an arrival is High Priority (VIP) */
  vipProbability: number;
  
  // -- Trace Data --
  /** Optional array of trace data for TRACE mode */
  traceData?: TraceEntry[];
  
  // -- Impatient Customer Logic --
  /** Enable impatient customer logic (Balking & Reneging) */
  impatientMode: boolean;
  /** Queue length threshold at which new arrivals balk (leave immediately) */
  balkThreshold: number;
  /** Average patience time in minutes before reneging */
  avgPatienceTime: number;

  // -- Heterogeneous Efficiency Logic --
  /** Toggle for Mixed Seniority (Heterogeneous Servers) */
  efficiencyMode: 'UNIFORM' | 'MIXED';
  /** Percentage of staff that are "Seniors" (high efficiency) */
  seniorityRatio: number;
  /** How to choose between multiple IDLE servers */
  serverSelectionStrategy: ServerSelectionStrategy;

  // -- Skill Based Routing --
  /** Toggle for Skill Based Routing */
  skillBasedRouting: boolean;
  /** Percentage of customers needing specific skills (0-1) */
  skillRatios: {
      [SkillType.SALES]: number;
      [SkillType.TECH]: number;
      [SkillType.SUPPORT]: number;
  };

  // -- Retrial Logic (Orbit) --
  /** Toggle for Retrial Mode (Blocked/Renege -> Orbit) */
  retrialMode: boolean;
  /** Average delay before retrying (minutes) */
  avgRetrialDelay: number;

  // -- State Dependent Rates (Panic Mode) --
  /** Toggle for State Dependent Service Rates */
  stateDependentMode: boolean;
  /** Queue length threshold to trigger higher efficiency */
  panicThreshold: number;
  /** Efficiency multiplier when in panic mode (e.g. 1.5x) */
  panicEfficiencyMultiplier: number;

  // -- Server Breakdown Logic --
  /** Toggle for Service Interruptions */
  breakdownMode: boolean;
  /** Mean Time Between Failures (minutes) */
  mtbf: number;
  /** Mean Time To Repair (minutes) */
  mttr: number;

  // -- Topology & Psychology --
  /** Queue Topology: Common vs Dedicated */
  queueTopology: QueueTopology;
  /** Enable Jockeying (Switching lines in Dedicated mode) */
  jockeyingEnabled: boolean;

  // -- Batch & Bulk Logic --
  /** Toggle for Bulk Arrivals (Groups arriving together) */
  bulkArrivalMode: boolean;
  /** Minimum group size for bulk arrivals */
  minGroupSize: number;
  /** Maximum group size for bulk arrivals */
  maxGroupSize: number;
  
  /** Toggle for Batch Service (Server processes multiple customers at once) */
  batchServiceMode: boolean;
  /** Maximum batch size a server can handle */
  maxBatchSize: number;

  // -- Call Center Specifics --
  /** Target Service Level time in minutes (e.g. 20s = 0.33m) */
  slTarget: number;
}

/**
 * Represents a single entity passing through the system.
 */
export interface Customer {
  /** Unique identifier for tracking */
  id: string;
  /** The absolute simulation time when the customer entered the system */
  arrivalTime: number;
  /** The duration required for service (determined upon arrival based on distribution) */
  serviceTime: number;
  /** Priority level. Higher number = Higher priority. 1=VIP, 0=Standard. */
  priority: number;
  /** The absolute simulation time when service actually began */
  startTime?: number;
  /** The absolute simulation time when the customer left the system */
  finishTime?: number;
  /** Visual property for the UI */
  color: string;
  
  // -- Skill Logic --
  /** The skill required to serve this customer */
  requiredSkill: SkillType;

  // -- EWT Logic --
  /** The estimated wait time calculated at the moment of arrival */
  estimatedWaitTime?: number;

  // -- Multi-Class Logic --
  /** Class A (Gold/VIP) or Class B (Standard) */
  classType: 'A' | 'B';

  // -- Impatience Data --
  /** The duration this customer is willing to wait before reneging (minutes) */
  patienceTime?: number;
  /** Timestamp when customer balked (refused entry) */
  balkTime?: number;

  // -- Retrial Logic --
  /** Time when this customer will retry if in orbit */
  nextRetryTime?: number;
  /** Is this a retrial attempt? */
  isRetrial?: boolean;
}

/**
 * Extended Customer interface for visual artifacts (Departing customers)
 */
export interface DepartedCustomer extends Customer {
    serverId: number;
    departureTime: number;
}

/**
 * Standardized log entry for exporting data.
 */
export interface CustomerLogEntry {
    id: string;
    arrivalTime: number;
    startTime: number;
    finishTime: number;
    waitTime: number;
    serviceTime: number;
    serverId: number;
    type: string; // 'VIP' | 'Standard' | 'Impatient'
    requiredSkill: string;
    estimatedWaitTime: number;
}

/**
 * Represents a service resource (e.g., a Bank Teller).
 */
export interface Server {
  /** Unique index (0 to s-1) */
  id: number;
  /** Current availability */
  state: ServerState;
  /** ID of the customer currently being served, if any */
  currentCustomerId?: string;
  /** Internal: Reference to the customer object being served (Primary) */
  _activeCustomer?: Customer;
  /** Internal: Reference to the entire batch being served */
  _activeBatch?: Customer[];
  
  /** Dynamic Schedule: If true, this server will be removed once they finish their current task. */
  shouldRemove?: boolean;
  
  // -- Efficiency Data --
  /** Efficiency factor. 1.0 = Normal, 1.5 = Fast (Senior), 0.7 = Slow (Trainee) */
  efficiency: number;
  /** Label for UI (e.g., 'Senior', 'Trainee') */
  typeLabel: 'Senior' | 'Junior' | 'Normal';

  // -- Skill Logic --
  /** The set of skills this server possesses */
  skills: SkillType[];

  // -- Breakdown Data --
  /** Simulation time when the next failure will occur */
  nextBreakdownTime?: number;
  /** Simulation time when the current repair will finish (if OFFLINE) */
  repairTime?: number;

  // -- Dedicated Topology Data --
  /** Local queue for this server (used in DEDICATED topology) */
  queue: Customer[];

  // -- Utilization Tracking --
  /** Sliding window (last 60 ticks) of busy state (0 or 1) */
  utilizationHistory: number[];
  /** Cumulative busy time in minutes */
  totalBusyTime: number;
  /** Timestamp when server started (for shift utilization) */
  startTime: number;
}

/**
 * A snapshot of system metrics at a specific point in time.
 * Used for plotting time-series charts.
 */
export interface ChartDataPoint {
  /** Current simulation time in hours */
  time: number;
  /** Observed Mean Waiting Time in Queue */
  wq: number;
  /** Observed Mean Total System Time */
  w: number;
  /** Theoretical (Expected) Waiting Time in Queue (Steady State) */
  wqTheor: number;
  /** Theoretical (Expected) Total System Time (Steady State) */
  wTheor: number;
  /** Total count of customers served so far */
  served: number;
  /** Current number of customers in the queue (Instantaneous) */
  lqActual: number;
  /** Theoretical Mean Queue Length */
  lqTheor: number;
  
  /** Heavy Traffic Approximation for Wq (Sakasegawa/Kingman) */
  wqApprox?: number;
  /** Heavy Traffic Approximation for Lq (Sakasegawa/Kingman) */
  lqApprox?: number;

  // -- Statistical Confidence Intervals --
  wqLower?: number;
  wqUpper?: number;
  varianceWq?: number;

  // -- Little's Law Validation --
  /** Time-average number of people in system (L) observed so far */
  lObs: number;
  /** Calculated λ * W observed so far. Should equal lObs in steady state. */
  lambdaW: number;
  
  /** The active Arrival Rate at this snapshot (for dynamic tracking) */
  currentLambda?: number;
  /** The active Server Count at this snapshot */
  currentServers?: number;

  // -- Visual History (Scrubbing) --
  /** Lightweight snapshot of the visual state for replay/scrubbing */
  visualSnapshot?: {
      queue: Customer[];
      servers: Server[];
      customersImpatient: number;
      customersServed: number;
      orbit: Customer[];
  };
}

/**
 * Represents a saved scenario snapshot for comparison.
 */
export interface SavedScenario {
    id: string;
    name: string;
    history: ChartDataPoint[];
    color: string;
    visible: boolean;
}

/**
 * Data point for the Cost Optimization analysis.
 */
export interface CostOptimizationData {
  /** Number of servers (s) */
  servers: number;
  /** Cost of servers ($ = s * Cs) */
  costServers: number;
  /** Cost of waiting ($ = Lq * Cw) */
  costWaiting: number;
  /** Total Cost */
  totalCost: number;
  /** Is this configuration stable? */
  isStable: boolean;
}

/**
 * Helper object to compute running variance and standard deviation online.
 * Welford's algorithm style accumulator.
 */
export interface StatisticalAccumulator {
  /** Number of samples */
  count: number;
  /** Sum of values */
  sum: number;
  /** Sum of squared values */
  sumSq: number;
}

/**
 * The complete state of the discrete-event simulation engine.
 */
export interface SimulationState {
  /** Current global simulation clock (in minutes) */
  currentTime: number;
  /** List of customers currently waiting for service (Common Queue) */
  queue: Customer[];
  /** List of customers waiting in Orbit to retry */
  orbit: Customer[];
  /** List of servers and their states */
  servers: Server[];
  /** Metric: Total completed customers */
  customersServed: number;
  
  /** Metric: Total customers served within Service Level target */
  customersServedWithinTarget: number;

  /** Metric: Total arrivals attempted */
  customersArrivals: number;
  /** Accumulator: Sum of all wait times (for calculating average) */
  totalWaitTime: number;
  /** Accumulator: Sum of all system times */
  totalSystemTime: number;
  /** Metric: Max observed queue length */
  maxQueueLength: number;
  /** Historical data points for graphing */
  history: ChartDataPoint[];
  
  // -- Advanced Stats --
  /** Accumulator for Wq variance calculations */
  statsWq: StatisticalAccumulator;
  /** Accumulator for W variance calculations */
  statsW: StatisticalAccumulator;
  
  /** Integral of N(t) dt. Used to calculate time-average L (Number in system) */
  integralL: number;
  /** Timestamp of the last processed event (for integration) */
  lastEventTime: number;

  /** Flag indicating if the closing time has been reached (no new arrivals) */
  isBankClosed: boolean;

  /** Flag indicating if system is currently in Panic Mode (State-Dependent Rates) */
  isPanic: boolean;

  // -- Impatience Metrics --
  /** Metric: Total customers who balked (refused to join) or reneged (left queue) */
  customersImpatient: number;

  // -- Animation States --
  /** List of customers who recently finished service (for exit animation) */
  recentlyDeparted: DepartedCustomer[];
  
  /** List of customers who recently balked (for refusal animation) */
  recentlyBalked: Customer[];
  
  // -- Logs --
  /** Complete log of every customer who finished service */
  completedCustomers: CustomerLogEntry[];
}

/**
 * Results from the analytical/mathematical engine.
 * Used as the "Truth" to validate simulation convergence.
 */
export interface TheoreticalMetrics {
  /** Traffic Intensity (Utilization Factor). Must be < 1 for stability. */
  rho: number;
  /** Probability of zero customers in system */
  p0: number;
  /** Expected mean queue length */
  lq: number;
  /** Expected mean number in system */
  l: number;
  /** Expected mean wait time in queue */
  wq: number;
  /** Expected mean total system time */
  w: number;
  /** Flag indicating if the system parameters allow for a steady state */
  isStable: boolean;
  /** Effective Arrival Rate (λ_eff). Only differs from λ in finite capacity models due to blocking. */
  lambdaEff?: number;
  /** True if the result uses an approximation (e.g., G/G/s) rather than exact formulas. */
  isApproximate?: boolean;
  /** Explanation note for approximations */
  approxNote?: string;

  // -- Heavy Traffic Approximations (Kingman/Sakasegawa) --
  /** Approximated Wait Time in Queue using Heavy Traffic formulas */
  heavyTrafficWq?: number;
  /** Approximated Queue Length using Heavy Traffic formulas */
  heavyTrafficLq?: number;
}

// ==========================================
// NETWORK SIMULATOR TYPES (Jackson Networks)
// ==========================================

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
  x: number; // For canvas UI
  y: number; // For canvas UI
  
  // Configuration
  serverCount: number;
  avgServiceTime: number; // mins
  capacity: number; // Max system capacity (Queue + Service) for blocking
  routingStrategy: RoutingStrategy; // PROBABILISTIC or SHORTEST_QUEUE
  resourcePoolId?: string; // Optional requirement for global resource
  
  // Batch Config
  arrivalBatchSize?: number; // For Source nodes: How many arrive at once. Default 1.
  serviceBatchSize?: number; // For Processing nodes: How many processed at once. Default 1.

  // External Source Config
  isSource: boolean;
  externalLambda: number; // Arrivals/hr from outside
  classARatio?: number; // 0 to 1. Ratio of Class A generation at source.
  
  // Stats State
  queue: Customer[];
  servers: Server[];
  stats: {
    totalWait: number;
    servedCount: number;
    currentWq: number;
    utilization: number;
    blockedCount: number; // Number of customers blocked from entering due to capacity
  };
}

export interface NetworkLink {
  id: string;
  sourceId: string;
  targetId: string;
  probability: number; // 0.0 to 1.0 (Deprecated/Default)
  probA?: number; // Probability for Class A
  probB?: number; // Probability for Class B
}

export interface NetworkState {
  currentTime: number;
  nodes: NetworkNode[]; // This holds the LIVE state of nodes
  links: NetworkLink[];
  resourcePools: ResourcePool[];
  totalExits: number;
  recentBlockedLinks: string[]; // IDs of links that had blocking events this frame
}
