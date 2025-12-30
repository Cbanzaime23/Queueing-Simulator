
import { TheoreticalMetrics, QueueModel, DistributionType, CostOptimizationData, NetworkNode, NetworkLink, SimulationConfig } from './types';

/**
 * Helper: Computes factorial of a number (n!).
 * @param n Integer input
 */
const factorial = (n: number): number => {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
};

/**
 * Helper: Formats decimal hours into a 12-hour clock string.
 * @param decimalHours The hour value (e.g., 9.5 for 9:30 AM, 14.0 for 2:00 PM)
 * @returns Formatted time string (e.g., "09:30 AM")
 */
export const formatTime = (decimalHours: number): string => {
  // Normalize to 24-hour cycle just in case simulation goes over 24h
  const normalizedHours = decimalHours % 24;
  
  let hours = Math.floor(normalizedHours);
  const minutes = Math.floor((normalizedHours - hours) * 60);
  
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  const strMinutes = minutes < 10 ? '0' + minutes : minutes;
  const strHours = hours < 10 ? '0' + hours : hours;
  
  return `${strHours}:${strMinutes} ${ampm}`;
};

/**
 * Calculates the Estimated Wait Time (EWT) for a new arrival based on current queue state.
 * Validates Little's Law instantaneously.
 * 
 * Formula: EWT = (Lq + 1) / (s * mu_eff)
 * 
 * @param queueLength Number of people currently in the queue
 * @param activeServers Number of servers currently working (s)
 * @param avgServiceTime Average service time (1/mu) in minutes
 * @param avgEfficiency Average server efficiency factor (default 1.0)
 * @returns Estimated wait time in minutes
 */
export const calculateEWT = (queueLength: number, activeServers: number, avgServiceTime: number, avgEfficiency: number = 1.0): number => {
    if (activeServers <= 0) return 999; // Infinite wait if no servers
    
    // Effective service rate per server (customers per minute)
    // avgServiceTime is 1/mu. efficiency multiplies rate.
    // rate = (1 / duration) * efficiency
    const effectiveServiceRate = (1 / avgServiceTime) * avgEfficiency;
    
    // Total system service rate (customers per minute the system can handle)
    const systemServiceRate = activeServers * effectiveServiceRate;
    
    // Work content: (People ahead + self) / Rate
    return (queueLength + 1) / systemServiceRate;
};

/**
 * Calculates the Probability of Waiting > 0 (Erlang-C Formula)
 */
const calculateErlangCProbability = (r: number, s: number): number => {
    if (s <= r) return 1.0; // Unstable or saturated
    
    let sum = 0;
    for (let i = 0; i < s; i++) {
        sum += Math.pow(r, i) / factorial(i);
    }
    
    const numerator = (Math.pow(r, s) / factorial(s)) * (s / (s - r));
    const denominator = sum + numerator;
    
    return numerator / denominator;
};

/**
 * STAFFING CALCULATOR (Inverse Erlang-C)
 * Finds the minimum number of servers (s) required to meet a Service Level target.
 * 
 * Target: P(Wait <= targetTime) >= targetPercent
 * Formula: SL = 1 - P(Wait > 0) * e^(-(s*mu - lambda) * targetTime)
 * 
 * @param lambda Arrival Rate (per hour)
 * @param mu Service Rate (per hour)
 * @param targetTime Target wait time in minutes (converted internally from hours if needed)
 * @param targetPercent Target Service Level (0.0 to 1.0)
 */
