
import { NetworkNode, NetworkLink, Customer, Server, ServerState, DistributionType, SkillType, RoutingStrategy, ResourcePool } from './types';
import { nextDistribution } from './mathUtils';

const CLASS_A_COLOR = 'bg-amber-400 border-2 border-amber-600'; // Gold/VIP
const CLASS_B_COLOR = 'bg-slate-400 border-2 border-slate-600'; // Silver/Standard

export class NetworkEngine {
    private nodes: NetworkNode[];
    private links: NetworkLink[];
    private resourcePools: ResourcePool[];
    private currentTime: number;
    private nextArrivalTimes: Map<string, number>; // nodeID -> next arrival time
    private totalExits: number;
    private recentBlockedLinks: string[];

    constructor(nodes: NetworkNode[], links: NetworkLink[], resourcePools: ResourcePool[] = []) {
        this.nodes = JSON.parse(JSON.stringify(nodes)); // Deep copy to start fresh
        this.links = links;
        this.resourcePools = JSON.parse(JSON.stringify(resourcePools)); // Deep copy pools
        this.currentTime = 0;
        this.nextArrivalTimes = new Map();
        this.totalExits = 0;
        this.recentBlockedLinks = [];
        
        // Initialize servers for each node and schedule first arrivals for sources
        this.nodes.forEach(node => {
            // Ensure capacity exists if missing from old config
            if (node.capacity === undefined) node.capacity = 9999;
            // Ensure classARatio exists
            if (node.classARatio === undefined) node.classARatio = 0.5;
            // Ensure routingStrategy exists
            if (node.routingStrategy === undefined) node.routingStrategy = RoutingStrategy.PROBABILISTIC;
            // Ensure batch sizes exist
            if (node.arrivalBatchSize === undefined) node.arrivalBatchSize = 1;
            if (node.serviceBatchSize === undefined) node.serviceBatchSize = 1;

            node.servers = Array.from({ length: node.serverCount }, (_, i) => ({
                id: i,
                state: ServerState.IDLE,
                efficiency: 1.0,
                typeLabel: 'Normal',
                queue: [],
                utilizationHistory: [],
                totalBusyTime: 0,
                startTime: 0,
                skills: [SkillType.GENERAL],
                _activeBatch: [], // Initialize batch array
                timeline: [{
                    state: ServerState.IDLE,
                    start: 0,
                    end: null
                }]
            }));
            
            node.queue = [];
            node.stats = { totalWait: 0, servedCount: 0, currentWq: 0, utilization: 0, blockedCount: 0 };

            if (node.isSource) {
                this.scheduleNextArrival(node);
            }
        });

        // Normalize Link Probabilities if missing
        this.links.forEach(link => {
            if (link.probA === undefined) link.probA = link.probability;
            if (link.probB === undefined) link.probB = link.probability;
        });
    }

    private scheduleNextArrival(node: NetworkNode) {
        if (node.externalLambda <= 0) return;
        const meanInterArrival = 60 / node.externalLambda;
        const delay = nextDistribution(DistributionType.POISSON, meanInterArrival);
        this.nextArrivalTimes.set(node.id, this.currentTime + delay);
    }

