// =============================================================================
// CashflowReport.jsx — public cashflow analysis report viewer
//
// Route: /report?id={uuid}  (no auth required)
// Data:  fetched from /api/cashflow-report?id= (Vercel serverless function)
//
// Component tree:
//   CashflowReportPage      — fetch, explicit state machine, branded gates
//   CashflowReport          — derives flags, renders full layout
//     OverviewPanel         — headline cards, cashflow breakdown, purchasing costs,
//                             buyer details, milestone cards
//     CashflowPanel         — snapshot cards, bar chart, crossover, annual table
//     ProjectionsPanel      — assumptions, milestone cards, line charts, projection table
//     LoanComparisonPanel   — conditional (hasBoth only)
//   BarChart                — inline SVG, true zero baseline
//   LineChart               — inline SVG, multi-series polylines
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

// ── Responsive hook ────────────────────────────────────────────────────────────

function useIsMobile(bp = 640) {
  const [mob, setMob] = useState(() => typeof window !== 'undefined' && window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < bp);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return mob;
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('en-AU');
}

function fmtPct(n, dp = 2) {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(dp) + '%';
}

function fmtSigned(n) {
  if (n === null || n === undefined) return '—';
  const rounded = Math.round(n);
  return rounded >= 0 ? `+$${fmt(rounded)}` : `-$${fmt(Math.abs(rounded))}`;
}

// ── SVG chart helpers ──────────────────────────────────────────────────────────

/**
 * Maps an array of values to SVG polyline point strings.
 * Used for line charts only — do NOT use for the bar chart.
 */