export const calculateRequiredServers = (
    lambda: number, 
    mu: number, 
    targetTimeMinutes: number, 
    targetPercent: number
): number => {
    // 1. Calculate Traffic Intensity (Erlangs)
    const r = lambda / mu;
    
    // 2. Start iterating s from stability baseline (s > r)
    let s = Math.floor(r) + 1;
    
    // Safety cap
    const MAX_SERVERS = 100;

    while (s <= MAX_SERVERS) {
        // Calculate P(Wait > 0) using Erlang-C
        const pWait = calculateErlangCProbability(r, s);
        
        // Calculate Service Level
        // SL = 1 - P(Wait > 0) * exp(-(s*mu - lambda) * t)
        // Note: Rates are per hour, so targetTime must be in hours for the formula
        const targetTimeHours = targetTimeMinutes / 60;
        const serviceLevel = 1 - (pWait * Math.exp(-(s * mu - lambda) * targetTimeHours));
        
        if (serviceLevel >= targetPercent) {
            return s;
        }
        s++;
    }
    
    return MAX_SERVERS;
};

/**
 * THEORETICAL ENGINE
 * 
 * Calculates steady-state performance metrics for queueing systems.
 * 
 * Logic Support:
 * 1. M/M/s: Uses exact Erlang-C formulas.
 * 2. M/G/1: Uses exact Pollaczek-Khinchine formula (via Allen-Cunneen identity).
 * 3. M/G/inf: Uses exact Palm's Theorem / Little's Law.
 * 4. M/M/s/K: Uses exact finite-state birth-death probabilities.
 * 5. G/G/s: Uses Allen-Cunneen / Sakasegawa Approximations.
 * 
 * @param lambda Arrival rate (customers per hour)
 * @param mu Service rate (customers per hour)
 * @param s Number of servers
 * @param model The Kendall notation model selected
 * @param K System capacity (for M/M/s/K)
 * @param arrivalType Distribution of inter-arrival times
 * @param erlangK Shape parameter for Erlang arrivals
 * @param serviceType Distribution of service times
 * @param erlangServiceK Shape parameter for Erlang service
 * @param avgEfficiency Optional multiplier for heterogeneous efficiency (default 1.0)
 * @param breakdownMode Optional boolean to enable breakdown logic
 * @param mtbf Mean Time Between Failures (mins)
 * @param mttr Mean Time To Repair (mins)
 */
