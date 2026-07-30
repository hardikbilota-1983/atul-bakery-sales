import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSales } from '@/context/SalesContext'
import { ProductCompare } from '@/components/ProductCompare'
import { Button } from '@/components/ui/Button'

export function ComparePage() {
  const { derived } = useSales()
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <Link to="/">
        <Button variant="ghost">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Button>
      </Link>
      <h1 className="font-display text-2xl font-semibold">Compare Products</h1>
      <ProductCompare products={derived.products} />
    </div>
  )
}
