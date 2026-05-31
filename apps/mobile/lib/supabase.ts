import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://yvpvrhwodskvbqmgsghy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cHZyaHdvZHNrdmJxbWdzZ2h5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczOTExNzQsImV4cCI6MjA5Mjk2NzE3NH0.T802qo1QASc1_Tnw4smctAhIp5sTCTo45gQKWyZa4AQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInBackground: false,
  },
});
