import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TenancyView } from '@/lib/types'

export interface RentSummary { outstanding: number; next_due_date: string | null; open_invoices: number }

export function useTenancies() {
  return useQuery({
    queryKey: ['my-tenancies'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_tenancies')
      if (error) throw error
      return (data ?? []) as TenancyView[]
    },
  })
}

export function useRentSummary() {
  return useQuery({
    queryKey: ['my-rent-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_rent_summary')
      if (error) throw error
      return data as RentSummary
    },
  })
}
