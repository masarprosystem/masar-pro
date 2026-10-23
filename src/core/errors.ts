const KNOWN: [RegExp, string][] = [
  [/SEAT_LIMIT_REACHED/i, 'وصلت للحد الأقصى من الحسابات للدور ده. زوّد الحسابات من الاشتراك.'],
  [/LAST_OWNER/i, 'لازم يفضل صاحب مكتب واحد على الأقل.'],
  [/NOT_ALLOWED|permission denied|42501/i, 'مش مسموح لك تعمل الإجراء ده.'],
  [/row-level security/i, 'مش مسموح لك تعمل الإجراء ده، أو اشتراك المكتب موقوف.'],
  [/Invalid login credentials/i, 'الإيميل أو كلمة السر غلط.'],
  [/Email not confirmed/i, 'الإيميل لسه متأكدش.'],
  [/duplicate key value/i, 'البيان ده متسجل قبل كده.'],
  [/Failed to fetch|NetworkError|Failed to send a request/i, 'مفيش اتصال بالسيرفر. اتأكد من الإنترنت.'],
  [/password.*(short|at least|weak|characters)/i, 'كلمة السر ضعيفة. لازم 8 حروف على الأقل.'],
];

export function errorMessage(err: unknown): string {
  const raw =
    typeof err === 'string'
      ? err
      : (err as { message?: string })?.message || (err as { error?: string })?.error || 'حصل خطأ غير متوقع';
  for (const [re, msg] of KNOWN) if (re.test(raw)) return msg;
  return raw.replace(/^[A-Z_]+:\s*/, '');
}
