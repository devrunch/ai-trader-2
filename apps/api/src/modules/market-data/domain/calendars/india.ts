interface Holiday { date: string; name: string; eveningOnly: boolean }

// source: NSE/CMTR/71775, NSE/FAOP/71777 (2025-12-12), BSE notice 20251212-8.
// https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf
// source: election amendment NSE/CMTR/72260 (2026-01-12), NSE/FAOP/72262.
// https://nsearchives.nseindia.com/content/circulars/CMTR72260.pdf
// eveningOnly is a curated MCX flag (MCX/TRD/636/2025, MCX/TRD/017/2026).
// source: https://www.hdfcsec.com/mcx-holidays-list (reproduces MCX/TRD/636/2025).
// source: https://bigul.co/pdf/circular-017---2026%201.pdf (MCX/TRD/017/2026).
// The task deliberately shares NSE holiday dates with MCX; this is not the full MCX calendar.
export const INDIA_HOLIDAYS: readonly Holiday[] = [
  { date: '2026-01-15', name: 'Maharashtra municipal election', eveningOnly: true },
  { date: '2026-01-26', name: 'Republic Day', eveningOnly: false },
  { date: '2026-02-15', name: 'Mahashivratri', eveningOnly: false },
  { date: '2026-03-03', name: 'Holi', eveningOnly: true },
  { date: '2026-03-21', name: 'Id-Ul-Fitr', eveningOnly: false },
  { date: '2026-03-26', name: 'Shri Ram Navami', eveningOnly: true },
  { date: '2026-03-31', name: 'Shri Mahavir Jayanti', eveningOnly: true },
  { date: '2026-04-03', name: 'Good Friday', eveningOnly: false },
  { date: '2026-04-14', name: 'Dr. Baba Saheb Ambedkar Jayanti', eveningOnly: true },
  { date: '2026-05-01', name: 'Maharashtra Day', eveningOnly: true },
  { date: '2026-05-28', name: 'Bakri Id', eveningOnly: true },
  { date: '2026-06-26', name: 'Muharram', eveningOnly: true },
  { date: '2026-08-15', name: 'Independence Day', eveningOnly: false },
  { date: '2026-09-14', name: 'Ganesh Chaturthi', eveningOnly: true },
  { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti', eveningOnly: false },
  { date: '2026-10-20', name: 'Dussehra', eveningOnly: true },
  { date: '2026-11-08', name: 'Diwali Laxmi Pujan', eveningOnly: false },
  { date: '2026-11-10', name: 'Diwali-Balipratipada', eveningOnly: true },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti', eveningOnly: true },
  { date: '2026-12-25', name: 'Christmas', eveningOnly: false },
];

// source: NSE/CMTR/71775, page 2. The time is the task's curated window.
export const MUHURAT_2026 = '2026-11-08'; // confirm yearly
