/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://dizmakvrzsntqbphdixh.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_8kw2oWaEFs-p7grgw2fuGQ_wdTco6qZ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});
