const KNOWN: [RegExp, string][] = [
  [/SEAT_LIMIT_REACHED/i, 'وصلت للحد الأقصى من الحسابات للدور ده. زوّد الحسابات من الاشتراك.'],
  [/LAST_OWNER/i, 'لازم يفضل صاحب مكتب واحد على الأقل.'],
  [/NOT_ALLOWED|permission denied|42501/i, 'مش مسموح لك تعمل الإجراء ده.'],
  [/row-level security/i, 'مش مسموح لك تعمل الإجراء ده، أو اشتراك المكتب موقوف.'],
  [/Invalid login credentials/i, 'الإيميل أو كلمة السر غلط.'],
  [/Email not confirmed/i, 'الإيميل لسه متأكدش.'],
  [/couriers_office_id_national_id_key/i, 'الرقم القومي ده متسجل لمندوب تاني في المكتب.'],
  [/STAGE_NOTE_REQUIRED/i, 'لازم تكتب السبب لما تحوّل المندوب لغير نشط أو محظور.'],
  [/ACTIVE_LIMIT_REACHED/i, 'وصلت للحد الأقصى من المناديب النشطين في الاشتراك. كلم فريق Masar Pro تزوّد الحد.'],
  [/INVALID_NATIONAL_ID|couriers_national_id_check/i, 'الرقم القومي غير صحيح.'],
  [/exceeded the maximum allowed size|Payload too large/i, 'الملف كبير. أقصى حجم 2 ميجا.'],
  [/mime type .* is not supported|invalid_mime_type/i, 'نوع الملف مش مسموح. ارفع صورة أو PDF.'],
  [/violates foreign key constraint.*carrier/i, 'الشركة دي مستخدمة في تعاقدات، أوقفها بدل ما تمسحها.'],
  [/METHOD_REQUIRED/i, 'اختار طريقة التحويل.'],
  [/PAID_BY_REQUIRED/i, 'اختار الموظف اللي حوّل.'],
  [/EMPTY_FILE/i, 'الملف مفيهوش مناديب.'],
  [/custody_office_id_month_member_id_key/i, 'العُهدة متسجلة للموظف ده في الشهر ده.'],
  [/violates foreign key constraint.*payroll_runs_carrier/i, 'الشركة دي ليها شيتات مرتبات، أوقفها بدل ما تمسحها.'],
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
