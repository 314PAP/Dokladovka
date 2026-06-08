import { motion } from "motion/react";
import { ReactNode } from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  color?: string;
  bg?: string;
}

export default function StatsCard({ title, value, icon, color = "text-indigo-600", bg = "bg-indigo-50" }: StatsCardProps) {
  return (
    <div className={`p-6 rounded-3xl text-white flex flex-col justify-between shadow-lg ${bg}`}>
      <div>
        <div className={`${color} bg-white/20 p-2 rounded-lg inline-block mb-3`}>
          {icon}
        </div>
        <h3 className="text-lg font-medium opacity-90">{title}</h3>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </div>
    </div>
  );
}
