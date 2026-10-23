import { supabase } from '@/core/supabase';
import type { DocType } from './model';

const MAX_SIDE = 1600;
const MAX_PDF = 2 * 1024 * 1024;

/** ضغط الصورة في المتصفح قبل الرفع: أقصى ضلع 1600 بكسل، WebP (أو JPEG لو المتصفح مش بيدعمه) */
export async function compressImage(file: File, quality = 0.72): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let width: number, height: number, source: CanvasImageSource;
  if (bitmap) {
    ({ width, height } = bitmap);
    source = bitmap;
  } else {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('الصورة مش مقروءة'));
      i.src = URL.createObjectURL(file);
    });
    width = img.naturalWidth;
    height = img.naturalHeight;
    source = img;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  bitmap?.close();
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  let blob = await toBlob('image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', quality);
  // لو لسه كبيرة، نقلل الجودة شوية
  if (blob && blob.size > 600 * 1024) blob = (await toBlob(blob.type, 0.55)) || blob;
  if (!blob) throw new Error('مقدرتش أضغط الصورة');
  return blob;
}

export async function uploadCourierDocument(p: {
  officeId: string;
  courierId: string;
  docType: DocType;
  file: File;
  expiresAt?: string | null;
  notes?: string;
}) {
  let body: Blob;
  let ext: string;
  if (p.file.type === 'application/pdf') {
    if (p.file.size > MAX_PDF) throw new Error('ملف الـ PDF أكبر من 2 ميجا. صوّره كصورة بدل كده.');
    body = p.file;
    ext = 'pdf';
  } else if (p.file.type.startsWith('image/') || /\.(heic|heif)$/i.test(p.file.name)) {
    body = await compressImage(p.file);
    ext = body.type === 'image/webp' ? 'webp' : 'jpg';
  } else {
    throw new Error('ارفع صورة أو PDF بس');
  }
  const path = `${p.officeId}/couriers/${p.courierId}/${p.docType}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from('documents').upload(path, body, { contentType: body.type || 'application/pdf', upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.from('courier_documents').insert({
    office_id: p.officeId,
    courier_id: p.courierId,
    doc_type: p.docType,
    storage_path: path,
    mime_type: body.type || 'application/pdf',
    size_bytes: body.size,
    expires_at: p.expiresAt || null,
    notes: p.notes || null,
  });
  if (error) {
    await supabase.storage.from('documents').remove([path]);
    throw error;
  }
  return { path, size: body.size, originalSize: p.file.size };
}

export async function signedUrl(path: string) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteCourierDocument(id: string, path: string) {
  const { error } = await supabase.from('courier_documents').delete().eq('id', id);
  if (error) throw error;
  await supabase.storage.from('documents').remove([path]);
}

export const kb = (n: number | null | undefined) => (n ? `${Math.max(1, Math.round(n / 1024)).toLocaleString('en-US')} KB` : '—');
