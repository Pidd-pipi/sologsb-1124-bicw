<script setup lang="ts">
/** 实寄封外借状态标签：在库 / 外借中 / 已逾期 N 天，卡片与目录表格共用。 */
withDefaults(
  defineProps<{
    /** 是否外借中（存在未归还记录） */
    active?: boolean
    /** 逾期天数，>0 时按逾期样式展示 */
    overdueDays?: number
    size?: 'small' | 'default' | 'large'
  }>(),
  { active: false, overdueDays: 0, size: 'small' }
)
</script>

<template>
  <el-tag v-if="active && overdueDays > 0" :size="size" type="danger" effect="dark">
    已逾期 {{ overdueDays }} 天
  </el-tag>
  <el-tag v-else-if="active" :size="size" type="warning" effect="plain">外借中</el-tag>
  <el-tag v-else :size="size" type="info" effect="plain">在库</el-tag>
</template>
