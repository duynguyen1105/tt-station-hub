// Vietnamese reply templates the OA sends back to station staff (build plan §2.4).

export const zaloTemplates = {
  photoReceived: (label: string) => `✅ Đã nhận ảnh ${label}. Đang xử lý...`,
  readingExtracted: (label: string, reading: string) =>
    `✅ ${label}: đọc được số ${reading}. Kế toán sẽ kiểm tra lại.`,
  needsReview: (label: string) => `⚠️ ${label}: ảnh chưa rõ, kế toán sẽ kiểm tra thủ công.`,
  missingDispensers: (missing: string[]) => `⏳ Còn thiếu ảnh các trụ: ${missing.join(', ')}.`,
  shiftSummary: (stationName: string, count: number) =>
    `📋 Trạm ${stationName}: đã nhận đủ ${count} ảnh cho ca này. Cảm ơn!`,
  notRecognized: () => `❓ Ảnh chưa nhận diện được. Vui lòng chụp rõ đồng hồ và gửi lại.`,
}
