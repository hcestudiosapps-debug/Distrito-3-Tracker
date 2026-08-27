import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://eqefqqsdbseqfobvmsxz.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxZWZxcXNkYnNlcWZvYnZtc3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODk3NTUsImV4cCI6MjEwMzM2NTc1NX0.MJn8jk3a3dtH5UA-DxAiI8GARqpno-pxGWFLfeeLDVk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