function toSVGPoints(values, svgWidth, svgHeight, padding = 40) {
  const min   = Math.min(...values);
  const max   = Math.max(...values);
  const range = max - min || 1;
  return values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (svgWidth - padding * 2);
    const y = svgHeight - padding - ((v - min) / range) * (svgHeight - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

// ── BarChart — true zero baseline, bars above/below ───────────────────────────

function BarChart({ values, width = 700, height = 220 }) {
  if (!values || values.length === 0) return null;

  const padL = 56, padR = 16, padT = 16, padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const zeroY  = padT + chartH / 2;
  const halfH  = chartH / 2;

  const maxAbs = Math.max(...values.map(Math.abs)) || 1;
  const barW   = (chartW / values.length) * 0.7;
  const barGap = chartW / values.length;

  const LABEL_YEARS = new Set([1, 5, 10, 15, 20]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      aria-label="Net monthly cost after tax over 20 years"
    >
      {/* Zero baseline */}
      <line
        x1={padL} y1={zeroY} x2={width - padR} y2={zeroY}
        stroke="#374151" strokeWidth={1.5}
      />

      {/* Y-axis label */}
      <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize={9} fill="#9ca3af">$/mo</text>

      {/* Bars */}
      {values.map((v, i) => {
        const cx   = padL + i * barGap + barGap / 2;
        const x    = cx - barW / 2;
        const pct  = Math.abs(v) / maxAbs;
        const barH = Math.max(pct * halfH, 2);
        const y    = v >= 0 ? zeroY - barH : zeroY;
        const fill = v >= 0 ? '#059669' : '#dc2626';
        const year = i + 1;
        const sign = v >= 0 ? '+' : '-';
        return (
          <rect
            key={i}
            x={x} y={y}
            width={barW} height={barH}
            fill={fill} rx={1}
          >
            <title>{`Year ${year}: ${sign}$${fmt(Math.abs(v))}/mo`}</title>
          </rect>
        );
      })}

      {/* X-axis year labels */}
      {values.map((_, i) => {
        const year = i + 1;
        if (!LABEL_YEARS.has(year)) return null;
        const cx = padL + i * barGap + barGap / 2;
        return (
          <text key={i} x={cx} y={height - 4} textAnchor="middle" fontSize={10} fill="#6b7280">
            {year}
          </text>
        );
      })}
    </svg>
  );
}

// ── LineChart — multi-series polylines ─────────────────────────────────────────

function LineChart({ series, width = 700, height = 250, formatY, labelYears }) {
  if (!series || series.length === 0) return null;

  const LABEL_Y = new Set(labelYears || [1, 5, 10, 15, 20]);
  const padL = 64, padR = 16, padT = 16, padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const allValues  = series.flatMap(s => s.values);
  const globalMin  = Math.min(...allValues);
  const globalMax  = Math.max(...allValues);
  const globalRange = globalMax - globalMin || 1;

  const n = series[0].values.length;

  function xAt(i)  { return padL + (i / (n - 1)) * chartW; }
  function yAt(v)  { return padT + chartH - ((v - globalMin) / globalRange) * chartH; }

  function makePoints(values) {
    return values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
  }

  // Y-axis ticks (3 ticks: min, mid, max)
  const ticks = [globalMin, (globalMin + globalMax) / 2, globalMax];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      {/* Y-axis ticks */}
      {ticks.map((t, i) => {
        const y = yAt(t);
        return (
          <g key={i}>
            <line x1={padL - 4} y1={y} x2={padL} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#f3f4f6" strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#9ca3af">
              {formatY ? formatY(t) : fmt(t)}
            </text>
          </g>
        );
      })}

      {/* Series polylines */}
      {series.map((s, si) => (
        <polyline
          key={si}
          points={makePoints(s.values)}
          fill="none"
          stroke={s.colour}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* X-axis year labels */}
      {Array.from({ length: n }, (_, i) => {
        const year = i + 1;
        if (!LABEL_Y.has(year)) return null;
        return (
          <text key={i} x={xAt(i)} y={height - 4} textAnchor="middle" fontSize={10} fill="#6b7280">
            {year}
          </text>
        );
      })}
    </svg>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const MILESTONE_YEARS = new Set([5, 10, 15, 20]);

const sectionStyle = {
  padding: '40px 0',
  scrollMarginTop: 110,
};

const cardStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '20px 24px',
  marginBottom: 20,
};

const metricCardStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '16px 20px',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const thStyle = {
  padding: '9px 12px',
  background: '#f9fafb',
  borderBottom: '1px solid #e5e7eb',
  fontSize: 11,
  fontWeight: 700,
  color: '#6b7280',
  textAlign: 'right',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

const thLeftStyle = { ...thStyle, textAlign: 'left' };

function tdStyle(highlight) {
  return {
    padding: '8px 12px',
    borderBottom: '1px solid #f3f4f6',
    textAlign: 'right',
    color: '#374151',
    background: highlight ? '#eff6ff' : 'transparent',
    fontWeight: highlight ? 600 : 400,
  };
}

function netStyle(v) {
  const colour = (v ?? 0) >= 0 ? '#059669' : '#dc2626';
  return { color: colour, fontWeight: 700 };
}

function NetDisplay({ value, suffix = '/mo' }) {
  if (value === null || value === undefined) return <span>—</span>;
  const pos = value >= 0;
  const label = pos ? 'Cashflow positive' : 'Out of pocket';
  const colour = pos ? '#059669' : '#dc2626';
  return (
    <span style={{ color: colour }}>
      {pos ? '+' : '-'}${fmt(Math.abs(value))}{suffix}
      <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 5, opacity: 0.8 }}>{label}</span>
    </span>
  );
}

// ── Branded gate pages ─────────────────────────────────────────────────────────

function BrandedGate({ heading, body }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'grid', placeItems: 'center', fontFamily: 'Inter, Arial, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 480, padding: '32px 24px' }}>
        <img src="/No BG, Light Text.png" alt="Fulcrum Australia" style={{ height: 36, marginBottom: 28, filter: 'invert(1) brightness(0.3)' }} />
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1a2e5a', marginBottom: 12 }}>{heading}</div>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.6 }}>{body}</p>
      </div>
    </div>
  );
}

// ── Overview panel ─────────────────────────────────────────────────────────────

function OverviewPanel({ data, hasPI, hasIO, isSMSF }) {
  const isMobile = useIsMobile();
  const d1      = data.day_one;
  const pc      = data.purchasing_costs;
  const entity  = data.entity;
  const loans   = data.loans;

  // Use PI values preferentially, fall back to IO
  const netMonthly = hasPI ? d1.pi_monthly_net_after_tax : d1.io_monthly_net_after_tax;
  const mortgage   = hasPI ? loans.pi?.monthly_repayment  : loans.io?.monthly_repayment;
  const rentIncome = hasPI ? d1.pi_monthly_rental_income  : (data.annual_schedule?.[0]?.monthly_rent_net);
  const ongoingCosts = d1.pi_monthly_ongoing_costs ?? data.annual_schedule?.[0]?.monthly_ongoing_costs;
  const pmCosts      = data.annual_schedule?.[0]?.property_mgmt_monthly ?? 0;
  const taxBenefit = hasPI ? d1.pi_monthly_tax_benefit    : d1.io_monthly_tax_benefit;

  const ENTITY_LABEL = {
    individual: 'Individual', joint: 'Joint tenants',
    tenants_in_common: 'Tenants in common', smsf: 'SMSF',
  };

  const PURCHASING_ITEMS = [
    { key: 'deposit',            label: 'Deposit' },
    { key: 'stamp_duty',         label: 'Stamp duty + transfer fee' },
    { key: 'lmi',                label: 'Lenders mortgage insurance (LMI)' },
    { key: 'establishment_fee',  label: 'Mortgage establishment fee' },
    { key: 'buyers_agent_fee',   label: "Buyer's agent fee" },
    { key: 'conveyancer',        label: 'Conveyancer / settlement agent' },
    { key: 'building_inspection',label: 'Building inspection' },
    { key: 'pest_inspection',    label: 'Pest inspection' },
    { key: 'renovation_allowance', label: 'Renovation / maintenance allowance' },
  ];

  return (
    <section id="overview" style={sectionStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>Overview</div>

      {/* Headline metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={metricCardStyle}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Purchase price</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>${fmt(data.property.purchase_price)}</div>
        </div>
        <div style={metricCardStyle}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Total purchasing costs</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>${fmt(pc.total)}</div>
        </div>
        <div style={metricCardStyle}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Gross rental yield</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{fmtPct(d1.gross_yield_pct)}</div>
        </div>
        <div style={metricCardStyle}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Net monthly cost (Year 1)</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            <NetDisplay value={netMonthly} />
          </div>
        </div>
      </div>

      {/* Monthly cashflow breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Monthly cashflow breakdown — Year 1</div>
          {[
            { label: 'Rental income (vacancy-adjusted)', value: rentIncome, sign: '+', colour: '#059669' },
            { label: 'Mortgage repayment', value: mortgage, sign: '-', colour: '#dc2626' },
            { label: 'Ongoing costs (council, insurance, etc.)', value: ongoingCosts, sign: '-', colour: '#dc2626' },
            { label: 'Property management (7.7% of rent)', value: pmCosts, sign: '-', colour: '#dc2626' },
          ].map(({ label, value, sign, colour }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: colour }}>{sign}${fmt(value)}/mo</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #e5e7eb' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Out of pocket subtotal</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
              {fmtSigned((rentIncome ?? 0) - (mortgage ?? 0) - (ongoingCosts ?? 0) - (pmCosts ?? 0))}/mo
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Tax benefit</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#059669' }}>+${fmt(taxBenefit)}/mo</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Net after tax</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}><NetDisplay value={netMonthly} /></span>
          </div>
        </div>

        {/* Purchasing costs summary */}
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Purchasing costs</div>
          {PURCHASING_ITEMS.map(({ key, label }) => {
            const val = pc[key];
            if (!val) return null;
            return (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{label}</span>
                <span style={{ fontSize: 13, color: '#374151' }}>${fmt(val)}</span>
              </div>
            );
          })}
          {pc.other_1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{pc.other_1.label}</span>
              <span style={{ fontSize: 13, color: '#374151' }}>${fmt(pc.other_1.amount)}</span>
            </div>
          )}
          {pc.other_2 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{pc.other_2.label}</span>
              <span style={{ fontSize: 13, color: '#374151' }}>${fmt(pc.other_2.amount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Total</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>${fmt(pc.total)}</span>
          </div>
        </div>
      </div>

      {/* Buyer details card */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
          {isSMSF ? 'SMSF details' : 'Buyer details'}
        </div>
        {isSMSF ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Fund name: </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{entity.smsf_fund_name || '—'}</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Fund tax impact (accumulation phase): </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>${fmt(d1.annual_tax_benefit_total)}/yr</span>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 14px', lineHeight: 1.5 }}>
              <strong>SMSF disclaimer:</strong> SMSF modelling is indicative only and is based on a simplified accumulation-phase scenario. Outcomes are subject to trustee, fund deed, and accountant advice. Member contribution caps, pension phase treatment, related-party rules, and borrowing structure variations are not modelled.
            </div>
          </>
        ) : (
          <>
            {(entity.buyers || []).map((buyer, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>
                  {buyer.name}
                  {entity.buyers.length > 1 && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af' }}>{fmtPct(buyer.ownership_pct, 0)} ownership</span>
                  )}
                </span>
                {d1.annual_tax_benefit_per_buyer?.[i] && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#059669' }}>
                    ${fmt(d1.annual_tax_benefit_per_buyer[i].annual_saving)}/yr tax saving
                  </span>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 0' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                {entity.buyers?.length > 1 ? 'Combined tax benefit' : 'Tax benefit'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>${fmt(d1.annual_tax_benefit_total)}/yr</span>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Based on Australian individual marginal tax rates (2024–25).</div>
          </>
        )}
      </div>

      {/* Capital position milestone cards */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Capital position milestones</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {[5, 10, 15, 20].map(yr => {
          const m = data.milestones[`year_${yr}`];
          if (!m) return null;
          const eq    = m.equity_pi ?? m.equity_io;
          const lb    = m.loan_balance_pi ?? m.loan_balance_io;
          const eqPct = m.equity_pct_pi ?? m.equity_pct_io;
          const net   = m.monthly_net_after_tax_pi ?? m.monthly_net_after_tax_io;
          return (
            <div key={yr} style={{ ...metricCardStyle, borderTop: '3px solid var(--primary, #1a2e5a)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary, #1a2e5a)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Year {yr}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'Market value',   value: `$${fmt(m.market_value)}` },
                  { label: 'Loan balance',   value: `$${fmt(lb)}` },
                  { label: 'Equity',         value: `$${fmt(eq)}` },
                  { label: 'Equity %',       value: fmtPct(eqPct) },
                  { label: 'Yield on cost',  value: fmtPct(m.gross_yield_on_cost_pct ?? m.yield_on_cost_pct) },
                  { label: 'Net monthly',    value: null, component: <NetDisplay value={net} /> },
                ].map(({ label, value, component }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6b7280' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{component ?? value}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Cashflow panel ─────────────────────────────────────────────────────────────

function CashflowPanel({ data, hasPI }) {
  const isMobile = useIsMobile();
  const schedule = data.annual_schedule || [];
  const SNAP_YEARS = [1, 2, 5, 10];

  const barValues = schedule.map(row =>
    hasPI ? (row.pi_monthly_net_after_tax ?? 0) : (row.io_monthly_net_after_tax ?? 0)
  );

  const crossYear = hasPI ? data.crossover_year_pi : data.crossover_year_io;

  return (
    <section id="cashflow" style={sectionStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>Cashflow</div>

      {/* Snapshot cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {SNAP_YEARS.map(yr => {
          const row = schedule.find(r => r.year === yr);
          if (!row) return null;
          const net = hasPI ? row.pi_monthly_net_after_tax : row.io_monthly_net_after_tax;
          const tb  = hasPI ? row.pi_monthly_tax_benefit   : row.io_monthly_tax_benefit;
          const nbf = hasPI ? row.pi_monthly_net_before_tax : row.io_monthly_net_before_tax;
          return (
            <div key={yr} style={metricCardStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Year {yr}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Weekly rent: <strong style={{ color: '#111827' }}>${fmt(row.weekly_rent)}</strong></div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Before tax: <span style={netStyle(nbf)}>{fmtSigned(nbf)}/mo</span></div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Tax benefit: <strong style={{ color: '#059669' }}>+${fmt(tb)}/mo</strong></div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}><NetDisplay value={net} /></div>
            </div>
          );
        })}
      </div>

      {/* Bar chart */}
      <div style={{ ...cardStyle, padding: '20px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Net monthly cost after tax — 20 years</div>
        <BarChart values={barValues} />
        <div style={{ display: 'flex', gap: 20, marginTop: 10, justifyContent: 'center' }}>
          <span style={{ fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, background: '#059669', borderRadius: 2, display: 'inline-block' }} />
            Cashflow positive
          </span>
          <span style={{ fontSize: 11, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, background: '#dc2626', borderRadius: 2, display: 'inline-block' }} />
            Out of pocket
          </span>
        </div>
      </div>

      {/* Crossover callout */}
      <div style={{ ...cardStyle, background: crossYear ? '#f0fdf4' : '#fff7ed', borderColor: crossYear ? '#a7f3d0' : '#fed7aa', marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: crossYear ? '#065f46' : '#92400e' }}>
          {crossYear
            ? `This property is projected to become cashflow positive after tax in Year ${crossYear}.`
            : 'This property does not reach cashflow positive within the 20-year projection period.'}
        </div>
      </div>

      {/* Annual cashflow table */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Annual cashflow — 20 years</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {['Year', 'Weekly Rent', 'Mortgage', 'Outgoings incl. PM', 'Before Tax', 'Tax Benefit', 'After Tax', 'Cumulative'].map((h, i) => (
                  <th key={h} style={i === 0 ? thLeftStyle : thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.map(row => {
                const hl     = MILESTONE_YEARS.has(row.year);
                const net    = hasPI ? row.pi_monthly_net_after_tax  : row.io_monthly_net_after_tax;
                const tb     = hasPI ? row.pi_monthly_tax_benefit    : row.io_monthly_tax_benefit;
                const nbf    = hasPI ? row.pi_monthly_net_before_tax : row.io_monthly_net_before_tax;
                const cumul  = hasPI ? row.cumulative_cash_contributed_pi : row.cumulative_cash_contributed_io;
                const mtg    = hasPI ? data.loans?.pi?.monthly_repayment : data.loans?.io?.monthly_repayment;
                return (
                  <tr key={row.year}>
                    <td style={{ ...tdStyle(hl), textAlign: 'left', fontWeight: hl ? 700 : 400 }}>{row.year}</td>
                    <td style={tdStyle(hl)}>${fmt(row.weekly_rent)}</td>
                    <td style={tdStyle(hl)}>${fmt(mtg)}</td>
                    <td style={tdStyle(hl)}>${fmt((row.monthly_ongoing_costs || 0) + (row.property_mgmt_monthly || 0))}</td>
                    <td style={{ ...tdStyle(hl), ...netStyle(nbf) }}>{fmtSigned(nbf)}/mo</td>
                    <td style={{ ...tdStyle(hl), color: '#059669' }}>+${fmt(tb)}/mo</td>
                    <td style={{ ...tdStyle(hl), ...netStyle(net), fontWeight: 700 }}>{fmtSigned(net)}/mo</td>
                    <td style={tdStyle(hl)}>${fmt(cumul)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ── Projections panel ──────────────────────────────────────────────────────────

const DISCLAIMER = 'This report is prepared for illustrative purposes only. All projections are based on assumed growth rates and do not guarantee future performance. This report does not constitute financial, taxation, or investment advice. Recipients should seek independent professional advice before making any investment decision.';

function ProjectionsPanel({ data, hasPI }) {
  const schedule = data.annual_schedule || [];
  const loans    = data.loans;
  const assum    = data.assumptions;

  const mvValues  = schedule.map(r => r.market_value);
  const lbValues  = schedule.map(r => hasPI ? (r.loan_balance_pi ?? 0) : (r.loan_balance_io ?? 0));
  const eqValues  = schedule.map(r => hasPI ? (r.equity_pi ?? 0) : (r.equity_io ?? 0));
  const yocValues = schedule.map(r => r.yield_on_cost_pct);

  const loan = hasPI ? loans?.pi : loans?.io;
  const loanLabel = hasPI ? 'P&I' : 'IO';

  return (
    <section id="projections" style={sectionStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>Projections</div>

      {/* Assumptions bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Purchase price',   value: `$${fmt(data.property.purchase_price)}` },
          { label: 'Capital growth',   value: fmtPct((assum.cap_growth_rate ?? 0) * 100, 1) },
          { label: 'Rental growth',    value: fmtPct((assum.rental_growth_rate ?? 0) * 100, 1) },
          { label: 'Inflation',        value: fmtPct((assum.inflation_rate ?? 0) * 100, 1) },
          { label: `Interest (${loanLabel})`, value: loan ? fmtPct(loan.rate, 2) : '—' },
          { label: 'Loan term',        value: loan ? `${loan.term_years} yrs` : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#f3f4f6', borderRadius: 20, padding: '6px 14px', fontSize: 13 }}>
            <span style={{ color: '#9ca3af', marginRight: 6 }}>{label}</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Milestone cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[5, 10, 15, 20].map(yr => {
          const m   = data.milestones[`year_${yr}`];
          if (!m) return null;
          const eq    = m.equity_pi ?? m.equity_io;
          const lb    = m.loan_balance_pi ?? m.loan_balance_io;
          const eqPct = m.equity_pct_pi ?? m.equity_pct_io;
          const tip   = m.total_interest_paid_pi ?? m.total_interest_paid_io;
          const yoc   = m.gross_yield_on_cost_pct ?? m.yield_on_cost_pct;
          const yov   = m.gross_yield_on_value_pct ?? m.yield_on_value_pct;
          return (
            <div key={yr} style={{ ...metricCardStyle, borderTop: '3px solid var(--teal, #1a7a8a)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal, #1a7a8a)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Year {yr}</div>
              {[
                { label: 'Market value',      value: `$${fmt(m.market_value)}` },
                { label: 'Loan balance',      value: `$${fmt(lb)}` },
                { label: 'Equity',            value: `$${fmt(eq)}` },
                { label: 'Equity %',          value: fmtPct(eqPct) },
                { label: 'Total interest',    value: `$${fmt(tip)}` },
                { label: 'Yield on cost',     value: fmtPct(yoc) },
                { label: 'Yield on value',    value: fmtPct(yov) },
                { label: 'Cumul. tax saving', value: `$${fmt(m.cumulative_tax_saving)}` },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ color: '#6b7280' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{value}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Line chart: value / balance / equity */}
      <div style={{ ...cardStyle, padding: '20px 16px', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Market value vs loan balance vs equity — 20 years</div>
        <LineChart
          series={[
            { values: mvValues, colour: '#1a2e5a' },
            { values: lbValues, colour: '#dc2626' },
            { values: eqValues, colour: '#059669' },
          ]}
          formatY={v => `$${fmt(v / 1000)}k`}
        />
        <div style={{ display: 'flex', gap: 20, marginTop: 10, justifyContent: 'center' }}>
          {[
            { label: 'Market value', colour: '#1a2e5a' },
            { label: 'Loan balance', colour: '#dc2626' },
            { label: 'Equity',       colour: '#059669' },
          ].map(({ label, colour }) => (
            <span key={label} style={{ fontSize: 11, color: '#374151', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 20, height: 3, background: colour, borderRadius: 2, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Line chart: yield on cost */}
      <div style={{ ...cardStyle, padding: '20px 16px', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Gross yield on cost — 20 years</div>
        <LineChart
          series={[{ values: yocValues, colour: 'var(--teal, #1a7a8a)' }]}
          height={160}
          formatY={v => fmtPct(v, 1)}
        />
      </div>

      {/* Annual projection table */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Annual projections — 20 years</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {['Year', 'Market Value', 'Loan Balance', 'Equity', 'Equity %', 'Yield on Cost', 'Weekly Rent', 'ROI %'].map((h, i) => (
                  <th key={h} style={i === 0 ? thLeftStyle : thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.map(row => {
                const hl    = MILESTONE_YEARS.has(row.year);
                const lb    = hasPI ? row.loan_balance_pi : row.loan_balance_io;
                const eq    = hasPI ? row.equity_pi       : row.equity_io;
                const eqPct = hasPI ? row.equity_pct_pi   : row.equity_pct_io;
                return (
                  <tr key={row.year}>
                    <td style={{ ...tdStyle(hl), textAlign: 'left', fontWeight: hl ? 700 : 400 }}>{row.year}</td>
                    <td style={tdStyle(hl)}>${fmt(row.market_value)}</td>
                    <td style={tdStyle(hl)}>${fmt(lb)}</td>
                    <td style={tdStyle(hl)}>${fmt(eq)}</td>
                    <td style={tdStyle(hl)}>{fmtPct(eqPct)}</td>
                    <td style={tdStyle(hl)}>{fmtPct(row.yield_on_cost_pct)}</td>
                    <td style={tdStyle(hl)}>${fmt(row.weekly_rent)}</td>
                    <td style={{ ...tdStyle(hl), color: (row.roi_pct ?? 0) >= 0 ? '#059669' : '#dc2626' }}>{fmtPct(row.roi_pct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </section>
  );
}

// ── Loan comparison panel ──────────────────────────────────────────────────────

function LoanComparisonPanel({ data }) {
  const isMobile = useIsMobile();
  const schedule = data.annual_schedule || [];
  const loans    = data.loans;
  const SNAP_YEARS = [1, 2, 5, 10];
  const MS_YEARS   = [5, 10, 20];

  const y20 = schedule.find(r => r.year === 20) || {};
  const equityAdv = (y20.equity_pi ?? 0) - (y20.equity_io ?? 0);
  const intAdvPI  = (y20.total_interest_paid_io ?? 0) - (y20.total_interest_paid_pi ?? 0);

  return (
    <section id="loan-comparison" style={sectionStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>Loan Comparison</div>

      {/* IO strategy note */}
      <div style={{ ...cardStyle, background: '#fefce8', borderColor: '#fde68a', marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
          IO loans result in lower monthly cost in early years but slower equity accumulation and higher total interest paid over the loan term.
        </div>
      </div>

      {/* Side-by-side monthly cost */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Monthly net after tax — P&amp;I vs IO</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thLeftStyle}>Year</th>
              <th style={thStyle}>P&amp;I net /mo</th>
              <th style={thStyle}>IO net /mo</th>
              <th style={thStyle}>Difference</th>
            </tr>
          </thead>
          <tbody>
            {SNAP_YEARS.map(yr => {
              const row  = schedule.find(r => r.year === yr);
              if (!row) return null;
              const pi   = row.pi_monthly_net_after_tax ?? 0;
              const io   = row.io_monthly_net_after_tax ?? 0;
              const diff = pi - io;
              return (
                <tr key={yr}>
                  <td style={{ ...tdStyle(false), textAlign: 'left' }}>Year {yr}</td>
                  <td style={{ ...tdStyle(false), ...netStyle(pi) }}>{fmtSigned(pi)}/mo</td>
                  <td style={{ ...tdStyle(false), ...netStyle(io) }}>{fmtSigned(io)}/mo</td>
                  <td style={{ ...tdStyle(false), color: diff >= 0 ? '#059669' : '#dc2626' }}>{fmtSigned(diff)}/mo</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Side-by-side equity */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Equity position — P&amp;I vs IO</div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thLeftStyle}>Year</th>
              <th style={thStyle}>P&amp;I equity</th>
              <th style={thStyle}>IO equity</th>
              <th style={thStyle}>P&amp;I advantage</th>
            </tr>
          </thead>
          <tbody>
            {MS_YEARS.map(yr => {
              const m   = data.milestones[`year_${yr}`];
              if (!m) return null;
              const adv = (m.equity_pi ?? 0) - (m.equity_io ?? 0);
              return (
                <tr key={yr}>
                  <td style={{ ...tdStyle(false), textAlign: 'left' }}>Year {yr}</td>
                  <td style={tdStyle(false)}>${fmt(m.equity_pi)}</td>
                  <td style={tdStyle(false)}>${fmt(m.equity_io)}</td>
                  <td style={{ ...tdStyle(false), color: adv >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>+${fmt(adv)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Equity advantage callout */}
      <div style={{ ...cardStyle, background: '#f0fdf4', borderColor: '#a7f3d0' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>
          P&amp;I builds ${fmt(equityAdv)} more equity than IO over 20 years.
        </div>
      </div>

      {/* Total interest comparison */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Total interest paid over loan term</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>P&amp;I — total interest</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>${fmt(y20.total_interest_paid_pi)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>IO — total interest</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>${fmt(y20.total_interest_paid_io)}</div>
          </div>
        </div>
        {intAdvPI > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#374151' }}>
            P&amp;I saves <strong>${fmt(intAdvPI)}</strong> in total interest compared to IO.
          </div>
        )}
      </div>

      {/* IO reversion disclaimer */}
      <div style={{ fontSize: 12, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '14px 18px', lineHeight: 1.6 }}>
        <strong>Note:</strong> IO repayments are modelled for the full comparison term. Reversion from IO to P&amp;I after a fixed IO sub-period is not modelled. This assumption applies whenever the Loan Comparison tab is rendered.
      </div>
    </section>
  );
}

// ── Report layout ──────────────────────────────────────────────────────────────

const ENTITY_LABEL = {
  individual: 'Individual', joint: 'Joint tenants',
  tenants_in_common: 'Tenants in common', smsf: 'SMSF',
};

function CashflowReport({ data }) {
  const isMobile = useIsMobile();
  const hasPI  = !!data.loans?.pi;
  const hasIO  = !!data.loans?.io;
  const hasBoth = hasPI && hasIO;
  const isSMSF = data.entity?.type === 'smsf';

  const [activeTab, setActiveTab] = useState('overview');
  const sectionRefs = {
    overview:         useRef(null),
    cashflow:         useRef(null),
    projections:      useRef(null),
    'loan-comparison': useRef(null),
  };

  useEffect(() => {
    const sections = ['overview', 'cashflow', 'projections'];
    if (hasBoth) sections.push('loan-comparison');

    const observers = sections.map(id => {
      const el = sectionRefs[id]?.current;
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveTab(id); },
        { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
      );
      obs.observe(el);
      return obs;
    });

    return () => observers.forEach(o => o?.disconnect());
  }, [hasBoth]);

  const TABS = [
    { id: 'overview',          label: 'Overview' },
    { id: 'cashflow',          label: 'Cashflow' },
    { id: 'projections',       label: 'Projections' },
    ...(hasBoth ? [{ id: 'loan-comparison', label: 'Loan Comparison' }] : []),
  ];

  const generatedDate = data.meta?.generated_at
    ? new Date(data.meta.generated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', minHeight: '100vh', background: '#f5f7fa', color: '#111827' }}>
      {/* Report header */}
      <div style={{
        background: 'var(--primary, #1a2e5a)',
        padding: isMobile ? '16px' : '18px 32px',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/No BG, Light Text.png" alt="Fulcrum Australia" style={{ height: 30 }} />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>Cashflow Analysis Report</div>
        </div>
        <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
          <div style={{ color: '#fff', fontSize: isMobile ? 13 : 14, fontWeight: 600, marginBottom: 3 }}>{data.property?.address}</div>
          <span style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 12 }}>
            {ENTITY_LABEL[data.entity?.type] || data.entity?.type}
          </span>
        </div>
      </div>

      {/* Sticky tab bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: isMobile ? '0 8px' : '0 32px', display: 'flex', gap: 0, overflowX: 'auto' }}>
        {TABS.map(tab => (
          <a
            key={tab.id}
            href={`#${tab.id}`}
            style={{
              display: 'inline-block',
              padding: isMobile ? '11px 12px' : '13px 20px',
              fontSize: isMobile ? 12 : 13,
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? 'var(--primary, #1a2e5a)' : '#6b7280',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary, #1a2e5a)' : '2px solid transparent',
              textDecoration: 'none',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: isMobile ? '0 16px 60px' : '0 32px 60px' }}>
        <div ref={sectionRefs.overview}>
          <OverviewPanel data={data} hasPI={hasPI} hasIO={hasIO} isSMSF={isSMSF} />
        </div>
        <div ref={sectionRefs.cashflow}>
          <CashflowPanel data={data} hasPI={hasPI} />
        </div>
        <div ref={sectionRefs.projections}>
          <ProjectionsPanel data={data} hasPI={hasPI} />
        </div>
        {hasBoth && (
          <div ref={sectionRefs['loan-comparison']}>
            <LoanComparisonPanel data={data} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #e5e7eb', background: '#f9fafb', padding: isMobile ? '24px 16px' : '24px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#6b7280', maxWidth: 720, margin: '0 auto', lineHeight: 1.7 }}>
          {DISCLAIMER}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
          Fulcrum Australia
          {generatedDate && <span> · Generated {generatedDate}</span>}
        </div>
      </div>
    </div>
  );
}

// ── CashflowReportPage — top-level route component ────────────────────────────

export default function CashflowReportPage() {
  const [searchParams]   = useSearchParams();
  const id               = searchParams.get('id');
  const [pageState,   setPageState]   = useState('loading');
  const [reportData,  setReportData]  = useState(null);

  useEffect(() => {
    if (!id) {
      setPageState('unavailable');
      return;
    }

    let cancelled = false;

    async function fetchReport() {
      try {
        const res = await fetch(`/api/cashflow-report?id=${encodeURIComponent(id)}`);
        if (!res.ok) { if (!cancelled) setPageState('unavailable'); return; }
        const json = await res.json();
        if (!json.available || !json.report_data) { if (!cancelled) setPageState('unavailable'); return; }
        if (json.schema_version !== 1) { if (!cancelled) setPageState('unsupportedVersion'); return; }
        if (!cancelled) {
          setReportData(json.report_data);
          setPageState('report');
        }
      } catch {
        if (!cancelled) setPageState('unavailable');
      }
    }

    fetchReport();
    return () => { cancelled = true; };
  }, [id]);

  if (pageState === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'grid', placeItems: 'center', fontFamily: 'Inter, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/No BG, Light Text.png" alt="Fulcrum Australia" style={{ height: 36, marginBottom: 24, filter: 'invert(1) brightness(0.3)' }} />
          <div style={{ fontSize: 14, color: '#9ca3af' }}>Loading report…</div>
        </div>
      </div>
    );
  }

  if (pageState === 'unsupportedVersion') {
    return (
      <BrandedGate
        heading="This report format is no longer supported"
        body="The report you are trying to view was generated with an older version that is no longer compatible. Please contact Fulcrum Australia for assistance."
      />
    );
  }

  if (pageState === 'unavailable') {
    return (
      <BrandedGate
        heading="This report is not available"
        body="The report you're looking for may not have been published yet, or the link may be incorrect."
      />
    );
  }

  return <CashflowReport data={reportData} />;
}
