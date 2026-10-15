import { describe, expect, it } from 'vitest'
import { toXlsx, xlsxSheetName } from './xlsx'

const decoder = new TextDecoder()

interface ZipRecord {
  name: string
  crc: number
  size: number
  offset: number
  data: Uint8Array
}

/** 独立实现的 CRC32，用于校验产物里的校验和是否正确。 */
function referenceCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function readZip(bytes: Uint8Array): ZipRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const endOffset = bytes.length - 22
  expect(view.getUint32(endOffset, true)).toBe(0x06054b50)
  const count = view.getUint16(endOffset + 10, true)
  let cursor = view.getUint32(endOffset + 16, true)

  const records: ZipRecord[] = []
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50)
    const crc = view.getUint32(cursor + 16, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const offset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))

    expect(view.getUint32(offset, true)).toBe(0x04034b50)
    const localNameLength = view.getUint16(offset + 26, true)
    const localName = decoder.decode(bytes.subarray(offset + 30, offset + 30 + localNameLength))
    expect(localName).toBe(name)

    const dataStart = offset + 30 + localNameLength
    records.push({ name, crc, size, offset, data: bytes.subarray(dataStart, dataStart + size) })
    cursor += 46 + nameLength
  }
  return records
}

const sheetOf = (bytes: Uint8Array): string => decoder.decode(readZip(bytes).find((record) => record.name === 'xl/worksheets/sheet1.xml')!.data)

describe('toXlsx', () => {
  it('产出结构完整的 zip 包（含 xlsx 所需的全部部件）', () => {
    const bytes = toXlsx([['名称', '数量'], ['腊肉', 12]])
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])

    const records = readZip(bytes)
    expect(records.map((record) => record.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml'
    ])
  })

  it('每个部件的校验和与长度都与真实字节一致', () => {
    const bytes = toXlsx([['供应商', '状态'], ['湘西腊味合作社', '合作中']])
    for (const record of readZip(bytes)) {
      expect(record.crc).toBe(referenceCrc32(record.data))
      expect(record.data.length).toBe(record.size)
    }
  })

  it('表头写成内联字符串，数值写成数字单元格', () => {
    const sheet = sheetOf(toXlsx([['平台交易额', 1234.5]]))
    expect(sheet).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">平台交易额</t></is></c>')
    expect(sheet).toContain('<c r="B1"><v>1234.5</v></c>')
  })

  it('转义 XML 特殊字符，并剔除 XML 不允许的控制字符', () => {
    const sheet = sheetOf(toXlsx([[`石板溪 & "云上" <门店>`, `带${String.fromCharCode(7)}控制符`]]))
    expect(sheet).toContain('石板溪 &amp; &quot;云上&quot; &lt;门店&gt;')
    expect(sheet).toContain('带控制符')
    expect(sheet).not.toContain(String.fromCharCode(7))
  })

  it('第 27 列起使用双字母列标，与 Excel 保持一致', () => {
    const wide = Array.from({ length: 27 }, (_, index) => `c${index}`)
    const sheet = sheetOf(toXlsx([wide]))
    expect(sheet).toContain('<c r="Z1" t="inlineStr">')
    expect(sheet).toContain('<c r="AA1" t="inlineStr">')
  })

  it('空值输出空单元格，空表也能生成合法工作表', () => {
    expect(sheetOf(toXlsx([['', '']]))).toContain('<row r="1"><c r="A1"/><c r="B1"/></row>')
    expect(sheetOf(toXlsx([]))).toContain('<sheetData></sheetData>')
  })

  it('工作表名按 OOXML 规则收敛长度与非法字符', () => {
    expect(xlsxSheetName('佣金结算')).toBe('佣金结算')
    expect(xlsxSheetName('经营报表/2026:Q1?')).toBe('经营报表_2026_Q1_')
    expect(xlsxSheetName('一'.repeat(40))).toHaveLength(31)
    expect(xlsxSheetName('')).toBe('Sheet1')
    expect(xlsxSheetName(undefined)).toBe('Sheet1')
  })

  it('把工作表名写进工作簿清单', () => {
    const bytes = toXlsx([['a']], { sheetName: '订单履约' })
    const workbook = decoder.decode(readZip(bytes).find((record) => record.name === 'xl/workbook.xml')!.data)
    expect(workbook).toContain('name="订单履约"')
  })
})