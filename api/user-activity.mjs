import { createClient } from '@supabase/supabase-js';
import { createUserActivityHandler } from '../server/user-activity.mjs';

export default createUserActivityHandler({createClient});