export const calculateTheoreticalMetrics = (
  lambda: number,
  mu: number,
  s: number,
  model: QueueModel = QueueModel.MMS,
  K: number = Infinity,
  arrivalType: DistributionType = DistributionType.POISSON,
  erlangK: number = 2,
  serviceType: DistributionType = DistributionType.POISSON,
  erlangServiceK: number = 2,
  avgEfficiency: number = 1.0,
  breakdownMode: boolean = false,
  mtbf: number = 60,
  mttr: number = 5
): TheoreticalMetrics => {
  
  if (arrivalType === DistributionType.TRACE || serviceType === DistributionType.TRACE) {
    // Cannot compute steady state metrics for arbitrary trace data generally without analysis
    return {
      rho: 0, p0: 0, lq: 0, l: 0, wq: 0, w: 0, isStable: true,
      isApproximate: true,
      approxNote: "Trace Data - Analytical models disable. Using empirical data.",
    };
  }

  // Adjust Mu by efficiency
  // e.g., if mu=4 (15 mins), and efficiency=1.5 (Fast), effective Mu=6 (10 mins)
  let effectiveMu = mu * avgEfficiency;

  // Adjust Mu by Availability Factor if Breakdowns enabled
  // A = MTBF / (MTBF + MTTR)
  if (breakdownMode && mtbf > 0) {
      const availability = mtbf / (mtbf + mttr);
      effectiveMu = effectiveMu * availability;
  }

  // r = Offered Load (Erlangs)
  const r = lambda / effectiveMu;
  
  // Effective Server Count (Handle special case for M/M/1 or M/M/inf)
  const actualS = model === QueueModel.MM1 ? 1 : (model === QueueModel.MMINF ? 100 : s);
  
  // Traffic Intensity (Utilization per server)
  const rho = r / actualS;

  // --- Coefficient of Variation (CV) Calculation ---
  // Used for Approximations and Exact M/G/1 formulas.
  
  // Arrival CV squared
  let ca2 = 1;
  if (arrivalType === DistributionType.DETERMINISTIC) ca2 = 0;
  if (arrivalType === DistributionType.UNIFORM) ca2 = 1/3;
  if (arrivalType === DistributionType.ERLANG) ca2 = 1 / erlangK;

  // Service CV squared
  let cs2 = 1;
  if (serviceType === DistributionType.DETERMINISTIC) cs2 = 0;
  if (serviceType === DistributionType.UNIFORM) cs2 = 1/3;
  if (serviceType === DistributionType.ERLANG) cs2 = 1 / erlangServiceK;
  
  const isPoissonArrival = arrivalType === DistributionType.POISSON;
  const isPoissonService = serviceType === DistributionType.POISSON;
  const isGGS = !isPoissonArrival || !isPoissonService;

  // --- Case 1: Infinite Server (M/M/inf, M/G/inf) ---
  if (model === QueueModel.MMINF) {
    const l = lambda / effectiveMu; // Little's Law L = λ * (1/μ) holds for G/G/∞
    
    // For M/G/∞, the number in system is Poisson distributed with mean L (Palm's Theorem).
    // So P0 = exp(-L) is exact for M/G/∞.
    const isExactMGInf = isPoissonArrival;

    return {
      rho: 0, 
      p0: Math.exp(-l),
      lq: 0, 
      l,
      wq: 0, 
      w: 1 / effectiveMu, 
      isStable: true,
      isApproximate: !isExactMGInf, // Approximate only if Arrivals are not Poisson
      approxNote: !isExactMGInf ? "G/G/∞ approximation (L=λ/μ remains exact)" : "Exact result (Palm's Theorem)"
    };
  }

  // --- Case 2: Finite Capacity (M/M/s/K) ---
  if (model === QueueModel.MMSK) {
    // Exact for M/M/s/K. For G/G/s/K we use heuristic scaling of Lq.
    let p0_inv = 0;
    for (let n = 0; n <= s; n++) {
      p0_inv += Math.pow(r, n) / factorial(n);
    }
    if (K > s) {
      for (let n = s + 1; n <= K; n++) {
        p0_inv += (Math.pow(r, s) / factorial(s)) * Math.pow(rho, n - s);
      }
    }
    
    const p0 = 1 / p0_inv;
    
    // Calculate Pk (Blocking Probability)
    let pk = K < s ? (Math.pow(r, K) / factorial(K)) * p0 : (Math.pow(r, s) / factorial(s)) * Math.pow(rho, K - s) * p0;
    
    // Effective Arrival Rate
    const lambdaEff = lambda * (1 - pk);
    
    // Calculate Expected Queue Length (Lq)
    let lq = 0;
    if (rho !== 1) {
      lq = (p0 * Math.pow(r, s) * rho) / (factorial(s) * Math.pow(1 - rho, 2)) * 
           (1 - Math.pow(rho, K - s + 1) - (K - s + 1) * Math.pow(rho, K - s) * (1 - rho));
    } else {
      lq = (p0 * Math.pow(r, s)) / (2 * factorial(s)) * (K - s) * (K - s + 1);
    }

    // Heuristic for G/G/s/K
    if (isGGS) {
      const approxFactor = (ca2 + cs2) / 2;
      lq *= approxFactor;
    }
    
    const wq = lq / lambdaEff;
    const w = wq + (1 / effectiveMu);
    const l = lambdaEff * w;

    return { 
      rho, p0, lq, l, wq, w, isStable: true, lambdaEff,
      isApproximate: isGGS,
      approxNote: isGGS ? "G/G/s/K Heuristic Approximation" : undefined
    };
  }

  // --- Case 3: Standard Infinite Capacity (M/M/s, M/G/1, G/G/s) ---
  
  const isStable = rho < 1;
  if (!isStable) {
    return { rho, p0: 0, lq: Infinity, l: Infinity, wq: Infinity, w: Infinity, isStable: false };
  }

  // Erlang-C Probability (Prob of waiting)
  let sigma = 0;
  for (let n = 0; n < actualS; n++) {
    sigma += Math.pow(r, n) / factorial(n);
  }

  const p0 = 1 / (sigma + Math.pow(r, actualS) / (factorial(actualS) * (1 - rho)));
  
  // Standard Lq for M/M/s
  let lq = (p0 * Math.pow(r, actualS) * rho) / (factorial(actualS) * Math.pow(1 - rho, 2));

  // Apply Allen-Cunneen Approximation for G/G/s
  // Formula: Lq(G/G/s) ≈ Lq(M/M/s) * (Ca^2 + Cs^2)/2
  if (isGGS) {
    const approxFactor = (ca2 + cs2) / 2;
    lq *= approxFactor;
  }

  // Apply Breakdown Approximation
  // Very rough approximation: Lq increases as rho increases due to breakdowns
  // Exact formulas for M/M/s with breakdowns are very complex.
  // We effectively modeled it by reducing mu, which increases rho, which increases Lq via Erlang-C.
  // This is a "Derated Capacity" approximation.

  const wq = lq / lambda;
  const w = wq + (1 / effectiveMu);
  const l = lq + r;

  // Identify Exact M/G/1 Case
  // For M/G/1, Allen-Cunneen yields: Lq = [rho^2 / (1-rho)] * [(1 + Cs^2)/2]
  // This is exactly the Pollaczek-Khinchine formula.
  const isMG1 = (actualS === 1) && isPoissonArrival && !isPoissonService;

  // If M/G/1, it is EXACT, not approximate.
  const isReallyApprox = isGGS && !isMG1;

  let approxNote: string | undefined = undefined;
  if (isMG1) approxNote = "Exact (Pollaczek-Khinchine Formula)";
  else if (isReallyApprox) approxNote = "G/G/s Allen-Cunneen Approximation";
  else if (breakdownMode) approxNote = "Adjusted for Availability (Effective Service Rate)";

  // --- HEAVY TRAFFIC APPROXIMATION (Kingman / Sakasegawa) ---
  let heavyTrafficLq = 0;
  let heavyTrafficWq = 0;

  if (rho < 1) {
    const numerator = Math.pow(rho, Math.sqrt(2 * (actualS + 1)));
    const denominator = 1 - rho;
    const variabilityTerm = (ca2 + cs2) / 2;
    
    heavyTrafficLq = (numerator / denominator) * variabilityTerm;
    heavyTrafficWq = heavyTrafficLq / lambda;
  }

  return { 
    rho, p0, lq, l, wq, w, isStable,
    isApproximate: isReallyApprox || breakdownMode,
    approxNote,
    heavyTrafficLq,
    heavyTrafficWq
  };
};

