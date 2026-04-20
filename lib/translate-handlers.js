const { Translate } = require('@google-cloud/translate').v2;
const {
    checkFormRateLimit,
    getClientIp,
    getSessionUser,
    isAdmin,
    parseBody,
    sendJson
} = require('./core');

const translateClient = process.env.GOOGLE_TRANSLATE
    ? new Translate({ key: process.env.GOOGLE_TRANSLATE })
    : null;

const translationCache = new Map();
const TRANSLATION_CACHE_MAX_SIZE = 5000;
const TRANSLATION_CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_TEXT_LENGTH = 1000;
const MAX_TEXTS_PER_REQUEST = 50;
const TRANSLATE_RATE_OPTS = { namespace: 'translate', limit: 30, windowMs: 60000 };

function evictOldCacheEntries() {
    if (translationCache.size > TRANSLATION_CACHE_MAX_SIZE) {
        const entriesToDelete = translationCache.size - Math.floor(TRANSLATION_CACHE_MAX_SIZE * 0.8);
        let deleted = 0;
        for (const key of translationCache.keys()) {
            if (deleted >= entriesToDelete) break;
            translationCache.delete(key);
            deleted++;
        }
    }
}

async function handleTranslate(req, res) {
    try {
        // Admin-only. Google Translate is billed per character, so leaving this open is
        // a cost-DoS vector. Also replaces the old in-memory rate limit with a Redis-backed
        // one that survives across serverless cold starts.
        const user = await getSessionUser(req);
        if (!user) return sendJson(res, 401, { error: 'Authentication required' });
        const admin = await isAdmin(user.email);
        if (!admin) return sendJson(res, 403, { error: 'Admin access required' });

        if (!translateClient) {
            return sendJson(res, 500, { error: 'Translation service not configured' });
        }

        const clientIp = getClientIp(req);
        if (!(await checkFormRateLimit(clientIp, TRANSLATE_RATE_OPTS))) {
            return sendJson(res, 429, { error: 'Rate limit exceeded. Please try again later.' });
        }

        const { texts, targetLang, sourceLang } = await parseBody(req);

        if (!texts || !Array.isArray(texts) || texts.length === 0) {
            return sendJson(res, 400, { error: 'texts array is required' });
        }
        if (!targetLang || typeof targetLang !== 'string' || !/^[a-zA-Z-]{2,10}$/.test(targetLang)) {
            return sendJson(res, 400, { error: 'Invalid targetLang' });
        }
        if (sourceLang && (typeof sourceLang !== 'string' || !/^[a-zA-Z-]{2,10}$/.test(sourceLang))) {
            return sendJson(res, 400, { error: 'Invalid sourceLang' });
        }
        if (texts.length > MAX_TEXTS_PER_REQUEST) {
            return sendJson(res, 400, { error: `Maximum ${MAX_TEXTS_PER_REQUEST} texts per request` });
        }

        for (const text of texts) {
            if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) {
                return sendJson(res, 400, { error: `Each text must be a string under ${MAX_TEXT_LENGTH} characters` });
            }
        }

        const results = [];
        const textsToTranslate = [];
        const textsToTranslateIndices = [];

        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            const cacheKey = `${sourceLang || 'auto'}:${targetLang}:${text}`;

            if (translationCache.has(cacheKey)) {
                results[i] = translationCache.get(cacheKey);
            } else {
                textsToTranslate.push(text);
                textsToTranslateIndices.push(i);
            }
        }

        if (textsToTranslate.length > 0) {
            const options = sourceLang
                ? { from: sourceLang, to: targetLang }
                : targetLang;

            const [translations] = await translateClient.translate(textsToTranslate, options);
            const translatedArray = Array.isArray(translations) ? translations : [translations];

            for (let j = 0; j < translatedArray.length; j++) {
                const originalIndex = textsToTranslateIndices[j];
                const originalText = textsToTranslate[j];
                const translatedText = translatedArray[j];
                const cacheKey = `${sourceLang || 'auto'}:${targetLang}:${originalText}`;

                translationCache.set(cacheKey, translatedText);
                results[originalIndex] = translatedText;
            }

            evictOldCacheEntries();
        }

        sendJson(res, 200, { translations: results });

    } catch (err) {
        console.error('Translation error:', err);
        console.error('Translation error details:', err.message);
        sendJson(res, 500, { error: 'Translation failed. Please try again.' });
    }
}

async function handleTranslateHealth(req, res) {
    const user = await getSessionUser(req);
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    const admin = await isAdmin(user.email);
    if (!admin) return sendJson(res, 403, { error: 'Admin access required' });
    sendJson(res, 200, {
        status: 'ok',
        configured: !!translateClient,
        cacheSize: translationCache.size
    });
}

module.exports = {
    handleTranslate,
    handleTranslateHealth
};
