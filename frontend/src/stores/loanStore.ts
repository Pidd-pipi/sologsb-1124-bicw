import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '@/utils/db'
import type { LoanRecord } from '@/types/loan'
import { nowIso } from '@/utils/id'
import { daysBetween } from '@/utils/dateRange'
import { activeLoanOf, loanStatus, type LoanStatus } from '@/utils/loan'

/**
 * 实寄封流转（借出 / 归还）记录。
 * 业务规则：同一封存在未归还记录期间，不允许再登记新的借出。
 */
export const useLoanStore = defineStore('loan', () => {
  const list = ref<LoanRecord[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      list.value = await db.loans.toArray()
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** 某一封的全部流转记录，按借出日倒序（最近一次在前）。 */
  function loansOf(coverId: number | null | undefined): LoanRecord[] {
    if (coverId == null) return []
    return list.value
      .filter((r) => r.coverId === coverId)
      .sort((a, b) => {
        if (a.loanDate !== b.loanDate) return a.loanDate < b.loanDate ? 1 : -1
        return (b.id ?? 0) - (a.id ?? 0)
      })
  }

  /** 当前未归还的那一条；正常业务下同一封至多一条。 */
  function activeOf(coverId: number | null | undefined): LoanRecord | null {
    if (coverId == null) return null
    return activeLoanOf(list.value.filter((r) => r.coverId === coverId))
  }

  /** 当前借出状态（含逾期天数），供详情页与目录共用。 */
  function statusOf(coverId: number | null | undefined): LoanStatus {
    return loanStatus(activeOf(coverId))
  }

  /** 各封当前未归还记录，按 coverId 索引，供目录批量展示。 */
  const activeByCover = computed<Map<number, LoanRecord>>(() => {
    const map = new Map<number, LoanRecord>()
    for (const rec of list.value) {
      if (!rec.returnedDate) map.set(rec.coverId, rec)
    }
    return map
  })

  const onLoanCount = computed(() => activeByCover.value.size)
  const overdueCount = computed(
    () => [...activeByCover.value.values()].filter((r) => loanStatus(r).overdue).length
  )

  /** 登记一笔借出；同一封未归还期间再借会被拒绝。 */
  async function createLoan(input: {
    coverId: number
    borrower: string
    purpose: string
    loanDate: string
    dueDate: string
  }): Promise<number> {
    const borrower = input.borrower.trim()
    const purpose = input.purpose.trim()
    if (!borrower) throw new Error('请填写借用人')
    if (!input.loanDate) throw new Error('请选择借出日')
    if (!input.dueDate) throw new Error('请选择约定归还日')
    const span = daysBetween(input.loanDate, input.dueDate)
    if (span == null) throw new Error('借出或归还日期填写有误')
    if (span < 0) throw new Error('约定归还日不能早于借出日')
    if (activeOf(input.coverId)) {
      throw new Error('该封尚有未归还的借出记录，归还后才能再次借出')
    }
    const now = nowIso()
    const record: LoanRecord = {
      coverId: input.coverId,
      borrower,
      purpose,
      loanDate: input.loanDate,
      dueDate: input.dueDate,
      returnedDate: '',
      returnCondition: '',
      createdAt: now,
      updatedAt: now
    }
    const id = await db.loans.add(record)
    await load()
    return id
  }

  /** 归还登记：补填实际归还日与品相说明。 */
  async function returnLoan(
    id: number,
    patch: { returnedDate: string; returnCondition: string }
  ): Promise<void> {
    if (!patch.returnedDate) throw new Error('请选择实际归还日')
    const existing = await db.loans.get(id)
    if (!existing) throw new Error('流转记录不存在')
    if (existing.loanDate && daysBetween(existing.loanDate, patch.returnedDate)! < 0) {
      throw new Error('实际归还日不能早于借出日')
    }
    await db.loans.update(id, {
      returnedDate: patch.returnedDate,
      returnCondition: patch.returnCondition.trim(),
      updatedAt: nowIso()
    })
    await load()
  }

  /** 删除一条流转记录（详情页历史维护用）。 */
  async function removeLoan(id: number): Promise<void> {
    await db.loans.delete(id)
    await load()
  }

  /** 删除实寄封时级联清除其全部流转记录。 */
  async function removeForCover(coverId: number): Promise<void> {
    const rows = await db.loans.where('coverId').equals(coverId).toArray()
    const ids = rows.map((r) => r.id).filter((v): v is number => typeof v === 'number')
    if (ids.length) await db.loans.bulkDelete(ids)
    if (loaded.value) await load()
  }

  return {
    list,
    loading,
    loaded,
    activeByCover,
    onLoanCount,
    overdueCount,
    load,
    loansOf,
    activeOf,
    statusOf,
    createLoan,
    returnLoan,
    removeLoan,
    removeForCover
  }
})