/**
 * Solves the Jackson Network Traffic Equations.
 * Lambda_i = Gamma_i + Sum(Lambda_j * P_ji)
 * 
 * Uses simple iterative solver (Fixed-point iteration) which converges if system is stable.
 */
export const solveJacksonNetwork = (nodes: NetworkNode[], links: NetworkLink[]): Map<string, number> => {
  const lambdas = new Map<string, number>();
  
  // Initialize with external arrival rates (gamma)
  nodes.forEach(n => lambdas.set(n.id, n.isSource ? n.externalLambda : 0));

  // Iterate to converge
  // Equation: L[i] = Gamma[i] + Sum(L[j] * P[j->i])
  for (let iter = 0; iter < 50; iter++) {
    let maxDiff = 0;
    const nextLambdas = new Map<string, number>();

    nodes.forEach(targetNode => {
      let incoming = targetNode.isSource ? targetNode.externalLambda : 0;
      
      // Add flow from other nodes
      links.forEach(link => {
        if (link.targetId === targetNode.id) {
          const sourceLambda = lambdas.get(link.sourceId) || 0;
          incoming += sourceLambda * link.probability;
        }
      });
      
      const diff = Math.abs(incoming - (lambdas.get(targetNode.id) || 0));
      if (diff > maxDiff) maxDiff = diff;
      nextLambdas.set(targetNode.id, incoming);
    });

    nodes.forEach(n => lambdas.set(n.id, nextLambdas.get(n.id) || 0));
    if (maxDiff < 0.0001) break;
  }
  
  return lambdas;
};

