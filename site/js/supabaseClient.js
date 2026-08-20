// Configuración de conexión a Supabase (proyecto: torneo-ciclo-superior-csjsf)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://imvvkjsnehgbfjqvdujg.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdnZranNuZWhnYmZqcXZkdWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNDcyMDcsImV4cCI6MjEwMjgyMzIwN30.uzaa4OuS80ujVlrDf7kYzW9E7rxq7CSohExb9UcKcKY';

export const ALLOWED_DOMAINS = ['csjsf.edu.ar', 'jsfernandez.org'];

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function isSchoolEmail(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.trim().toLowerCase().split('@')[1];
  return ALLOWED_DOMAINS.includes(domain);
}
