
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { calculateStats, generateHistogram, recommendDistribution } from '../mathUtils';
import { TraceEntry, DistributionType } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DataLabProps {
  onDataLoaded: (data: TraceEntry[]) => void;
}

const DataLab: React.FC<DataLabProps> = ({ onDataLoaded }) => {
  const [rawData, setRawData] = useState<TraceEntry[]>([]);
  const [interArrivalStats, setInterArrivalStats] = useState<any>(null);
  const [serviceStats, setServiceStats] = useState<any>(null);
  const [arrivalHist, setArrivalHist] = useState<any[]>([]);
  const [serviceHist, setServiceHist] = useState<any[]>([]);

  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const parsed: TraceEntry[] = [];
      let lastTime = 0;

      // Skip header if present (check if first char is number)
      const startIdx = isNaN(parseFloat(lines[0].split(',')[0])) ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].trim().split(',');
        if (parts.length >= 2) {
          const t = parseFloat(parts[0]);
          const d = parseFloat(parts[1]);
          if (!isNaN(t) && !isNaN(d)) {
             parsed.push({ arrivalTime: t, serviceTime: d });
          }
        }
      }

      parsed.sort((a, b) => a.arrivalTime - b.arrivalTime);
      
      // Calculate Inter-arrivals for analysis
      const interArrivals: number[] = [];
      for(let i=1; i<parsed.length; i++) {
          interArrivals.push(parsed[i].arrivalTime - parsed[i-1].arrivalTime);
      }
      
      const serviceTimes = parsed.map(p => p.serviceTime);

      setRawData(parsed);
      setInterArrivalStats(calculateStats(interArrivals));
      setServiceStats(calculateStats(serviceTimes));
      setArrivalHist(generateHistogram(interArrivals));
      setServiceHist(generateHistogram(serviceTimes));
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      processFile(acceptedFiles[0]);
    }
  }, [processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
      onDrop,
      accept: {'text/csv': ['.csv'], 'text/plain': ['.txt', '.log']},
      multiple: false
  });

  const handleApply = () => {
      onDataLoaded(rawData);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 min-h-[600px]">
      <div className="flex items-center gap-2 mb-6 border-b pb-4">
        <i className="fa-solid fa-flask text-purple-600 text-2xl"></i>
        <div>
            <h2 className="text-xl font-bold text-slate-800">Data Lab & Distribution Fitter</h2>
            <p className="text-xs text-slate-500">Upload historical logs (CSV: "Arrival Time, Duration") to analyze variance and run Trace-Driven simulations.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Col: Upload & Raw Info */}
        <div className="space-y-6">
            <div 
                {...getRootProps()} 
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${isDragActive ? 'border-purple-500 bg-purple-50' : 'border-slate-300 hover:border-purple-400 hover:bg-slate-50'}`}
            >
                <input {...getInputProps()} />
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
                    <i className="fa-solid fa-cloud-arrow-up text-2xl"></i>
                </div>
                <p className="text-sm font-bold text-slate-600 text-center">
                    {isDragActive ? "Drop file here..." : "Drag & Drop or Click to Upload"}
                </p>
                <p className="text-xs text-slate-400 mt-2">Format: CSV (Time, Duration)</p>
            </div>

            {rawData.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold uppercase text-slate-500">File Summary</span>
                        <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-1 rounded-full">{rawData.length} Entries</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Time Span</span>
                            <span className="font-mono text-sm text-slate-700">
                                {rawData[0].arrivalTime.toFixed(1)} - {rawData[rawData.length-1].arrivalTime.toFixed(1)} m
                            </span>
                         </div>
                         <div>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Avg Lambda</span>
                            <span className="font-mono text-sm text-slate-700">
                                {interArrivalStats ? (60 / interArrivalStats.mean).toFixed(1) : '-'} /hr
                            </span>
                         </div>
                    </div>
                    
                    <button 
                        onClick={handleApply}
                        className="w-full mt-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
                    >
                        <i className="fa-solid fa-play"></i> Run Trace Simulation
                    </button>
                </div>
            )}
        </div>

        {/* Right Col: Analysis */}
        <div className="space-y-6">
             <h3 className="text-sm font-black uppercase text-slate-700 border-b pb-2">Statistical Fit Analysis</h3>
             
             {interArrivalStats && (
                 <div className="space-y-6 animate-fade-in">
                     {/* Arrival Analysis */}
                     <div>
                        <div className="flex justify-between items-end mb-2">
                             <h4 className="text-xs font-bold text-blue-600 uppercase">Inter-Arrival Times</h4>
                             <span className="text-[10px] font-mono bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                                 CV: {interArrivalStats.cv.toFixed(2)}
                             </span>
                        </div>
                        <div className="h-32 w-full bg-white border border-slate-100 rounded-lg p-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={arrivalHist}>
                                    <XAxis dataKey="label" hide />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-slate-400">Recommendation:</span>
                            <span className="font-bold text-slate-700">{recommendDistribution(interArrivalStats).type}</span>
                        </div>
                     </div>

                     {/* Service Analysis */}
                     <div>
                        <div className="flex justify-between items-end mb-2">
                             <h4 className="text-xs font-bold text-emerald-600 uppercase">Service Durations</h4>
                             <span className="text-[10px] font-mono bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded">
                                 CV: {serviceStats.cv.toFixed(2)}
                             </span>
                        </div>
                        <div className="h-32 w-full bg-white border border-slate-100 rounded-lg p-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={serviceHist}>
                                    <XAxis dataKey="label" hide />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#10b981" radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-slate-400">Recommendation:</span>
                            <span className="font-bold text-slate-700">{recommendDistribution(serviceStats).type}</span>
                        </div>
                     </div>
                 </div>
             )}

             {!interArrivalStats && (
                 <div className="h-64 flex flex-col items-center justify-center text-slate-300">
                     <i className="fa-solid fa-chart-simple text-4xl mb-4"></i>
                     <span className="text-sm">No data analyzed yet.</span>
                 </div>
             )}
        </div>
      </div>
    </div>
  );
};

export default DataLab;
