export interface CalendarDate {
  year: number
  month: number
  day: number
}

export interface CalendarCell extends CalendarDate {
  date: string
  currentMonth: boolean
  today: boolean
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function isValidDate(year: number, month: number, day: number) {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

export function formatDate({ year, month, day }: CalendarDate) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseDate(value: string): CalendarDate | null {
  const match = DATE_PATTERN.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return isValidDate(year, month, day) ? { year, month, day } : null
}

export function todayDate(now = new Date()): string {
  return formatDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() })
}

export function monthLabel(year: number, month: number) {
  return `${year}年${String(month).padStart(2, '0')}月`
}

export function shiftMonth({ year, month }: Pick<CalendarDate, 'year' | 'month'>, delta: number) {
  const next = month + delta
  if (next < 1) return { year: year - 1, month: 12 }
  if (next > 12) return { year: year + 1, month: 1 }
  return { year, month: next }
}

export function buildMonthGrid(year: number, month: number, today = todayDate()): CalendarCell[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const mondayOffset = (firstWeekday + 6) % 7
  const start = new Date(year, month - 1, 1 - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const cell = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    const value = {
      year: cell.getFullYear(),
      month: cell.getMonth() + 1,
      day: cell.getDate()
    }
    const date = formatDate(value)
    return {
      ...value,
      date,
      currentMonth: value.year === year && value.month === month,
      today: date === today
    }
  })
}
