import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/context/ThemeContext'
import { AuthProvider } from '@/context/AuthContext'
import { HelpTipProvider } from '@/components/ui/HelpTip'
import { RequireAuth } from '@/components/RequireAuth'
import { DashboardPage } from '@/pages/DashboardPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { ComparePage } from '@/pages/ComparePage'
import { LoginPage } from '@/pages/LoginPage'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HelpTipProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/product/:name" element={<ProductDetailPage />} />
                <Route path="/compare" element={<ComparePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </HelpTipProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
