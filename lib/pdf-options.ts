/**
 * 오답노트 PDF 모양을 바꾸는 '04 표지·서식' 설정을 오답 기록(wrong_answer_records.pdf_options)에 함께 남길 때 쓰는 모양.
 * 관리자 다운목록의 [다시 받기]가 이 값으로 처음과 같은 PDF 를 다시 만든다(lib/reissue.ts).
 *
 * - 학생 이름·학년·교재·문항은 기록의 원래 칸(student_name_raw, grade, textbook, problem_key …)에 이미 있다.
 * - 직접 올린 표지 그림(customCharacter)은 크기가 커서 저장하지 않고 '썼는지'만 남긴다.
 * - 칸이 아직 없으면(supabase/wrong_answer_records_reissue.sql 실행 전) 기록·목록 모두 이 값 없이 그대로 동작한다.
 * 비밀 값·네트워크 없음. 화면·서버 둘 다 쓴다.
 */

import { PDF_DEFAULTS } from './textbook-catalog';

export type PdfOptions = {
  includeCover: boolean;
  includeCharacter: boolean;
  includeSolutionQr: boolean;
  /** 표지 제목(화면 currentCoverTitle: 직접 쓴 제목, 없으면 교재 이름) */
  coverTitle: string;
  academyName: string;
  coverSubtitle: string;
  /** 표지 '응시 일자' 에 찍힌 글자 그대로 */
  testDate: string;
  /** 직접 올린 표지 그림을 썼는지(그림 자체는 저장하지 않음) */
  customCharacter: boolean;
};

/** 기록에만 더하는 칸 이름. 칸이 없을 때 알아보는 데 쓴다. */
export const REISSUE_COLUMNS = ['problem_order', 'pdf_options'] as const;

const TEXT_MAX = 120;

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, TEXT_MAX) : '');

/** 화면이 보낸 값·표에서 읽은 값을 정해진 모양으로만 남긴다. 객체가 아니면 null. */
export function sanitizePdfOptions(raw: unknown): PdfOptions | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    includeCover: bool(o.includeCover, PDF_DEFAULTS.includeCover),
    includeCharacter: bool(o.includeCharacter, PDF_DEFAULTS.includeCharacter),
    includeSolutionQr: bool(o.includeSolutionQr, PDF_DEFAULTS.includeSolutionQr),
    coverTitle: text(o.coverTitle),
    academyName: text(o.academyName),
    coverSubtitle: text(o.coverSubtitle),
    testDate: text(o.testDate),
    customCharacter: o.customCharacter === true,
  };
}

/**
 * PostgREST 오류가 '새 칸(problem_order, pdf_options)이 아직 없음' 때문인지.
 * select 는 42703(column does not exist), insert 는 PGRST204(schema cache 에 칸 없음)로 온다.
 */
export function isMissingReissueColumn(status: number, body: string): boolean {
  if (status !== 400) return false;
  const mentions = REISSUE_COLUMNS.some((name) => body.includes(name));
  return mentions && (body.includes('42703') || body.includes('PGRST204') || /does not exist|could not find/i.test(body));
}
