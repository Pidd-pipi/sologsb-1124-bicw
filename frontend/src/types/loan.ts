/**
 * 实寄封流转记录（CoverLoan）：一次借出与归还的登记事实。
 * 同一封同时只允许存在一条未归还（returnDate 为空）的记录。
 */

/** 实寄封借出 / 归还记录 */
export interface CoverLoan {
  id?: number
  /** 所属实寄封 id */
  coverId: number
  /** 借用人，如 展览主办方 / 同行藏友 */
  borrower: string
  /** 用途，如 专题展览、对照研究 */
  purpose: string
  /** 借出日期 YYYY-MM-DD */
  loanDate: string
  /** 约定归还日期 YYYY-MM-DD */
  dueDate: string
  /** 实际归还日期 YYYY-MM-DD，未归还为空串 */
  returnDate: string
  /** 归还时的品相说明 */
  returnCondition: string
  createdAt: string
  updatedAt: string
}

/** 该记录是否仍处于外借中（未登记实际归还日）。 */
export function isLoanActive(loan: CoverLoan | null | undefined): loan is CoverLoan {
  return !!loan && !loan.returnDate
}

/** 从一组流转记录里找出当前未归还的那条；异常情况下有多条时取最近借出的一条。 */
export function activeLoanOf(records: CoverLoan[]): CoverLoan | null {
  const open = records.filter((r) => !r.returnDate)
  if (!open.length) return null
  return open.reduce((latest, r) => (r.loanDate > latest.loanDate ? r : latest))
}

/**
 * 逾期天数：约定归还日已过且仍未归还时，返回 today - dueDate 的自然日天数；
 * 约定日当天归还不算逾期；其余情况返回 0。
 */
export function loanOverdueDays(
  loan: CoverLoan | null | undefined,
  today: string
): number {
  if (!isLoanActive(loan) || !loan.dueDate) return 0
  if (today <= loan.dueDate) return 0
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${loan.dueDate}T00:00:00Z`)
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.round(ms / 86400000)
}

/** 生成一条空白借出记录，借出日默认今天，供表单初始化使用。 */
export function createEmptyLoan(coverId: number, today: string): CoverLoan {
  return {
    coverId,
    borrower: '',
    purpose: '',
    loanDate: today,
    dueDate: '',
    returnDate: '',
    returnCondition: '',
    createdAt: '',
    updatedAt: ''
  }
}
