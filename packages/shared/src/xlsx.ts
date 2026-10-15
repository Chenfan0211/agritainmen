/**
 * 最小 xlsx（Office Open XML SpreadsheetML）生成器。
 *
 * 功能清单要求经营报表「支持导出为 xlsx 文件」，而本工程约定不引入额外依赖，
 * 因此这里按 OOXML 规范拼装最小工作簿，并用 store（不压缩）模式自行打包 ZIP。
 * 产物可被 Excel / WPS / Numbers 正常打开。
 *
 * 能力边界（够用即止）：单工作表、内联字符串、无样式、无共享字符串表。
 */

export type XlsxCell = string | number

export interface XlsxOptions {
  sheetName?: string
}

/**
 * 生成的字节视图固定绑定到 ArrayBuffer：既可直接作为 BlobPart 使用，
 * 也兼容 TS 5.7 起 `Uint8Array` 的泛型参数（默认 ArrayBufferLike 不可赋给 BlobPart）。
 */
export type XlsxBytes = Uint8Array<ArrayBuffer>

/** 工作表名长度上限与非法字符，按 OOXML 规范收敛。 */
const SHEET_NAME_MAX = 31
const SHEET_NAME_INVALID = /[:\/?*\[\]]/g

/** 固定 DOS 时间戳（1980-01-01 00:00:00），保证同一份数据反复导出结果稳定。 */
const DOS_TIME = 0
const DOS_DATE = 33

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function concat(parts: Uint8Array[]): XlsxBytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    merged.set(part, offset)
    offset += part.length
  }
  return merged
}

interface ZipEntry {
  name: string
  data: Uint8Array
}

/** 按 ZIP 规范自行组包；使用 store 模式，因此条目的原始字节可直接读取。 */
function buildZip(entries: ZipEntry[]): XlsxBytes {
  const encoder = new TextEncoder()
  const payloads: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)

    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, DOS_TIME, true)
    localView.setUint16(12, DOS_DATE, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, entry.data.length, true)
    localView.setUint32(22, entry.data.length, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    payloads.push(local, entry.data)

    const header = new Uint8Array(46 + nameBytes.length)
    const headerView = new DataView(header.buffer)
    headerView.setUint32(0, 0x02014b50, true)
    headerView.setUint16(4, 20, true)
    headerView.setUint16(6, 20, true)
    headerView.setUint16(8, 0x0800, true)
    headerView.setUint16(10, 0, true)
    headerView.setUint16(12, DOS_TIME, true)
    headerView.setUint16(14, DOS_DATE, true)
    headerView.setUint32(16, crc, true)
    headerView.setUint32(20, entry.data.length, true)
    headerView.setUint32(24, entry.data.length, true)
    headerView.setUint16(28, nameBytes.length, true)
    headerView.setUint16(30, 0, true)
    headerView.setUint16(32, 0, true)
    headerView.setUint16(34, 0, true)
    headerView.setUint16(36, 0, true)
    headerView.setUint32(38, 0, true)
    headerView.setUint32(42, offset, true)
    header.set(nameBytes, 46)
    directory.push(header)

    offset += local.length + entry.data.length
  }

  const directorySize = directory.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, directorySize, true)
  endView.setUint32(16, offset, true)
  return concat([...payloads, ...directory, end])
}

/** XML 文本转义，并剔除 XML 1.0 不允许出现的控制字符。 */
function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 0 → A、25 → Z、26 → AA，与 Excel 列标一致。 */
function columnName(index: number): string {
  let name = ''
  let current = index
  while (current >= 0) {
    name = String.fromCharCode(65 + (current % 26)) + name
    current = Math.floor(current / 26) - 1
  }
  return name
}

function sheetXml(rows: Array<Array<XlsxCell>>): string {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`
          if (typeof cell === 'number' && Number.isFinite(cell)) return `<c r="${ref}"><v>${cell}</v></c>`
          const text = cell === undefined || cell === null ? '' : String(cell)
          if (!text) return `<c r="${ref}"/>`
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
        })
        .join('')
      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'

const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'

const WORKBOOK_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'

export function xlsxSheetName(name?: string): string {
  const trimmed = (name || '').replace(SHEET_NAME_INVALID, '_').trim()
  return trimmed.slice(0, SHEET_NAME_MAX) || 'Sheet1'
}

/** 把二维表（首行通常为表头）生成为单工作表 xlsx 字节流。 */
export function toXlsx(rows: Array<Array<XlsxCell>>, options: XlsxOptions = {}): XlsxBytes {
  const encoder = new TextEncoder()
  return buildZip([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml(xlsxSheetName(options.sheetName))) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml(rows)) }
  ])
}