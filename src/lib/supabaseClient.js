import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://plnfmgqjaspzucomxbsy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsbmZtZ3FqYXNwenVjb214YnN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNzQzODEsImV4cCI6MjEwODg1MDM4MX0.d0sLqi9sBC7603ekUEuTbcXdQxaMVKkVW0XzEtBcX48'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)