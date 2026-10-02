/** PostgreSQL sequences behind the readable codes (migration CodeSequences). */
export const CODE_SEQUENCES = {
  APT: 'public.seq_appointment_number',
  CONS: 'public.seq_consultation_number',
  REC: 'public.seq_recipe_number',
  PAC: 'public.seq_patient_code',
} as const;

export type CodePrefix = keyof typeof CODE_SEQUENCES;

/** Next `<PREFIX>-<YYYY>-<NNNNN>`: nextval is atomic, unlike reading the max and adding one. */
export async function nextCode(
  runner: { query: (sql: string) => Promise<any> },
  prefix: CodePrefix,
): Promise<string> {
  const [{ value }] = await runner.query(`SELECT nextval('${CODE_SEQUENCES[prefix]}') AS value`);
  return `${prefix}-${new Date().getFullYear()}-${String(value).padStart(5, '0')}`;
}
