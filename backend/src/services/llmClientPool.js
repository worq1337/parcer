/**
 * LLM Client Pool Service
 *
 * #?@02;5=85 ?C;>< OpenAI :;85=B>2 4;O @07=KE Telegram-1>B>2.
 * 064K9 1>B ?>;CG05B A2>9 M:75<?;O@ OpenAI :;85=B0 A >B45;L=K< API :;NG><.
 *
 * -B> ?>72>;O5B:
 * 1.  0745;L=> >BA;56820BL usage/costs 4;O :064>3> 1>B0
 * 2. A?>;L7>20BL @07=K5 API :;NG8 A @07=K<8 ;8<8B0<8
 * 3. 7>;8@>20BL rate limits <564C 1>B0<8
 */

const OpenAI = require('openai');
const { LLM_KEYS } = require('../config/llmKeys');

// C; :;85=B>2: botUsername => OpenAI instance
const clientPool = {};

/**
 * >;CG8BL OpenAI :;85=B0 4;O C:070==>3> 1>B0
 *
 * @param {string} botUsername - Username Telegram-1>B0 (=0?@8<5@, "CardXabarBot")
 * @returns {OpenAI} - -:75<?;O@ OpenAI :;85=B0
 */
function getClient(botUsername) {
  // A;8 ?5@540= botUsername 8 4;O =53> 5ABL A?5F80;L=K9 :;NG
  if (botUsername && LLM_KEYS[botUsername]) {
    const apiKey = LLM_KEYS[botUsername];

    // A;8 :;85=B 4;O MB>3> 1>B0 5IQ =5 A>740=
    if (!clientPool[botUsername]) {
      console.log(`[LLM Pool] Creating OpenAI client for bot: ${botUsername}`);
      clientPool[botUsername] = new OpenAI({ apiKey });
    }

    return clientPool[botUsername];
  }

  // =0G5 8A?>;L7C5< 45D>;B=K9 :;85=B
  if (!clientPool.__default) {
    const defaultKey = process.env.OPENAI_API_KEY;
    if (!defaultKey) {
      throw new Error('OPENAI_API_KEY =5 7040= 2 ?5@5<5==KE >:@C65=8O');
    }
    console.log('[LLM Pool] Creating default OpenAI client');
    clientPool.__default = new OpenAI({ apiKey: defaultKey });
  }

  return clientPool.__default;
}

/**
 * >;CG8BL 8=D>@<0F8N > ?C;5 :;85=B>2 (4;O >B;04:8/<>=8B>@8=30)
 *
 * @returns {Object} - !B0B8AB8:0 ?C;0
 */
function getPoolInfo() {
  const bots = Object.keys(clientPool).filter(k => k !== '__default');
  return {
    totalClients: Object.keys(clientPool).length,
    bots,
    hasDefault: Boolean(clientPool.__default)
  };
}

module.exports = {
  getClient,
  getPoolInfo
};
