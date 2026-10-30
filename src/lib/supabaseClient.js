import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://plnfmggjaszucmxbosy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsZm1mZ2dqYXN6dWNteGJvc3kiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc2MTYwNzI1MCwiZXhwIjoyMDcxODMwNTAwfQ.4pYXiOJE3O7fNyQ2h'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)