    public tick(dt: number) {
        const newTime = this.currentTime + dt;
        this.recentBlockedLinks = []; // Reset for this tick
        
        // 1. Handle External Arrivals (With Batch Support)
        this.nodes.forEach(node => {
            if (node.isSource) {
                while (this.nextArrivalTimes.get(node.id)! <= newTime) {
                    // Loop for Arrival Batch Size
                    const batchSize = node.arrivalBatchSize || 1;
                    
                    for (let i = 0; i < batchSize; i++) {
                        // Check Capacity for EACH customer in the batch
                        const busyCount = node.servers.reduce((acc, s) => acc + (s.state === ServerState.BUSY ? (s._activeBatch?.length || 1) : 0), 0);
                        const currentInSystem = node.queue.length + busyCount;
                        
                        if (currentInSystem < node.capacity) {
                            this.handleArrival(node, this.nextArrivalTimes.get(node.id)!);
                        } else {
                            node.stats.blockedCount++;
                        }
                    }
                    
                    // Schedule next batch arrival
                    const meanInterArrival = 60 / node.externalLambda;
                    const delay = nextDistribution(DistributionType.POISSON, meanInterArrival);
                    this.nextArrivalTimes.set(node.id, this.nextArrivalTimes.get(node.id)! + delay);
                }
            }
        });

        // 2. Process Service Logic for Each Node (With Service Batch Support)
        this.nodes.forEach(node => {
            // Assign IDLE servers
            const idleServers = node.servers.filter(s => s.state === ServerState.IDLE);
            
            while (idleServers.length > 0 && node.queue.length > 0) {
                // -- RESOURCE POOL CHECK --
                // Before starting service, check if node requires a resource
                if (node.resourcePoolId) {
                    const pool = this.resourcePools.find(p => p.id === node.resourcePoolId);
                    if (!pool || pool.availableCount <= 0) {
                        // Resource unavailable. Cannot start service.
                        // Break the loop for this node, assuming FIFO and all servers need resource.
                        break; 
                    }
                }

                const server = idleServers.pop()!;
                
                // Determine Batch Size
                const batchLimit = node.serviceBatchSize || 1;
                // Pull up to batchLimit customers
                const batch = node.queue.splice(0, batchLimit);
                
                if (batch.length > 0) {
                    // -- CONSUME RESOURCE --
                    if (node.resourcePoolId) {
                         const pool = this.resourcePools.find(p => p.id === node.resourcePoolId);
                         if (pool) pool.availableCount--;
                    }

                    const startTime = Math.max(this.currentTime, batch[0].arrivalTime); 
                    
                    // Determine Service Duration (Applied to WHOLE batch)
                    const duration = nextDistribution(DistributionType.POISSON, node.avgServiceTime);
                    const finishTime = this.currentTime + duration; // Use 'this.currentTime' as start of service

                    // Update all customers in batch
                    batch.forEach(customer => {
                        customer.startTime = this.currentTime;
                        customer.finishTime = finishTime;
                        // Record wait stats
                        node.stats.totalWait += (this.currentTime - customer.arrivalTime);
                    });

                    server.state = ServerState.BUSY;
                    server._activeBatch = batch;
                    server._activeCustomer = batch[0]; // Legacy/Visual fallback
                    
                    // UPDATE TIMELINE
                    if (server.timeline.length > 0) {
                        const lastSeg = server.timeline[server.timeline.length - 1];
                        if (lastSeg.end === null) lastSeg.end = this.currentTime;
                    }
                    server.timeline.push({
                        state: ServerState.BUSY,
                        start: this.currentTime,
                        end: null
                    });
                }
            }

            // Handle Departures (Batched)
            node.servers.forEach(server => {
                if (server.state === ServerState.BUSY && server._activeBatch && server._activeBatch.length > 0) {
                    // Check finish time of the batch (all share the same finishTime)
                    if (server._activeBatch[0].finishTime! <= newTime) {
                        const finishedBatch = server._activeBatch;
                        
                        // -- RELEASE RESOURCE --
                        if (node.resourcePoolId) {
                             const pool = this.resourcePools.find(p => p.id === node.resourcePoolId);
                             if (pool) pool.availableCount++;
                        }

                        // Route ALL customers in batch
                        finishedBatch.forEach(customer => {
                             this.routeCustomer(customer, node);
                             node.stats.servedCount++;
                        });
                        
                        server.state = ServerState.IDLE;
                        server._activeBatch = [];
                        server._activeCustomer = undefined;

                        // UPDATE TIMELINE
                        if (server.timeline.length > 0) {
                            const lastSeg = server.timeline[server.timeline.length - 1];
                            if (lastSeg.end === null) lastSeg.end = newTime;
                        }
                        server.timeline.push({
                            state: ServerState.IDLE,
                            start: newTime,
                            end: null
                        });
                    }
                }
                // Fallback for single mode if _activeBatch wasn't used (legacy safety)
                else if (server.state === ServerState.BUSY && server._activeCustomer) {
                     if (server._activeCustomer.finishTime! <= newTime) {
                         // -- RELEASE RESOURCE --
                        if (node.resourcePoolId) {
                             const pool = this.resourcePools.find(p => p.id === node.resourcePoolId);
                             if (pool) pool.availableCount++;
                        }

                        this.routeCustomer(server._activeCustomer, node);
                        node.stats.servedCount++;
                        server.state = ServerState.IDLE;
                        server._activeCustomer = undefined;
                        server._activeBatch = [];

                        // UPDATE TIMELINE
                        if (server.timeline.length > 0) {
                            const lastSeg = server.timeline[server.timeline.length - 1];
                            if (lastSeg.end === null) lastSeg.end = newTime;
                        }
                        server.timeline.push({
                            state: ServerState.IDLE,
                            start: newTime,
                            end: null
                        });
                     }
                }
            });
            
            // Calc stats
            node.stats.currentWq = node.stats.servedCount > 0 ? node.stats.totalWait / node.stats.servedCount : 0;
            const busyCount = node.servers.reduce((acc, s) => acc + (s.state === ServerState.BUSY ? 1 : 0), 0);
            node.stats.utilization = busyCount / node.serverCount;
        });

        this.currentTime = newTime;
    }

