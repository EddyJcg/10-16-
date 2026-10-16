import { createClient } from '@supabase/supabase-js';
import { createAdminHandler } from '../server/user-admin.mjs';

export default createAdminHandler({createClient});
