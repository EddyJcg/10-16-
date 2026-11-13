import { createClient } from '@supabase/supabase-js';
import { createGeminiChatHandler } from '../server/gemini-chat.mjs';

export default createGeminiChatHandler({createClient});