    private handleArrival(node: NetworkNode, arrivalTime: number, existingCustomer?: Customer) {
        let customer: Customer;

        if (existingCustomer) {
            customer = existingCustomer;
        } else {
            // Generate New Customer
            const isClassA = Math.random() < (node.classARatio ?? 0.5);
            customer = {
                id: Math.random().toString(36).substr(2, 9),
                arrivalTime,
                serviceTime: 0, // Assigned at service start in this engine
                priority: isClassA ? 1 : 0,
                color: isClassA ? CLASS_A_COLOR : CLASS_B_COLOR,
                requiredSkill: SkillType.GENERAL,
                classType: isClassA ? 'A' : 'B'
            };
        }
        
        // Reset timing for this specific node leg
        customer.arrivalTime = arrivalTime; 
        customer.startTime = undefined;
        customer.finishTime = undefined;

        node.queue.push(customer);
    }

    private routeCustomer(customer: Customer, currentNode: NetworkNode) {
        // Find links originating from this node
        const links = this.links.filter(l => l.sourceId === currentNode.id);
        
        if (links.length === 0) {
            this.totalExits++;
            return; // Exit system
        }

        // --- STATE DEPENDENT ROUTING (JSQ) ---
        if (currentNode.routingStrategy === RoutingStrategy.SHORTEST_QUEUE) {
            let candidateLinks: { link: NetworkLink, node: NetworkNode, load: number }[] = [];
            
            // Identify connected nodes
            for (const link of links) {
                const targetNode = this.nodes.find(n => n.id === link.targetId);
                if (targetNode) {
                    // Load = Queue + Active Customers (approximation)
                    const busyCount = targetNode.servers.reduce((acc, s) => acc + (s.state === ServerState.BUSY ? (s._activeBatch?.length || 1) : 0), 0);
                    const load = targetNode.queue.length + busyCount;
                    candidateLinks.push({ link, node: targetNode, load });
                }
            }

            if (candidateLinks.length > 0) {
                // Sort by load (ascending)
                candidateLinks.sort((a, b) => a.load - b.load);
                
                // Pick the best one (Shortest Queue)
                const bestCandidate = candidateLinks[0];
                
                // Check Capacity of best candidate
                // Note: Blocking checks just queue + busy servers count roughly
                const busyCount = bestCandidate.node.servers.reduce((acc, s) => acc + (s.state === ServerState.BUSY ? (s._activeBatch?.length || 1) : 0), 0);
                if (bestCandidate.node.queue.length + busyCount < bestCandidate.node.capacity) {
                    this.handleArrival(bestCandidate.node, customer.finishTime!, customer);
                } else {
                    // Even the best node is full -> Blocked
                    currentNode.stats.blockedCount++;
                    this.recentBlockedLinks.push(bestCandidate.link.id);
                }
                return;
            } else {
                this.totalExits++;
                return;
            }
        }

        // --- PROBABILISTIC ROUTING ---
        const rand = Math.random();
        let cumulative = 0;
        let routed = false;

        for (const link of links) {
            // Select probability based on Class
            const prob = customer.classType === 'A' ? (link.probA ?? link.probability) : (link.probB ?? link.probability);
            
            cumulative += prob;
            if (rand < cumulative) {
                const targetNode = this.nodes.find(n => n.id === link.targetId);
                if (targetNode) {
                    // Check Capacity (Blocking Logic)
                    const busyCount = targetNode.servers.reduce((acc, s) => acc + (s.state === ServerState.BUSY ? (s._activeBatch?.length || 1) : 0), 0);
                    const currentLoad = targetNode.queue.length + busyCount;
                    
                    if (currentLoad < targetNode.capacity) {
                        // Send to next node
                        // Arrival time at next node is finish time at current
                        this.handleArrival(targetNode, customer.finishTime!, customer);
                        routed = true;
                    } else {
                        // BLOCKED
                        // Increment blocked stat on SOURCE node
                        currentNode.stats.blockedCount++;
                        // Record link for visualization
                        this.recentBlockedLinks.push(link.id);
                        // Customer is lost
                        routed = true;
                    }
                }
                break;
            }
        }

        if (!routed) {
            this.totalExits++;
        }
    }

    public getState() {
        return {
            currentTime: this.currentTime,
            nodes: this.nodes,
            links: this.links,
            resourcePools: this.resourcePools,
            totalExits: this.totalExits,
            recentBlockedLinks: this.recentBlockedLinks
        };
    }
}
