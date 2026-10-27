const OCCUPANCY_LABELS = [
  'Empty',
  'Many seats available',
  'Few seats available',
  'Standing room only',
  'Crushed standing room only',
  'Full',
  'Not accepting passengers',
];

const CONGESTION_LABELS = [
  null,
  'Running smoothly',
  'Stop and go',
  'Congested',
  'Severe congestion',
];

const CURRENT_STATUS_LABELS = ['Incoming', 'Stopped at stop', 'In transit'];

export function occupancyLabel(value) {
  if (value === null || value === undefined) return null;
  return OCCUPANCY_LABELS[value] ?? null;
}

export function congestionLabel(value) {
  if (value === null || value === undefined) return null;
  return CONGESTION_LABELS[value] ?? null;
}

export function currentStatusLabel(value) {
  if (value === null || value === undefined) return null;
  return CURRENT_STATUS_LABELS[value] ?? null;
}

export function speedKmh(speed) {
  if (speed === null || speed === undefined || Number.isNaN(Number(speed))) return null;
  return Math.round(Number(speed) * 3.6);
}
