<script setup lang="ts">
import type { MessageSchema } from '../../locales/schema'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  quote: string
  author: string
  link: string
}>()
const { t } = useI18n<MessageSchema>({
  useScope: 'global'
})
</script>

<template>
  <div>
    <blockquote>
      <p>
        {{ t(props.quote) }}
        <cite>
          <a :href="t(props.link)" target="_blank">{{
            t(props.author)
          }}</a>
        </cite>
      </p>
    </blockquote>
  </div>
</template>
