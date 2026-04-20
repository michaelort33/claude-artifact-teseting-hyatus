const { Pool } = require('pg');
const { put } = require('@vercel/blob');

const databaseUrl = process.env.DATABASE_URL;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const limit = Number(process.env.BACKFILL_LIMIT || '0');
const batchSize = Number(process.env.BACKFILL_BATCH_SIZE || '10');
const concurrency = Number(process.env.BACKFILL_CONCURRENCY || '4');

if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
}

if (!blobToken) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required');
}

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
});

function parseDataUrl(dataUrl) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        throw new Error('Invalid screenshot payload');
    }

    return {
        contentType: match[1],
        buffer: Buffer.from(match[2], 'base64')
    };
}

function getExtensionForContentType(contentType) {
    const extensionMap = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/heic': 'heic'
    };

    return extensionMap[contentType] || 'bin';
}

async function processRow(row) {
    const { contentType, buffer } = parseDataUrl(row.screenshot_url);
    const extension = getExtensionForContentType(contentType);
    const pathname = `screenshots/backfill/submission-${row.id}.${extension}`;

    const blob = await put(pathname, buffer, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType,
        token: blobToken
    });

    await pool.query(
        'UPDATE review_rewards SET screenshot_url = $1 WHERE id = $2',
        [blob.url, row.id]
    );

    console.log(`Backfilled submission ${row.id} -> ${blob.url}`);
}

function chunkRows(rows, size) {
    const chunks = [];
    for (let index = 0; index < rows.length; index += size) {
        chunks.push(rows.slice(index, index + size));
    }
    return chunks;
}

async function main() {
    const totalResult = await pool.query(`
        SELECT COUNT(*)
        FROM review_rewards
        WHERE screenshot_url LIKE 'data:%'
    `);
    const total = Number(totalResult.rows[0].count);

    console.log(`Found ${total} screenshots to backfill`);

    let processed = 0;
    while (true) {
        const remainingLimit = limit > 0 ? Math.max(limit - processed, 0) : batchSize;
        if (limit > 0 && remainingLimit === 0) {
            break;
        }

        const result = await pool.query(`
            SELECT id, screenshot_url
            FROM review_rewards
            WHERE screenshot_url LIKE 'data:%'
            ORDER BY id ASC
            LIMIT ${Math.min(batchSize, remainingLimit)}
        `);

        if (result.rows.length === 0) {
            break;
        }

        console.log(`Processing batch of ${result.rows.length} screenshots (${processed}/${total} completed)`);

        for (const rows of chunkRows(result.rows, concurrency)) {
            await Promise.all(rows.map(processRow));
            processed += rows.length;
            console.log(`Completed ${processed}/${total}`);
        }
    }

    const remainingResult = await pool.query(`
        SELECT COUNT(*)
        FROM review_rewards
        WHERE screenshot_url LIKE 'data:%'
    `);

    console.log(`Remaining legacy screenshots: ${remainingResult.rows[0].count}`);
}

main()
    .then(() => pool.end())
    .catch(async (error) => {
        console.error(error);
        await pool.end();
        process.exit(1);
    });
