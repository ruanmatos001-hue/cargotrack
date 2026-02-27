import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cbmjezhhlmmptckpbxuq.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNibWplemhobG1tcHRja3BieHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNjg4ODUsImV4cCI6MjA4NzY0NDg4NX0.xnDG3gmxsJEdS0_FrJAv3HhG-j0Ppzo1bS9u3Xdf1i8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
