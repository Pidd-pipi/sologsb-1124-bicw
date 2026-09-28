/**
 * 实寄封流转记录的状态计算：当前借出、逾期天数等。
 * 详情页与封目录（卡片 / 表格）共用，保证口径一致。
 */
import type { LoanRecord } from '@/types/loan'
import { daysBetween, isValidDate } from '@/utils/dateRange'

/** 一条流转记录是否尚未归还。 */
export function isOnLoan(loan: LoanRecord | null | undefined): boolean {
  return !!loan && !loan.returnedDate
}

/** 今天的本地日期 YYYY-MM-DD（不用 toISOString，避免时区偏移）。 */
export function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface LoanStatus {
  /** 当前是否借出在外（有未归还记录） */
  onLoan: boolean
  /** 约定归还日是否已过且仍未归还 */
  overdue: boolean
  /** 逾期天数（约定归还日次日起算）；未逾期或日期非法为 null */
  overdueDays: number | null
  /** 距约定归还日还有几天；已过期为负，未设日期为 null */
  daysToDue: number | null
}

const IDLE: LoanStatus = { onLoan: false, overdue: false, overdueDays: null, daysToDue: null }

/** 依据一条（通常是最近一条未归还的）流转记录计算当前借出状态。 */
export function loanStatus(loan: LoanRecord | null | undefined, today: string = todayLocal()): LoanStatus {
  if (!isOnLoan(loan) || !isValidDate(loan!.dueDate)) return IDLE
  const diff = daysBetween(loan!.dueDate, today)
  if (diff == null) return IDLE
  // 约定归还日当天不算逾期，次日起算逾期 1 天
  const overdue = diff > 0
  return {
    onLoan: true,
    overdue,
    overdueDays: overdue ? diff : 0,
    daysToDue: diff
  }
}

/**
 * 从一组流转记录中找出当前有效的未归还记录。
 * 正常业务下同一封至多一条；若历史数据异常出现多条，取借出日最近的一条。
 */
export function activeLoanOf(records: LoanRecord[] | null | undefined): LoanRecord | null {
  const active = (records ?? []).filter((r) => !r.returnedDate)
  if (!active.length) return null
  return [...active].sort((a, b) => (a.loanDate < b.loanDate ? 1 : -1))[0]
}

/** 逾期提示文案，如「逾期 12 天」；未逾期返回空串。 */
export function overdueText(loan: LoanRecord | null | undefined, today: string = todayLocal()): string {
  const s = loanStatus(loan, today)
  return s.overdue && s.overdueDays != null ? `逾期 ${s.overdueDays} 天` : ''
}
