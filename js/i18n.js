/* ============================================================
   i18n.js — Internationalisation (English + Lao)
   ============================================================ */

var currentLang = localStorage.getItem("lang") || "en";

var translations = {
  en: {
    // Auth
    loginTitle: "Welcome to Godsmash",
    loginSubtitle: "Sign in to manage your badminton sessions",
    enterEmail: "Enter your email",
    sendLink: "Send Sign-In Link",
    checkEmail: "Check your email for the sign-in link!",
    profileSetup: "Profile Setup",
    displayName: "Display Name",
    saveContinue: "Save & Continue",
    logout: "Logout",

    // Poll lifecycle
    pollDraft: "Draft",
    confirmPlan: "Confirm this plan",
    playersWord: "players",
    draftCreated: "Draft poll created!",
    planConfirmed: "Plan confirmed",
    onlyCreatorConfirm: "Only the poll creator can confirm",
    needMinPlayers: "Need at least {n} players",

    // Nav
    navPolls: "Polls",
    navSessions: "Sessions",
    navDashboard: "Dashboard",
    navSettings: "Settings",

    // Polls
    createPoll: "Create Poll",
    addOption: "Add Option",
    pollOptions: "Poll Options",
    vote: "Vote",
    unvote: "Unvote",
    votesNeeded: "votes needed",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    cancelPoll: "Cancel Poll",
    noPolls: "No polls yet",
    createFirstPoll: "Create your first poll!",
    open: "Open",
    selectCourt: "Select Court",

    // Sessions
    courtDetails: "Court Details",
    court: "Court",
    date: "Date",
    startTime: "Start Time",
    duration: "Duration",
    players: "Players",
    payerHint: "Who paid at the counter?",
    courtPayer: "Court Payer",
    shuttlePayer: "Shuttle Payer",
    selectPayer: "Select Payer",
    shuttlecocks: "Shuttlecocks",
    splitEqually: "Split Equally",
    addBrand: "Add Brand",
    shuttleTotal: "Shuttle Total",
    otherCosts: "Other Costs",
    otherCostHint: "Parking, drinks, etc.",
    addOtherCost: "Add Other Cost",
    otherTotal: "Other Total",
    calculateSplit: "Calculate Split",
    sessionDetail: "Session Detail",
    addDinner: "Add Dinner",
    markPaid: "Mark Paid",
    paid: "Paid",
    unpaid: "Unpaid",
    paymentStatus: "Payment Status",

    // Results
    perPerson: "Per Person",
    payTo: "Pay To",
    payer: "Payer",
    owes: "owes",
    total: "Total",
    shared: "Shared",
    personal: "Personal",
    notSplit: "Not Split",
    copyMessenger: "Copy for Messenger",
    copied: "Copied!",
    totalSession: "Total Session",
    each: "each",
    deleteSession: "Delete Session",
    deleteConfirm: "Are you sure you want to delete this session?",
    backToNew: "Back",

    // Dinner
    dinnerBill: "Dinner Bill",
    totalBill: "Total Bill",
    uploadReceipt: "Upload Receipt",
    selectDiners: "Select Diners",
    dinnerSplit: "Dinner Split",
    receipt: "Receipt",
    viewReceipt: "View Receipt",
    dinnerPayer: "Dinner Payer",

    // Dashboard
    balance: "Balance",
    spending: "Spending",
    activity: "Activity",
    monthly: "Monthly",
    quarterly: "Quarterly",
    yearly: "Yearly",
    settleUp: "Settle Up",
    noData: "No data available",
    sessionsAttended: "Sessions Attended",
    attendanceRate: "Attendance Rate",
    courtCost: "Court Cost",
    shuttleCost: "Shuttle Cost",
    dinnerCost: "Dinner Cost",

    // Settings
    courts: "Courts",
    addCourt: "Add Court",
    shuttlecockBrands: "Shuttlecock Brands",
    addShuttlecockBrand: "Add Shuttlecock Brand",
    playerRoster: "Player Roster",
    addPlayer: "Add Player",
    profile: "Profile",
    qrCodes: "QR Codes",
    courtPayerQR: "Court Payer QR",
    shuttlePayerQR: "Shuttle Payer QR",
    uploadQR: "Upload QR",
    qrName: "QR Name",
    editProfile: "Edit Profile",

    // Common
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    name: "Name",
    location: "Location",
    pricePerHour: "Price / Hour",
    pricePerTube: "Price / Tube",
    phone: "Phone",
    courtName: "Court Name",
    brandName: "Brand Name",
    selectBrand: "Select Brand",
    qty: "Qty",
    cocksUsed: "Cocks Used",
    tubes: "tubes",
    player: "Player",
    description: "Description",
    amount: "Amount",
    noSessions: "No sessions yet",
    createFirst: "Create your first session!",

    // Header
    headerTitle: "Godsmash",
    headerSub: "Badminton Club"
  },

  la: {
    // Auth
    loginTitle: "ຍິນດີຕ້ອນຮັບ Godsmash",
    loginSubtitle: "ເຂົ້າສູ່ລະບົບເພື່ອຈັດການເກມແບດມິນຕັນ",
    enterEmail: "ກະລຸນາໃສ່ອີເມວ",
    sendLink: "ສົ່ງລິ້ງເຂົ້າສູ່ລະບົບ",
    checkEmail: "ກວດສອບອີເມວຂອງທ່ານ!",
    profileSetup: "ຕັ້ງຄ່າໂປຣໄຟລ໌",
    displayName: "ຊື່ສະແດງ",
    saveContinue: "ບັນທຶກ ແລະ ສືບຕໍ່",
    logout: "ອອກຈາກລະບົບ",

    // Poll lifecycle
    pollDraft: "ຮ່າງ",
    confirmPlan: "ຢືນຢັນແຜນນີ້",
    playersWord: "ຄົນ",
    draftCreated: "ສ້າງໂພລຮ່າງແລ້ວ!",
    planConfirmed: "ຢືນຢັນແຜນແລ້ວ",
    onlyCreatorConfirm: "ມີແຕ່ຜູ້ສ້າງໂພລທີ່ຢືນຢັນໄດ້",
    needMinPlayers: "ຕ້ອງມີຢ່າງໜ້ອຍ {n} ຄົນ",

    // Nav
    navPolls: "ໂຫວດ",
    navSessions: "ປະຫວັດ",
    navDashboard: "ແດຊບອດ",
    navSettings: "ຕັ້ງຄ່າ",

    // Polls
    createPoll: "ສ້າງໂຫວດ",
    addOption: "ເພີ່ມຕົວເລືອກ",
    pollOptions: "ຕົວເລືອກໂຫວດ",
    vote: "ໂຫວດ",
    unvote: "ຍົກເລີກໂຫວດ",
    votesNeeded: "ໂຫວດທີ່ຕ້ອງການ",
    confirmed: "ຢືນຢັນແລ້ວ",
    cancelled: "ຍົກເລີກແລ້ວ",
    cancelPoll: "ຍົກເລີກໂຫວດ",
    noPolls: "ຍັງບໍ່ມີໂຫວດ",
    createFirstPoll: "ສ້າງໂຫວດທຳອິດ!",
    open: "ເປີດ",
    selectCourt: "ເລືອກສະໜາມ",

    // Sessions
    courtDetails: "ລາຍລະອຽດສະໜາມ",
    court: "ສະໜາມ",
    date: "ວັນທີ",
    startTime: "ເວລາເລີ່ມ",
    duration: "ໄລຍະເວລາ",
    players: "ຜູ້ຫຼິ້ນ",
    payerHint: "ໃຜຈ່າຍຢູ່ເຄົາເຕີ?",
    courtPayer: "ຜູ້ຈ່າຍສະໜາມ",
    shuttlePayer: "ຜູ້ຈ່າຍລູກຂົນໄກ່",
    selectPayer: "ເລືອກຜູ້ຈ່າຍ",
    shuttlecocks: "ລູກຂົນໄກ່",
    splitEqually: "ແບ່ງເທົ່າກັນ",
    addBrand: "ເພີ່ມຍີ່ຫໍ້",
    shuttleTotal: "ລວມລູກຂົນໄກ່",
    otherCosts: "ຄ່າໃຊ້ຈ່າຍອື່ນ",
    otherCostHint: "ບ່ອນຈອດລົດ, ເຄື່ອງດື່ມ, ແລະ ອື່ນໆ",
    addOtherCost: "ເພີ່ມຄ່າໃຊ້ຈ່າຍອື່ນ",
    otherTotal: "ລວມຄ່າອື່ນ",
    calculateSplit: "ຄິດໄລ່ການແບ່ງ",
    sessionDetail: "ລາຍລະອຽດເຊສຊັ່ນ",
    addDinner: "ເພີ່ມອາຫານຄ່ຳ",
    markPaid: "ໝາຍວ່າຈ່າຍແລ້ວ",
    paid: "ຈ່າຍແລ້ວ",
    unpaid: "ຍັງບໍ່ຈ່າຍ",
    paymentStatus: "ສະຖານະການຈ່າຍ",

    // Results
    perPerson: "ຕໍ່ຄົນ",
    payTo: "ຈ່າຍໃຫ້",
    payer: "ຜູ້ຈ່າຍ",
    owes: "ເປັນໜີ້",
    total: "ລວມ",
    shared: "ແບ່ງກັນ",
    personal: "ສ່ວນຕົວ",
    notSplit: "ບໍ່ແບ່ງ",
    copyMessenger: "ກັອບໃສ່ Messenger",
    copied: "ກັອບແລ້ວ!",
    totalSession: "ລວມເຊສຊັ່ນ",
    each: "ຄົນລະ",
    deleteSession: "ລຶບເຊສຊັ່ນ",
    deleteConfirm: "ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບເຊສຊັ່ນນີ້?",
    backToNew: "ກັບຄືນ",

    // Dinner
    dinnerBill: "ບິນອາຫານຄ່ຳ",
    totalBill: "ບິນລວມ",
    uploadReceipt: "ອັບໂຫຼດໃບບິນ",
    selectDiners: "ເລືອກຜູ້ຮ່ວມກິນ",
    dinnerSplit: "ແບ່ງອາຫານຄ່ຳ",
    receipt: "ໃບບິນ",
    viewReceipt: "ເບິ່ງໃບບິນ",
    dinnerPayer: "ຜູ້ຈ່າຍອາຫານຄ່ຳ",

    // Dashboard
    balance: "ຍອດເງິນ",
    spending: "ຄ່າໃຊ້ຈ່າຍ",
    activity: "ກິດຈະກຳ",
    monthly: "ລາຍເດືອນ",
    quarterly: "ລາຍໄຕມາດ",
    yearly: "ລາຍປີ",
    settleUp: "ຊຳລະ",
    noData: "ບໍ່ມີຂໍ້ມູນ",
    sessionsAttended: "ເຊສຊັ່ນທີ່ເຂົ້າຮ່ວມ",
    attendanceRate: "ອັດຕາການເຂົ້າຮ່ວມ",
    courtCost: "ຄ່າສະໜາມ",
    shuttleCost: "ຄ່າລູກຂົນໄກ່",
    dinnerCost: "ຄ່າອາຫານຄ່ຳ",

    // Settings
    courts: "ສະໜາມ",
    addCourt: "ເພີ່ມສະໜາມ",
    shuttlecockBrands: "ຍີ່ຫໍ້ລູກຂົນໄກ່",
    addShuttlecockBrand: "ເພີ່ມຍີ່ຫໍ້ລູກຂົນໄກ່",
    playerRoster: "ລາຍຊື່ຜູ້ຫຼິ້ນ",
    addPlayer: "ເພີ່ມຜູ້ຫຼິ້ນ",
    profile: "ໂປຣໄຟລ໌",
    qrCodes: "QR ໂຄ້ດ",
    courtPayerQR: "QR ຜູ້ຈ່າຍສະໜາມ",
    shuttlePayerQR: "QR ຜູ້ຈ່າຍລູກຂົນໄກ່",
    uploadQR: "ອັບໂຫຼດ QR",
    qrName: "ຊື່ QR",
    editProfile: "ແກ້ໄຂໂປຣໄຟລ໌",

    // Common
    cancel: "ຍົກເລີກ",
    save: "ບັນທຶກ",
    delete: "ລຶບ",
    name: "ຊື່",
    location: "ສະຖານທີ່",
    pricePerHour: "ລາຄາ / ຊົ່ວໂມງ",
    pricePerTube: "ລາຄາ / ຫຼອດ",
    phone: "ໂທລະສັບ",
    courtName: "ຊື່ສະໜາມ",
    brandName: "ຊື່ຍີ່ຫໍ້",
    selectBrand: "ເລືອກຍີ່ຫໍ້",
    qty: "ຈຳນວນ",
    cocksUsed: "ລູກທີ່ໃຊ້",
    tubes: "ຫຼອດ",
    player: "ຜູ້ຫຼິ້ນ",
    description: "ລາຍລະອຽດ",
    amount: "ຈຳນວນເງິນ",
    noSessions: "ຍັງບໍ່ມີເຊສຊັ່ນ",
    createFirst: "ສ້າງເຊສຊັ່ນທຳອິດ!",

    // Header
    headerTitle: "Godsmash",
    headerSub: "ສະໂມສອນແບດມິນຕັນ"
  }
};

