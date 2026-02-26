import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cbmjezhhlmmptckpbxuq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNibWplemhobG1tcHRja3BieHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNjg4ODUsImV4cCI6MjA4NzY0NDg4NX0.xnDG3gmxsJEdS0_FrJAv3HhG-j0Ppzo1bS9u3Xdf1i8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
