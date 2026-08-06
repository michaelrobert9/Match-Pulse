// ─────────────────────────────────────────────────────────────────────────
// EFT / invoice billing constants shared by the Products page and the invoice
// pages. ONE place to edit when the details change.
//
// Account number confirmed by the owner (FNB 62791013982). accountName and
// accountType still to be confirmed against the bank's records — update them
// here if what the bank has differs.
// ─────────────────────────────────────────────────────────────────────────
export const EFT = {
  bank:        'First National Bank (FNB)',
  accountName: 'MatchPulse',
  accountType: 'Cheque Account',
  accountNo:   '6279 101 3982',
  branchCode:  '250655', // FNB universal branch code
  email:       'billing@matchpulse.co.za',
}

export const INVOICE_STATUS = {
  outstanding: { label: 'Outstanding', pill: 'warn'  },
  paid:        { label: 'Paid',        pill: 'ok'    },
  void:        { label: 'Void',        pill: 'muted' },
}

export const statusOf = (s) => INVOICE_STATUS[s] ?? { label: s, pill: 'muted' }
