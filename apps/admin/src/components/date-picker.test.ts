import { describe, expect, it } from 'vitest'
import { buildMonthGrid, formatDate, monthLabel, parseDate, shiftMonth, todayDate } from './date-picker'

describe('admin date picker calendar', () => {
  it('parses and formats YYYY-MM-DD without timezone drift', () => {
    expect(parseDate('2026-08-01')).toEqual({ year: 2026, month: 8, day: 1 })
    expect(parseDate('')).toBeNull()
    expect(parseDate('2026-13-01')).toBeNull()
    expect(parseDate('2026-02-30')).toBeNull()
    expect(formatDate({ year: 2026, month: 8, day: 1 })).toBe('2026-08-01')
  })

  it('formats a Chinese month title and shifts across year boundaries', () => {
    expect(monthLabel(2026, 8)).toBe('2026年08月')
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 })
  })

  it('builds a Monday-first 6x7 grid for August 2026', () => {
    const cells = buildMonthGrid(2026, 8, '2026-08-14')
    expect(cells).toHaveLength(42)
    expect(cells[0]).toMatchObject({ date: '2026-07-27', day: 27, currentMonth: false, today: false })
    expect(cells[5]).toMatchObject({ date: '2026-08-01', day: 1, currentMonth: true, today: false })
    expect(cells.find((cell) => cell.date === '2026-08-14')).toMatchObject({ currentMonth: true, today: true })
    expect(cells.at(-1)).toMatchObject({ date: '2026-09-06', currentMonth: false })
  })

  it('returns today as YYYY-MM-DD from a provided clock', () => {
    expect(todayDate(new Date(2026, 8, 14))).toBe('2026-09-14')
  })
})
