
import React, { useMemo, useRef } from 'react';
import MetricsCard from './MetricsCard';
import { NetworkNode, ServerState } from '../types';

interface NetworkMetricsProps {
    simState: any;
}

const NetworkMetrics: React.FC<NetworkMetricsProps> = ({ simState }) => {
    const peakWipRef = useRef(0);
    const lastTimeRef = useRef(0);

    const currentWip = useMemo(() => {
        if (!simState || !simState.nodes) return 0;
        let count = 0;
        simState.nodes.forEach((node: NetworkNode) => {
            // Count Queue
            count += node.queue.length;
            
            // Count In-Service (including batches)
            node.servers.forEach(s => {
                if (s.state === ServerState.BUSY) {
                    count += s._activeBatch && s._activeBatch.length > 0 ? s._activeBatch.length : 1;
                }
            });
        });
        return count;
    }, [simState]);

    // Handle Reset Logic: If simulation time rewinds, reset peak
    if (simState && simState.currentTime < lastTimeRef.current) {
        peakWipRef.current = 0;
    }

    if (simState) {
        lastTimeRef.current = simState.currentTime;
        if (currentWip > peakWipRef.current) {
            peakWipRef.current = currentWip;
        }
    }

    if (!simState) return null;

    return (
        <div className="grid grid-cols-1 gap-2 mb-4">
            <MetricsCard
                label="Network WIP"
                value={currentWip}
                unit="ppl"
                icon="fa-solid fa-people-arrows"
                colorClass="text-purple-600"
                subtext={`Peak Recorded: ${peakWipRef.current}`}
            />
        </div>
    );
};

export default NetworkMetrics;
