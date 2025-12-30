
import React from 'react';

/**
 * Props for the MetricsCard component.
 */
interface MetricsCardProps {
  /** The title of the metric (e.g., "Wait Time") */
  label: string;
  /** The value to display. Numbers will be formatted to 3 decimal places. */
  value: string | number;
  /** Optional unit suffix (e.g., "min", "cust") */
  unit?: string;
  /** FontAwesome icon class string */
  icon?: string;
  /** Tailwind text color class for the value */
  colorClass?: string;
  /** Small explanatory text below the value */
  subtext?: string;
}

/**
 * A reusable UI component for displaying a single simulation statistic.
 */
const MetricsCard: React.FC<MetricsCardProps> = ({ label, value, unit, icon, colorClass = "text-blue-600", subtext }) => {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        {icon && <i className={`${icon} text-slate-400`}></i>}
      </div>
      <div>
        <div className="flex items-baseline space-x-1">
          <span className={`text-2xl font-bold ${colorClass}`}>{typeof value === 'number' && isFinite(value) ? value.toFixed(3) : value}</span>
          {unit && <span className="text-slate-400 text-sm font-medium">{unit}</span>}
        </div>
        {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
      </div>
    </div>
  );
};

export default MetricsCard;
