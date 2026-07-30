import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import type { SalesLine } from '@/types/sales'

export function exportCsv(lines: SalesLine[], filename = 'sales-export.csv') {
  const headers = [
    'orderDate',
    'periodEnd',
    'productName',
    'category',
    'quantity',
    'revenue',
    'grossSales',
    'discounts',
    'refunds',
    'cogs',
    'profit',
    'avgUnitPrice',
    'store',
    'sourceFile',
  ]
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = lines
    .map((l) => {
      const row = l as unknown as Record<string, unknown>
      return headers.map((h) => escape(row[h])).join(',')
    })
    .join('\n')
  const blob = new Blob([[headers.join(','), body].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  saveAs(blob, filename)
}

export function exportExcel(lines: SalesLine[], filename = 'sales-export.xlsx') {
  const rows = lines.map((l) => ({
    Date: l.orderDate,
    PeriodEnd: l.periodEnd,
    Product: l.productName,
    Category: l.category,
    Quantity: l.quantity,
    Revenue: l.revenue,
    GrossSales: l.grossSales,
    Discounts: l.discounts,
    Refunds: l.refunds,
    COGS: l.cogs,
    Profit: l.profit,
    AvgPrice: l.avgUnitPrice,
    Store: l.store,
    Source: l.sourceFile,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sales')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), filename)
}

export async function exportElementPng(el: HTMLElement, filename = 'chart.png') {
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(el, {
    backgroundColor: null,
    scale: 2,
  })
  canvas.toBlob((blob) => {
    if (blob) saveAs(blob, filename)
  })
}

export async function exportElementPdf(el: HTMLElement, filename = 'dashboard.pdf') {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#0f1419' })
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  })
  pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height)
  pdf.save(filename)
}
