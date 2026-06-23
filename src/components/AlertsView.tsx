import React from 'react';
import { ShieldAlert, Bell, Radio, CheckSquare, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';

export const AlertsView: React.FC = () => {
  const alertsData = [
    {
      id: 'a-1',
      title: 'Emergency Valve Override Scheduled',
      description: 'Ward 10 hydraulic engineering team will execute system pressure calibrations on main Amin Marg lines. Expect temporary water supply disruptions for 2h.',
      time: 'Just now',
      tag: 'Water Department',
      type: 'warning',
    },
    {
      id: 'a-2',
      title: 'Escalation Alert Priority Activated',
      description: 'Setu re-escalated unresolved streetlight outage Dossier #3911-S to RMC Executive Electrical Commissioner. Automated SLA counter expired.',
      time: '34m ago',
      tag: 'Setu Agent',
      type: 'agent',
    },
    {
      id: 'a-3',
      title: 'Repairs Completed: Sadhu Vaswani Drain',
      description: 'Solid Waste sanitation trucks dispatched. Blockage successfully eliminated. Area sanitized.',
      time: '3h ago',
      tag: 'Sanitation Dept',
      type: 'success',
    },
    {
      id: 'a-4',
      title: 'Civic Corroboration Spike Verified',
      description: 'Case dossier #4829-X (Pothole cluster, University Rd) has surpassed 40 corroborating citizens. Emergency field dispatch queued.',
      time: '1d ago',
      tag: 'Setu Agent',
      type: 'info',
    }
  ];

  return (
    <div className="flex-1 flex flex-col bg-paper overflow-y-auto">
      {/* Banner */}
      <div className="bg-white px-5 py-4 border-b border-hairline shrink-0 flex justify-between items-center shadow-xs">
        <div>
          <p className="text-[10px] font-mono leading-none text-zinc-400 font-bold uppercase tracking-widest">Localized Updates</p>
          <h2 className="text-sm font-display font-black text-ink uppercase tracking-tight flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-civic animate-pulse" /> Community Alerts
          </h2>
        </div>
        <span className="bg-zinc-100 text-ink text-[10px] font-mono px-2 py-0.5 rounded-[4px]">Rajkot, IN</span>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {alertsData.map((alert, idx) => {
          let typeColor = 'border-l-zinc-300';
          let icon = <Bell className="w-4 h-4 text-zinc-400" />;
          
          if (alert.type === 'warning') {
            typeColor = 'border-l-st-stalled bg-red-50/50';
            icon = <ShieldAlert className="w-4 h-4 text-st-stalled" />;
          } else if (alert.type === 'agent') {
            typeColor = 'border-l-civic bg-civic-tint/30';
            icon = <span className="text-civic font-mono font-bold leading-none select-none">⬡</span>;
          } else if (alert.type === 'success') {
            typeColor = 'border-l-st-resolved bg-green-50/30';
            icon = <CheckSquare className="w-4 h-4 text-st-resolved" />;
          } else if (alert.type === 'info') {
            typeColor = 'border-l-st-progress bg-blue-50/30';
            icon = <MessageSquare className="w-4 h-4 text-st-progress" />;
          }

          return (
            <motion.div
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: idx * 0.08 }}
              key={alert.id}
              className={`bg-white border border-hairline border-l-4 ${typeColor} p-4 rounded-[12px] space-y-1.5 shadow-xs`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5">
                  {icon}
                  <span className="text-[10px] font-mono font-bold text-ink-soft uppercase bg-zinc-50 px-1.5 py-0.5 rounded border border-hairline/60">
                    {alert.tag}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">{alert.time}</span>
              </div>
              <h3 className="text-xs font-bold text-ink tracking-tight uppercase font-display leading-tight">
                {alert.title}
              </h3>
              <p className="text-[11px] text-ink-soft leading-relaxed font-mono">
                {alert.description}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
