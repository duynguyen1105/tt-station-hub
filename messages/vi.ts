/**
 * Centralized Vietnamese UI strings. All user-facing text lives here so the
 * codebase itself stays in English. Import `vi` and reference nested keys.
 */
export const vi = {
  appName: 'Hồ sơ Trạm Trường Thịnh',
  appShortName: 'Hồ sơ Trạm',
  appDescription: 'Hệ thống quản lý hồ sơ trạm xăng dầu Trường Thịnh',

  nav: {
    overview: 'Trang tổng thể',
    stations: 'Trạm',
    review: 'Cần duyệt',
    upload: 'Tải ảnh',
    misaReport: 'Báo cáo MISA',
    settings: 'Cài đặt',
  },

  stationTabs: {
    overview: 'Tổng quan',
    shifts: 'Chốt ca',
    documents: 'Giấy tờ pháp lý',
    inventory: 'Hàng tồn',
    debts: 'Công nợ',
  },

  common: {
    save: 'Lưu',
    cancel: 'Hủy',
    confirm: 'Xác nhận',
    delete: 'Xóa',
    edit: 'Sửa',
    add: 'Thêm',
    close: 'Đóng',
    search: 'Tìm kiếm',
    loading: 'Đang tải...',
    noData: 'Không có dữ liệu',
    actions: 'Thao tác',
    approve: 'Duyệt',
    reject: 'Từ chối',
    correct: 'Sửa số',
  },

  auth: {
    login: 'Đăng nhập',
    loggingIn: 'Đang đăng nhập...',
    logout: 'Đăng xuất',
    email: 'Email',
    password: 'Mật khẩu',
    loginSubtitle: 'Đăng nhập để tiếp tục',
    invalidEmail: 'Email không hợp lệ',
    passwordRequired: 'Vui lòng nhập mật khẩu',
    loginFailed: 'Đăng nhập thất bại. Kiểm tra lại email và mật khẩu.',
  },

  roles: {
    admin: 'Quản trị viên',
    accountant: 'Kế toán',
    viewer: 'Người xem',
  },

  dashboard: {
    welcome: 'Xin chào,',
  },

  errors: {
    generic: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
    unauthorized: 'Bạn không có quyền truy cập.',
    notFound: 'Không tìm thấy dữ liệu.',
  },

  fuelType: { DO: 'Dầu DO', E0: 'Xăng E0', DC: 'Dầu DC', XANG_A95: 'Xăng A95' },

  shiftType: { morning: 'Sáng', afternoon: 'Chiều', night: 'Đêm', full_day: 'Cả ngày' },

  shiftStatus: {
    open: 'Mở',
    collecting_photos: 'Đang nhận ảnh',
    ai_processing: 'AI đang xử lý',
    pending_review: 'Chờ duyệt',
    completed: 'Đã chốt',
    cancelled: 'Đã hủy',
  },

  reviewStatus: {
    pending: 'Chờ xử lý',
    auto_approved: 'Tự duyệt',
    needs_review: 'Cần kiểm tra',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
    corrected: 'Đã sửa',
  },

  anomalyReasons: {
    reading_decreased: 'Số giảm',
    delta_too_large: 'Chênh lệch lớn',
    meters_diverge: 'Hai đồng hồ lệch',
    low_confidence: 'Độ tin cậy thấp',
    missing_photo: 'Thiếu ảnh',
    amount_mismatch: 'Lệch số tiền',
  },

  docStatus: { valid: 'Còn hạn', expiring_soon: 'Sắp hết hạn', expired: 'Hết hạn' },

  docType: {
    business_license: 'Giấy phép kinh doanh',
    fire_safety: 'PCCC',
    environment: 'Môi trường',
    measurement: 'Đo lường',
    other: 'Khác',
  },

  movementType: {
    import: 'Nhập',
    sale: 'Bán',
    physical_count: 'Kiểm kê',
    adjustment: 'Điều chỉnh',
  },

  stations: {
    listTitle: 'Danh sách trạm',
    branch: 'Chi nhánh',
    address: 'Địa chỉ',
    dispensers: 'Trụ bơm',
    viewProfile: 'Xem hồ sơ',
    empty: 'Chưa có trạm nào.',
  },

  shifts: {
    title: 'Chốt ca',
    date: 'Ngày',
    shiftType: 'Ca',
    employee: 'Nhân viên',
    status: 'Trạng thái',
    electronic: 'Điện tử',
    mechanical: 'Cơ',
    confidence: 'Độ tin cậy',
    dispenser: 'Trụ',
    complete: 'Chốt ca',
    completing: 'Đang chốt...',
    empty: 'Chưa có ca nào.',
    noReadings: 'Chưa có số liệu cho ca này.',
    viewDetail: 'Xem / Duyệt',
  },

  review: {
    shiftsTitle: 'Duyệt chốt ca',
    debtsTitle: 'Duyệt lượt xe',
    empty: 'Không có mục nào cần duyệt.',
    station: 'Trạm',
  },

  correction: {
    title: 'Sửa số đọc',
    electronicLabel: 'Số điện tử',
    mechanicalLabel: 'Số cơ',
    original: 'Số AI gốc',
  },

  inventory: {
    title: 'Hàng tồn',
    fuelType: 'Nhiên liệu',
    estimated: 'Tồn ước tính',
    physical: 'Tồn thực',
    variance: 'Chênh lệch',
    threshold: 'Ngưỡng',
    low: 'Tồn thấp',
    empty: 'Chưa có dữ liệu tồn kho.',
  },

  documents: {
    title: 'Giấy tờ',
    name: 'Tên giấy tờ',
    type: 'Loại',
    number: 'Số',
    expiry: 'Hết hạn',
    authority: 'Cơ quan cấp',
    empty: 'Chưa có giấy tờ nào.',
  },

  debts: {
    title: 'Công nợ',
    customer: 'Khách hàng',
    balance: 'Dư nợ',
    plate: 'Biển số',
    liters: 'Số lít',
    unitPrice: 'Đơn giá',
    amount: 'Thành tiền',
    payment: 'Thanh toán',
    visits: 'Lượt xe',
    empty: 'Chưa có công nợ.',
  },

  overview: {
    title: 'Trang tổng thể',
    pendingReviews: 'Cần duyệt',
    expiringDocs: 'Giấy tờ sắp hết hạn',
    lowStock: 'Tồn thấp',
    overdueDebts: 'Nợ quá hạn',
  },

  meterTypeLabel: {
    electronic_montech: 'Điện tử (Montech)',
    electronic_lungbor: 'Điện tử (Lungbor)',
    mechanical: 'Cơ',
    unclear: 'Không rõ',
    not_a_meter: 'Không phải đồng hồ',
    debt_meter: 'Đồng hồ công nợ',
  } as Record<string, string>,

  upload: {
    title: 'Tải ảnh đồng hồ',
    subtitle: 'Chạy thử pipeline lưu ảnh → AI đọc số → chờ duyệt mà không cần Zalo.',
    station: 'Trạm',
    selectStation: 'Chọn trạm',
    kind: 'Loại ảnh',
    kindAuto: 'Tự động nhận diện',
    kindShift: 'Chốt ca (đồng hồ tổng)',
    kindDebt: 'Lượt xe / công nợ',
    kindInventory: 'Đo bồn (tồn kho)',
    assignPump: 'Gán trụ (tùy chọn)',
    pumpAuto: 'Tự động (theo nhãn AI)',
    pumpHint: 'Chọn trụ nếu ảnh không hiện nhãn (vd: đồng hồ Lungbor).',
    slotLabel: 'Loại đồng hồ (nếu gán trụ)',
    slotAuto: 'Tự động (theo AI)',
    slotElectronic: 'Điện tử',
    slotMechanical: 'Cơ',
    debtTypeLabel: 'Loại ảnh công nợ',
    debtMeter: 'Ảnh đồng hồ (lít + đơn giá)',
    debtVehicle: 'Ảnh biển số xe',
    plateResult: 'Biển số đọc được',
    tankDipResult: 'Kết quả đo bồn',
    tankLabel: 'Hầm',
    tankFuel: 'Nhiên liệu',
    tankCapacity: 'Sức chứa',
    tankDipValue: 'Mực đo',
    tankBaremNote:
      'Cần bảng barem bồn để quy mực đo ra số lít tồn (§12.6). Hiện ghi nhận mực đo thô.',
    photo: 'Ảnh đồng hồ',
    dropHint: 'Kéo thả ảnh vào đây hoặc bấm để chọn',
    changePhoto: 'Chọn ảnh khác',
    caption: 'Ghi chú (tùy chọn)',
    captionHint: 'Ví dụ: “Xe 51C-12345” cho lượt công nợ.',
    submit: 'Tải lên & đọc số',
    uploading: 'Đang tải & đọc số...',
    resultTitle: 'Kết quả đọc số AI',
    reading: 'Số đọc',
    meterType: 'Loại đồng hồ',
    dispenser: 'Trụ',
    fuel: 'Nhiên liệu',
    confidence: 'Độ tin cậy',
    aiNotes: 'Ghi chú AI',
    liters: 'Số lít',
    unitPrice: 'Đơn giá',
    amount: 'Thành tiền (lít × đơn giá)',
    amountMatch: 'Khớp số hiển thị',
    amountMismatch: 'Lệch số hiển thị — cần kiểm tra',
    extractionFailed: 'AI chưa đọc được. Ảnh đã được lưu, bạn có thể kiểm tra thủ công.',
    uploaded: 'Đã tải ảnh lên thành công.',
    noStations: 'Chưa có trạm nào. Hãy chạy seed dữ liệu trước.',
    viewReview: 'Mở hàng đợi cần duyệt',
    empty: '—',
  },
} as const

export type Messages = typeof vi
