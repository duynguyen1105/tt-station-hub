// Every rule the danh mục nhiên liệu adds. Pure — plain values in, plain values
// out — so the rules are testable without React or Prisma, in the style of
// retail-price-board.ts and photo-to-reading.ts.

/**
 * The khóa nhiên liệu generated from a tên: "Xăng RON 98" -> "XANG_RON_98".
 * Named for what it produces — the string every table stores as `fuelType`.
 * Diacritics are stripped (đ included), everything that is not a letter or a
 * digit collapses to one underscore, and the edges carry none.
 *
 * A nhiên liệu keeps its khóa for life, so this runs once at creation and the tên
 * is free to change afterwards. The five founding nhiên liệu are the exception:
 * their khóa predate this rule and are seeded literally (prisma/seed.ts), so four
 * of the five are not what this function would produce from their tên.
 */
export function generateFuelType(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
