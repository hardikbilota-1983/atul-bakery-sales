import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/context/ThemeContext'
import { SalesProvider } from '@/context/SalesContext'
import { DashboardPage } from '@/pages/DashboardPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { ComparePage } from '@/pages/ComparePage'

export default function App() {
  return (
    <ThemeProvider>
      <SalesProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/product/:name" element={<ProductDetailPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SalesProvider>
    </ThemeProvider>
  )
}