/**
 * Get a translation by key
 */
function t(key) {
  var lang = translations[currentLang] || translations.en;
  return lang[key] || translations.en[key] || key;
}

/**
 * Set the active language
 */
function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("lang", lang);
  applyI18n();
}

/**
 * Toggle between English and Lao
 */
function toggleLang() {
  setLang(currentLang === "en" ? "la" : "en");
}

/**
 * Apply translations to all DOM elements with data-i18n
 */
function applyI18n() {
  // Elements with data-i18n attribute
  var els = document.querySelectorAll("[data-i18n]");
  for (var i = 0; i < els.length; i++) {
    var key = els[i].getAttribute("data-i18n");
    var tag = els[i].tagName.toLowerCase();

    if (tag === "input" || tag === "textarea") {
      els[i].placeholder = t(key);
    } else {
      els[i].textContent = t(key);
    }
  }

  // Elements with data-i18n-placeholder (explicit placeholder override)
  var phEls = document.querySelectorAll("[data-i18n-placeholder]");
  for (var j = 0; j < phEls.length; j++) {
    var pKey = phEls[j].getAttribute("data-i18n-placeholder");
    phEls[j].placeholder = t(pKey);
  }

  // Special elements
  var headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = t("headerTitle");

  var headerSub = document.getElementById("headerSub");
  if (headerSub) headerSub.textContent = t("headerSub");

  var langBtn = document.getElementById("langBtn");
  if (langBtn) langBtn.textContent = currentLang === "en" ? "LA" : "EN";
}
