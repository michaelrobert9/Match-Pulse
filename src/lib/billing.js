// ─────────────────────────────────────────────────────────────────────────
// EFT / invoice billing constants shared by the Products page and the invoice
// pages. ONE place to edit when the details change.
//
// ⚠️ PLACEHOLDER BANK DETAILS — these are NOT real. Replace every field below
// with the actual MatchPulse account before taking live payments.
// ─────────────────────────────────────────────────────────────────────────
export const EFT = {
  bank:        'First National Bank',
  accountName: 'MatchPulse (Pty) Ltd',
  accountType: 'Business Cheque',
  accountNo:   '628 4402 1367',
  branchCode:  '250655',
  email:       'billing@matchpulse.co.za',
}

export const INVOICE_STATUS = {
  outstanding: { label: 'Outstanding', pill: 'warn'  },
  paid:        { label: 'Paid',        pill: 'ok'    },
  void:        { label: 'Void',        pill: 'muted' },
}

export const statusOf = (s) => INVOICE_STATUS[s] ?? { label: s, pill: 'muted' }
