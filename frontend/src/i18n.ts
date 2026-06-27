export type Lang = "en" | "sv";

type Dict = Record<string, string>;

const en: Dict = {
  // tabs
  dashboard: "Dashboard", catalog: "Catalog", scan: "Scan", orders: "Orders", settings: "Settings",
  // dashboard
  welcomeBack: "Welcome back", operator: "Operator",
  stockValue: "Stock Value", totalUnits: "Total Units", products: "Products", lowStock: "Low Stock",
  lowStockWarning: "Low stock warning",
  productsAtThreshold: "product(s) at or below threshold. Review the list below and reorder.",
  lowStockAlerts: "LOW STOCK ALERTS", allHealthy: "All stock levels healthy ✓",
  expiringSoon: "EXPIRING SOON", recentActivity: "RECENT ACTIVITY", noMovements: "No recent movements",
  left: "left",
  // movement types
  receive: "receive", adjust: "adjust", remove: "remove",
  // catalog
  searchProducts: "Search products", all: "All", noProducts: "No products yet",
  addOrScan: "Tap + or scan a barcode to add stock", noSku: "No SKU", lowBadge: "LOW",
  // scan
  scanBarcode: "SCAN BARCODE", alignFrame: "Align the code within the frame",
  cameraNeeded: "Camera access needed to scan barcodes", grantCamera: "Grant Camera Access",
  inStock: "In stock", receiveUpdate: "Receive / Update Stock", scanAgain: "Scan again",
  newProduct: "New product", foundReview: "Found in database — review & save",
  notInDb: "Not in database — add manually", addThisProduct: "Add This Product", barcode: "Barcode",
  // orders
  purchaseOrders: "PURCHASE ORDERS", reorderSubtitle: "Reorder suggestions & supplier emails",
  stockValue15: "Stock Value · 15 Months", exportPdf: "Export PDF", latest: "Latest",
  aiInsight: "AI Restock Insight", generateAi: "Generate AI Insight",
  suggestedReorders: "SUGGESTED REORDERS", est: "Est.", noPending: "No pending orders",
  aboveThresholds: "All products are above their thresholds", have: "Have", order: "order",
  noSupplier: "No supplier", orderHistory: "ORDER HISTORY", noPos: "No purchase orders yet",
  draftEmailSupplier: "Draft Email to Supplier", deliverTo: "DELIVER TO", poEmail: "Purchase Order Email",
  to: "To", subject: "Subject", noSupplierEmail: "(no supplier email)",
  copyEmail: "Copy Email Text", copied: "Copied ✓", markAsSent: "Mark as Sent", close: "Close",
  items: "item(s)", statusSent: "SENT", statusDraft: "DRAFT",
  // settings
  currency: "Currency", appearance: "Appearance", dark: "Dark", light: "Light",
  language: "Language", english: "English", swedish: "Swedish",
  warehouses: "Warehouses", categories: "Categories", suppliers: "Suppliers", signOut: "Sign Out",
  noneYet: "None yet", add: "Add", name: "Name", address: "Address", email: "Email",
  save: "Save", cancel: "Cancel",
  // product editor
  newProductTitle: "New Product", productName: "Product Name", sku: "SKU", price: "Price", cost: "Cost",
  quantity: "Quantity", lowStockAt: "Low Stock At", purchaseDate: "Purchase Date",
  bestBefore: "Best Before Date", warehouse: "Warehouse", category: "Category", supplier: "Supplier",
  notes: "Notes", optionalNotes: "Optional notes", addInSettings: "Add in Settings",
  saveChanges: "Save Changes", nameRequired: "Product name is required", saveFailed: "Save failed",
  // product detail
  receiveStock: "Receive Stock", current: "Current", units: "units", qtyReceived: "Quantity received",
  bestBeforeOptional: "Best before (YYYY-MM-DD, optional)", addToStock: "Add to Stock",
  receiveBtn: "Receive", notFound: "Not found",
  // auth
  appTagline: "Warehouse inventory command center", password: "Password", signIn: "Sign In",
  noAccount: "No account? ", createOne: "Create one", createAccount: "CREATE ACCOUNT",
  startManaging: "Start managing your warehouse", haveAccount: "Have an account? ", signInLink: "Sign in",
  createAccountBtn: "Create Account", passwordMin: "Password must be at least 6 characters",
  loginFailed: "Login failed", regFailed: "Registration failed", yourName: "Your name",
};

