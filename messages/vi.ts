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
} as const

export type Messages = typeof vi
