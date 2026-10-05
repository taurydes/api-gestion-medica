import { MammographyAnalysisPrediction } from '../entities/mammography-analysis.entity';
import { NEUTRAL_LABELS } from './detector.client';

const LEGACY_LABEL = /bi-?rads/i;

/**
 * Safety net on read (MJ-36): any `label` inside the stored detector response that still carries the
 * legacy BI-RADS wording is replaced by the neutral class name; everything else is returned untouched.
 */
export function neutralizeLabels<T>(raw: T, prediction: MammographyAnalysisPrediction | null | undefined): T {
  if (!prediction || raw === null || typeof raw !== 'object') return raw;
  if (Array.isArray(raw)) return raw.map((item) => neutralizeLabels(item, prediction)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] =
      key === 'label' && typeof value === 'string' && LEGACY_LABEL.test(value)
        ? NEUTRAL_LABELS[prediction]
        : neutralizeLabels(value, prediction);
  }
  return out as T;
}
