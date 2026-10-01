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

    // Auth / settings menu
    signIn: "Sign in",
    register: "Register",
    emailLabel: "Email",
    sendRegisterLink: "Register & Send Confirmation Link",
    tabProfile: "Profile",
    tabPlayers: "Players",
    tabCourts: "Courts",
    tabShuttle: "Cocks",
    tabQR: "QR",
    profileSaved: "Profile saved",

    // Poll lifecycle
    pollDraft: "Draft",
    confirmPlan: "Confirm this plan",
    playersWord: "players",
    draftCreated: "Draft poll created!",
    planConfirmed: "Plan confirmed",
    onlyCreatorConfirm: "Only the poll creator can confirm",
    needMinPlayers: "Need at least {n} players",

    addVotesForOthers: "Add players",
    editPlayer: "Edit player",
    manualPlayer: "added manually",
    manualPlayerHint: "Add friends who don't use the app. Anyone in the group can edit or remove manual players; registered accounts can only be changed by their owner.",
    playerExists: "A player with this name already exists",
    registeredPlayer: "registered",
    voteForOthersHint: "Tick everyone who is joining this option, e.g. friends who replied in chat or don't have an account.",
    // Added: sessions, dashboard, settings
    addBrandsFirst: "Add shuttlecock brands in Settings first",
    allSettled: "All debts settled!",
    allTime: "All time",
    appSettings: "App",
    balanceHint: "Unpaid amounts from all sessions, netted between each pair.",
    byMonth: "By month",
    byYear: "By year",
    cock: "cock",
    cocks: "cocks",
    cocksPerTube: "Cocks / tube",
    confirmEmailPrompt: "Please enter your email to confirm sign-in",
    copyInvite: "Share invite link",
    costDetails: "Cost details",
    courtAndCocksEach: "Court + cocks per player ({n}):",
    createdBy: "by",
    editBrand: "Edit brand",
    editCosts: "Edit costs",
    editCourt: "Edit court",
    everyone: "everyone",
    fillAllFields: "Please fill in all fields",
    fillAllOptions: "Please fill in date, time and court for every option",
    for: "for",
    inviteHint: "Friends join by opening this link, tapping Register and confirming their email.",
    inviteMessage: "Join our badminton group on Godsmash:",
    invitePlayers: "Invite friends",
    language: "Language",
    linkExpired: "This sign-in link has expired or was already used. Please request a new one.",
    loading: "Loading…",
    needTwoPlayers: "Need at least 2 players",
    needsCosts: "Enter costs",
    newSession: "New session",
    noCourtsYet: "No courts yet — add one in Settings",
    notPlaying: "not playing",
    nothingToPay: "Nobody owes anything.",
    only: "only",
    openSession: "Open session",
    option: "Option",
    otherCostPlaceholder: "Water, drinks…",
    owedToYou: "Owed to you",
    paidBy: "paid by",
    paidOut: "paid",
    pollClosed: "This poll is closed",
    pollNote: "Note (optional)",
    pollNotePlaceholder: "e.g. Friday game, bring your own racket",
    pollsJoined: "polls voted",
    pollsWord: "Polls",
    qrHint: "Shown on each session so friends can pay by scanning.",
    qrNamePlaceholder: "Account name",
    removeDinner: "Remove dinner",
    selectPlayersFirst: "Select players first",
    sessionNotFound: "Session not found",
    sessionsWord: "Sessions",
    settled: "Settled",
    splitBetween: "Split between",
    tapToVote: "Tap the options you can join. Needs {n} players to confirm.",
    theme: "Theme",
    tube: "tube",
    unpaidSessions: "Sessions with unpaid amounts",
    whoPaysWhom: "Who pays whom",
    you: "you",
    youOwe: "You owe",
    yourShare: "your share",

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
    payerHint: "Tap names to add or remove players",
    courtPayer: "Court Payer",
    shuttlePayer: "Shuttle Payer",
    selectPayer: "Select Payer",
    shuttlecocks: "Shuttlecocks",
    splitEqually: "Split Equally",
    addBrand: "Add Brand",
    shuttleTotal: "Shuttle Total",
    otherCosts: "Other Costs",
    otherCostHint: "Water, drinks, parking… pick who paid and who it is for",
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
    createFirst: "Confirm a poll, or start a session here",

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

    // Auth / settings menu
    signIn: "ເຂົ້າສູ່ລະບົບ",
    register: "ລົງທະບຽນ",
    emailLabel: "ອີເມວ",
    sendRegisterLink: "ລົງທະບຽນ ແລະ ສົ່ງລິ້ງຢືນຢັນ",
    tabProfile: "ໂປຣໄຟລ໌",
    tabPlayers: "ຜູ້ຫຼິ້ນ",
    tabCourts: "ສະໜາມ",
    tabShuttle: "ລູກຂົນໄກ່",
    tabQR: "QR",
    profileSaved: "ບັນທຶກໂປຣໄຟລ໌ແລ້ວ",

    // Poll lifecycle
    pollDraft: "ຮ່າງ",
    confirmPlan: "ຢືນຢັນແຜນນີ້",
    playersWord: "ຄົນ",
    draftCreated: "ສ້າງໂພລຮ່າງແລ້ວ!",
    planConfirmed: "ຢືນຢັນແຜນແລ້ວ",
    onlyCreatorConfirm: "ມີແຕ່ຜູ້ສ້າງໂພລທີ່ຢືນຢັນໄດ້",
    needMinPlayers: "ຕ້ອງມີຢ່າງໜ້ອຍ {n} ຄົນ",

    addVotesForOthers: "ເພີ່ມຜູ້ຫຼິ້ນ",
    editPlayer: "ແກ້ໄຂຜູ້ຫຼິ້ນ",
    manualPlayer: "ເພີ່ມດ້ວຍຕົນເອງ",
    manualPlayerHint: "ເພີ່ມໝູ່ທີ່ບໍ່ໄດ້ໃຊ້ແອັບ. ທຸກຄົນໃນກຸ່ມແກ້ໄຂ ຫຼື ລຶບຜູ້ຫຼິ້ນທີ່ເພີ່ມເອງໄດ້; ບັນຊີທີ່ລົງທະບຽນແລ້ວ ມີແຕ່ເຈົ້າຂອງທີ່ແກ້ໄຂໄດ້.",
    playerExists: "ມີຜູ້ຫຼິ້ນຊື່ນີ້ແລ້ວ",
    registeredPlayer: "ລົງທະບຽນແລ້ວ",
    voteForOthersHint: "ໝາຍທຸກຄົນທີ່ຈະມາຕົວເລືອກນີ້, ເຊັ່ນ ໝູ່ທີ່ຕອບໃນແຊັດ ຫຼື ບໍ່ມີບັນຊີ.",
    // Added: sessions, dashboard, settings
    addBrandsFirst: "ກະລຸນາເພີ່ມຍີ່ຫໍ້ລູກຂົນໄກ່ໃນການຕັ້ງຄ່າກ່ອນ",
    allSettled: "ຊຳລະໝົດແລ້ວ!",
    allTime: "ທັງໝົດ",
    appSettings: "ແອັບ",
    balanceHint: "ຍອດທີ່ຍັງບໍ່ໄດ້ຈ່າຍຈາກທຸກເຊສຊັ່ນ, ຫັກລົບລະຫວ່າງແຕ່ລະຄູ່.",
    byMonth: "ລາຍເດືອນ",
    byYear: "ລາຍປີ",
    cock: "ລູກ",
    cocks: "ລູກ",
    cocksPerTube: "ລູກ / ຫຼອດ",
    confirmEmailPrompt: "ກະລຸນາໃສ່ອີເມວເພື່ອຢືນຢັນການເຂົ້າສູ່ລະບົບ",
    copyInvite: "ແບ່ງປັນລິ້ງເຊີນ",
    costDetails: "ລາຍລະອຽດຄ່າໃຊ້ຈ່າຍ",
    courtAndCocksEach: "ຄ່າສະໜາມ + ລູກ ຕໍ່ຄົນ ({n}):",
    createdBy: "ໂດຍ",
    editBrand: "ແກ້ໄຂຍີ່ຫໍ້",
    editCosts: "ແກ້ໄຂຄ່າໃຊ້ຈ່າຍ",
    editCourt: "ແກ້ໄຂສະໜາມ",
    everyone: "ທຸກຄົນ",
    fillAllFields: "ກະລຸນາໃສ່ຂໍ້ມູນໃຫ້ຄົບ",
    fillAllOptions: "ກະລຸນາໃສ່ວັນທີ, ເວລາ ແລະ ສະໜາມ ໃຫ້ທຸກຕົວເລືອກ",
    for: "ສຳລັບ",
    inviteHint: "ໝູ່ເຂົ້າຮ່ວມໂດຍເປີດລິ້ງນີ້, ກົດລົງທະບຽນ ແລະ ຢືນຢັນອີເມວ.",
    inviteMessage: "ມາຮ່ວມກຸ່ມແບດມິນຕັນຂອງພວກເຮົາໃນ Godsmash:",
    invitePlayers: "ເຊີນໝູ່",
    language: "ພາສາ",
    linkExpired: "ລິ້ງນີ້ໝົດອາຍຸ ຫຼື ຖືກໃຊ້ແລ້ວ. ກະລຸນາຂໍລິ້ງໃໝ່.",
    loading: "ກຳລັງໂຫຼດ…",
    needTwoPlayers: "ຕ້ອງມີຢ່າງໜ້ອຍ 2 ຄົນ",
    needsCosts: "ໃສ່ຄ່າໃຊ້ຈ່າຍ",
    newSession: "ເຊສຊັ່ນໃໝ່",
    noCourtsYet: "ຍັງບໍ່ມີສະໜາມ — ເພີ່ມໃນການຕັ້ງຄ່າ",
    notPlaying: "ບໍ່ໄດ້ຫຼິ້ນ",
    nothingToPay: "ບໍ່ມີໃຜຕິດໜີ້.",
    only: "ສະເພາະ",
    openSession: "ເປີດເຊສຊັ່ນ",
    option: "ຕົວເລືອກ",
    otherCostPlaceholder: "ນ້ຳ, ເຄື່ອງດື່ມ…",
    owedToYou: "ຄົນອື່ນຕິດທ່ານ",
    paidBy: "ຈ່າຍໂດຍ",
    paidOut: "ຈ່າຍແລ້ວ",
    pollClosed: "ໂຫວດນີ້ປິດແລ້ວ",
    pollNote: "ໝາຍເຫດ (ບໍ່ບັງຄັບ)",
    pollNotePlaceholder: "ເຊັ່ນ: ເກມວັນສຸກ, ເອົາໄມ້ມາເອງ",
    pollsJoined: "ໂຫວດທີ່ເຂົ້າຮ່ວມ",
    pollsWord: "ໂຫວດ",
    qrHint: "ສະແດງໃນແຕ່ລະເຊສຊັ່ນເພື່ອໃຫ້ໝູ່ສະແກນຈ່າຍ.",
    qrNamePlaceholder: "ຊື່ບັນຊີ",
    removeDinner: "ລຶບອາຫານຄ່ຳ",
    selectPlayersFirst: "ກະລຸນາເລືອກຜູ້ຫຼິ້ນກ່ອນ",
    sessionNotFound: "ບໍ່ພົບເຊສຊັ່ນ",
    sessionsWord: "ເຊສຊັ່ນ",
    settled: "ຊຳລະແລ້ວ",
    splitBetween: "ແບ່ງໃຫ້",
    tapToVote: "ແຕະຕົວເລືອກທີ່ທ່ານມາໄດ້. ຕ້ອງມີ {n} ຄົນຈຶ່ງຢືນຢັນໄດ້.",
    theme: "ຮູບແບບສີ",
    tube: "ຫຼອດ",
    unpaidSessions: "ເຊສຊັ່ນທີ່ຍັງຄ້າງຈ່າຍ",
    whoPaysWhom: "ໃຜຈ່າຍໃຫ້ໃຜ",
    you: "ທ່ານ",
    youOwe: "ທ່ານຕິດ",
    yourShare: "ສ່ວນຂອງທ່ານ",

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
    payerHint: "ແຕະຊື່ເພື່ອເພີ່ມ ຫຼື ລຶບຜູ້ຫຼິ້ນ",
    courtPayer: "ຜູ້ຈ່າຍສະໜາມ",
    shuttlePayer: "ຜູ້ຈ່າຍລູກຂົນໄກ່",
    selectPayer: "ເລືອກຜູ້ຈ່າຍ",
    shuttlecocks: "ລູກຂົນໄກ່",
    splitEqually: "ແບ່ງເທົ່າກັນ",
    addBrand: "ເພີ່ມຍີ່ຫໍ້",
    shuttleTotal: "ລວມລູກຂົນໄກ່",
    otherCosts: "ຄ່າໃຊ້ຈ່າຍອື່ນ",
    otherCostHint: "ນ້ຳ, ເຄື່ອງດື່ມ, ບ່ອນຈອດລົດ… ເລືອກວ່າໃຜຈ່າຍ ແລະ ຈ່າຍໃຫ້ໃຜ",
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
    createFirst: "ຢືນຢັນໂຫວດ ຫຼື ເລີ່ມເຊສຊັ່ນຢູ່ນີ້",

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
  if (typeof setAuthMode === "function" && typeof authMode !== "undefined") setAuthMode(authMode);
  if (typeof refreshCurrentPage === "function") refreshCurrentPage("lang");
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
  var authLangBtn = document.getElementById("authLangBtn");
  if (authLangBtn) authLangBtn.textContent = currentLang === "en" ? "\u0EA5\u0EB2\u0EA7" : "English";
  document.documentElement.lang = currentLang === "la" ? "lo" : "en";
}
