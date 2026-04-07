// =============================================================================
// BrandHeader.jsx — navy brand header for every broker form card
//
// Brand colour sourced from --primary CSS variable (portal-wide constant).
// Do not hardcode any colour values here.
// =============================================================================

export default function BrandHeader() {
  return (
    <div style={{
      background: 'var(--primary)',
      borderRadius: '4px 4px 0 0',
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* FA geometric logo mark */}
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="2" y="2" width="36" height="36" rx="4" fill="rgba(255,255,255,0.12)" />
        <path d="M10 30 L20 10 L30 30" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M13.5 22 L26.5 22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      <div>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.18em',
          color: 'rgba(255,255,255,0.9)',
          textTransform: 'uppercase',
          lineHeight: 1.2,
        }}>
          FULCRUM AUSTRALIA
        </div>
        <div style={{
          fontSize: 10,
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase',
          marginTop: 2,
        }}>
          Cashflow Analysis Request
        </div>
      </div>
    </div>
  );
}
