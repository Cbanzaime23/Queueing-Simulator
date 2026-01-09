
import React from 'react';
import { Server, ServerState } from '../types';
import { formatTime } from '../mathUtils';

interface ServerTimelineProps {
    servers: Server[];
    currentTime: number;
    openHour: number;
}

const ServerTimeline: React.FC<ServerTimelineProps> = ({ servers, currentTime, openHour }) => {
    // Determine the visualization window
    // For now, we show the entire history from t=0 to currentTime.
    const totalDuration = Math.max(currentTime, 1); // Avoid div/0

    const getSegmentColor = (state: ServerState) => {
        switch (state) {
            case ServerState.BUSY: return 'bg-emerald-500';
            case ServerState.IDLE: return 'bg-slate-200';
            case ServerState.OFFLINE: return 'bg-red-500 pattern-diagonal-lines'; // pattern logic would need CSS, fallback to solid
            default: return 'bg-gray-300';
        }
    };

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Server Occupancy Timeline</h3>
            
            <div className="space-y-3">
                {servers.map(server => (
                    <div key={server.id} className="flex items-center gap-4">
                        {/* Label */}
                        <div className="w-24 shrink-0 text-right">
                            <div className="text-xs font-bold text-slate-600">Server {server.id + 1}</div>
                            <div className="text-[9px] text-slate-400 uppercase">{server.typeLabel} ({server.efficiency}x)</div>
                        </div>

                        {/* Timeline Track */}
                        <div className="flex-1 h-6 bg-slate-50 rounded flex overflow-hidden relative border border-slate-100">
                            {server.timeline.map((seg, i) => {
                                const start = seg.start;
                                const end = seg.end !== null ? seg.end : currentTime;
                                const duration = Math.max(0, end - start);
                                const widthPct = (duration / totalDuration) * 100;
                                
                                // Optimization: Don't render extremely tiny segments if there are too many
                                if (widthPct < 0.1 && server.timeline.length > 200) return null;

                                return (
                                    <div 
                                        key={i}
                                        className={`h-full ${getSegmentColor(seg.state)} hover:brightness-90 transition-colors relative group`}
                                        style={{ width: `${widthPct}%` }}
                                    >
                                        {/* Tooltip */}
                                        <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 pointer-events-none transition-opacity">
                                            <div className="bg-slate-800 text-white text-[9px] rounded py-1 px-2 whitespace-nowrap shadow-lg">
                                                <div className="font-bold border-b border-slate-600 pb-0.5 mb-0.5">{seg.state}</div>
                                                <div>{formatTime(openHour + start/60)} - {formatTime(openHour + end/60)}</div>
                                                <div>Dur: {duration.toFixed(1)}m</div>
                                            </div>
                                            {/* Arrow */}
                                            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-slate-800 absolute left-1/2 -translate-x-1/2"></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Current Status Indicator */}
                        <div className={`w-2 h-2 rounded-full ${server.state === ServerState.BUSY ? 'bg-emerald-500' : server.state === ServerState.OFFLINE ? 'bg-red-500' : 'bg-slate-300'}`} title={`Current: ${server.state}`}></div>
                    </div>
                ))}
            </div>

            {/* Time Axis */}
            <div className="flex pl-28 pr-6 mt-1 justify-between text-[9px] text-slate-400 font-mono">
                <span>{formatTime(openHour)}</span>
                <span>{formatTime(openHour + currentTime/60)}</span>
            </div>
            
            {/* Legend */}
            <div className="flex justify-center gap-4 mt-3 text-[10px] text-slate-500">
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div> Busy</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-200 rounded-sm border border-slate-300"></div> Idle</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> Offline</div>
            </div>
        </div>
    );
};

export default ServerTimeline;
