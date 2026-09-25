const express = require("express");
const https = require("https");
const dotenv = require("dotenv");
const cors = require('cors');


dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

const errorMessage = (error) => error instanceof Error ? error.message : String(error);

const sheetIdDE = process.env.SHEET_ID_DE;
const sheetIdEN = process.env.SHEET_ID_EN;

const getSheetUrl = (language) => {
    const sheetId = language === "de" ? sheetIdDE : sheetIdEN;

    if (!sheetId) {
        throw new Error(`Missing environment variable SHEET_ID_${language === "de" ? "DE" : "EN"}`);
    }

    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
};

const fetchText = (url, errorPrefix) => {
    return new Promise((resolve, reject) => {
        const request = https.get(url, (res) => {
            let data = "";

            if (res.statusCode && res.statusCode >= 400) {
                res.resume();
                reject(`${errorPrefix}: Google Sheets returned HTTP ${res.statusCode}`);
                return;
            }

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                resolve(data);
            });
        });

        request.setTimeout(10000, () => {
            request.destroy(new Error("request timed out"));
        });

        request.on("error", (err) => {
            reject("Error fetching Google Sheets: " + err.message);
        });
    });
};

const fetchSheetData = async (url) => {
    const data = await fetchText(url, "Error fetching Google Sheets");
    return csvToJson(data);
};

const fetchRawSheetData = (url) => {
    return fetchText(url, "Error fetching raw Google Sheets data");
};

function normalizeText(value) {
    return String(value || "")
        .replace(/\r/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/^\s+|\s+$/g, "")
        .replace(/""/g, '"');
}

function parseCsvRows(data) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < data.length; index += 1) {
        const character = data[index];
        const nextCharacter = data[index + 1];

        if (character === '"') {
            if (quoted && nextCharacter === '"') {
                cell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === "," && !quoted) {
            row.push(cell);
            cell = "";
        } else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && nextCharacter === "\n") index += 1;
            row.push(cell);
            if (row.some((value) => value !== "")) rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += character;
        }
    }

    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
    return rows;
}

function extractKeyValuePairs(data) {
    const rows = parseCsvRows(data);

    if (rows[0]?.[0].startsWith("intro correct-text")) {
        throw new Error("Google Sheet export is flattened. Put every keyword in column A and its value in column B.");
    }

    const entries = {};

    if (rows.length >= 2 && rows[0].length > 2) {
        rows[0].forEach((key, index) => {
            if (key && rows[1][index] !== undefined) {
                entries[normalizeText(key)] = normalizeText(rows[1][index]);
            }
        });
        rows.splice(0, 2);
    }

    rows.forEach((columns) => {
        const key = normalizeText(columns[0]);
        if (!key) return;
        entries[key] = normalizeText(columns.slice(1).join(","));
    });

    return entries;
}

function csvToJson(data) {
    const text = normalizeText(data);
    const entries = extractKeyValuePairs(text);
    const jsonData = { questions: [] };

    Object.entries(entries).forEach(([key, value]) => {
        if (key.startsWith("question_")) {
            const match = key.match(/^question_(\d+)(?:_(.+))?$/);
            if (!match) return;

            const index = Number(match[1]);
            const field = match[2];

            if (!jsonData.questions[index]) {
                jsonData.questions[index] = {};
            }

            if (field) {
                jsonData.questions[index][field] = value;
            }
        } else {
            jsonData[key] = value;
        }
    });

    jsonData.questions = jsonData.questions.filter(Boolean);
    return jsonData;
}


app.get("/raw", async (req, res) => {
    try {
        const url = getSheetUrl(req.query.lang === "en" ? "en" : "de");
        const data = await fetchRawSheetData(url);
        res.type("text/plain").send(data);
    } catch (error) {
        res.status(500).json({ error: errorMessage(error) });
    }
});

app.get("/", async (req, res) => {
    try {
        const data = await fetchSheetData(getSheetUrl("de"));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: errorMessage(error) });
    }
});

// German Sheet Endpoint
app.get("/de", async (req, res) => {
    try {
        const data = await fetchSheetData(getSheetUrl("de"));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: errorMessage(error) });
    }
});

// English Sheet Endpoint
app.get("/en", async (req, res) => {
    try {
        const data = await fetchSheetData(getSheetUrl("en"));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: errorMessage(error) });
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

app.csvToJson = csvToJson;
app.fetchSheetData = fetchSheetData;
app.getSheetUrl = getSheetUrl;

module.exports = app;