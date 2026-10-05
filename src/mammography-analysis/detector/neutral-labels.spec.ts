import { MammographyAnalysisPrediction } from '../entities/mammography-analysis.entity';
import { neutralizeLabels } from './neutral-labels';

const legacyRaw = {
  label: 'Sospechoso de malignidad',
  prediction: 'MALIGNO',
  probability: 99.21,
  raw: { label: 'Neoplasia Maligna (BI-RADS 4/5)', status: 'danger', prediction: 'MALIGNO', probability: 99.21 },
};

describe('neutralizeLabels — legacy BI-RADS wording never leaves the API (MJ-36, QA H-04)', () => {
  it('rewrites the nested raw.label of a malignant analysis and keeps every other field', () => {
    const out = neutralizeLabels(legacyRaw, MammographyAnalysisPrediction.MALIGNANT);

    expect(out.raw.label).toBe('Sospechoso de malignidad');
    expect(out).toMatchObject({ prediction: 'MALIGNO', probability: 99.21, raw: { status: 'danger', probability: 99.21 } });
    expect(JSON.stringify(out)).not.toMatch(/BI-RADS/i);
  });

  it('uses the benign wording for a benign analysis', () => {
    const out = neutralizeLabels(
      { raw: { label: 'Hallazgos Benignos (BI-RADS 1/2)' } },
      MammographyAnalysisPrediction.BENIGN,
    );
    expect(out.raw.label).toBe('No sospechoso');
  });

  it('leaves neutral labels, non-label strings and nulls as they are', () => {
    const clean = { label: 'No sospechoso', note: 'BI-RADS mentioned by the doctor', raw: { label: 'No sospechoso' } };
    expect(neutralizeLabels(clean, MammographyAnalysisPrediction.BENIGN)).toEqual(clean);
    expect(neutralizeLabels(null, MammographyAnalysisPrediction.BENIGN)).toBeNull();
    expect(neutralizeLabels(legacyRaw, null)).toBe(legacyRaw);
  });

  it('does not mutate the stored object', () => {
    const copy = JSON.parse(JSON.stringify(legacyRaw));
    neutralizeLabels(legacyRaw, MammographyAnalysisPrediction.MALIGNANT);
    expect(legacyRaw).toEqual(copy);
  });
});
