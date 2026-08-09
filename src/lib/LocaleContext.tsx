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
  // Pricing
  pricingEyebrow: string
  pricingHeadline: string
  pricingSubheadline: string
  monthly: string
  yearly: string
  save2months: string
  startFree: string
  ctaQuote: string
  ctaSubtext: string
  footerTagline: string
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
    // Pricing
    pricingEyebrow: 'Pricing — Job Ticket AV-2026',
    pricingHeadline: 'Stop running your business from memory.',
    pricingSubheadline: 'One system for your jobs, your inventory, and your money — priced the way your business already thinks: per seat, per month, no IT department required.',
    monthly: 'Monthly',
    yearly: 'Yearly',
    save2months: 'Save 2 months',
    startFree: 'Start free setup',
    ctaQuote: 'Your crews are on sites you can\'t visit daily. Your factory runs out of resin without warning. Find out before it\'s an emergency.',
    ctaSubtext: 'Setup: 30 minutes · Works on low-end Android · Naira, VAT & WHT built in',
    footerTagline: 'The Business Operating System — Lagos, Nigeria',
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
    // Pricing
    pricingEyebrow: 'Iwé Owo — AV-2026',
    pricingHeadline: 'Ma ṣe tẹ̀siwaju lọ́pọ̀ láti ṣe iṣẹ́ rẹ.',
    pricingSubheadline: 'Ẹ̀yà kan fún iṣẹ́ rẹ, ipamọ́ra rẹ, àti owó rẹ — owo ti wà ninu àlàáfíà.',
    monthly: 'Oṣù kọ̀ọ̀kan',
    yearly: 'Ọdún kọ̀ọ̀kan',
    save2months: 'Fipamọ́ ọdún méjì',
    startFree: 'Bẹ̀rẹ̀ setup libre',
    ctaQuote: 'Ọ̀dọ́ rẹ wà lálú ounjẹ́ lásìkò. Rí i síwájú kí ó jẹ́ ìdádúró.',
    ctaSubtext: 'Setup: àkókò 30 mins · Nṣiṣẹ́ lórí Android alámu · Naira, VAT & WHT wà nínú',
    footerTagline: 'Ọ̀pọ̀ Iṣẹ́ Ìdaraya — Lagos, Nigeria',
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
    // Pricing
    pricingEyebrow: 'Kashe Kuɗi — AV-2026',
    pricingHeadline: 'Ka daina gudanar da kasuwanci da zuciya ka kaɗai.',
    pricingSubheadline: 'Tsarin guda don ayyukan ka, ajiya, da kuɗin ka — farashin da ake tunani.',
    monthly: 'Na wata',
    yearly: 'Na shekara',
    save2months: 'Ajiye watanni 2',
    startFree: 'Fara kyauta',
    ctaQuote: 'Yan uwanku suna wuri da ba za a iya ziyartar su ba. Ka gani kafin ya zama matsala.',
    ctaSubtext: 'Saiti: minti 30 · Yana aiki akan Android · Naira, VAT & WHT an haɗa su',
    footerTagline: 'Tsarin Kasuwanci — Lagos, Nigeria',
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
    // Pricing
    pricingEyebrow: 'Nhazi Ọnya — AV-2026',
    pricingHeadline: 'Kwụsị ịme azụmaahịa gị site na ncheta.',
    pricingSubheadline: 'Usoro otu maka ọrụ gị, nchekwa, na ego gị — ọnụ ahịa dị ka ị chere ya.',
    monthly: 'Kwa ọnwa',
    yearly: 'Kwa afọ',
    save2months: 'Chekwaa ọnwa 2',
    startFree: 'Bido nwere obi ụtọ',
    ctaQuote: 'Ndị otu gị dị na ebe ịnwere ike ịnwale kwa ụbọchị. Chọpụta ya tupu ọ bụrụ nsogbu.',
    ctaSubtext: 'Nhazi: nkeji 30 · Na-arụ ọrụ na Android · Naira, VAT & WHT edobere',
    footerTagline: 'Usoro Azụmaahịa — Lagos, Nigeria',
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
    // Pricing
    pricingEyebrow: 'Tarification — AV-2026',
    pricingHeadline: 'Arrêtez de gérer votre entreprise de mémoire.',
    pricingSubheadline: 'Un système pour vos emplois, votre inventaire et votre argent.',
    monthly: 'Mensuel',
    yearly: 'Annuel',
    save2months: 'Économisez 2 mois',
    startFree: 'Commencer gratuitement',
    ctaQuote: 'Vos équipes sont sur des sites que vous ne pouvez pas visiter chaque jour.',
    ctaSubtext: 'Configuration: 30 minutes · Fonctionne sur Android · Naira, TVA et WHT intégrés',
    footerTagline: 'Le Système d\'Exploitation Métier — Lagos, Nigeria',
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
    // Pricing
    pricingEyebrow: 'Precios — AV-2026',
    pricingHeadline: 'Deja de gestionar tu negocio desde la memoria.',
    pricingSubheadline: 'Un sistema para tus trabajos, inventario y dinero.',
    monthly: 'Mensual',
    yearly: 'Anual',
    save2months: 'Ahorra 2 meses',
    startFree: 'Empezar gratis',
    ctaQuote: 'Tus equipos están en sitios que no puedes visitar todos los días.',
    ctaSubtext: 'Configuración: 30 minutos · Funciona en Android · Naira, IVA y WHT integrados',
    footerTagline: 'El Sistema Operativo de Negocios — Lagos, Nigeria',
  },
  ar: {
    dashboard: 'لوحة القيادة',
    crm: 'إدارة العملاء',
    finance: 'المالية',
    tasks: 'المهام',
    projects: 'المشاريع',
    // Pricing
    pricingEyebrow: 'التسعير — AV-2026',
    pricingHeadline: 'توقف عن إدارة عملك من الذاكرة.',
    pricingSubheadline: 'نظام واحد لعملك ومخزونك وأموالك.',
    monthly: 'شهري',
    yearly: 'سنوي',
    save2months: 'وفر شهرين',
    startFree: 'ابدأ مجاناً',
    ctaQuote: 'فريقك في مواقع لا يمكنك زيارتها يومياً.',
    ctaSubtext: 'الإعداد: 30 دقيقة · يعمل على أندرويد · النيرا والضريبة included',
    footerTagline: 'نظام تشغيل الأعمال — لاغوس، نيجيريا',
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
    // Pricing
    pricingEyebrow: 'Preços — AV-2026',
    pricingHeadline: 'Pare de gerenciar seu negócio pela memória.',
    pricingSubheadline: 'Um sistema para seus trabalhos, inventário e dinheiro.',
    monthly: 'Mensal',
    yearly: 'Anual',
    save2months: 'Economize 2 meses',
    startFree: 'Começar grátis',
    ctaQuote: 'Sua equipe está em locais que você não pode visitar todos os dias.',
    ctaSubtext: 'Configuração: 30 minutos · Funciona no Android · Naira, IVA e WHT incluídos',
    footerTagline: 'O Sistema Operacional de Negócios — Lagos, Nigéria',
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
    // Pricing
    pricingEyebrow: '定价 — AV-2026',
    pricingHeadline: '不要再凭记忆经营您的业务。',
    pricingSubheadline: '一个系统管理您的工作、库存和资金。',
    monthly: '每月',
    yearly: '每年',
    save2months: '节省2个月',
    startFree: '免费开始',
    ctaQuote: '您的团队在您无法每天访问的现场工作。',
    ctaSubtext: '设置: 30分钟 · 适用于Android · 奈拉、增值税和预扣税已包含',
    footerTagline: '商业操作系统 — 尼日利亚拉各斯',
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
    // Pricing
    pricingEyebrow: 'मूल्य निर्धारण — AV-2026',
    pricingHeadline: 'याददाश्त से अपना व्यापार चलाना बंद करें।',
    pricingSubheadline: 'अपने काम, इन्वेंट्री और पैसे के लिए एक ही सिस्टम।',
    monthly: 'मासिक',
    yearly: 'वार्षिक',
    save2months: '2 महीने बचाएं',
    startFree: 'मुफ्त शुरू करें',
    ctaQuote: 'आपकी टीम उन जगहों पर है जहाँ आप रोज़ नहीं जा सकते।',
    ctaSubtext: 'सेटअप: 30 मिनट · Android पर काम करता है · नायरा, वैट और डब्ल्यूएचटी शामिल',
    footerTagline: 'बिज़नेस ऑपरेटिंग सिस्टम — लागोस, नाइजीरिया',
  },
}

type LocaleContextType = {
  locale: Locale
  loading: boolean
  setLanguage: (code: string) => void
  t: (key: keyof TranslationKeys, fallback?: string) => string
  translations: Partial<TranslationKeys>
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

  const currentTranslations = translations[locale.language] || translations.en

  return (
    <LocaleContext.Provider value={{ locale, loading, setLanguage, t, translations: currentTranslations }}>
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
