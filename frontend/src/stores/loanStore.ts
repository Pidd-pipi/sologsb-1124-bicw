import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '@/utils/db'
import { todayLocal } from '@/utils/dateRange'
import { nowIso } from '@/utils/id'
import {
  activeLoanOf,
  createEmptyLoan,
  loanOverdueDays,
  type CoverLoan
} from '@/types/loan'

export const useLoanStore = defineStore('loan', () => {
  const records = ref<CoverLoan[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  /** 今天（YYYY-MM-DD），逾期天数按此日期计算 */
  const today = ref(todayLocal())

  async function load(): Promise<void> {
    loading.value = true
    try {
      records.value = await db.loans.orderBy('loanDate').reverse().toArray()
      today.value = todayLocal()
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** 某一封的全部流转记录，最近借出的在前。 */
  function recordsOf(coverId: number | null | undefined): CoverLoan[] {
    if (coverId == null) return []
    return records.value
      .filter((r) => r.coverId === coverId)
      .sort((a, b) => b.loanDate.localeCompare(a.loanDate))
  }

  /** 某一封当前未归还的借出记录；不存在返回 null。 */
  function activeOf(coverId: number | null | undefined): CoverLoan | null {
    if (coverId == null) return null
    return activeLoanOf(records.value.filter((r) => r.coverId === coverId))
  }

  /** 某一封是否仍在外借。 */
  function isOnLoan(coverId: number | null | undefined): boolean {
    return activeOf(coverId) != null
  }

  /** 当前外借逾期天数，未外借或未逾期返回 0。 */
  function overdueDaysOf(coverId: number | null | undefined): number {
    return loanOverdueDays(activeOf(coverId), today.value)
  }

  /** 目录页统计：当前外借中的封数。 */
  const activeCount = computed(() => {
    const onLoan = new Set<number>()
    for (const r of records.value) {
      if (!r.returnDate) onLoan.add(r.coverId)
    }
    return onLoan.size
  })

  /**
   * 登记借出。同一封存在未归还记录时拒绝，由调用方提示借用人 / 日期必填。
   */
  async function checkOut(input: {
    coverId: number
    borrower: string
    purpose: string
    loanDate: string
    dueDate: string
  }): Promise<number> {
    if (activeOf(input.coverId)) {
      throw new Error('该封尚未归还，不能重复登记借出')
    }
    const now = nowIso()
    const record: CoverLoan = {
      ...createEmptyLoan(input.coverId, input.loanDate || today.value),
      borrower: input.borrower.trim(),
      purpose: input.purpose.trim(),
      dueDate: input.dueDate,
      createdAt: now,
      updatedAt: now
    }
    const id = await db.loans.add(record)
    await load()
    return id
  }

  /** 登记归还：补填实际归还日与品相说明。 */
  async function checkIn(
    loanId: number,
    input: { returnDate: string; returnCondition: string }
  ): Promise<void> {
    const found = records.value.find((r) => r.id === loanId)
    if (!found) throw new Error('流转记录不存在')
    if (found.returnDate) throw new Error('该次借出已归还，请勿重复登记')
    await db.loans.update(loanId, {
      returnDate: input.returnDate,
      returnCondition: input.returnCondition.trim(),
      updatedAt: nowIso()
    })
    await load()
  }

  /** 删除一条已归档（已归还）的历史记录。 */
  async function remove(loanId: number): Promise<void> {
    const found = records.value.find((r) => r.id === loanId)
    if (!found) return
    if (!found.returnDate) throw new Error('外借中的记录不能删除，请先登记归还')
    await db.loans.delete(loanId)
    await load()
  }

  /** 删除实寄封时级联清理其全部流转记录。 */
  async function removeByCover(coverId: number): Promise<void> {
    const own = await db.loans.where('coverId').equals(coverId).primaryKeys()
    await db.loans.bulkDelete(own)
    await load()
  }

  return {
    records,
    loading,
    loaded,
    today,
    activeCount,
    load,
    recordsOf,
    activeOf,
    isOnLoan,
    overdueDaysOf,
    checkOut,
    checkIn,
    remove,
    removeByCover
  }
})
