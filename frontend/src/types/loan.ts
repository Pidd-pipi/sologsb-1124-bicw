/** 实寄封流转记录（借出 / 归还）模型。 */

/** 一条流转记录：登记借出时填写前四项，归还时补填后两项。 */
export interface LoanRecord {
  id?: number
  /** 所属实寄封 id */
  coverId: number
  /** 借用人（同行姓名 / 展览或机构名） */
  borrower: string
  /** 借用用途，如 展览、研究 */
  purpose: string
  /** 借出日 YYYY-MM-DD */
  loanDate: string
  /** 约定归还日 YYYY-MM-DD */
  dueDate: string
  /** 实际归还日 YYYY-MM-DD；空串表示尚未归还 */
  returnedDate: string
  /** 归还时品相说明 */
  returnCondition: string
  createdAt: string
  updatedAt: string
}

/** 用途候选值，下拉之外仍允许自行输入。 */
export const LOAN_PURPOSES = ['展览', '研究', '交流', '拍摄', '鉴定', '其他']

/** 生成一条空白流转记录，供表单初始化使用。 */
export function createEmptyLoan(coverId = 0): LoanRecord {
  return {
    coverId,
    borrower: '',
    purpose: '展览',
    loanDate: '',
    dueDate: '',
    returnedDate: '',
    returnCondition: '',
    createdAt: '',
    updatedAt: ''
  }
}
