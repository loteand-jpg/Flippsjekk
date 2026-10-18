import { getCourse } from '../../config/courses';
import type { CoursePurchase } from '../../domain/schemas';
import { uuid } from '../../lib/ids';
import { ServiceError, type CourseAccess, type CoursePurchaseResult, type CourseService, type VippsCoursePending } from '../types';
import type { MockContext } from './context';

/** Norsk mobilnummer (8 siffer, starter på 4 eller 9). Returnerer null hvis ugyldig. */
export function normalizeNorwegianMobile(raw: string): string | null {
  const digits = raw.replace(/[\s+\-]/g, '').replace(/^0047|^47(?=\d{8}$)/, '');
  return /^[49]\d{7}$/.test(digits) ? digits : null;
}

/**
 * Kurs kjøpes med engangsbetaling via Vipps og gir varig tilgang. Betalingen er «pending» til Vipps har
 * bekreftet, og tilgang gis først da. Prisen kommer alltid fra kurskatalogen.
 */
export class MockCourseService implements CourseService {
  private readonly pending = new Map<string, { uid: string; courseId: string; amount: number; expiresAt: number }>();

  constructor(private readonly ctx: MockContext) {}

  private find(uid: string, courseId: string): CoursePurchase | null {
    return this.ctx.db.read((s) => s.coursePurchases.find((p) => p.userId === uid && p.courseId === courseId) ?? null);
  }

  async getAccess(courseId: string): Promise<CourseAccess> {
    const uid = this.ctx.uid();
    const purchase = this.find(uid, courseId);
    return { courseId, owned: purchase !== null, purchase };
  }

  async listPurchases(): Promise<CoursePurchase[]> {
    const uid = this.ctx.uid();
    return this.ctx.db.read((s) => s.coursePurchases.filter((p) => p.userId === uid).sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)));
  }

  async startPurchase(input: { courseId: string; phone: string }): Promise<CoursePurchaseResult> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const course = getCourse(input.courseId);
    if (!course) throw new ServiceError('not_found', 'Fant ikke kurset.');
    if (course.status !== 'available' || course.price === null) throw new ServiceError('conflict', 'Kurset er ikke til salgs ennå.');
    if (this.find(uid, course.id)) throw new ServiceError('conflict', 'Du har allerede kjøpt dette kurset og har tilgang.');
    const digits = normalizeNorwegianMobile(input.phone);
    if (!digits) throw new ServiceError('validation', 'Skriv inn et norsk mobilnummer med 8 siffer (starter på 4 eller 9).');
    const now = this.ctx.now().getTime();
    const paymentId = `pay_${uuid().slice(0, 8)}`;
    const expiresAt = now + 5 * 60_000;
    this.pending.set(paymentId, { uid, courseId: course.id, amount: course.price, expiresAt });
    const result: VippsCoursePending = {
      kind: 'vipps_pending',
      paymentId,
      phoneMasked: `+47 ${digits[0]}•• •• ${digits.slice(-3)}`,
      courseId: course.id,
      amount: course.price,
      expiresAt: new Date(expiresAt).toISOString(),
    };
    return result;
  }

  hasPending(id: string): boolean {
    return this.pending.has(id);
  }

  /**
   * Simulerer brukerens valg i Vipps og Vipps' bekreftelse til serveren (webhook i produksjon).
   * Idempotent mot dobbeltkjøp: finnes kjøpet allerede, opprettes det ikke på nytt.
   */
  async decideVipps(paymentId: string, outcome: 'approved' | 'rejected') {
    await this.ctx.delay();
    const p = this.pending.get(paymentId);
    if (!p) throw new ServiceError('not_found', 'Fant ikke Vipps-betalingen. Den kan ha utløpt – start på nytt.');
    this.pending.delete(paymentId);
    const uid = this.ctx.uid();
    if (p.uid !== uid) throw new ServiceError('forbidden', 'Betalingen tilhører en annen konto.');
    const now = this.ctx.now();
    if (now.getTime() > p.expiresAt) throw new ServiceError('conflict', 'Vipps-betalingen utløp før den ble godkjent. Start på nytt.');
    if (outcome === 'rejected') return { status: 'rejected' as const, subscription: null, purchase: null };
    const purchase = this.ctx.db.transaction((d) => {
      const existing = d.coursePurchases.find((x) => x.userId === uid && x.courseId === p.courseId);
      if (existing) return existing;
      const row: CoursePurchase = { id: uuid(), userId: uid, courseId: p.courseId, amountPaid: p.amount, provider: 'vipps', paymentId, purchasedAt: now.toISOString() };
      d.coursePurchases.push(row);
      return row;
    });
    return { status: 'approved' as const, subscription: null, purchase };
  }
}
