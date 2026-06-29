import React, { useMemo } from 'react';
import { CivicIssue } from '../types';
import { computeImpactMetrics, CountPct } from '../lib/metrics';
import { ShieldAlert, FileText, CheckCircle2, Users, TrendingUp, Building2, MapPin } from 'lucide-react';

interface ImpactDashboardProps {
  issues: CivicIssue[];
}

// Hand-built bar (no charting dep). `colorClass` is a Tailwind bg-* token.
const Bar: React.FC<{ pct: number; colorClass?: string }> = ({ pct, colorClass = 'bg-civic' }) => (
  <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
    <div
      className={`h-full ${colorClass} rounded-full transition-[width] duration-500 motion-reduce:transition-none`}
      style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
    />
  </div>
);

// Section shell — white card, hairline border, dossier feel.
const Section: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-surface border border-hairline rounded-[12px] p-4 space-y-3 shadow-xs">
    <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-ink-soft border-b border-hairline pb-2 flex items-center gap-1.5">
      {icon}
      {title}
    </h3>
    {children}
  </div>
);

// A labeled bar row: label · bar · mono count.
const BarRow: React.FC<{ row: CountPct; colorClass?: string; accent?: boolean }> = ({ row, colorClass, accent }) => (
  <div className="flex items-center gap-3">
    <span className={`w-20 shrink-0 text-[10px] font-mono uppercase tracking-wide truncate ${accent ? 'text-signal font-bold' : 'text-ink-soft'}`}>
      {row.label}
    </span>
    <div className="flex-1"><Bar pct={row.pct} colorClass={colorClass} /></div>
    <span className="w-7 shrink-0 text-right text-[11px] font-mono font-bold text-ink tabular-nums">{row.count}</span>
  </div>
);

