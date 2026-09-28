/* eslint-disable */
// 冒烟测试：Dexie v2→v3 迁移、借还规则、逾期计算、级联删除。
// 运行：node --import tsx scripts/smoke-loans.mts（在 frontend 目录，依赖 fake-indexeddb）
import 'fake-indexeddb/auto'

// @ 别名由 vite 处理，这里用相对路径
import { db, initDatabase, DB_VERSION } from '../src/utils/db.ts'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error('断言失败：' + msg)
  console.log('  ✓ ' + msg)
}

async function buildLegacyV2(): Promise<void> {
  // 先在一个临时 Dexie 上建 v1/v2 旧结构，模拟升级前的历史库
  const Dexie = (await import('dexie')).default
  const legacy = new Dexie('gbpostmark')
  legacy.version(2).stores({
    postmarks:
      '++id, pmNo, type, office, province, yearFrom, yearTo, scarceLevel, inkColor, bilingual',
    covers:
      '++id, coverNo, sentFrom, sentTo, postDate, conditionGrade, registered, routeId, acquireFrom',
    routes: '++id, routeNo, name, era, transport, totalDays',
    stampEntries: '++id, coverId, stampName, variety, issueYear',
    assets: '++id, ownerType, ownerId, side, [ownerType+ownerId]'
  })
  await legacy.covers.add({
    coverNo: 'CV-9001',
    sentFrom: '测试地',
    sentTo: '测试到',
    postDate: '2000-01-01',
    arriveDate: '',
    franking: [],
    cancelPmIds: [],
    routeId: null,
    viaPoints: [],
    registered: false,
    conditionGrade: '中品',
    acquireFrom: '',
    price: 0,
    storageAlbum: '',
    frontImage: '',
    backImage: '',
    note: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  })
  await legacy.close()
}

async function main(): Promise<void> {
  console.log('场景 1：v2 旧库升级到 v' + DB_VERSION)
  await buildLegacyV2()
  await db.open()
  assert(db.verno === 3, `版本号升级为 3（实际 ${db.verno}）`)
  const oldCover = await db.covers.where('coverNo').equals('CV-9001').first()
  assert(!!oldCover, '旧封数据在升级后保留')
  const loanCount = await db.loans.count()
  assert(loanCount === 0, 'loans 表存在且为空（旧库无流转数据）')
  db.close()
  await new Promise<void>((res) => {
    indexedDB.deleteDatabase('gbpostmark').onsuccess = () => res()
  })

  console.log('场景 2：全新数据库写入样例流转记录')
  await new Promise<void>((res) => {
    indexedDB.deleteDatabase('gbpostmark').onsuccess = () => res()
  })
  await initDatabase()
  const seeded = await db.loans.toArray()
  assert(seeded.length === 3, `样例写入 3 条流转记录（实际 ${seeded.length}）`)
  const cv2 = await db.loans.where('coverId').equals(2).toArray()
  assert(cv2.length === 1 && cv2[0].returnedDate === '', 'CV-0002 有一条未归还记录')

  console.log('场景 3：借还业务规则（用 pinia store）')
  const { setActivePinia, createPinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useLoanStore } = await import('../src/stores/loanStore.ts')
  const store = useLoanStore()
  await store.load()
  assert(store.list.length === 3, 'store 载入 3 条记录')
  assert(!!store.activeOf(2), 'coverId=2 当前在借')
  assert(store.statusOf(1).onLoan === false, 'coverId=1 已归还，不在借')

  const today = new Date().toISOString().slice(0, 10)
  let blocked = false
  try {
    await store.createLoan({
      coverId: 2,
      borrower: '重复借',
      purpose: '展览',
      loanDate: today,
      dueDate: today
    })
  } catch {
    blocked = true
  }
  assert(blocked, '未归还期间再次登记借出被拒绝')

  const newId = await store.createLoan({
    coverId: 4,
    borrower: '新借用人',
    purpose: '研究',
    loanDate: '2026-09-01',
    dueDate: '2026-09-10'
  })
  assert(!!newId, '无在借记录的封可以借出')
  const s = store.statusOf(4)
  assert(s.onLoan && s.overdue && s.overdueDays != null && s.overdueDays > 0, '约定日已过 → 逾期')

  let badDate = false
  try {
    await store.createLoan({
      coverId: 99,
      borrower: 'x',
      purpose: 'x',
      loanDate: '2026-09-20',
      dueDate: '2026-09-01'
    })
  } catch {
    badDate = true
  }
  assert(badDate, '约定归还日早于借出日被拒绝')

  await store.returnLoan(newId, { returnedDate: '2026-09-15', returnCondition: '完好' })
  assert(!store.activeOf(4), '归还后在借记录清空')
  const after = store.loansOf(4)
  assert(after.length === 1 && after[0].returnedDate === '2026-09-15', '历史记录保留实际归还日')
  await store.createLoan({
    coverId: 4,
    borrower: '再次借用',
    purpose: '交流',
    loanDate: '2026-09-20',
    dueDate: '2026-10-20'
  })
  assert(!!store.activeOf(4) && store.loansOf(4).length === 2, '归还后可再次借出，历史保留 2 条')

  console.log('场景 4：删除封级联清理流转记录')
  await store.removeForCover(4)
  assert(store.loansOf(4).length === 0, '级联删除该封全部流转记录')
  assert(store.loansOf(1).length === 1, '其他封的流转记录不受影响')

  db.close()
  console.log('\n全部通过 ✅')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
