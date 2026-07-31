import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

export type Language = {
  code: string
  name: string
  nativeName: string
  dir: 'ltr' | 'rtl'
  flag: string
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr', flag: '🇩🇪' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr', flag: '🇧🇷' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', dir: 'ltr', flag: '🇯🇵' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr', flag: '🇮🇳' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr', flag: '🇷🇺' },
]

export const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.crm': 'CRM',
    'nav.chat': 'Chat',
    'nav.tasks': 'Tasks',
    'nav.projects': 'Projects',
    'nav.finance': 'Finance',
    'nav.people': 'People',
    'nav.inventory': 'Inventory',
    'nav.reports': 'Reports',
    'nav.settings': 'Settings',
    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.create': 'Create',
    'common.search': 'Search',
    'common.loading': 'Loading...',
    'common.noResults': 'No results found',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.done': 'Done',
    // Auth
    'auth.login': 'Log In',
    'auth.signup': 'Sign Up',
    'auth.logout': 'Log Out',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.forgotPassword': 'Forgot password?',
    // Dashboard
    'dashboard.welcome': 'Welcome back',
    'dashboard.today': 'Today',
    'dashboard.quickActions': 'Quick Actions',
    // CRM
    'crm.contacts': 'Contacts',
    'crm.deals': 'Deals',
    'crm.addContact': 'Add Contact',
    'crm.addDeal': 'Add Deal',
    // Tasks
    'tasks.myTasks': 'My Tasks',
    'tasks.addTask': 'Add Task',
    'tasks.todo': 'To Do',
    'tasks.inProgress': 'In Progress',
    'tasks.done': 'Done',
    // Finance
    'finance.invoices': 'Invoices',
    'finance.payments': 'Payments',
    'finance.createInvoice': 'Create Invoice',
    // Settings
    'settings.profile': 'Profile',
    'settings.business': 'Business',
    'settings.branding': 'Branding',
    'settings.security': 'Security',
    'settings.language': 'Language',
  },
  es: {
    'nav.home': 'Inicio',
    'nav.crm': 'CRM',
    'nav.chat': 'Chat',
    'nav.tasks': 'Tareas',
    'nav.projects': 'Proyectos',
    'nav.finance': 'Finanzas',
    'nav.people': 'Personas',
    'nav.inventory': 'Inventario',
    'nav.reports': 'Reportes',
    'nav.settings': 'Configuración',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.edit': 'Editar',
    'common.create': 'Crear',
    'common.search': 'Buscar',
    'common.loading': 'Cargando...',
    'common.noResults': 'Sin resultados',
    'common.confirm': 'Confirmar',
    'common.back': 'Atrás',
    'common.next': 'Siguiente',
    'common.done': 'Hecho',
    'auth.login': 'Iniciar Sesión',
    'auth.signup': 'Registrarse',
    'auth.logout': 'Cerrar Sesión',
    'auth.email': 'Correo electrónico',
    'auth.password': 'Contraseña',
    'dashboard.welcome': 'Bienvenido de nuevo',
    'dashboard.today': 'Hoy',
    'dashboard.quickActions': 'Acciones Rápidas',
    'crm.contacts': 'Contactos',
    'crm.deals': 'Negocios',
    'crm.addContact': 'Agregar Contacto',
    'crm.addDeal': 'Agregar Negocio',
    'tasks.myTasks': 'Mis Tareas',
    'tasks.addTask': 'Agregar Tarea',
    'settings.profile': 'Perfil',
    'settings.business': 'Negocio',
    'settings.branding': 'Marca',
    'settings.security': 'Seguridad',
    'settings.language': 'Idioma',
  },
  fr: {
    'nav.home': 'Accueil',
    'nav.crm': 'CRM',
    'nav.chat': 'Chat',
    'nav.tasks': 'Tâches',
    'nav.projects': 'Projets',
    'nav.finance': 'Finance',
    'nav.people': 'Personnes',
    'nav.inventory': 'Inventaire',
    'nav.reports': 'Rapports',
    'nav.settings': 'Paramètres',
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.delete': 'Supprimer',
    'common.edit': 'Modifier',
    'common.create': 'Créer',
    'common.search': 'Rechercher',
    'common.loading': 'Chargement...',
    'common.noResults': 'Aucun résultat',
    'common.confirm': 'Confirmer',
    'common.back': 'Retour',
    'common.next': 'Suivant',
    'common.done': 'Terminé',
    'auth.login': 'Connexion',
    'auth.signup': "S'inscrire",
    'auth.logout': 'Déconnexion',
    'auth.email': 'E-mail',
    'auth.password': 'Mot de passe',
    'dashboard.welcome': 'Bienvenue',
    'dashboard.today': "Aujourd'hui",
    'dashboard.quickActions': 'Actions Rapides',
    'crm.contacts': 'Contacts',
    'crm.deals': 'Affaires',
    'crm.addContact': 'Ajouter Contact',
    'crm.addDeal': 'Ajouter Affaire',
    'tasks.myTasks': 'Mes Tâches',
    'tasks.addTask': 'Ajouter Tâche',
    'settings.profile': 'Profil',
    'settings.business': 'Entreprise',
    'settings.branding': 'Image de marque',
    'settings.security': 'Sécurité',
    'settings.language': 'Langue',
  },
  ar: {
    'nav.home': 'الرئيسية',
    'nav.crm': 'إدارة العلاقات',
    'nav.chat': 'المحادثة',
    'nav.tasks': 'المهام',
    'nav.projects': 'المشاريع',
    'nav.finance': 'المالية',
    'nav.people': 'الأشخاص',
    'nav.inventory': 'المخزون',
    'nav.reports': 'التقارير',
    'nav.settings': 'الإعدادات',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.create': 'إنشاء',
    'common.search': 'بحث',
    'common.loading': 'جاري التحميل...',
    'common.noResults': 'لا توجد نتائج',
    'common.confirm': 'تأكيد',
    'common.back': 'رجوع',
    'common.next': 'التالي',
    'common.done': 'تم',
    'auth.login': 'تسجيل الدخول',
    'auth.signup': 'إنشاء حساب',
    'auth.logout': 'تسجيل الخروج',
    'auth.email': 'البريد الإلكتروني',
    'auth.password': 'كلمة المرور',
    'dashboard.welcome': 'مرحباً بعودتك',
    'dashboard.today': 'اليوم',
    'dashboard.quickActions': 'إجراءات سريعة',
    'crm.contacts': 'جهات الاتصال',
    'crm.deals': 'الصفقات',
    'crm.addContact': 'إضافة جهة اتصال',
    'crm.addDeal': 'إضافة صفقة',
    'tasks.myTasks': 'مهامي',
    'tasks.addTask': 'إضافة مهمة',
    'settings.profile': 'الملف الشخصي',
    'settings.business': 'الأعمال',
    'settings.branding': 'العلامة التجارية',
    'settings.security': 'الأمان',
    'settings.language': 'اللغة',
  },
  zh: {
    'nav.home': '首页',
    'nav.crm': '客户管理',
    'nav.chat': '聊天',
    'nav.tasks': '任务',
    'nav.projects': '项目',
    'nav.finance': '财务',
    'nav.people': '人员',
    'nav.inventory': '库存',
    'nav.reports': '报告',
    'nav.settings': '设置',
    'common.save': '保存',
    'common.cancel': '取消',
    'common.delete': '删除',
    'common.edit': '编辑',
    'common.create': '创建',
    'common.search': '搜索',
    'common.loading': '加载中...',
    'common.noResults': '无结果',
    'common.confirm': '确认',
    'common.back': '返回',
    'common.next': '下一步',
    'common.done': '完成',
    'auth.login': '登录',
    'auth.signup': '注册',
    'auth.logout': '退出登录',
    'auth.email': '邮箱',
    'auth.password': '密码',
    'dashboard.welcome': '欢迎回来',
    'dashboard.today': '今天',
    'dashboard.quickActions': '快捷操作',
    'crm.contacts': '联系人',
    'crm.deals': '交易',
    'crm.addContact': '添加联系人',
    'crm.addDeal': '添加交易',
    'tasks.myTasks': '我的任务',
    'tasks.addTask': '添加任务',
    'settings.profile': '个人资料',
    'settings.business': '企业',
    'settings.branding': '品牌',
    'settings.security': '安全',
    'settings.language': '语言',
  },
}