export const ImpactDashboard: React.FC<ImpactDashboardProps> = ({ issues }) => {
  const m = useMemo(() => computeImpactMetrics(issues), [issues]);

  const generated = useMemo(() => {
    try { return new Date(m.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }, [m.generatedAt]);

  return (
    <div className="flex-1 flex flex-col bg-paper overflow-y-auto">
      {/* Ledger header */}
      <div className="bg-surface px-5 py-4 border-b border-hairline shrink-0 flex justify-between items-center shadow-xs">
        <div>
          <p className="text-[10px] font-mono leading-none text-zinc-400 font-bold uppercase tracking-widest">Transparency · Accountability</p>
          <h2 className="text-sm font-display font-black text-ink uppercase tracking-tight">Public Impact Ledger</h2>
        </div>
        <span className="bg-ink text-white text-[9px] font-mono px-2 py-0.5 rounded-[3px] uppercase tracking-widest font-bold">Rajkot, IN</span>
      </div>

      {m.total === 0 ? (
        // Intentional empty state — an awaiting-dossier card, not a blank screen.
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16 space-y-3">
          <FileText className="w-9 h-9 text-zinc-300" />
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">No civic data on record yet</p>
          <p className="text-[10px] font-mono leading-relaxed max-w-[240px] text-zinc-400">
            Accountability metrics populate as citizens file dossiers and Setu routes them. The ledger is live — it just hasn't been written to yet.
          </p>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {/* Headline stat grid (2×2) — stamp-style, mono numbers, no gradient hero */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<FileText className="w-3.5 h-3.5" />} label="Total cases" value={String(m.total)} />
            <StatCard
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              label="Resolution rate"
              value={`${m.resolutionRate}%`}
              sub={m.resolved === 0 ? 'none resolved yet' : `${m.resolved} resolved`}
              tone={m.resolved === 0 ? 'muted' : 'good'}
            />
            <StatCard icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Currently escalated" value={String(m.escalated)} tone={m.escalated > 0 ? 'alert' : 'default'} />
            <StatCard icon={<Users className="w-3.5 h-3.5" />} label="Citizen confirmations" value={String(m.totalConfirmations)} />
          </div>

          {/* By status */}
          <Section title="Lifecycle status" icon={<TrendingUp className="w-3.5 h-3.5" />}>
            <div className="space-y-2.5">
              {m.byStatus.map((row) => (
                <BarRow key={row.key} row={row} colorClass={statusBar(row.key)} />
              ))}
            </div>
          </Section>

          {/* By category (all 6 always shown) */}
          <Section title="By category" icon={<FileText className="w-3.5 h-3.5" />}>
            <div className="space-y-2.5">
              {m.byCategory.map((row) => (
                <BarRow key={row.key} row={row} colorClass="bg-civic" />
              ))}
            </div>
          </Section>

          {/* Most-affected wards */}
          <Section title="Most-affected wards" icon={<MapPin className="w-3.5 h-3.5" />}>
            <div className="space-y-2.5">
              {m.byWard.map((row, i) => (
                <BarRow key={row.key} row={row} colorClass={i === 0 ? 'bg-signal' : 'bg-ink'} accent={i === 0} />
              ))}
            </div>
            {m.topWard && (
              <p className="text-[9px] font-mono text-zinc-400 pt-1 border-t border-hairline">
                Most reports: <span className="text-signal font-bold">{m.topWard.ward}</span> ({m.topWard.count})
              </p>
            )}
          </Section>

          {/* By zone */}
          <Section title="By zone">
            <div className="grid grid-cols-3 gap-3">
              {m.byZone.map((z) => (
                <div key={z.key} className="text-center bg-paper border border-hairline rounded-[8px] p-2">
                  <p className="text-lg font-mono font-black text-ink tabular-nums leading-none">{z.count}</p>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-ink-soft mt-1">{z.label}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Accountability block */}
          <Section title="Accountability — Setu & departments" icon={<ShieldAlert className="w-3.5 h-3.5" />}>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-civic-tint border border-civic/30 rounded-[8px] p-2.5">
                <p className="text-lg font-mono font-black text-civic-deep tabular-nums leading-none">{m.setuEscalations}</p>
                <p className="text-[9px] font-mono uppercase tracking-wider text-civic-deep/80 mt-1">Setu escalations</p>
              </div>
              <div className="bg-paper border border-hairline rounded-[8px] p-2.5">
                <p className="text-lg font-mono font-black text-signal tabular-nums leading-none">{m.setuReEscalations}</p>
                <p className="text-[9px] font-mono uppercase tracking-wider text-ink-soft mt-1">Auto re-escalations</p>
              </div>
            </div>

            {m.byDepartment.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Open caseload by department
                </p>
                {m.byDepartment.map((d) => {
                  const ratio = d.total > 0 ? Math.round((d.open / d.total) * 100) : 0;
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-[10px] font-mono text-ink-soft truncate" title={d.name}>{d.name}</span>
                      <div className="flex-1"><Bar pct={ratio} colorClass="bg-st-escalate" /></div>
                      <span className="w-12 shrink-0 text-right text-[10px] font-mono font-bold text-ink tabular-nums">{d.open}/{d.total}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-hairline">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-soft">Avg time to resolution</span>
              <span className="text-[11px] font-mono font-bold text-ink">
                {m.avgResolutionHours === null ? '—' : `~${m.avgResolutionHours}h`}
              </span>
            </div>
            {m.avgResolutionHours !== null && (
              <p className="text-[9px] font-mono text-zinc-400 leading-relaxed">Approximate — measured from report to last update.</p>
            )}
          </Section>

          {/* Audit footer — reinforces the transparency framing */}
          <p className="text-center text-[9px] font-mono text-zinc-400 tracking-wide pt-1 pb-2">
            Derived live from {m.total} public {m.total === 1 ? 'dossier' : 'dossiers'} · {generated}
          </p>
        </div>
      )}
    </div>
  );
};

// Map a lifecycle status to a Tailwind bg-* token for its bar (mirrors Doc 3 status semantics).
function statusBar(status: string): string {
  switch (status) {
    case 'VALIDATED': case 'OPEN': return 'bg-st-open';
    case 'ESCALATED': return 'bg-st-escalate';
    case 'STALLED': return 'bg-st-stalled';
    case 'IN_PROGRESS': return 'bg-st-progress';
    case 'RESOLVED': return 'bg-st-resolved';
    default: return 'bg-st-new';
  }
}

type Tone = 'default' | 'good' | 'alert' | 'muted';
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; tone?: Tone }> = ({
  icon, label, value, sub, tone = 'default',
}) => {
  const valueColor =
    tone === 'good' ? 'text-st-resolved' : tone === 'alert' ? 'text-st-stalled' : tone === 'muted' ? 'text-ink-soft' : 'text-ink';
  return (
    <div className="bg-surface border border-hairline rounded-[12px] p-3 shadow-xs">
      <div className="flex items-center gap-1.5 text-ink-soft">
        {icon}
        <span className="text-[9px] font-mono font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className={`text-2xl font-mono font-black tabular-nums mt-1.5 leading-none ${valueColor}`}>{value}</p>
      {sub && <p className="text-[9px] font-mono text-zinc-400 mt-1">{sub}</p>}
    </div>
  );
};
