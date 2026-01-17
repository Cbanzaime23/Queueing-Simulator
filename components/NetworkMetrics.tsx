
import React, { useMemo, useRef } from 'react';
import MetricsCard from './MetricsCard';
import { NetworkNode, ServerState } from '../types';

interface NetworkMetricsProps {
    simState: any;
}

const NetworkMetrics: React.FC<NetworkMetricsProps> = ({ simState }) => {
    const peakWipRef = useRef(0);
    const lastTimeRef = useRef(0);

    const metrics = useMemo(() => {
        if (!simState || !simState.nodes) return { wip: 0, blocked: 0, served: 0, valueAddedTime: 0, maxUtil: 0, bottleneckName: 'None' };
        
        let wip = 0;
        let blocked = 0;
        let served = 0;
        let valueAddedTime = 0;
        let maxUtil = 0;
        let bottleneckName = 'None';

        simState.nodes.forEach((node: NetworkNode) => {
            // WIP Calculation
            wip += node.queue.length;
            
            // Count In-Service (including batches)
            node.servers.forEach(s => {
                if (s.state === ServerState.BUSY) {
                    wip += s._activeBatch && s._activeBatch.length > 0 ? s._activeBatch.length : 1;
                }
            });

            // Stats Aggregation
            blocked += node.stats.blockedCount || 0;
            served += node.stats.servedCount || 0;
            
            // Value Added Time (Approx: Served Count * Avg Service Time)
            valueAddedTime += (node.stats.servedCount || 0) * node.avgServiceTime;

            // Bottleneck Detection
            const util = node.stats.utilization || 0;
            if (util > maxUtil) {
                maxUtil = util;
                bottleneckName = node.name;
            }
        });

        return { wip, blocked, served, valueAddedTime, maxUtil, bottleneckName };
    }, [simState]);

    const { wip, blocked, served, valueAddedTime, maxUtil, bottleneckName } = metrics;

    // Handle Reset Logic: If simulation time rewinds, reset peak
    if (simState && simState.currentTime < lastTimeRef.current) {
        peakWipRef.current = 0;
    }

    if (simState) {
        lastTimeRef.current = simState.currentTime;
        if (wip > peakWipRef.current) {
            peakWipRef.current = wip;
        }
    }

    // Blocking Probability Calculation
    const totalAttempts = blocked + served;
    const blockingProb = totalAttempts > 0 ? blocked / totalAttempts : 0;
    const blockingPct = (blockingProb * 100).toFixed(1);
    const blockingColor = blockingProb > 0.05 ? 'text-red-600' : 'text-orange-500';

    // Flow Efficiency Calculation
    const totalGlobalSystemTime = simState ? simState.totalGlobalSystemTime : 0;
    const flowEfficiency = totalGlobalSystemTime > 0 
        ? (valueAddedTime / totalGlobalSystemTime) * 100 
        : 0;
    
    let flowColor = 'text-amber-600';
    if (flowEfficiency > 50) flowColor = 'text-emerald-600';
    else if (flowEfficiency < 20) flowColor = 'text-red-600';

    // Bottleneck Color
    let bottleneckColor = 'text-slate-600';
    if (maxUtil > 0.9) bottleneckColor = 'text-red-600';
    else if (maxUtil > 0.7) bottleneckColor = 'text-amber-600';
    else bottleneckColor = 'text-emerald-600';

    // Throughput Calculation
    const totalExits = simState ? simState.totalExits : 0;
    const currentTime = simState ? simState.currentTime : 0;
    const throughputRate = currentTime > 1 ? (totalExits / currentTime) * 60 : 0;

    if (!simState) return null;

    return (
        <div className="grid grid-cols-2 gap-2 mb-4">
            <MetricsCard
                label="Network WIP"
                value={wip}
                unit="ppl"
                icon="fa-solid fa-people-arrows"
                colorClass="text-purple-600"
                subtext={`Peak: ${peakWipRef.current}`}
            />
            <MetricsCard
                label="Global Blocking"
                value={`${blockingPct}%`}
                unit=""
                icon="fa-solid fa-ban"
                colorClass={blockingColor}
                subtext={`Lost: ${blocked}`}
            />
            <MetricsCard
                label="Flow Efficiency"
                value={`${flowEfficiency.toFixed(1)}%`}
                unit=""
                icon="fa-solid fa-stopwatch-20"
                colorClass={flowColor}
                subtext="Value / Cycle Time"
            />
            <MetricsCard
                label="Bottleneck Util"
                value={`${(maxUtil * 100).toFixed(0)}%`}
                unit=""
                icon="fa-solid fa-fire"
                colorClass={bottleneckColor}
                subtext={`Constraint: ${bottleneckName}`}
            />
            <div className="col-span-2">
                <MetricsCard
                    label="Network Throughput"
                    value={throughputRate.toFixed(1)}
                    unit="cust/hr"
                    icon="fa-solid fa-person-walking-arrow-right"
                    colorClass="text-indigo-600"
                    subtext={`Total Exits: ${totalExits}`}
                />
            </div>
        </div>
    );
};

export default NetworkMetrics;
