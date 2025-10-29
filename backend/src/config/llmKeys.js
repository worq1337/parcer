/**
 * LLM API Keys Configuration
 *
 * 0@B0 API :;NG59 4;O @07=KE Telegram-1>B>2.
 * 064K9 1>B 8A?>;L7C5B A2>9 OpenAI API :;NG 4;O ?0@A8=30.
 *
 * ;NG8 7040NBAO G5@57 ?5@5<5==K5 >:@C65=8O:
 * - OPENAI_KEY_CARDXABAR - 4;O CardXabarBot
 * - OPENAI_KEY_HUMO - 4;O HUMOcardbot
 * - OPENAI_KEY_NBU - 4;O NBUCard_bot
 * - OPENAI_API_KEY - fallback 4;O 2A5E >AB0;L=KE 1>B>2
 */

module.exports.LLM_KEYS = {
  'CardXabarBot': process.env.OPENAI_KEY_CARDXABAR || null,
  'HUMOcardbot': process.env.OPENAI_KEY_HUMO || null,
  'NBUCard_bot': process.env.OPENAI_KEY_NBU || null,
};
