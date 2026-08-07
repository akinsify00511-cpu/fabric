/**
 * AVENIZE INTERNATIONALIZATION (i18n) & LOCALE
 * 
 * Supports: English, Yoruba, Hausa, Igbo, French, Spanish, Arabic, Portuguese, Chinese, Hindi
 * 
 * Status: Scaffolded - Translation strings need completion
 * To enable: Set multiLanguage: true in features.ts and add translations
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export type Language = {
  code: string
  name: string
  nativeName: string
  dir: 'ltr' | 'rtl'
  flag: string
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', flag: '🇺🇸' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Èdè Yorùbá', dir: 'ltr', flag: '🇳🇬' },
  { code: 'ha', name: 'Hausa', nativeName: 'Harshen Hausa', dir: 'ltr', flag: '🇳🇬' },
  { code: 'ig', name: 'Igbo', nativeName: 'Asụsụ Igbo', dir: 'ltr', flag: '🇳🇬' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', flag: '🇪🇸' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr', flag: '🇵🇹' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr', flag: '🇨🇳' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr', flag: '🇮🇳' },
]

type Locale = {
  language: string
  date_format: string
  time_format: string
  number_format: string
  currency_display: string
  timezone: string
}

const DEFAULT_LOCALE: Locale = {
  language: 'en',
  date_format: 'YYYY-MM-DD',
  time_format: '24h',
  number_format: 'comma_dot',
  currency_display: 'symbol',
  timezone: 'Africa/Lagos',
}

// Translation strings scaffold
type TranslationKeys = {
  // Common
  dashboard: string
  crm: string
  finance: string
  tasks: string
  projects: string
  chat: string
  people: string
  settings: string
  logout: string
  save: string
  cancel: string
  delete: string
  edit: string
  search: string
  // Dashboard
  welcome: string
  todayOverview: string
  // CRM
  deals: string
  contacts: string
  pipeline: string
  hotDeal: string
  // Finance
  invoices: string
  payments: string
  // Tasks
  myTasks: string
  completed: string
  pending: string
}

const translations: Record<string, Partial<TranslationKeys>> = {
  en: {
    dashboard: 'Dashboard',
    crm: 'CRM',
    finance: 'Finance',
    tasks: 'Tasks',
    projects: 'Projects',
    chat: 'Chat',
    people: 'People',
    settings: 'Settings',
    logout: 'Logout',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
    welcome: 'Welcome back',
    todayOverview: "Today's Overview",
    deals: 'Deals',
    contacts: 'Contacts',
    pipeline: 'Pipeline',
    hotDeal: 'Hot Deal',
    invoices: 'Invoices',
    payments: 'Payments',
    myTasks: 'My Tasks',
    completed: 'Completed',
    pending: 'Pending',
  },
  yo: {
    dashboard: 'Ẹ̀bù ilé',
    crm: 'CRM',
    finance: 'Owo',
    tasks: 'Iṣẹ́',
    projects: 'Àwọn iṣẹ́',
    chat: 'Ọ̀rọ̀',
    people: 'Àwọn ènìyàn',
    settings: 'Ètò',
    logout: 'Jáde',
    save: 'Fọ̀kọ̀',
    cancel: 'Kọ̀',
    delete: 'Pa',
    edit: 'Ṣàtúnṣe',
    search: 'Wa',
    welcome: 'Káàbọ̀ padà',
    todayOverview: 'Àkọ́sílẹ̀ òní',
    deals: 'Àwọn ipèsi',
    contacts: 'Àwọn ẹ̀bí',
    pipeline: 'Ibiti',
    hotDeal: 'Ipèsi búburú',
    invoices: 'Awọn iwe-owo',
    payments: 'Awọn sisanwo',
    myTasks: 'Awọn iṣẹ́ mi',
    completed: 'Ti parí',
    pending: 'Ti fojú',
  },
  ha: {
    dashboard: 'Dashboard',
    crm: 'CRM',
    finance: 'Kuɗi',
    tasks: 'Aikayi',
    projects: 'Ayyukan',
    chat: 'Zagi',
    people: 'Mutane',
    settings: 'Saituna',
    logout: 'Fita',
    save: 'Ajiye',
    cancel: 'Soke',
    delete: 'Goge',
    edit: 'Shirya',
    search: 'Nema',
    welcome: 'Barka da komawa',
    todayOverview: 'Bayani na yau',
    deals: 'Yard',
    contacts: 'Masu tuntuɓi',
    pipeline: 'Gudanarwa',
    hotDeal: 'Hulda mai zafi',
    invoices: 'Takardu',
    payments: 'Biyan kuɗi',
    myTasks: 'Ayyukana',
    completed: 'Anayi cikakke',
    pending: 'Aka jiran',
  },
  ig: {
    dashboard: 'Ncheta',
    crm: 'CRM',
    finance: 'Mmanụ̀',
    tasks: 'Nke a zụrụ',
    projects: 'Meba',
    chat: 'Okwu',
    people: 'Ndị mmadụ',
    settings: 'Nhazi',
    logout: 'Pụọ',
    save: 'Chee',
    cancel: 'Kagbuo',
    delete: 'Mechie',
    edit: 'Dezie',
    search: 'Chọọ',
    welcome: 'Nwere anya',
    todayOverview: 'Ncheta taa',
    deals: 'Ndewere',
    contacts: 'Ndị na-akpakọrọ',
    pipeline: 'Akụkọ',
    hotDeal: 'Ndewere kpaliri',
    invoices: 'Akụkọ ego',
    payments: 'Mmanụ ego',
    myTasks: 'M ga eme',
    completed: 'Emechara',
    pending: 'Na-echere',
  },
  fr: {
    dashboard: 'Tableau de bord',
    crm: 'CRM',
    finance: 'Finance',
    tasks: 'Tâches',
    projects: 'Projets',
    chat: 'Discussion',
    people: 'Personnes',
    settings: 'Paramètres',
    logout: 'Déconnexion',
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    search: 'Rechercher',
    welcome: 'Bon retour',
    todayOverview: "Aperçu d'aujourd'hui",
    deals: 'Offres',
    contacts: 'Contacts',
    pipeline: 'Pipeline',
    hotDeal: 'Affaire chaude',
    invoices: 'Factures',
    payments: 'Paiements',
    myTasks: 'Mes tâches',
    completed: 'Terminées',
    pending: 'En attente',
  },
  es: {
    dashboard: 'Panel',
    crm: 'CRM',
    finance: 'Finanzas',
    tasks: 'Tareas',
    projects: 'Proyectos',
    chat: 'Chat',
    people: 'Personas',
    settings: 'Configuración',
    logout: 'Cerrar sesión',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    search: 'Buscar',
    welcome: 'Bienvenido',
    todayOverview: 'Resumen de hoy',
    deals: 'Negocios',
    contacts: 'Contactos',
    pipeline: 'Embudo',
    hotDeal: 'Negocio urgente',
    invoices: 'Facturas',
    payments: 'Pagos',
    myTasks: 'Mis tareas',
    completed: 'Completadas',
    pending: 'Pendientes',
  },
  ar: {
    dashboard: 'لوحة القيادة',
    crm: 'إدارة العملاء',
    finance: 'المالية',
    tasks: 'المهام',
    projects: 'المشاريع',
    chat: 'الدردشة',
    people: 'الأشخاص',
    settings: 'الإعدادات',
    logout: 'تسجيل الخروج',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    search: 'بحث',
    welcome: 'مرحبًا بعودتك',
    todayOverview: 'نظرة عامة اليوم',
    deals: 'صفقات',
    contacts: 'جهات الاتصال',
    pipeline: 'المحفل',
    hotDeal: 'صفقة ساخنة',
    invoices: 'الفواتير',
    payments: 'المدفوعات',
    myTasks: 'مهامي',
    completed: 'مكتمل',
    pending: 'قيد الانتظار',
  },
  pt: {
    dashboard: 'Painel',
    crm: 'CRM',
    finance: 'Finanças',
    tasks: 'Tarefas',
    projects: 'Projetos',
    chat: 'Chat',
    people: 'Pessoas',
    settings: 'Configurações',
    logout: 'Sair',
    save: 'Salvar',
    cancel: 'Cancelar',
    delete: 'Excluir',
    edit: 'Editar',
    search: 'Pesquisar',
    welcome: 'Bem-vindo de volta',
    todayOverview: 'Visão geral de hoje',
    deals: 'Negócios',
    contacts: 'Contatos',
    pipeline: 'Funil',
    hotDeal: 'Negócio quente',
    invoices: 'Faturas',
    payments: 'Pagamentos',
    myTasks: 'Minhas tarefas',
    completed: 'Concluídas',
    pending: 'Pendentes',
  },
  zh: {
    dashboard: '仪表板',
    crm: '客户管理',
    finance: '财务',
    tasks: '任务',
    projects: '项目',
    chat: '聊天',
    people: '人员',
    settings: '设置',
    logout: '退出',
    save: '保存',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    search: '搜索',
    welcome: '欢迎回来',
    todayOverview: '今日概览',
    deals: '交易',
    contacts: '联系人',
    pipeline: '管道',
    hotDeal: '热门交易',
    invoices: '发票',
    payments: '付款',
    myTasks: '我的任务',
    completed: '已完成',
    pending: '待处理',
  },
  hi: {
    dashboard: 'डैशबोर्ड',
    crm: 'सीआरएम',
    finance: 'वित्त',
    tasks: 'कार्य',
    projects: 'परियोजनाएं',
    chat: 'चैट',
    people: 'लोग',
    settings: 'सेटिंग्स',
    logout: 'लॉग आउट',
    save: 'सहेजें',
    cancel: 'रद्द करें',
    delete: 'हटाएं',
    edit: 'संपादित करें',
    search: 'खोजें',
    welcome: 'वापसी पर स्वागत है',
    todayOverview: 'आज का अवलोकन',
    deals: 'सौदे',
    contacts: 'संपर्क',
    pipeline: 'पाइपलाइन',
    hotDeal: 'गर्म सौदा',
    invoices: 'चालान',
    payments: 'भुगतान',
    myTasks: 'मेरे कार्य',
    completed: 'पूर्ण',
    pending: 'लंबित',
  },
}

type LocaleContextType = {
  locale: Locale
  loading: boolean
  setLanguage: (code: string) => void
  t: (key: keyof TranslationKeys, fallback?: string) => string
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)
  const [loading] = useState(false)

  const language = LANGUAGES.find((l) => l.code === locale.language) || LANGUAGES[0]

  useEffect(() => {
    document.documentElement.dir = language.dir
    document.documentElement.lang = language.code
  }, [language])

  const setLanguage = useCallback((code: string) => {
    setLocale(prev => ({ ...prev, language: code }))
  }, [])

  const t = useCallback((key: keyof TranslationKeys, fallback?: string): string => {
    const langTranslations = translations[locale.language]
    if (langTranslations && langTranslations[key]) {
      return langTranslations[key]!
    }
    // Fallback to English
    if (translations.en[key]) {
      return translations.en[key]!
    }
    return fallback || key
  }, [locale.language])

  return (
    <LocaleContext.Provider value={{ locale, loading, setLanguage, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used within LocaleProvider')
  return context
}

// Alias for compatibility with i18n.tsx conventions
export function useTranslation() {
  return useLocale()
}