type Locale = {
  language: string
  timezone: string
  date_format: string
  time_format: string
  number_format: string
  currency_display: string
}

type LocaleContextType = {
  locale: Locale
  language: Language
  loading: boolean
  t: (key: string, params?: Record<string, string | number>) => string
  updateLocale: (updates: Partial<Locale>) => Promise<void>
  setLanguage: (code: string) => Promise<void>
}

const DEFAULT_LOCALE: Locale = {
  language: 'en',
  timezone: 'UTC',
  date_format: 'MM/DD/YYYY',
  time_format: '12h',
  number_format: 'comma_dot',
  currency_display: 'symbol',
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)
  const [loading, setLoading] = useState(true)

  const language = LANGUAGES.find((l) => l.code === locale.language) || LANGUAGES[0]

  // Apply RTL direction to document
  useEffect(() => {
    document.documentElement.dir = language.dir
    document.documentElement.lang = language.code
  }, [language])

  // Load user locale
  useEffect(() => {
    if (!user) return

    const loadLocale = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('user_locale')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setLocale(data as Locale)
      } else {
        // Create default locale
        await supabase.from('user_locale').insert({
          user_id: user.id,
          ...DEFAULT_LOCALE,
        })
      }
      setLoading(false)
    }

    loadLocale()
  }, [user])

  const updateLocale = useCallback(async (updates: Partial<Locale>) => {
    if (!user) return

    const newLocale = { ...locale, ...updates }
    setLocale(newLocale)

    const { error } = await supabase
      .from('user_locale')
      .upsert({
        user_id: user.id,
        ...newLocale,
      })

    if (error) {
      console.error('Failed to update locale:', error)
      setLocale(locale)
    }
  }, [user, locale])

  const setLanguage = useCallback(async (code: string) => {
    await updateLocale({ language: code })
  }, [updateLocale])

  // Translation function
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const translations = TRANSLATIONS[locale.language] || TRANSLATIONS.en
    let text = translations[key] || TRANSLATIONS.en[key] || key

    // Replace parameters
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`{${k}}`, 'g'), String(v))
      })
    }

    return text
  }, [locale.language])

  return (
    <LocaleContext.Provider value={{ locale, language, loading, t, updateLocale, setLanguage }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (context === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider')
  }
  return context
}

// Hook for formatting
export function useFormat() {
  const { locale } = useLocale()

  const formatDate = useCallback((date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    const formats: Record<string, (d: Date) => string> = {
      'MM/DD/YYYY': (d) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
      'DD/MM/YYYY': (d) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`,
      'YYYY-MM-DD': (d) => d.toISOString().split('T')[0],
    }
    return formats[locale.date_format]?.(d) || d.toLocaleDateString()
  }, [locale.date_format])

  const formatTime = useCallback((date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date
    if (locale.time_format === '24h') {
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }, [locale.time_format])

  const formatNumber = useCallback((num: number): string => {
    const formats: Record<string, Intl.NumberFormatOptions> = {
      'comma_dot': { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      'dot_comma': { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      'space_dot': { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    }
    return new Intl.NumberFormat(locale.language, formats[locale.number_format]).format(num)
  }, [locale.number_format, locale.language])

  const formatCurrency = useCallback((amount: number, currency = 'USD'): string => {
    const options: Intl.NumberFormatOptions = {
      style: locale.currency_display === 'symbol' ? 'currency' : 'decimal',
      currency,
      minimumFractionDigits: 2,
    }
    return new Intl.NumberFormat(locale.language, options).format(amount)
  }, [locale.currency_display, locale.language])

  return { formatDate, formatTime, formatNumber, formatCurrency }
}