const sv: Dict = {
  dashboard: "Översikt", catalog: "Katalog", scan: "Skanna", orders: "Beställningar", settings: "Inställningar",
  welcomeBack: "Välkommen tillbaka", operator: "Operatör",
  stockValue: "Lagervärde", totalUnits: "Antal enheter", products: "Produkter", lowStock: "Lågt lager",
  lowStockWarning: "Varning för lågt lager",
  productsAtThreshold: "produkt(er) på eller under gränsvärdet. Granska listan nedan och beställ.",
  lowStockAlerts: "VARNINGAR LÅGT LAGER", allHealthy: "Alla lagernivåer är bra ✓",
  expiringSoon: "GÅR SNART UT", recentActivity: "SENASTE AKTIVITET", noMovements: "Inga senaste rörelser",
  left: "kvar",
  receive: "inkommande", adjust: "justering", remove: "uttag",
  searchProducts: "Sök produkter", all: "Alla", noProducts: "Inga produkter än",
  addOrScan: "Tryck + eller skanna en streckkod för att lägga till lager", noSku: "Ingen SKU", lowBadge: "LÅG",
  scanBarcode: "SKANNA STRECKKOD", alignFrame: "Rikta in koden i ramen",
  cameraNeeded: "Kameraåtkomst krävs för att skanna streckkoder", grantCamera: "Ge kameraåtkomst",
  inStock: "I lager", receiveUpdate: "Ta emot / Uppdatera lager", scanAgain: "Skanna igen",
  newProduct: "Ny produkt", foundReview: "Hittad i databasen — granska & spara",
  notInDb: "Inte i databasen — lägg till manuellt", addThisProduct: "Lägg till produkt", barcode: "Streckkod",
  purchaseOrders: "INKÖPSORDER", reorderSubtitle: "Återbeställningsförslag & leverantörsmail",
  stockValue15: "Lagervärde · 15 månader", exportPdf: "Exportera PDF", latest: "Senaste",
  aiInsight: "AI-påfyllningsinsikt", generateAi: "Generera AI-insikt",
  suggestedReorders: "FÖRESLAGNA ÅTERBESTÄLLNINGAR", est: "Ca.", noPending: "Inga väntande beställningar",
  aboveThresholds: "Alla produkter är över sina gränsvärden", have: "Har", order: "beställ",
  noSupplier: "Ingen leverantör", orderHistory: "ORDERHISTORIK", noPos: "Inga inköpsorder än",
  draftEmailSupplier: "Skapa mail till leverantör", deliverTo: "LEVERERA TILL", poEmail: "Inköpsordermail",
  to: "Till", subject: "Ämne", noSupplierEmail: "(ingen leverantörsmail)",
  copyEmail: "Kopiera mailtext", copied: "Kopierat ✓", markAsSent: "Markera som skickad", close: "Stäng",
  items: "artikel(ar)", statusSent: "SKICKAD", statusDraft: "UTKAST",
  currency: "Valuta", appearance: "Utseende", dark: "Mörkt", light: "Ljust",
  language: "Språk", english: "Engelska", swedish: "Svenska",
  warehouses: "Lager", categories: "Kategorier", suppliers: "Leverantörer", signOut: "Logga ut",
  noneYet: "Inga än", add: "Lägg till", name: "Namn", address: "Adress", email: "E-post",
  save: "Spara", cancel: "Avbryt",
  newProductTitle: "Ny produkt", productName: "Produktnamn", sku: "SKU", price: "Pris", cost: "Kostnad",
  quantity: "Antal", lowStockAt: "Lågt lager vid", purchaseDate: "Inköpsdatum",
  bestBefore: "Bäst före-datum", warehouse: "Lager", category: "Kategori", supplier: "Leverantör",
  notes: "Anteckningar", optionalNotes: "Valfria anteckningar", addInSettings: "Lägg till i Inställningar",
  saveChanges: "Spara ändringar", nameRequired: "Produktnamn krävs", saveFailed: "Sparning misslyckades",
  receiveStock: "Ta emot lager", current: "Nuvarande", units: "enheter", qtyReceived: "Mottaget antal",
  bestBeforeOptional: "Bäst före (ÅÅÅÅ-MM-DD, valfritt)", addToStock: "Lägg till i lager",
  receiveBtn: "Ta emot", notFound: "Hittades inte",
  appTagline: "Lagerhanteringens kommandocentral", password: "Lösenord", signIn: "Logga in",
  noAccount: "Inget konto? ", createOne: "Skapa ett", createAccount: "SKAPA KONTO",
  startManaging: "Börja hantera ditt lager", haveAccount: "Har du ett konto? ", signInLink: "Logga in",
  createAccountBtn: "Skapa konto", passwordMin: "Lösenordet måste vara minst 6 tecken",
  loginFailed: "Inloggning misslyckades", regFailed: "Registrering misslyckades", yourName: "Ditt namn",
};

export const TRANSLATIONS: Record<Lang, Dict> = { en, sv };

export function translate(lang: Lang, key: string): string {
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}