/**
 * Generates cost data across a range of server counts.
 * Calculates Total Cost = (Server Cost * s) + (Waiting Cost * Lq)
 */
export const generateCostOptimizationData = (
  lambda: number,
  mu: number,
  costPerServer: number,
  costPerWait: number,
  model: QueueModel,
  K: number,
  arrivalType: DistributionType,
  erlangK: number,
  serviceType: DistributionType,
  erlangServiceK: number
): CostOptimizationData[] => {
  const results: CostOptimizationData[] = [];
  const scanLimit = 20;

  for (let s = 1; s <= scanLimit; s++) {
    if (model === QueueModel.MM1 && s > 1) break;
    if (model === QueueModel.MMINF) break;

    const metrics = calculateTheoreticalMetrics(
      lambda, mu, s, model, K, 
      arrivalType, erlangK, serviceType, erlangServiceK
    );

    if (metrics.isStable) {
      const costServers = s * costPerServer;
      const costWaiting = metrics.lq * costPerWait; 
      
      results.push({
        servers: s,
        costServers,
        costWaiting,
        totalCost: costServers + costWaiting,
        isStable: true
      });
    } else {
      results.push({
        servers: s,
        costServers: s * costPerServer,
        costWaiting: 0,
        totalCost: 0,
        isStable: false
      });
    }
  }

  return results;
}

export interface SensitivityResult {
  xValue: number;
  wq: number;
  lq: number;
  rho: number;
  totalCost: number;
  isStable: boolean;
}

/**
 * Sensitivity Analysis: Generates theoretical metrics by varying a specific parameter.
 */
export const calculateSensitivity = (
  baseConfig: SimulationConfig,
  paramName: 'serverCount' | 'lambda' | 'avgServiceTime',
  range: [number, number],
  step: number,
  costPerServer: number,
  costPerWait: number
): SensitivityResult[] => {
  const results: SensitivityResult[] = [];
  const [min, max] = range;

  // Calculate efficiency
  const avgEff = baseConfig.efficiencyMode === 'MIXED' ? (baseConfig.seniorityRatio * 1.5) + ((1 - baseConfig.seniorityRatio) * 0.7) : 1.0;

  for (let val = min; val <= max; val += step) {
    // Round val to avoid floating point anomalies
    const currentVal = Math.round(val * 100) / 100;
    
    // Override base params
    let s = baseConfig.serverCount;
    let lambda = baseConfig.lambda;
    let mu = 60 / baseConfig.avgServiceTime;

    if (paramName === 'serverCount') s = currentVal;
    if (paramName === 'lambda') lambda = currentVal;
    if (paramName === 'avgServiceTime') mu = 60 / currentVal;

    const metrics = calculateTheoreticalMetrics(
      lambda, mu, s, 
      baseConfig.model, baseConfig.capacity, 
      baseConfig.arrivalType, baseConfig.arrivalK, 
      baseConfig.serviceType, baseConfig.serviceK, 
      avgEff, baseConfig.breakdownMode, baseConfig.mtbf, baseConfig.mttr
    );

    const costServers = s * costPerServer;
    // For cost calculation, if unstable, we assume max cost or infinity
    const costWaiting = metrics.isStable ? metrics.lq * costPerWait : (costPerWait * 100); 

    results.push({
      xValue: currentVal,
      wq: metrics.isStable ? metrics.wq * 60 : 0, // min
      lq: metrics.isStable ? metrics.lq : 0,
      rho: metrics.rho,
      totalCost: metrics.isStable ? costServers + costWaiting : 0,
      isStable: metrics.isStable
    });
  }

  return results;
}

