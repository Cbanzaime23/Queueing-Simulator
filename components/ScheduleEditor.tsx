
import React from 'react';

interface ScheduleEditorProps {
  title: string;
  data: number[];
  onChange: (newData: number[]) => void;
  min: number;
  max: number;
  colorClass: string;
  barColorClass: string;
  unit: string;
  onAutoStaff?: () => void;
}

const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ 
    title, 
    data, 
    onChange, 
    min, 
    max,
    colorClass,
    barColorClass,
    unit,
    onAutoStaff
}) => {
  
  const handleBarClick = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
    // Calculate value based on click position within the bar container
    const rect = e.currentTarget.getBoundingClientRect();
    const height = rect.height;
    const clickY = e.clientY - rect.top;
    const percentage = 1 - (clickY / height);
    
    // Snap to integer
    let newValue = Math.round(min + (percentage * (max - min)));
    newValue = Math.max(min, Math.min(max, newValue));
    
    const newData = [...data];
    newData[index] = newValue;
    onChange(newData);
  };

  const handleDrag = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return; // Only process if primary mouse button is down
    handleBarClick(index, e);
  }

  return (
    <div className={`p-4 rounded-xl border ${colorClass} bg-white shadow-sm`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">{title}</h3>
        <div className="flex items-center gap-2">
            {onAutoStaff && (
                <button 
                    onClick={onAutoStaff}
                    className="flex items-center gap-1 bg-teal-500 hover:bg-teal-600 text-white text-[9px] font-bold px-2 py-1 rounded shadow-sm transition-colors"
                    title="Calculate optimal staffing based on arrival schedule"
                >
                    <i className="fa-solid fa-wand-magic-sparkles"></i> Auto-Staff
                </button>
            )}
            <span className="text-[10px] text-slate-400 font-medium">Click & Drag</span>
        </div>
      </div>
      
      <div className="flex items-end justify-between h-32 gap-1 select-none">
        {data.map((value, i) => {
            const heightPercent = ((value - min) / (max - min)) * 100;
            return (
                <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 whitespace-nowrap">
                         {i}:00 - {value} {unit}
                    </div>

                    <div 
                        className={`w-full rounded-t-sm cursor-pointer transition-all duration-75 relative ${barColorClass} hover:brightness-90`}
                        style={{ height: `${Math.max(5, heightPercent)}%` }}
                        onMouseDown={(e) => handleBarClick(i, e)}
                        onMouseMove={(e) => handleDrag(i, e)}
                    ></div>
                    
                    {/* Hour Label */}
                    {i % 4 === 0 && (
                        <div className="absolute -bottom-5 text-[9px] text-slate-400 font-mono">
                            {i}
                        </div>
                    )}
                </div>
            )
        })}
      </div>
      <div className="h-4"></div> 
    </div>
  );
};

export default ScheduleEditor;
