import { createI18n } from 'vue-i18n'

// All locales are bundled eagerly. To code-split them into per-locale chunks,
// this would need to be changed to lazy loading with async i18n initialization.
const modules = import.meta.glob('./*.json', { eager: true })

const messages = Object.fromEntries(
  Object.entries(modules).map(([key, value]) => {
    const locale = key.match(/\.\/(.*)\.json$/)?.[1]
    return [locale, (value as any).default]
  })
)

export interface NumberSchema {
  currency: {
    style: 'currency'
    currencyDisplay: 'symbol'
    currency: string
  }
}
export type MessageSchema = (typeof messages)['en-US']

export const i18n = createI18n<[MessageSchema], string>({
  locale: 'en-US',
  messages
})