/**
 * Generates a random variable from an Exponential distribution.
 * Uses Inverse Transform Sampling.
 * @param rate The rate parameter (λ). Mean = 1/rate.
 */
export const nextExponential = (rate: number): number => {
  return -Math.log(Math.random()) / rate;
};

/**
 * Generates a random duration based on the selected distribution type.
 * @param type Distribution enum
 * @param mean Desired mean value
 * @param kParam Shape parameter (only for Erlang)
 */
export const nextDistribution = (type: DistributionType, mean: number, kParam: number = 2): number => {
  switch (type) {
    case DistributionType.DETERMINISTIC:
      return mean;
    case DistributionType.UNIFORM:
      // Uniform [0, 2*mean] provides a mean of 'mean'
      return Math.random() * 2 * mean;
    case DistributionType.ERLANG:
      // Erlang-k is the sum of k independent exponential variables.
      // Each stage has a mean of (mean / k), so rate = k / mean.
      let sum = 0;
      const rate = kParam / mean;
      for (let i = 0; i < kParam; i++) {
        sum += nextExponential(rate);
      }
      return sum;
    case DistributionType.TRACE:
      return mean; // Fallback if trace called via nextDistribution (should typically be handled by Engine index)
    case DistributionType.POISSON:
    default:
      // Standard exponential inter-arrival/service time
      return nextExponential(1 / mean);
  }
};

/**
 * STATISTICAL ANALYSIS HELPERS
 */

export interface DataStats {
  mean: number;
  variance: number;
  stdDev: number;
  cv: number; // Coefficient of Variation
  min: number;
  max: number;
  count: number;
}

export const calculateStats = (data: number[]): DataStats => {
  if (data.length === 0) return { mean: 0, variance: 0, stdDev: 0, cv: 0, min: 0, max: 0, count: 0 };
  
  const sum = data.reduce((a, b) => a + b, 0);
  const mean = sum / data.length;
  
  const sqDiffSum = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
  const variance = sqDiffSum / data.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    mean,
    variance,
    stdDev,
    cv: mean > 0 ? stdDev / mean : 0,
    min: Math.min(...data),
    max: Math.max(...data),
    count: data.length
  };
};

export const generateHistogram = (data: number[], buckets: number = 20) => {
  if (data.length === 0) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const bucketSize = range / buckets;
  
  const histogram = Array.from({ length: buckets }, (_, i) => ({
    rangeStart: min + i * bucketSize,
    rangeEnd: min + (i + 1) * bucketSize,
    label: `${(min + i * bucketSize).toFixed(1)}-${(min + (i + 1) * bucketSize).toFixed(1)}`,
    count: 0
  }));

  data.forEach(val => {
    let bucketIndex = Math.floor((val - min) / bucketSize);
    if (bucketIndex >= buckets) bucketIndex = buckets - 1;
    histogram[bucketIndex].count++;
  });

  return histogram;
};

export const recommendDistribution = (stats: DataStats): { type: string, confidence: string } => {
  const cv = stats.cv;
  // Heuristics for distribution fitting based on Coeff of Variation
  if (cv < 0.1) return { type: 'Deterministic', confidence: 'High' };
  if (cv >= 0.9 && cv <= 1.1) return { type: 'Poisson (Exponential)', confidence: 'High' };
  if (cv < 0.9) return { type: `Erlang (k ≈ ${(1/(cv*cv)).toFixed(1)})`, confidence: 'Medium' };
  return { type: 'General / Hyperexponential', confidence: 'Low' };
};

// --- EXPORT UTILITIES ---

export const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export const generateCSV = (data: any[], headers: string[]): string => {
  if (data.length === 0) return '';
  const headerRow = headers.join(',') + '\n';
  const rows = data.map(obj => {
      return headers.map(header => {
          const val = obj[header];
          return typeof val === 'number' ? val.toFixed(4) : `"${val}"`;
      }).join(',');
  }).join('\n');
  return headerRow + rows;
};
